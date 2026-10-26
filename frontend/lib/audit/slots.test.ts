import { describe, expect, it } from "vitest";

import type { UploadLimits } from "@/lib/api/types";
import { describeAccepted, preCheckFile, SLOTS } from "./slots";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const limits: UploadLimits = {
  maxFileBytes: 15 * 1024 * 1024,
  maxTotalBytes: 150 * 1024 * 1024,
  maxPdfPages: 20,
  categories: {
    MENU: { maxFiles: 5, accept: ["application/pdf", "image/jpeg", XLSX, "text/csv"] },
    INVOICE: { maxFiles: 40, accept: ["application/pdf", "image/jpeg", XLSX, "text/csv"] },
    POS: { maxFiles: 5, accept: [XLSX, "text/csv"] },
  },
};

const file = (name: string, type: string, size = 1024) =>
  new File([new Uint8Array(size)], name, { type });

describe("preCheckFile", () => {
  it("accepts a file the category allows", () => {
    expect(preCheckFile("POS", file("sales.csv", "text/csv"), limits)).toBeNull();
  });

  it("rejects a type the category does not allow", () => {
    const result = preCheckFile("POS", file("menu.pdf", "application/pdf"), limits);
    expect(result).toContain("not accepted");
  });

  it("rejects a file over the size limit", () => {
    const big = file("huge.csv", "text/csv", limits.maxFileBytes + 1);
    expect(preCheckFile("MENU", big, limits)).toContain("larger than 15 MB");
  });

  it("rejects an empty file", () => {
    expect(preCheckFile("MENU", file("empty.csv", "text/csv", 0), limits)).toContain("is empty");
  });

  it("lets a file through when the browser reports no type, since the server identifies it", () => {
    expect(preCheckFile("MENU", file("menu.csv", ""), limits)).toBeNull();
  });

  it("checks nothing until the server's limits have arrived", () => {
    expect(preCheckFile("POS", file("anything.pdf", "application/pdf"), null)).toBeNull();
  });
});

describe("describeAccepted", () => {
  it("summarises the server's rules for the slot", () => {
    expect(describeAccepted("INVOICE", limits)).toBe(
      "PDF, JPG, Excel, CSV · up to 40 files, 15 MB each",
    );
  });

  it("shows a placeholder before the limits load", () => {
    expect(describeAccepted("MENU", null)).toBe("Loading…");
  });
});

describe("SLOTS", () => {
  it("covers each upload category exactly once, in order", () => {
    expect(SLOTS.map((slot) => slot.category)).toEqual(["MENU", "INVOICE", "POS"]);
    expect(SLOTS.map((slot) => slot.step)).toEqual([1, 2, 3]);
  });
});
