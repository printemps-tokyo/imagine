import { describe, expect, it } from "vitest";
import { parseModelOverrides, gemini, geminiSupports2K, fal } from "../src/providers/index.js";
import { parseDataUri, isDataUri } from "../src/datauri.js";
import { buildContactSheet } from "../src/contact-sheet.js";
import { resolvePreset } from "../src/presets.js";
import type { GenerateRequest } from "../src/providers/types.js";

function req(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    prompt: "x",
    preset: resolvePreset("square"),
    presetName: "square",
    quality: "high",
    outputFormat: "jpeg",
    ...overrides,
  };
}

describe("parseModelOverrides", () => {
  it("parses provider=model pairs", () => {
    expect(parseModelOverrides("fal=fal-ai/flux/schnell,gemini=gemini-2.5-flash-image")).toEqual({
      fal: "fal-ai/flux/schnell",
      gemini: "gemini-2.5-flash-image",
    });
  });
  it("rejects malformed or unknown entries", () => {
    expect(() => parseModelOverrides("fal")).toThrow();
    expect(() => parseModelOverrides("bogus=x")).toThrow("bogus");
    expect(() => parseModelOverrides("fal=")).toThrow();
  });
});

describe("model override in providers", () => {
  it("openai uses the override model", () => {
    const body = JSON.parse(gemini.buildRequest(req({ model: "gemini-2.5-flash-image" }), "k").body);
    expect(body).toBeDefined();
  });

  it("gemini omits imageSize for flash models, keeps it for pro", () => {
    expect(geminiSupports2K("gemini-3-pro-image")).toBe(true);
    expect(geminiSupports2K("gemini-2.5-flash-image")).toBe(false);
    const flash = JSON.parse(gemini.buildRequest(req({ model: "gemini-2.5-flash-image" }), "k").body);
    expect(flash.generationConfig.imageConfig.imageSize).toBeUndefined();
    const pro = JSON.parse(gemini.buildRequest(req(), "k").body);
    expect(pro.generationConfig.imageConfig.imageSize).toBe("2K");
  });

  it("fal adds sync_mode and uses the override model in the url", () => {
    const r = fal.buildRequest(req({ model: "fal-ai/flux/schnell", falSyncMode: true }), "k");
    expect(r.url).toBe("https://fal.run/fal-ai/flux/schnell");
    expect(JSON.parse(r.body).sync_mode).toBe(true);
  });

  it("fal omits sync_mode when not requested", () => {
    const r = fal.buildRequest(req(), "k");
    expect(JSON.parse(r.body).sync_mode).toBeUndefined();
  });
});

describe("parseDataUri", () => {
  it("detects and parses a base64 data URI", () => {
    expect(isDataUri("data:image/png;base64,AAAA")).toBe(true);
    expect(isDataUri("https://x/y.png")).toBe(false);
    expect(parseDataUri("data:image/png;base64,AAAA")).toEqual({
      mimeType: "image/png",
      base64: "AAAA",
    });
  });
  it("throws on non-base64 URIs", () => {
    expect(() => parseDataUri("data:text/plain,hello")).toThrow();
  });
});

describe("buildContactSheet", () => {
  it("includes each image and escapes the prompt", () => {
    const html = buildContactSheet('a <b> "quote"', [
      { provider: "openai", file: "x_openai.jpg", label: "25 KB" },
      { provider: "fal", file: "x_fal.jpg" },
    ]);
    expect(html).toContain('src="x_openai.jpg"');
    expect(html).toContain('src="x_fal.jpg"');
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain('a <b> "quote"');
  });
});
