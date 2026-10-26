import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AuditRecord } from "@/lib/audit/types";

/**
 * Phase 1 status store: a single JSON file on disk. Zero new dependencies,
 * survives dev-server restarts. NOT safe for concurrent production traffic —
 * see README's "Known limitations" for the real-database upgrade path.
 */

// Read lazily (not as a module-level const) so tests can point this at an
// isolated directory via AUDIT_DATA_DIR before the first call, without
// needing to mock the module. In production AUDIT_DATA_DIR is never set, so
// this always resolves to the literal ".data" — the turbopackIgnore comment
// tells the bundler not to trace this as a dynamic import/require path (it
// isn't one, it's a plain fs path), which otherwise pulls the whole project
// into the server output. See Next's "Dynamic filesystem access" build warning.
function getDataDir(): string {
  return path.join(/* turbopackIgnore: true */
    process.cwd(),
    process.env.AUDIT_DATA_DIR ?? ".data",
  );
}

function getDataFile(): string {
  return path.join(/* turbopackIgnore: true */ getDataDir(), "audits.json");
}

/** Where generated report files are stored — shared by the callback (write)
 * and report (read) routes, and overridable by tests via AUDIT_DATA_DIR. */
export function getReportsDir(): string {
  return path.join(/* turbopackIgnore: true */ getDataDir(), "reports");
}

type AuditsFile = Record<string, AuditRecord>;

// Serializes writes within this process so two near-simultaneous requests
// don't clobber each other's read-modify-write. Does NOT help across
// multiple processes/instances — see the module comment above.
let writeQueue: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<AuditsFile> {
  try {
    const raw = await readFile(getDataFile(), "utf-8");
    return JSON.parse(raw) as AuditsFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeAll(data: AuditsFile): Promise<void> {
  await mkdir(getDataDir(), { recursive: true });
  await writeFile(getDataFile(), JSON.stringify(data, null, 2), "utf-8");
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task);
  // Swallow rejections in the chain itself so one failed write doesn't
  // permanently wedge the queue for later, unrelated writes.
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function createAudit(id: string): Promise<AuditRecord> {
  return enqueue(async () => {
    const all = await readAll();
    const now = new Date().toISOString();
    const record: AuditRecord = {
      id,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    };
    all[id] = record;
    await writeAll(all);
    return record;
  });
}

export async function getAudit(id: string): Promise<AuditRecord | null> {
  const all = await readAll();
  return all[id] ?? null;
}

export async function updateAudit(
  id: string,
  patch: Partial<Omit<AuditRecord, "id" | "createdAt">>,
): Promise<AuditRecord | null> {
  return enqueue(async () => {
    const all = await readAll();
    const existing = all[id];
    if (!existing) return null;

    const updated: AuditRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    all[id] = updated;
    await writeAll(all);
    return updated;
  });
}
