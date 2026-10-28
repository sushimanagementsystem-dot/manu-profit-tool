import { describe, expect, it } from "vitest";

import type { Metric, ResultItem, ResultsResponse } from "@/lib/api/types";

import { assumptionChips, issueCounts, unlinkedSales } from "./figures";

const metric = (value: string | null): Metric => ({ value, confidence: "VERIFIED", reasons: [] });
const item = (units: string, revenue: string): ResultItem =>
  ({ unitsSold: units, netRevenue: metric(revenue) }) as ResultItem;
const summary = (netRevenue: string, unitsSold: string) =>
  ({ netRevenue, unitsSold }) as ResultsResponse["summary"];

describe("unlinkedSales", () => {
  it("is the part of the totals no menu item accounts for", () => {
    expect(unlinkedSales(summary("1500", "55"), [item("40", "1000"), item("10", "400")])).toEqual({
      revenue: 100,
      units: 5,
    });
  });

  it("is zero when the menu items account for everything", () => {
    expect(unlinkedSales(summary("1000", "50"), [item("50", "1000")])).toEqual({ revenue: 0, units: 0 });
  });
});

describe("assumptionChips", () => {
  const base = {
    vatRate: "0.135",
    vatRateDrink: "0.23",
    menuPricesIncludeVat: true,
    priceBasis: "LATEST" as const,
    wastagePct: "0",
  };

  it("words each assumption for the owner", () => {
    expect(assumptionChips(base)).toEqual([
      { label: "VAT", value: "13.5% food · 23% drinks" },
      { label: "Menu prices", value: "include VAT" },
      { label: "Ingredient price", value: "latest invoice" },
      { label: "Wastage", value: "0%" },
    ]);
  });

  it("says when VAT is not set, and shows a single rate", () => {
    expect(assumptionChips({ ...base, vatRate: null })[0].value).toBe("not set");
    expect(assumptionChips({ ...base, vatRateDrink: null })[0].value).toBe("13.5%");
  });
});

describe("issueCounts", () => {
  it("splits by severity", () => {
    const issues = [{ severity: "critical" }, { severity: "warning" }, { severity: "warning" }, { severity: "info" }];
    expect(issueCounts(issues as ResultsResponse["issues"])).toEqual({ total: 4, critical: 1, warnings: 2, notes: 1 });
  });
});
