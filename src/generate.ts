/**
 * Generation orchestration: the thin IO shell around the pure providers.
 * Builds each request, performs the HTTP call(s), and returns image bytes.
 */
import { resolveKey, type Env } from "./keys.js";
import { resolvePreset, DEFAULT_PRESET } from "./presets.js";
import { isDataUri, parseDataUri } from "./datauri.js";
import { getProvider, type GenerateRequest, type OutputFormat, type ProviderId, type Quality } from "./providers/index.js";

export interface GenerateOptions {
  prompt: string;
  presetName?: string;
  quality?: Quality;
  outputFormat?: OutputFormat;
  /** Per-provider model id overrides. */
  models?: Partial<Record<ProviderId, string>>;
  /** fal only: request an inline base64 data URI instead of a hosted URL. */
  falSyncMode?: boolean;
  /** Seed for reproducible generation (fal only). */
  seed?: number;
  /** Negative prompt (fal only; ignored by providers that do not support it). */
  negativePrompt?: string;
  /** Retries on transient failures (429 / 5xx / network / timeout). Default 2. Applies to both the generation call and the image download. */
  retries?: number;
  /** Per-request timeout in seconds (generation call and image download). Default 120. */
  timeoutSec?: number;
  env: Env;
}

/** Default per-request timeout in seconds. */
export const DEFAULT_TIMEOUT_SEC = 120;

/**
 * Largest usable timeout in seconds. Node timers (including
 * AbortSignal.timeout) cap delays at 2^31-1 ms; a larger value overflows the
 * 32-bit timer and fires after ~1 ms, so every request would instantly time
 * out.
 */
export const MAX_TIMEOUT_SEC = Math.floor((2 ** 31 - 1) / 1000);

/** Validate a timeout in seconds against Node's timer limit, or throw. */
export function assertValidTimeoutSec(seconds: number): number {
  if (seconds > MAX_TIMEOUT_SEC) {
    throw new Error(`--timeout must be at most ${MAX_TIMEOUT_SEC} seconds`);
  }
  return seconds;
}

/** HTTP statuses worth retrying: rate limiting and transient server errors. */
export function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** A failure that should be retried (network error or retriable status). */
class TransientError extends Error {}

/** True when err is the rejection produced by an expired AbortSignal.timeout(). */
export function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.name === "TimeoutError";
}

/**
 * Fetch failures worth retrying: network errors (fetch rejects with a
 * TypeError) and request timeouts (AbortSignal.timeout rejects with a
 * DOMException named "TimeoutError").
 */
export function isTransientFetchError(err: unknown): boolean {
  return err instanceof TypeError || isTimeoutError(err);
}

