import { describe, expect, it } from "vitest";
import { falCost, falFluxCost, openaiCost, geminiCost, formatCost } from "../src/cost.js";

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

describe("falCost", () => {
  it("prices each FLUX.2 model from its own page", () => {
    // 1536x1088 = 1.67 MP.
    expect(falCost("fal-ai/flux-2-pro", 1536, 1088)).toBeCloseTo(0.045, 5);
    expect(falCost("fal-ai/flux-2-max", 1536, 1088)).toBeCloseTo(0.1, 5);
    expect(falCost("fal-ai/flux-2-flex", 1536, 1088)).toBeCloseTo(0.1, 5);
    expect(falCost("fal-ai/flux-2/turbo", 1000, 1000)).toBeCloseTo(0.008, 5);
    expect(falCost("fal-ai/flux-2-dev", 1536, 1088)).toBeCloseTo(0.012 * 1.671168, 5);
  });

  it("has no estimate for a model it has no price for", () => {
    expect(falCost("fal-ai/flux/schnell", 1024, 1024)).toBeUndefined();
  });
});

describe("openaiCost", () => {
  it("prices per model and refuses to guess an unknown one", () => {
    expect(openaiCost(1756, "gpt-image-2.6-flare")).toBeCloseTo(0.05268, 5);
    expect(openaiCost(1000, "gpt-image-1-mini")).toBeCloseTo(0.008, 5);
    expect(openaiCost(1000, "gpt-image-9")).toBeUndefined();
  });

  it("bills output tokens at $30/1M", () => {
    expect(openaiCost(5500)).toBeCloseTo(0.165, 5);
  });
  it("returns undefined without usage", () => {
    expect(openaiCost(undefined)).toBeUndefined();
  });
});

describe("geminiCost", () => {
  it("prices the newer models at their own rates and token counts", () => {
    expect(geminiCost(undefined, 0, "gemini-nano-banana-2.1")).toBeCloseTo(0.0504, 4);
    expect(geminiCost(undefined, 0, "gemini-3.1-flash-image")).toBeCloseTo(0.1008, 4);
    expect(geminiCost(1120, 100, "gemini-3.1-flash-lite-image")).toBeCloseTo(0.03375, 5);
    expect(geminiCost(undefined, 0, "gemini-2.5-flash-image")).toBeCloseTo(0.0387, 4);
  });
  it("has no estimate for an unknown model, or thinking tokens without a rate", () => {
    expect(geminiCost(1120, 0, "gemini-9-image")).toBeUndefined();
    expect(geminiCost(1290, 10, "gemini-2.5-flash-image")).toBeUndefined();
  });

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
