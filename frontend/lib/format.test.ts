import { describe, expect, it, vi } from "vitest";

import { formatBytes, formatMoney, formatNumber, formatPercent, formatTimeLeft } from "./format";

describe("missing values read as missing, never as zero", () => {
  it.each([
    ["money", () => formatMoney(null)],
    ["number", () => formatNumber(null)],
    ["percent", () => formatPercent(null)],
  ])("shows a dash for a null %s", (_label, format) => {
    expect(format()).toBe("—");
  });

  it("still shows a real zero", () => {
    expect(formatPercent("0")).toBe("0.0%");
    expect(formatNumber("0")).toBe("0");
  });
});

describe("formatMoney", () => {
  it("keeps the analysis currency and two decimals", () => {
    expect(formatMoney("1234.5", "EUR")).toMatch(/1[,.\s]?234[.,]50/);
    expect(formatMoney("12.775330", "EUR")).toMatch(/12[.,]78/);
  });
});

describe("formatPercent", () => {
  it("rounds to one decimal place", () => {
    expect(formatPercent("93.4157")).toBe("93.4%");
  });
});

describe("formatBytes", () => {
  it.each([
    [512, "512 B"],
    [2048, "2 KB"],
    [5 * 1024 * 1024, "5.0 MB"],
  ])("formats %i bytes", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("formatTimeLeft", () => {
  const at = (iso: string, now: string) => {
    vi.setSystemTime(new Date(now));
    const result = formatTimeLeft(iso);
    vi.useRealTimers();
    return result;
  };

  it("counts down in days, then hours, then minutes", () => {
    vi.useFakeTimers();
    expect(at("2026-10-28T12:00:00Z", "2026-10-26T12:00:00Z")).toBe("in 2 days");
    vi.useFakeTimers();
    expect(at("2026-10-26T17:00:00Z", "2026-10-26T12:00:00Z")).toBe("in 5 hours");
    vi.useFakeTimers();
    expect(at("2026-10-26T12:30:00Z", "2026-10-26T12:00:00Z")).toBe("in 30 minutes");
  });

  it("says expired once the retention window has passed", () => {
    vi.useFakeTimers();
    expect(at("2026-10-26T11:00:00Z", "2026-10-26T12:00:00Z")).toBe("expired");
  });
});
