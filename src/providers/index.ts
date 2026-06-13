import { openai } from "./openai.js";
import { gemini } from "./gemini.js";
import { fal } from "./fal.js";
import type { Provider, ProviderId } from "./types.js";

export * from "./types.js";
export { openai, gemini, fal };

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
