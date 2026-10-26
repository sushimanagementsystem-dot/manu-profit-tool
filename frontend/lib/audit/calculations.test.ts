import { describe, expect, it } from "vitest";

import {
  costPerPortion,
  gpPercent,
  grossProfitPerPortion,
  salesMixPercent,
  totalGpContribution,
} from "./calculations";

describe("costPerPortion", () => {
  it("sums quantity × unit cost across ingredients", () => {
    const result = costPerPortion([
      { quantityPerPortion: 0.2, unitCost: 10 }, // 2
      { quantityPerPortion: 0.5, unitCost: 4 }, // 2
    ]);
    expect(result).toEqual({ value: 4, confidence: "verified" });
  });

  it("is incomplete when any ingredient has no matched cost", () => {
    const result = costPerPortion([
      { quantityPerPortion: 0.2, unitCost: 10 },
      { quantityPerPortion: 0.5, unitCost: null },
    ]);
    expect(result.value).toBeNull();
    expect(result.confidence).toBe("incomplete");
    expect(result.note).toContain("1 of 2");
  });

  it("is incomplete when there are no ingredients at all", () => {
    const result = costPerPortion([]);
    expect(result.confidence).toBe("incomplete");
  });
});

describe("grossProfitPerPortion", () => {
  it("subtracts ingredient cost from selling price", () => {
    const result = grossProfitPerPortion(10, { value: 4, confidence: "verified" });
    expect(result).toEqual({ value: 6, confidence: "verified" });
  });

  it("is incomplete when the selling price is missing", () => {
    const result = grossProfitPerPortion(null, { value: 4, confidence: "verified" });
    expect(result.confidence).toBe("incomplete");
  });

  it("propagates an incomplete ingredient cost instead of guessing", () => {
    const result = grossProfitPerPortion(10, {
      value: null,
      confidence: "incomplete",
      note: "missing cost",
    });
    expect(result.confidence).toBe("incomplete");
    expect(result.note).toBe("missing cost");
  });
});

describe("gpPercent", () => {
  it("computes gross profit as a percentage of selling price", () => {
    const result = gpPercent(10, { value: 6, confidence: "verified" });
    expect(result).toEqual({ value: 60, confidence: "verified" });
  });

  it("does not divide by zero when selling price is 0", () => {
    const result = gpPercent(0, { value: 0, confidence: "verified" });
    expect(result.value).toBeNull();
    expect(result.confidence).toBe("incomplete");
  });
});

describe("totalGpContribution", () => {
  it("multiplies gross profit per portion by units sold", () => {
    const result = totalGpContribution({ value: 6, confidence: "verified" }, 50);
    expect(result).toEqual({ value: 300, confidence: "verified" });
  });

  it("is incomplete without a units-sold figure", () => {
    const result = totalGpContribution({ value: 6, confidence: "verified" }, null);
    expect(result.confidence).toBe("incomplete");
  });
});

describe("salesMixPercent", () => {
  it("computes an item's share of total units sold", () => {
    const result = salesMixPercent(25, 200);
    expect(result).toEqual({ value: 12.5, confidence: "verified" });
  });

  it("does not divide by zero when total units is 0", () => {
    const result = salesMixPercent(0, 0);
    expect(result.confidence).toBe("incomplete");
  });

  it("is incomplete without an item units figure", () => {
    const result = salesMixPercent(null, 200);
    expect(result.confidence).toBe("incomplete");
  });
});
