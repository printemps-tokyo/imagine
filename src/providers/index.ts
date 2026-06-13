import { openai } from "./openai.js";
import { gemini } from "./gemini.js";
import { fal } from "./fal.js";
import type { Provider, ProviderId } from "./types.js";

export * from "./types.js";
export { openai, gemini, fal };
export { geminiSupports2K } from "./gemini.js";

/** All providers in display order. */
export const PROVIDERS: Provider[] = [openai, gemini, fal];

export const PROVIDER_IDS: ProviderId[] = PROVIDERS.map((p) => p.id);

export function getProvider(id: ProviderId): Provider {
  const found = PROVIDERS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`unknown provider "${id}" (expected: ${PROVIDER_IDS.join(", ")})`);
  }
  return found;
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDER_IDS.includes(value as ProviderId);
}

/** Parse a comma-separated provider list, validating each entry. */
export function parseProviderList(value: string): ProviderId[] {
  const ids = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!isProviderId(id)) {
      throw new Error(`unknown provider "${id}" (expected: ${PROVIDER_IDS.join(", ")})`);
    }
  }
  return ids as ProviderId[];
}

/**
 * Parse model overrides of the form "provider=model,provider=model".
 * Example: "fal=fal-ai/flux/schnell,gemini=gemini-2.5-flash-image"
 */
export function parseModelOverrides(value: string): Partial<Record<ProviderId, string>> {
  const out: Partial<Record<ProviderId, string>> = {};
  for (const pair of value.split(",").map((s) => s.trim()).filter(Boolean)) {
    const eq = pair.indexOf("=");
    if (eq < 0) {
      throw new Error(`invalid --model entry "${pair}" (expected provider=model)`);
    }
    const id = pair.slice(0, eq).trim();
    const model = pair.slice(eq + 1).trim();
    if (!isProviderId(id)) {
      throw new Error(`unknown provider "${id}" in --model (expected: ${PROVIDER_IDS.join(", ")})`);
    }
    if (!model) {
      throw new Error(`empty model for provider "${id}" in --model`);
    }
    out[id] = model;
  }
  return out;
}
