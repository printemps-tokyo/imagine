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
  /** Number of retries on transient failures (429 / 5xx / network). Default 2. */
  retries?: number;
  env: Env;
}

/** HTTP statuses worth retrying: rate limiting and transient server errors. */
export function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** A failure that should be retried (network error or retriable status). */
class TransientError extends Error {}

function backoffMs(attempt: number): number {
  // 0.5s, 1s, 2s, ... capped at 8s.
  return Math.min(8000, 500 * 2 ** (attempt - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GeneratedImage {
  provider: ProviderId;
  bytes: Uint8Array;
  mimeType: string;
  costUsd?: number;
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
  };

  const httpReq = provider.buildRequest(req, apiKey);

  // Retry the generation call on transient failures (rate limits / 5xx /
  // network errors) with exponential backoff.
  const maxAttempts = (opts.retries ?? 2) + 1;
  let res: Response;
  let text: string;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(httpReq.url, {
        method: "POST",
        headers: httpReq.headers,
        body: httpReq.body,
      });
      text = await res.text();
      if (!res.ok && isRetriableStatus(res.status)) {
        throw new TransientError(`HTTP ${res.status}`);
      }
      break;
    } catch (err) {
      const transient = err instanceof TransientError || err instanceof TypeError;
      if (transient && attempt < maxAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err instanceof TransientError ? new Error(err.message) : err;
    }
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
    const imgRes = await fetch(parsed.url);
    if (!imgRes.ok) {
      throw new Error(`failed to download image (${imgRes.status})`);
    }
    bytes = new Uint8Array(await imgRes.arrayBuffer());
  } else {
    throw new Error("provider returned neither image data nor a url");
  }

  return { provider: providerId, bytes, mimeType, costUsd: parsed.costUsd };
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
