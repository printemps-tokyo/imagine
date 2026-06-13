import { describe, expect, it } from "vitest";
import { openai, gemini, fal } from "../src/providers/index.js";
import { parseProviderList } from "../src/providers/index.js";
import { resolvePreset } from "../src/presets.js";
import type { GenerateRequest } from "../src/providers/types.js";

function req(presetName: string): GenerateRequest {
  return {
    prompt: "a cute banana mascot",
    preset: resolvePreset(presetName),
    presetName,
    quality: "high",
    outputFormat: "jpeg",
  };
}

describe("openai provider", () => {
  it("builds a request with WxH size and bearer auth", () => {
    const r = openai.buildRequest(req("a4yoko"), "sk-test");
    expect(r.url).toBe("https://api.openai.com/v1/images/generations");
    expect(r.headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(r.body);
    expect(body).toMatchObject({
      model: "gpt-image-2",
      size: "1536x1088",
      quality: "high",
      output_format: "jpeg",
    });
  });

  it("parses base64 image and cost", () => {
    const parsed = openai.parseResponse({
      data: [{ b64_json: "AAA=" }],
      usage: { output_tokens: 5500 },
    });
    expect(parsed.b64).toBe("AAA=");
    expect(parsed.costUsd).toBeCloseTo(0.165, 5);
  });

  it("labels the mime type from the requested output format", () => {
    const jpeg = openai.parseResponse({ data: [{ b64_json: "AAA=" }] }, req("square"));
    expect(jpeg.mimeType).toBe("image/jpeg");
    const png = openai.parseResponse(
      { data: [{ b64_json: "AAA=" }] },
      { ...req("square"), outputFormat: "png" },
    );
    expect(png.mimeType).toBe("image/png");
  });

  it("throws on API error", () => {
    expect(() => openai.parseResponse({ error: { message: "bad size" } })).toThrow("bad size");
  });
});

describe("gemini provider", () => {
  it("uses imageConfig.aspectRatio (not arbitrary pixels)", () => {
    const r = gemini.buildRequest(req("a4tate"), "g-key");
    expect(r.headers["x-goog-api-key"]).toBe("g-key");
    const body = JSON.parse(r.body);
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: "2:3", imageSize: "2K" });
  });

  it("parses inlineData", () => {
    const parsed = gemini.parseResponse({
      candidates: [{ content: { parts: [{ inlineData: { data: "BBB=", mimeType: "image/jpeg" } }] } }],
    });
    expect(parsed.b64).toBe("BBB=");
    expect(parsed.mimeType).toBe("image/jpeg");
  });

  it("throws when blocked (no candidates)", () => {
    expect(() => gemini.parseResponse({})).toThrow(/blocked|no content/i);
  });
});

describe("fal provider", () => {
  it("builds an image_size object and Key auth", () => {
    const r = fal.buildRequest(req("wide"), "fal-key");
    expect(r.headers.Authorization).toBe("Key fal-key");
    const body = JSON.parse(r.body);
    expect(body.image_size).toEqual({ width: 1536, height: 864 });
  });

  it("parses an image url and computes cost from dimensions", () => {
    const parsed = fal.parseResponse({
      images: [{ url: "https://cdn/x.jpg", width: 1536, height: 1088 }],
    });
    expect(parsed.url).toBe("https://cdn/x.jpg");
    expect(parsed.costUsd).toBeCloseTo(0.045, 5);
  });

  it("surfaces the locked-balance error", () => {
    expect(() =>
      fal.parseResponse({ detail: "User is locked. Reason: Exhausted balance" }),
    ).toThrow(/locked/i);
  });

  it("labels png output when requested", () => {
    const parsed = fal.parseResponse(
      { images: [{ url: "https://cdn/x.png", width: 1024, height: 1024 }] },
      { ...req("square"), outputFormat: "png" },
    );
    expect(parsed.mimeType).toBe("image/png");
  });
});

describe("parseProviderList", () => {
  it("parses and validates a comma list", () => {
    expect(parseProviderList("openai, fal")).toEqual(["openai", "fal"]);
  });
  it("throws on an unknown provider", () => {
    expect(() => parseProviderList("openai,bogus")).toThrow("bogus");
  });
});
