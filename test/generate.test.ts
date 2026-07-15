import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateAll, generateOne } from "../src/generate.js";
import type { Env } from "../src/keys.js";

/**
 * Exercises the retry behaviour of the image-download step. No real APIs are
 * hit: global fetch is mocked and dispatches on the requested URL, so we can
 * make the download fail transiently, fail permanently, or succeed at will.
 */

const env: Env = { FAL_KEY: "test-key", OPENAI_API_KEY: "test-key" };

const FAL_GEN_URL = "https://fal.run/fal-ai/flux-2-pro";
const OPENAI_GEN_URL = "https://api.openai.com/v1/images/generations";
const IMG_URL = "https://cdn.example/img.jpg";

/** fal generation response: succeeds and points at a hosted URL to download. */
function falGenResponse(): Response {
  return new Response(
    JSON.stringify({ images: [{ url: IMG_URL, width: 1024, height: 1024 }] }),
    { status: 200 },
  );
}

/** OpenAI generation response: returns inline base64, so no download happens. */
function openaiGenResponse(): Response {
  return new Response(
    JSON.stringify({ data: [{ b64_json: Buffer.from("img").toString("base64") }] }),
    { status: 200 },
  );
}

function imageResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
}

let realFetch: typeof fetch;

beforeEach(() => {
  realFetch = globalThis.fetch;
  // Fake timers so exponential-backoff sleeps do not wait in real time.
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type FetchInput = Parameters<typeof fetch>[0];

/** Start an operation and drain backoff/timeout timers so retries resolve. */
async function run<T>(start: () => Promise<T>): Promise<T> {
  const p = start();
  // Capture the outcome eagerly so a rejection is never momentarily unhandled
  // while we advance the fake timers.
  const settled = p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const result = await settled;
  if (result.ok) return result.value;
  throw result.error;
}

describe("image download retries", () => {
  it("retries a transient download (503) and succeeds", async () => {
    let downloadCalls = 0;
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      const url = String(input);
      if (url === FAL_GEN_URL) return falGenResponse();
      if (url === IMG_URL) {
        downloadCalls++;
        // Fail the first two attempts (maxAttempts = retries + 1 = 3).
        if (downloadCalls < 3) return new Response("", { status: 503 });
        return imageResponse();
      }
      throw new Error(`unexpected url ${url}`);
    }) as typeof fetch;

    const img = await run(() => generateOne("fal", { prompt: "x", env, retries: 2 }));
    expect(downloadCalls).toBe(3);
    expect(img.bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("retries a transient network error (TypeError) and succeeds", async () => {
    let downloadCalls = 0;
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      const url = String(input);
      if (url === FAL_GEN_URL) return falGenResponse();
      if (url === IMG_URL) {
        downloadCalls++;
        if (downloadCalls < 2) throw new TypeError("fetch failed");
        return imageResponse();
      }
      throw new Error(`unexpected url ${url}`);
    }) as typeof fetch;

    const img = await run(() => generateOne("fal", { prompt: "x", env, retries: 2 }));
    expect(downloadCalls).toBe(2);
    expect(img.bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("fails only that provider when the download exhausts retries", async () => {
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      const url = String(input);
      if (url === OPENAI_GEN_URL) return openaiGenResponse();
      if (url === FAL_GEN_URL) return falGenResponse();
      if (url === IMG_URL) return new Response("", { status: 503 });
      throw new Error(`unexpected url ${url}`);
    }) as typeof fetch;

    const results = await run(() =>
      generateAll(["openai", "fal"], { prompt: "x", env, retries: 1 }),
    );
    const openai = results.find((r) => r.provider === "openai");
    const fal = results.find((r) => r.provider === "fal");
    expect(openai?.ok).toBe(true);
    expect(fal?.ok).toBe(false);
    expect(fal?.error).toContain("failed to download image (503)");
  });

  it("does not retry a non-transient download error (404)", async () => {
    let downloadCalls = 0;
    globalThis.fetch = vi.fn(async (input: FetchInput) => {
      const url = String(input);
      if (url === FAL_GEN_URL) return falGenResponse();
      if (url === IMG_URL) {
        downloadCalls++;
        return new Response("", { status: 404 });
      }
      throw new Error(`unexpected url ${url}`);
    }) as typeof fetch;

    await expect(
      run(() => generateOne("fal", { prompt: "x", env, retries: 2 })),
    ).rejects.toThrow("failed to download image (404)");
    expect(downloadCalls).toBe(1);
  });
});
