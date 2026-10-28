import { describe, expect, it } from "vitest";

import { formatCalls, formatUsd } from "./ai-cost";

describe("formatUsd", () => {
  it("keeps three decimals for the cents an analysis costs, two once it passes a dollar", () => {
    expect(formatUsd("0.0728")).toBe("$0.073");
    expect(formatUsd("0.0042")).toBe("$0.004");
    expect(formatUsd("1.5")).toBe("$1.50");
    expect(formatUsd("0.0000")).toBe("$0.000");
  });

  it("says a cost is unknown instead of showing it as zero", () => {
    expect(formatUsd(null)).toBe("not priced");
    expect(formatUsd(undefined)).toBe("not priced");
    expect(formatUsd("abc")).toBe("not priced");
  });
});

describe("formatCalls", () => {
  it("counts calls in words", () => {
    expect(formatCalls(0)).toBe("none yet");
    expect(formatCalls(1)).toBe("1 call");
    expect(formatCalls(4)).toBe("4 calls");
  });
});
