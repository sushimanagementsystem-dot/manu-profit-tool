import { describe, expect, it } from "vitest";

import type { UploadedFile } from "@/lib/api/types";

import { unreadFiles } from "./incomplete";

const file = (overrides: Partial<UploadedFile>): UploadedFile => ({
  id: "f1",
  category: "POS",
  originalName: "pos.csv",
  sizeBytes: 100,
  mimeType: "text/csv",
  status: "PROCESSED",
  statusMessage: null,
  ...overrides,
});

describe("unreadFiles", () => {
  it("is empty when every file was read, so no banner shows", () => {
    expect(unreadFiles([file({}), file({ id: "f2", category: "MENU" })])).toEqual([]);
  });

  it("names the failed file, its slot, the reason and what the figures lose", () => {
    const [unread] = unreadFiles([
      file({ id: "bad", status: "FAILED", statusMessage: "Could not find the POS sales columns." }),
      file({ id: "ok", category: "MENU" }),
    ]);
    expect(unread).toMatchObject({
      id: "bad",
      name: "pos.csv",
      slot: "POS Sales Report",
      reason: "Could not find the POS sales columns.",
    });
    expect(unread.effect).toMatch(/revenue and items sold/);
  });

  it("still explains a failure that came without a message", () => {
    const [unread] = unreadFiles([file({ status: "FAILED", statusMessage: null })]);
    expect(unread.reason).toBe("This file could not be read.");
  });

  it("says something different for each kind of file", () => {
    const effects = (["MENU", "INVOICE", "POS"] as const).map(
      (category) => unreadFiles([file({ category, status: "FAILED" })])[0].effect,
    );
    expect(new Set(effects).size).toBe(3);
  });
});
