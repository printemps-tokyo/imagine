/**
 * Text metadata in PNG files (iTXt chunks, PNG specification section 11.3.3),
 * so a generated image carries its prompt and settings. Pure byte work, no
 * dependencies; anything that is not a PNG is passed through unchanged.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | undefined;

/** CRC-32 as PNG chunks use it (ISO 3309, polynomial 0xEDB88320). */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && SIGNATURE.every((b, i) => bytes[i] === b);
}

/** A keyword the spec allows: 1-79 printable Latin-1 characters, no leading, trailing or double spaces. */
function validKeyword(k: string): boolean {
  return (
    k.length >= 1 &&
    k.length <= 79 &&
    /^[\x20-\x7e\xa1-\xff]+$/.test(k) &&
    !k.startsWith(" ") &&
    !k.endsWith(" ") &&
    !k.includes("  ")
  );
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** One uncompressed iTXt chunk: keyword, then UTF-8 text (any language). */
function itxt(keyword: string, text: string): Uint8Array {
  const key = Uint8Array.from(keyword, (c) => c.charCodeAt(0));
  const value = new TextEncoder().encode(text);
  // keyword NUL, compression flag 0, method 0, empty language tag NUL,
  // empty translated keyword NUL, text.
  const data = new Uint8Array(key.length + 5 + value.length);
  data.set(key, 0);
  data.set(value, key.length + 5);
  return chunk("iTXt", data);
}

/**
 * Insert `entries` as iTXt chunks right after IHDR. Returns the bytes
 * unchanged when they are not a PNG. Throws on a keyword the spec forbids.
 */
export function addPngText(bytes: Uint8Array, entries: Record<string, string>): Uint8Array {
  if (!isPng(bytes)) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ihdrLength = view.getUint32(8);
  const type = String.fromCharCode(...bytes.subarray(12, 16));
  if (type !== "IHDR") throw new Error("PNG does not start with IHDR");
  const afterIhdr = 8 + 12 + ihdrLength;
  const chunks: Uint8Array[] = [];
  for (const [k, v] of Object.entries(entries)) {
    if (!validKeyword(k)) throw new Error(`invalid PNG text keyword "${k}"`);
    chunks.push(itxt(k, v));
  }
  const extra = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(bytes.length + extra);
  out.set(bytes.subarray(0, afterIhdr), 0);
  let at = afterIhdr;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  out.set(bytes.subarray(afterIhdr), at);
  return out;
}

/** The uncompressed tEXt and iTXt entries of a PNG (compressed ones are skipped). */
export function readPngText(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPng(bytes)) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === "tEXt" || type === "iTXt") {
      const nul = data.indexOf(0);
      if (nul > 0) {
        const key = String.fromCharCode(...data.subarray(0, nul));
        if (type === "tEXt") {
          out[key] = String.fromCharCode(...data.subarray(nul + 1));
        } else if (data[nul + 1] === 0) {
          // Skip the language tag and translated keyword (both NUL-ended).
          let p = nul + 3;
          p = data.indexOf(0, p) + 1;
          p = data.indexOf(0, p) + 1;
          if (p > 0) out[key] = new TextDecoder().decode(data.subarray(p));
        }
      }
    }
    if (type === "IEND") break;
    at += 12 + length;
  }
  return out;
}

export interface GenerationInfo {
  prompt: string;
  provider: string;
  model: string;
  presetName: string;
  width: number;
  height: number;
  quality: string;
  seed?: number;
  negativePrompt?: string;
  /** e.g. "imagine 0.3.0". */
  software: string;
  created: Date;
}

/**
 * The text entries written into a generated PNG: the prompt under the
 * standard Description keyword, the program and time under Software and
 * Creation Time (RFC 1123 date, as the specification suggests), and the
 * settings as JSON under "imagine".
 */
export function generationEntries(info: GenerationInfo): Record<string, string> {
  const settings = {
    provider: info.provider,
    model: info.model,
    size: info.presetName,
    width: info.width,
    height: info.height,
    quality: info.quality,
    ...(info.seed !== undefined ? { seed: info.seed } : {}),
    ...(info.negativePrompt ? { negativePrompt: info.negativePrompt } : {}),
  };
  return {
    Description: info.prompt,
    Software: info.software,
    "Creation Time": info.created.toUTCString(),
    imagine: JSON.stringify(settings),
  };
}
