// Checks MP-01.json without n8n: each Code node must parse, and its HMAC must agree
// with the backend's, computed here the way backend/src/common/crypto.ts does.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const wf = JSON.parse(readFileSync(new URL('./workflows/MP-01.json', import.meta.url), 'utf8'));
const code = Object.fromEntries(
  wf.nodes.filter((n) => n.type.endsWith('code')).map((n) => [n.name, n.parameters.jsCode]),
);

let failures = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!pass) failures += 1;
};

// 1. Syntax.
for (const [name, js] of Object.entries(code)) {
  try {
    new vm.Script(`(async () => {\n${js}\n})`);
    ok(`${name} parses`, true);
  } catch (e) {
    ok(`${name} parses`, false, e.message);
  }
}

// 2. Run "Verify Signature" against a payload signed the way the backend signs it.
const REQUEST_SECRET = 'request-secret-for-the-test';
const INBOUND_KEY = 'inbound-key-for-the-test';
const CALLBACK_SECRET = 'callback-secret-for-the-test';

const task = {
  schemaVersion: '1',
  jobId: '11111111-1111-4111-8111-111111111111',
  taskId: '22222222-2222-4222-8222-222222222222',
  attempt: 1,
  file: {
    id: '33333333-3333-4333-8333-333333333333',
    category: 'INVOICE',
    mimeType: 'application/pdf',
    pageCount: 2,
    downloadUrl: 'http://localhost:4000/api/v1/internal/files/abc.def',
  },
  hints: { currency: 'EUR' },
  model: 'claude-opus-5-5',
  callbackUrl: 'http://localhost:4000/api/v1/internal/n8n/callbacks',
};
const body = JSON.stringify(task);
const stamp = Math.floor(Date.now() / 1000).toString();
const backendSig = 'sha256=' + crypto.createHmac('sha256', REQUEST_SECRET).update(`${stamp}.${body}`).digest('hex');

function runNode(name, { inputItems, env, nodeOutputs = {} }) {
  const context = {
    require: (m) => {
      if (m === 'crypto') return crypto;
      throw new Error(`blocked require: ${m}`);
    },
    Buffer,
    Date,
    Number,
    JSON,
    String,
    Array,
    Error,
    console,
    $env: env,
    $execution: { id: 'exec-123' },
    $input: { first: () => inputItems[0] },
    $: (nodeName) => {
      if (!(nodeName in nodeOutputs)) throw new Error(`no stub for node ${nodeName}`);
      return { first: () => nodeOutputs[nodeName] };
    },
  };
  const script = new vm.Script(`(function () {\n${code[name]}\n})()`);
  return script.runInNewContext(context, { timeout: 5000 });
}

try {
  const out = runNode('Verify Signature', {
    inputItems: [{
      json: {
        headers: { 'x-mp-key': INBOUND_KEY, 'x-mp-timestamp': stamp, 'x-mp-signature': backendSig },
      },
      binary: { data: { data: Buffer.from(body, 'utf8').toString('base64') } },
    }],
    env: { MP_INBOUND_KEY: INBOUND_KEY, MP_REQUEST_SECRET: REQUEST_SECRET },
  });
  ok('Verify Signature accepts a correctly signed request', out[0].json.taskId === task.taskId);
} catch (e) {
  ok('Verify Signature accepts a correctly signed request', false, e.message);
}

for (const [label, mutate] of [
  ['a tampered body', (h, b) => [h, b.replace('EUR', 'USD')]],
  ['a wrong signature', (h, b) => [{ ...h, 'x-mp-signature': 'sha256=' + '0'.repeat(64) }, b]],
  ['a wrong inbound key', (h, b) => [{ ...h, 'x-mp-key': 'nope' }, b]],
  ['an old timestamp', (h, b) => [{ ...h, 'x-mp-timestamp': String(Number(h['x-mp-timestamp']) - 600) }, b]],
]) {
  const [headers, mutatedBody] = mutate(
    { 'x-mp-key': INBOUND_KEY, 'x-mp-timestamp': stamp, 'x-mp-signature': backendSig },
    body,
  );
  let rejected = false;
  try {
    runNode('Verify Signature', {
      inputItems: [{ json: { headers }, binary: { data: { data: Buffer.from(mutatedBody, 'utf8').toString('base64') } } }],
      env: { MP_INBOUND_KEY: INBOUND_KEY, MP_REQUEST_SECRET: REQUEST_SECRET },
    });
  } catch {
    rejected = true;
  }
  ok(`Verify Signature rejects ${label}`, rejected);
}

