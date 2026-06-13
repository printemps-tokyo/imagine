import { describe, expect, it } from "vitest";
import { PRESETS, resolvePreset, isPreset } from "../src/presets.js";

describe("presets", () => {
  it("all OpenAI/fal dimensions are multiples of 16", () => {
    for (const [name, s] of Object.entries(PRESETS)) {
      expect(s.width % 16, `${name} width`).toBe(0);
      expect(s.height % 16, `${name} height`).toBe(0);
    }
  });

  it("resolvePreset returns the size for a known preset", () => {
    expect(resolvePreset("square")).toEqual({
      width: 1024,
      height: 1024,
      geminiAspect: "1:1",
    });
  });

  it("resolvePreset throws for unknown presets", () => {
    expect(() => resolvePreset("gigantic")).toThrow();
  });

  it("isPreset narrows known names", () => {
    expect(isPreset("a4yoko")).toBe(true);
    expect(isPreset("nope")).toBe(false);
  });
});
