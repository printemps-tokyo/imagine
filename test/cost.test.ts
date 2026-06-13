import { describe, expect, it } from "vitest";
import { falFluxCost, openaiCost, geminiCost, formatCost } from "../src/cost.js";

describe("falFluxCost", () => {
  it("charges $0.03 for up to the first megapixel", () => {
    // 800x800 = 0.64MP -> ceil 1 -> 0.03
    expect(falFluxCost(800, 800)).toBeCloseTo(0.03, 5);
  });

  it("rounds megapixels up and adds $0.015 per extra MP", () => {
    // 1536x1088 = 1.67MP -> ceil 2 -> 0.03 + 0.015 = 0.045
    expect(falFluxCost(1536, 1088)).toBeCloseTo(0.045, 5);
    // 1536x2048 = 3.15MP -> ceil 4 -> 0.03 + 0.015*3 = 0.075
    expect(falFluxCost(1536, 2048)).toBeCloseTo(0.075, 5);
  });
});

describe("openaiCost", () => {
  it("bills output tokens at $30/1M", () => {
    expect(openaiCost(5500)).toBeCloseTo(0.165, 5);
  });
  it("returns undefined without usage", () => {
    expect(openaiCost(undefined)).toBeUndefined();
  });
});

describe("geminiCost", () => {
  it("uses reported image tokens when present", () => {
    expect(geminiCost(1120)).toBeCloseTo(0.1344, 4);
  });
  it("falls back to ~1120 tokens", () => {
    expect(geminiCost(undefined)).toBeCloseTo(0.1344, 4);
  });
  it("adds thinking tokens at $12/1M when reported", () => {
    // 1120*120 + 1000*12 = 134400 + 12000 = 146400 / 1e6 = 0.1464
    expect(geminiCost(1120, 1000)).toBeCloseTo(0.1464, 4);
  });
});

describe("formatCost", () => {
  it("formats a known cost", () => {
    expect(formatCost(0.045)).toBe("$0.045");
  });
  it("shows ? for unknown", () => {
    expect(formatCost(undefined)).toBe("$?");
  });
});
