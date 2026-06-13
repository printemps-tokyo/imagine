/**
 * API key resolution. Keys come from environment variables only — never from
 * a hardcoded file path — so this tool is safe to publish and share.
 */
import type { ProviderId } from "./providers/types.js";

export const ENV_VARS: Record<ProviderId, string> = {
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  fal: "FAL_KEY",
};

export type Env = Record<string, string | undefined>;

/** Return the API key for a provider, or undefined if its env var is unset. */
export function resolveKey(provider: ProviderId, env: Env): string | undefined {
  const value = env[ENV_VARS[provider]];
  return value && value.trim() ? value.trim() : undefined;
}

/** Mask a key for display: first 6 chars + length. Never print the full key. */
export function maskKey(key: string | undefined): string {
  if (!key) return "(not set)";
  return `${key.slice(0, 6)}...(${key.length} chars)`;
}
