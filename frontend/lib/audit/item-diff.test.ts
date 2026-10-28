import { describe, expect, it } from "vitest";

import type { ResultItem } from "@/lib/api/types";

import { changedItemIds } from "./item-diff";

const metric = (value: string | null) => ({ value, confidence: "VERIFIED" as const, reasons: [] });
const item = (id: string, overrides: Partial<ResultItem> = {}): ResultItem => ({
  menuItemId: id,
  name: id,
  category: null,
  grossPrice: "10",
  netPrice: metric("9"),
  costPerPortion: metric("3"),
  costSource: "RECIPE",
  gpPerPortion: metric("6"),
  gpPercent: metric("66"),
  unitsSold: "100",
  netRevenue: metric("900"),
  theoreticalGp: metric(null),
  matrixClass: "STAR",
  confidence: "VERIFIED",
  reasons: [],
  ...overrides,
});

describe("changedItemIds", () => {
  it("is empty when nothing moved", () => {
    expect(changedItemIds([item("a")], [item("a")])).toEqual([]);
  });

  it("names the rows whose figures moved, and only those", () => {
    const before = [item("a"), item("b")];
    const after = [item("a"), item("b", { unitsSold: "120", netRevenue: metric("1080") })];
    expect(changedItemIds(before, after)).toEqual(["b"]);
  });

  it("catches a row that only moved class because another row changed", () => {
    expect(changedItemIds([item("a")], [item("a", { matrixClass: "DOG" })])).toEqual(["a"]);
  });

  it("does not call a brand-new row changed", () => {
    expect(changedItemIds([item("a")], [item("a"), item("b")])).toEqual([]);
  });
});
