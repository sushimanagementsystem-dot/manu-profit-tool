import { rm } from "node:fs/promises";
import path from "node:path";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Isolate this test run's data from the real .data/ directory. Must be set
// before the route modules (which read process.env lazily, see
// lib/audit/store.ts) are first called.
const TEST_DATA_DIR = ".data-test-audit-flow";
process.env.AUDIT_DATA_DIR = TEST_DATA_DIR;

const { POST: createAudit } = await import("./route");
const { GET: getStatus } = await import("./[id]/status/route");
const { POST: postCallback } = await import("./[id]/callback/route");
const { GET: getReport } = await import("./[id]/report/route");

function makeFile(name: string, type: string, bytes = "x".repeat(10)): File {
  return new File([bytes], name, { type });
}

function buildUploadForm() {
  const form = new FormData();
  form.append("menu", makeFile("menu.pdf", "application/pdf"));
  form.append(
    "invoices",
    makeFile(
      "invoice1.pdf",
      "application/pdf",
    ),
  );
  form.append(
    "pos",
    makeFile(
      "pos.csv",
      "text/csv",
    ),
  );
  return form;
}

describe("POST /api/audits — validation", () => {
  beforeEach(() => {
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_SECRET;
    delete process.env.N8N_CALLBACK_SECRET;
  });

  it("rejects a request missing a required slot", async () => {
    const form = new FormData();
    form.append("menu", makeFile("menu.pdf", "application/pdf"));
    // invoices + pos missing

    const response = await createAudit(
      new Request("http://localhost/api/audits", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/Supplier Invoices/);
  });

  it("rejects an unsupported file type", async () => {
    const form = buildUploadForm();
    form.set("pos", makeFile("pos.txt", "text/plain"));

    const response = await createAudit(
      new Request("http://localhost/api/audits", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/unsupported file type/);
  });

  it("rejects a file over the size limit", async () => {
    const form = buildUploadForm();
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "menu.pdf", {
      type: "application/pdf",
    });
    form.set("menu", big);

    const response = await createAudit(
      new Request("http://localhost/api/audits", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/over the/);
  });
});

describe("POST /api/audits — n8n not configured", () => {
  beforeEach(() => {
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_SECRET;
    delete process.env.N8N_CALLBACK_SECRET;
  });

  it("still creates the audit, but marks it failed with a clear message", async () => {
    const response = await createAudit(
      new Request("http://localhost/api/audits", {
        method: "POST",
        body: buildUploadForm(),
      }),
    );

    expect(response.status).toBe(202);
    const { auditId } = await response.json();
    expect(auditId).toBeTruthy();

    const statusResponse = await getStatus(new Request("http://localhost"), {
      params: Promise.resolve({ id: auditId }),
    });
    const status = await statusResponse.json();
    expect(status.status).toBe("failed");
    expect(status.message).toMatch(/isn't configured/);
  });
});

describe("POST /api/audits — forwards to n8n when configured", () => {
  beforeEach(() => {
    process.env.N8N_WEBHOOK_URL = "https://example.test/webhook/audit";
    process.env.N8N_WEBHOOK_SECRET = "whsecret";
    process.env.N8N_CALLBACK_SECRET = "cbsecret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks the audit processing when n8n accepts the forward", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://example.test/webhook/audit");
        expect((init?.headers as Record<string, string>)["x-webhook-secret"]).toBe(
          "whsecret",
        );
        return new Response(null, { status: 200 });
      }),
    );

    const response = await createAudit(
      new Request("http://localhost/api/audits", {
        method: "POST",
        body: buildUploadForm(),
      }),
    );
    const { auditId } = await response.json();

    const statusResponse = await getStatus(new Request("http://localhost"), {
      params: Promise.resolve({ id: auditId }),
    });
    const status = await statusResponse.json();
    expect(status.status).toBe("processing");
  });

  it("marks the audit failed when n8n is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const response = await createAudit(
      new Request("http://localhost/api/audits", {
        method: "POST",
        body: buildUploadForm(),
      }),
    );
    const { auditId } = await response.json();

    const statusResponse = await getStatus(new Request("http://localhost"), {
      params: Promise.resolve({ id: auditId }),
    });
    const status = await statusResponse.json();
    expect(status.status).toBe("failed");
    expect(status.message).toMatch(/Could not reach n8n/);
  });
});

describe("GET /api/audits/[id]/status", () => {
  it("404s for an unknown audit id", async () => {
    const response = await getStatus(new Request("http://localhost"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(response.status).toBe(404);
  });

  it("400s for a malformed id", async () => {
    const response = await getStatus(new Request("http://localhost"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(response.status).toBe(400);
  });
});

describe("the callback → report download flow", () => {
  beforeEach(() => {
    process.env.N8N_WEBHOOK_URL = "https://example.test/webhook/audit";
    process.env.N8N_WEBHOOK_SECRET = "whsecret";
    process.env.N8N_CALLBACK_SECRET = "cbsecret";
  });

  async function createTestAudit(): Promise<string> {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    const response = await createAudit(
      new Request("http://localhost/api/audits", {
        method: "POST",
        body: buildUploadForm(),
      }),
    );
    vi.unstubAllGlobals();
    const { auditId } = await response.json();
    return auditId;
  }

  it("rejects a callback with the wrong secret", async () => {
    const auditId = await createTestAudit();
    const response = await postCallback(
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-callback-secret": "wrong" },
        body: new FormData(),
      }),
      { params: Promise.resolve({ id: auditId }) },
    );
    expect(response.status).toBe(401);
  });

  it("stores the report and makes it downloadable once completed", async () => {
    const auditId = await createTestAudit();

    const callbackForm = new FormData();
    callbackForm.set("status", "completed");
    callbackForm.set(
      "report",
      new File(["fake xlsx bytes"], "Menu-Profit-Report.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    const callbackResponse = await postCallback(
      new Request("http://localhost", {
        method: "POST",
        headers: { "x-callback-secret": "cbsecret" },
        body: callbackForm,
      }),
      { params: Promise.resolve({ id: auditId }) },
    );
    expect(callbackResponse.status).toBe(200);

    const statusResponse = await getStatus(new Request("http://localhost"), {
      params: Promise.resolve({ id: auditId }),
    });
    const status = await statusResponse.json();
    expect(status.status).toBe("completed");
    expect(status.report.fileName).toBe("Menu-Profit-Report.xlsx");

    const reportResponse = await getReport(new Request("http://localhost"), {
      params: Promise.resolve({ id: auditId }),
    });
    expect(reportResponse.status).toBe(200);
    expect(reportResponse.headers.get("content-disposition")).toContain(
      "Menu-Profit-Report.xlsx",
    );
    const bytes = await reportResponse.text();
    expect(bytes).toBe("fake xlsx bytes");
  });

  it("404s a report download before the audit is completed", async () => {
    const auditId = await createTestAudit();
    const response = await getReport(new Request("http://localhost"), {
      params: Promise.resolve({ id: auditId }),
    });
    expect(response.status).toBe(404);
  });
});

beforeAll(async () => {
  await rm(path.join(process.cwd(), TEST_DATA_DIR), {
    recursive: true,
    force: true,
  });
});

afterAll(async () => {
  await rm(path.join(process.cwd(), TEST_DATA_DIR), {
    recursive: true,
    force: true,
  });
});
