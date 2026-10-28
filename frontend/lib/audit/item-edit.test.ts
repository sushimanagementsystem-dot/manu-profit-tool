import { describe, expect, it } from "vitest";

import type { ResultItem } from "@/lib/api/types";

import { buildOperations, startValue, trimZeros, validateEdit } from "./item-edit";

const metric = (value: string | null) => ({ value, confidence: "VERIFIED" as const, reasons: [] });
const item = (overrides: Partial<ResultItem> = {}): ResultItem => ({
  menuItemId: "m1",
  name: "Classic Burger",
  category: "Mains",
  grossPrice: "14.5000",
  netPrice: metric("12.7753"),
  costPerPortion: metric("0.8400"),
  costSource: "RECIPE",
  gpPerPortion: metric("11.9353"),
  gpPercent: metric("93.4"),
  unitsSold: "320.0000",
  netRevenue: metric("3680.0000"),
  theoreticalGp: metric(null),
  matrixClass: "STAR",
  confidence: "VERIFIED",
  reasons: [],
  ...overrides,
});

describe("validateEdit", () => {
  it("trims and tidies a name, and refuses an empty or huge one", () => {
    expect(validateEdit("name", "  Classic   Burger ")).toEqual({ ok: true, value: "Classic Burger" });
    expect(validateEdit("name", "   ")).toMatchObject({ ok: false });
    expect(validateEdit("name", "x".repeat(201))).toMatchObject({ ok: false });
  });

  it("reads thousands separators and currency signs, but refuses an ambiguous comma", () => {
    expect(validateEdit("unitsSold", "1,580")).toEqual({ ok: true, value: "1580" });
    expect(validateEdit("unitsSold", "1 580")).toEqual({ ok: true, value: "1580" });
    expect(validateEdit("grossPrice", "€14.50")).toEqual({ ok: true, value: "14.5" });
    expect(validateEdit("grossPrice", "12,5")).toMatchObject({ ok: false });
  });

  it.each([
    ["unitsSold", "-5"],
    ["unitsSold", "abc"],
    ["unitsSold", ""],
    ["grossPrice", "1.23456"],
    ["cost", "1e3"],
  ] as const)("refuses %s = %j", (field, raw) => {
    expect(validateEdit(field, raw).ok).toBe(false);
  });

  it("allows zero units sold and a zero cost, but not a zero selling price", () => {
    expect(validateEdit("unitsSold", "0")).toEqual({ ok: true, value: "0" });
    expect(validateEdit("cost", "0")).toEqual({ ok: true, value: "0" });
    expect(validateEdit("grossPrice", "0")).toMatchObject({ ok: false });
  });

  it("lets a cost be cleared with an empty box", () => {
    expect(validateEdit("cost", "  ")).toEqual({ ok: true, value: "" });
  });
});

describe("buildOperations", () => {
  it("builds the operation for each field", () => {
    expect(buildOperations("name", item(), "Smash Burger")).toEqual([
      { op: "RENAME_MENU_ITEM", menuItemId: "m1", name: "Smash Burger" },
    ]);
    expect(buildOperations("unitsSold", item(), "400")).toEqual([
      { op: "SET_UNITS_SOLD", menuItemId: "m1", quantity: "400" },
    ]);
    expect(buildOperations("grossPrice", item(), "15")).toEqual([
      { op: "SET_SELLING_PRICE", menuItemId: "m1", grossPrice: "15" },
    ]);
    expect(buildOperations("cost", item(), "3.2")).toEqual([
      { op: "SET_ITEM_COST", menuItemId: "m1", cost: "3.2" },
    ]);
  });

  it("returns null when the value is what is already there, so no revision is made", () => {
    expect(buildOperations("name", item(), "Classic Burger")).toBeNull();
    expect(buildOperations("unitsSold", item(), "320")).toBeNull();
    expect(buildOperations("grossPrice", item(), "14.5")).toBeNull();
    expect(buildOperations("cost", item({ costSource: "MANUAL", costPerPortion: metric("3.2000") }), "3.2")).toBeNull();
  });

  it("treats a recipe cost typed back in as a change, because it becomes a hand-entered one", () => {
    expect(buildOperations("cost", item(), "0.84")).toEqual([
      { op: "SET_ITEM_COST", menuItemId: "m1", cost: "0.84" },
    ]);
  });

  it("clears a hand-entered cost, and ignores clearing one that was never entered", () => {
    expect(buildOperations("cost", item({ costSource: "MANUAL" }), "")).toEqual([
      { op: "SET_ITEM_COST", menuItemId: "m1", cost: null },
    ]);
    expect(buildOperations("cost", item(), "")).toBeNull();
  });
});

describe("startValue", () => {
  it("starts from the plain figure, not a formatted or four-decimal one", () => {
    expect(startValue("unitsSold", item())).toBe("320");
    expect(startValue("grossPrice", item())).toBe("14.5");
    expect(trimZeros("0.8400")).toBe("0.84");
    expect(trimZeros(null)).toBe("");
  });

  it("starts the cost empty when it comes from a recipe, since there is nothing hand-entered to edit", () => {
    expect(startValue("cost", item())).toBe("");
    expect(startValue("cost", item({ costSource: "MANUAL", costPerPortion: metric("3.2000") }))).toBe("3.2");
  });
});
