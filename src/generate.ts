/**
 * Generation orchestration: the thin IO shell around the pure providers.
 * Builds each request, performs the HTTP call(s), and returns image bytes.
 */
import { resolveKey, type Env } from "./keys.js";
import { resolvePreset, DEFAULT_PRESET } from "./presets.js";
import { getProvider, type GenerateRequest, type OutputFormat, type ProviderId, type Quality } from "./providers/index.js";

export interface GenerateOptions {
  prompt: string;
  presetName?: string;
  quality?: Quality;
  outputFormat?: OutputFormat;
  env: Env;
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
  };

  const httpReq = provider.buildRequest(req, apiKey);
  const res = await fetch(httpReq.url, {
    method: "POST",
    headers: httpReq.headers,
    body: httpReq.body,
  });

  const json = (await res.json()) as unknown;
  const parsed = provider.parseResponse(json);

  let bytes: Uint8Array;
  if (parsed.b64) {
    bytes = Uint8Array.from(Buffer.from(parsed.b64, "base64"));
  } else if (parsed.url) {
    const imgRes = await fetch(parsed.url);
    if (!imgRes.ok) {
      throw new Error(`failed to download image (${imgRes.status})`);
    }
    bytes = new Uint8Array(await imgRes.arrayBuffer());
  } else {
    throw new Error("provider returned neither image data nor a url");
  }

  return { provider: providerId, bytes, mimeType: parsed.mimeType, costUsd: parsed.costUsd };
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
