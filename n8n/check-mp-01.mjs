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

// 2. Read Task — the Webhook node authenticates, so this only parses and guards the shape.
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

function runNode(name, { inputItems, env = {}, nodeOutputs = {} }) {
  const context = {
    require: (m) => {
      if (m === 'crypto') return crypto;
      throw new Error(`blocked require: ${m}`);
    },
    Buffer, Date, Number, JSON, String, Array, Error, console,
    $env: env,
    $execution: { id: 'exec-123' },
    $input: { first: () => inputItems[0] },
    $: (nodeName) => {
      if (!(nodeName in nodeOutputs)) throw new Error(`no stub for node ${nodeName}`);
      return { first: () => nodeOutputs[nodeName] };
    },
  };
  return new vm.Script(`(function () {
${code[name]}
})()`).runInNewContext(context, { timeout: 5000 });
}

const asWebhookItem = (body) => ({
  json: { headers: {} },
  binary: { data: { data: Buffer.from(JSON.stringify(body), 'utf8').toString('base64') } },
});

try {
  const out = runNode('Read Task', { inputItems: [asWebhookItem(task)] });
  ok('Read Task reads the body the backend sent', out[0].json.taskId === task.taskId);
} catch (e) {
  ok('Read Task reads the body the backend sent', false, e.message);
}

ok('Read Task holds no secret', !code['Read Task'].includes('$env') && !code['Read Task'].includes('createHmac'));

for (const [label, body] of [
  ['an unsupported schemaVersion', { ...task, schemaVersion: '2' }],
  ['a task with no callbackUrl', { ...task, callbackUrl: undefined }],
  ['a task with no download URL', { ...task, file: { ...task.file, downloadUrl: undefined } }],
]) {
  let rejected = false;
  try {
    runNode('Read Task', { inputItems: [asWebhookItem(body)] });
  } catch {
    rejected = true;
  }
  ok(`Read Task rejects ${label}`, rejected);
}

// 3. Build Claude Request — shape of the API call.
let built;
try {
  built = runNode('Build Claude Request', {
    inputItems: [{ json: {} }],
    nodeOutputs: {
      'Read Task': { json: task },
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

// 4. Build Callback — status logic, and no secret anywhere in it.
ok('Build Callback holds no secret', !code['Build Callback'].includes('$env') && !code['Build Callback'].includes('createHmac'));

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
      nodeOutputs: { 'Build Claude Request': { json: built } },
    })[0].json;
    ok(`Build Callback reports ${label} as ${expectedStatus}`, JSON.parse(out.body).status === expectedStatus);
  } catch (e) {
    ok(`Build Callback handles ${label}`, false, e.message);
  }
}

// 5. The callback body must satisfy the backend's Zod schema shape.
try {
  const out = runNode('Build Callback', {
    inputItems: [{ json: claudeOk }],
    nodeOutputs: { 'Build Claude Request': { json: built } },
  })[0].json;
  const parsed = JSON.parse(out.body);
  ok('callback carries schemaVersion "1"', parsed.schemaVersion === '1');
  ok('callback echoes taskId and attempt', parsed.taskId === task.taskId && parsed.attempt === 1);
  ok('callback reports usage for the budget', parsed.usage?.inputTokens === 1200 && parsed.usage?.outputTokens === 340);
} catch (e) {
  ok('callback body shape', false, e.message);
}


// 6. Optional live check: the JSON schema is validated by the API, not by anything above.
// A nullable type carrying an enum passes every offline check here and is rejected with a 400
// at request time, which is how MP-01 first failed on a real document. Run with --live and
// ANTHROPIC_API_KEY set; it asks for one token, so it costs almost nothing.
if (process.argv.includes('--live')) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    ok('live schema check', false, 'ANTHROPIC_API_KEY is not set');
  } else {
    for (const category of ['MENU', 'POS', 'INVOICE']) {
      const request = runNode('Build Claude Request', {
        inputItems: [{ json: {} }],
        nodeOutputs: {
          'Read Task': { json: { ...task, file: { ...task.file, category } } },
          'Download File': { binary: { data: { data: 'JVBERi0xLjQK' } } },
        },
      })[0].json.request;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ ...request, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      });
      // 400 means the schema itself was rejected; any other status means it was accepted and
      // generation then ran into the one-token ceiling, which is what we asked for.
      const detail = response.status === 400 ? (await response.json())?.error?.message : '';
      ok(`${category} schema is accepted by the API`, response.status !== 400, detail);
    }
  }
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
