import { describe, expect, it } from "vitest";

import type { Metric, ResultItem } from "@/lib/api/types";

import { filterCounts, totals, viewItems } from "./item-view";

const metric = (value: string | null, confidence: Metric["confidence"] = "VERIFIED"): Metric => ({
  value,
  confidence,
  reasons: [],
});
const item = (name: string, overrides: Partial<ResultItem> = {}): ResultItem => ({
  menuItemId: name,
  name,
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

const burger = item("Burger", { unitsSold: "600", netRevenue: metric("5000"), gpPercent: metric("77") });
const fries = item("Fries", {
  unitsSold: "640",
  netRevenue: metric("2000"),
  costPerPortion: metric(null),
  gpPerPortion: metric(null),
  gpPercent: metric(null),
});
const soup = item("Daily Soup", {
  unitsSold: "210",
  netRevenue: metric("1000", "ESTIMATED"),
  costSource: "MANUAL",
});
const all = [burger, fries, soup];
const view = (over: Partial<Parameters<typeof viewItems>[1]> = {}) =>
  viewItems(all, { query: "", filter: "all", sort: "sold", ...over }).map((i) => i.name);

describe("viewItems", () => {
  it("sorts by units sold, largest first", () => {
    expect(view()).toEqual(["Fries", "Burger", "Daily Soup"]);
  });

  it("sorts by revenue and by name", () => {
    expect(view({ sort: "revenue" })).toEqual(["Burger", "Fries", "Daily Soup"]);
    expect(view({ sort: "name" })).toEqual(["Burger", "Daily Soup", "Fries"]);
  });

  it("puts an unknown GP % last instead of treating it as zero", () => {
    expect(view({ sort: "gp-percent" })).toEqual(["Burger", "Daily Soup", "Fries"]);
  });

  it("filters to items without a cost, estimated figures, or costs set by the client", () => {
    expect(view({ filter: "needs-cost" })).toEqual(["Fries"]);
    expect(view({ filter: "estimated" })).toEqual(["Daily Soup"]);
    expect(view({ filter: "set-by-you" })).toEqual(["Daily Soup"]);
  });

  it("searches names without regard to case or surrounding spaces", () => {
    expect(view({ query: "  SOUP " })).toEqual(["Daily Soup"]);
    expect(view({ query: "zzz" })).toEqual([]);
  });

  it("does not reorder the list it was given", () => {
    const input = [fries, burger];
    viewItems(input, { query: "", filter: "all", sort: "name" });
    expect(input).toEqual([fries, burger]);
  });
});

describe("filterCounts", () => {
  it("counts what each chip would show", () => {
    expect(filterCounts(all)).toEqual({ all: 3, "needs-cost": 1, estimated: 1, "set-by-you": 1 });
  });
});

describe("totals", () => {
  it("adds units and revenue", () => {
    expect(totals(all)).toEqual({ unitsSold: "1450", netRevenue: "8000.00" });
  });

  it("adds nothing for an unknown figure", () => {
    const unknown = item("X", { unitsSold: null, netRevenue: metric(null) });
    expect(totals([burger, unknown])).toEqual({ unitsSold: "600", netRevenue: "5000.00" });
  });
});