function backoffMs(attempt: number): number {
  // 0.5s, 1s, 2s, ... capped at 8s.
  return Math.min(8000, 500 * 2 ** (attempt - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` up to `maxAttempts` times, retrying with exponential backoff on
 * transient failures (a thrown TransientError, a network error, or a request
 * timeout). Non-transient errors propagate immediately. The last error is
 * rethrown unchanged once the attempts are exhausted so callers can translate
 * it into a precise message.
 */
async function withRetry<T>(
  maxAttempts: number,
  fn: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const transient = err instanceof TransientError || isTransientFetchError(err);
      if (transient && attempt < maxAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }
}

export interface GeneratedImage {
  provider: ProviderId;
  bytes: Uint8Array;
  mimeType: string;
  costUsd?: number;
  /** The model id the request used. */
  model: string;
  /** The seed the provider used, when it reports one. */
  seed?: number;
}

/** Generate one image from one provider. Throws on missing key or API error. */
export async function generateOne(
  providerId: ProviderId,
  opts: GenerateOptions,
): Promise<GeneratedImage> {
  const provider = getProvider(providerId);
  const apiKey = resolveKey(providerId, opts.env);
  if (!apiKey) {
    throw new Error(`missing API key (set ${envVarFor(providerId)})`);
  }

  const req: GenerateRequest = {
    prompt: opts.prompt,
    preset: resolvePreset(opts.presetName ?? DEFAULT_PRESET),
    presetName: opts.presetName ?? DEFAULT_PRESET,
    quality: opts.quality ?? "high",
    outputFormat: opts.outputFormat ?? "jpeg",
    model: opts.models?.[providerId],
    falSyncMode: providerId === "fal" ? opts.falSyncMode : undefined,
    seed: providerId === "fal" ? opts.seed : undefined,
    negativePrompt: providerId === "fal" ? opts.negativePrompt : undefined,
  };

  const httpReq = provider.buildRequest(req, apiKey);

  // Retry the generation call on transient failures (rate limits / 5xx /
  // network errors / timeouts) with exponential backoff.
  const maxAttempts = (opts.retries ?? 2) + 1;
  const timeoutSec = opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  const timeoutMs = timeoutSec * 1000;
  let res: Response;
  let text: string;
  try {
    ({ res, text } = await withRetry(maxAttempts, async () => {
      const r = await fetch(httpReq.url, {
        method: "POST",
        headers: httpReq.headers,
        body: httpReq.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const t = await r.text();
      if (!r.ok && isRetriableStatus(r.status)) {
        throw new TransientError(`HTTP ${r.status}`);
      }
      return { res: r, text: t };
    }));
  } catch (err) {
    if (err instanceof TransientError) throw new Error(err.message, { cause: err });
    if (isTimeoutError(err)) throw new Error(`request timed out after ${timeoutSec}s`, { cause: err });
    throw err;
  }

  // Read the body as text first: providers return JSON error bodies (which the
  // parser turns into a meaningful message), but gateways/5xx may return HTML.
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `HTTP ${res.status} (non-JSON response): ${text.slice(0, 200).trim()}`,
    );
  }
  // parseResponse turns a provider error field into a precise message. If it
  // did not throw but the HTTP status is still bad, surface the status.
  const parsed = provider.parseResponse(json, req);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  let bytes: Uint8Array;
  let mimeType = parsed.mimeType;
  if (parsed.b64) {
    bytes = Uint8Array.from(Buffer.from(parsed.b64, "base64"));
  } else if (parsed.url && isDataUri(parsed.url)) {
    const { base64, mimeType: dataMime } = parseDataUri(parsed.url);
    bytes = Uint8Array.from(Buffer.from(base64, "base64"));
    mimeType = dataMime;
  } else if (parsed.url) {
    // Retry the download on transient failures (rate limits / 5xx / network
    // errors / timeouts) with the same backoff as the generation call. A
    // non-transient status (e.g. 404) fails immediately without retrying.
    const url = parsed.url;
    try {
      bytes = await withRetry(maxAttempts, async () => {
        const imgRes = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!imgRes.ok) {
          const message = `failed to download image (${imgRes.status})`;
          if (isRetriableStatus(imgRes.status)) throw new TransientError(message);
          throw new Error(message);
        }
        return new Uint8Array(await imgRes.arrayBuffer());
      });
    } catch (err) {
      if (err instanceof TransientError) throw new Error(err.message, { cause: err });
      if (isTimeoutError(err)) {
        throw new Error(`image download timed out after ${timeoutSec}s`, { cause: err });
      }
      throw err;
    }
  } else {
    throw new Error("provider returned neither image data nor a url");
  }

  return {
    provider: providerId,
    bytes,
    mimeType,
    costUsd: parsed.costUsd,
    model: req.model ?? provider.model,
    ...(parsed.seed !== undefined ? { seed: parsed.seed } : {}),
  };
}

export interface GenerateAllResult {
  provider: ProviderId;
  ok: boolean;
  image?: GeneratedImage;
  error?: string;
}

/** Generate from many providers concurrently; never rejects (per-provider status). */
export async function generateAll(
  providerIds: ProviderId[],
  opts: GenerateOptions,
): Promise<GenerateAllResult[]> {
  const settled = await Promise.allSettled(
    providerIds.map((id) => generateOne(id, opts)),
  );
  return settled.map((s, i) => {
    const provider = providerIds[i] as ProviderId;
    if (s.status === "fulfilled") {
      return { provider, ok: true, image: s.value };
    }
    return { provider, ok: false, error: (s.reason as Error).message };
  });
}

function envVarFor(id: ProviderId): string {
  return { openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY", fal: "FAL_KEY" }[id];
}