// 3. Build Claude Request — shape of the API call.
let built;
try {
  built = runNode('Build Claude Request', {
    inputItems: [{ json: {} }],
    env: {},
    nodeOutputs: {
      'Verify Signature': { json: task },
      'Download File': { binary: { data: { data: 'JVBERi0xLjQK' } } },
    },
  })[0].json;
  const r = built.request;
  ok('request targets the model the backend chose', r.model === 'claude-opus-5-5');
  ok('request uses a json_schema output format', r.output_config?.format?.type === 'json_schema');
  ok('request sends no thinking budget', !('thinking' in r) && !('budget_tokens' in r));
  ok('a PDF is sent as a document block', r.messages[0].content[0].type === 'document');
  ok('document carries the right media type', r.messages[0].content[0].source.media_type === 'application/pdf');
  const required = built.request.output_config.format.schema.properties.invoices.items.required;
  ok('invoice schema matches the backend contract', required.includes('totals') && required.includes('lines'));
} catch (e) {
  ok('Build Claude Request runs', false, e.message);
}

// 4. Build Callback — signature must verify the way the backend verifies it.
function backendVerifies(timestamp, rawBody, signature) {
  const expected = 'sha256=' + crypto.createHmac('sha256', CALLBACK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const claudeOk = {
  model: 'claude-opus-5-5',
  stop_reason: 'end_turn',
  usage: { input_tokens: 1200, output_tokens: 340 },
  content: [
    { type: 'thinking', thinking: '' },
    { type: 'text', text: JSON.stringify({ invoices: [], warnings: ['test'] }) },
  ],
};

for (const [label, response, expectedStatus] of [
  ['a successful extraction', claudeOk, 'SUCCEEDED'],
  ['an API error', { error: { type: 'overloaded_error', message: 'Overloaded' } }, 'FAILED'],
  ['a refusal', { ...claudeOk, stop_reason: 'refusal' }, 'FAILED'],
  ['a truncated response', { ...claudeOk, stop_reason: 'max_tokens' }, 'FAILED'],
  ['non-JSON text', { ...claudeOk, content: [{ type: 'text', text: 'sorry, I cannot' }] }, 'FAILED'],
]) {
  try {
    const out = runNode('Build Callback', {
      inputItems: [{ json: response }],
      env: { MP_CALLBACK_SECRET: CALLBACK_SECRET },
      nodeOutputs: { 'Build Claude Request': { json: built } },
    })[0].json;
    const parsed = JSON.parse(out.body);
    const signed = backendVerifies(out.timestamp, out.body, out.signature);
    ok(`Build Callback reports ${label} as ${expectedStatus}`, parsed.status === expectedStatus && signed,
      signed ? '' : 'signature would not verify');
  } catch (e) {
    ok(`Build Callback handles ${label}`, false, e.message);
  }
}

// 5. The callback body must satisfy the backend's Zod schema shape.
try {
  const out = runNode('Build Callback', {
    inputItems: [{ json: claudeOk }],
    env: { MP_CALLBACK_SECRET: CALLBACK_SECRET },
    nodeOutputs: { 'Build Claude Request': { json: built } },
  })[0].json;
  const parsed = JSON.parse(out.body);
  ok('callback carries schemaVersion "1"', parsed.schemaVersion === '1');
  ok('callback echoes taskId and attempt', parsed.taskId === task.taskId && parsed.attempt === 1);
  ok('callback reports usage for the budget', parsed.usage?.inputTokens === 1200 && parsed.usage?.outputTokens === 340);
} catch (e) {
  ok('callback body shape', false, e.message);
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
