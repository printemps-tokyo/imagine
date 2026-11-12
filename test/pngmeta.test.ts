import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { addPngText, crc32, generationEntries, isPng, readPngText } from "../src/pngmeta.js";

/** A valid 1x1 RGBA PNG built from scratch. */
function tinyPng(): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const raw = Buffer.from([0, 255, 0, 0, 255]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("addPngText / readPngText", () => {
  it("round-trips UTF-8 text, including Japanese", () => {
    const png = addPngText(tinyPng(), { Description: "夕焼けの富士山、水彩", Software: "imagine" });
    expect(isPng(png)).toBe(true);
    expect(readPngText(png)).toEqual({ Description: "夕焼けの富士山、水彩", Software: "imagine" });
  });

  it("places the chunks after IHDR with valid CRCs", () => {
    const png = addPngText(tinyPng(), { Comment: "x" });
    const view = new DataView(png.buffer);
    const at = 8 + 12 + 13;
    expect(String.fromCharCode(...png.subarray(at + 4, at + 8))).toBe("iTXt");
    const length = view.getUint32(at);
    expect(view.getUint32(at + 8 + length)).toBe(crc32(png.subarray(at + 4, at + 8 + length)));
    // The image data is untouched after the inserted chunk.
    expect(String.fromCharCode(...png.subarray(at + 12 + length + 4, at + 12 + length + 8))).toBe("IDAT");
  });

  it("leaves a JPEG alone", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    expect(addPngText(jpeg, { Comment: "x" })).toBe(jpeg);
    expect(readPngText(jpeg)).toEqual({});
  });

  it("rejects keywords the spec forbids", () => {
    expect(() => addPngText(tinyPng(), { "": "x" })).toThrow(/keyword/);
    expect(() => addPngText(tinyPng(), { " lead": "x" })).toThrow(/keyword/);
    expect(() => addPngText(tinyPng(), { 説明: "x" })).toThrow(/keyword/);
  });
});

describe("generationEntries", () => {
  it("puts the prompt under Description and the settings as JSON", () => {
    const e = generationEntries({
      prompt: "a fox",
      provider: "fal",
      model: "fal-ai/flux-2-pro",
      presetName: "square",
      width: 1024,
      height: 1024,
      quality: "high",
      seed: 42,
      software: "imagine 1.2.3",
      created: new Date("2026-11-12T00:00:00Z"),
    });
    expect(e.Description).toBe("a fox");
    expect(e.Software).toBe("imagine 1.2.3");
    expect(e["Creation Time"]).toBe("Thu, 12 Nov 2026 00:00:00 GMT");
    expect(JSON.parse(e.imagine!)).toEqual({
      provider: "fal",
      model: "fal-ai/flux-2-pro",
      size: "square",
      width: 1024,
      height: 1024,
      quality: "high",
      seed: 42,
    });
    // Every keyword is one addPngText accepts.
    expect(readPngText(addPngText(tinyPng(), e))).toEqual(e);
  });
});
