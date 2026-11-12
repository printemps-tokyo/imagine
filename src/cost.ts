/**
 * Rough cost estimates (USD). These are heuristics for display only; the
 * authoritative cost is whatever each provider bills. Figures are from the
 * providers' public pricing pages as of 2026-11-12 (OpenAI API pricing,
 * Gemini API pricing, and each fal model page) and may drift over time. A
 * model that is not listed here gets no estimate ("$?") rather than a guess.
 */

interface FalPrice {
  /** USD for the first megapixel. */
  first: number;
  /** USD per further megapixel. */
  next: number;
  /** Whether megapixels are rounded up, as the model page states. */
  ceil: boolean;
}

/** fal FLUX.2 prices per output megapixel (text-to-image, no input images). */
export const FAL_PRICES: Record<string, FalPrice> = {
  "fal-ai/flux-2-pro": { first: 0.03, next: 0.015, ceil: true },
  "fal-ai/flux-2-max": { first: 0.07, next: 0.03, ceil: true },
  "fal-ai/flux-2-flex": { first: 0.05, next: 0.05, ceil: true },
  "fal-ai/flux-2": { first: 0.012, next: 0.012, ceil: false },
  "fal-ai/flux-2-dev": { first: 0.012, next: 0.012, ceil: false },
  "fal-ai/flux-2/turbo": { first: 0.008, next: 0.008, ceil: false },
  // From the billing data embedded in the model page.
  "fal-ai/flux-2/flash": { first: 0.005, next: 0.005, ceil: false },
};

/** A fal model's cost for a width x height output, or undefined when unknown. */
export function falCost(model: string, width: number, height: number): number | undefined {
  const price = FAL_PRICES[model];
  if (!price) return undefined;
  const raw = (width * height) / 1_000_000;
  const mp = price.ceil ? Math.ceil(raw) : raw;
  if (mp <= 0) return 0;
  return price.first * Math.min(1, mp) + price.next * Math.max(0, mp - 1);
}

/** fal FLUX 2 Pro (kept for the public API): first megapixel $0.03, then $0.015 each, rounded up. */
export function falFluxCost(width: number, height: number): number {
  return falCost("fal-ai/flux-2-pro", width, height) ?? 0;
}

/** OpenAI image output, USD per 1M output tokens. */
export const OPENAI_OUTPUT_PER_M: Record<string, number> = {
  "gpt-image-2.6-sunburst": 30,
  "gpt-image-2.6-flare": 30,
  "gpt-image-2.5-sunburst": 30,
  "gpt-image-2.5-flare": 30,
  "gpt-image-2": 30,
  "gpt-image-1.5": 32,
  "gpt-image-1-mini": 8,
};

/** OpenAI cost from the reported output tokens; undefined when either is unknown. */
export function openaiCost(
  outputTokens: number | undefined,
  model = "gpt-image-2",
): number | undefined {
  const rate = OPENAI_OUTPUT_PER_M[model];
  if (outputTokens === undefined || rate === undefined) return undefined;
  return (outputTokens / 1_000_000) * rate;
}

interface GeminiPrice {
  /** USD per 1M image output tokens. */
  image: number;
  /** USD per 1M text and thinking output tokens; undefined when not published. */
  text?: number;
  /** Image tokens for the size imagine asks for, when usage is not reported. */
  tokens: number;
}

/**
 * Gemini image models. imagine asks for 2K where a model supports it, so
 * `tokens` is the 2K count (1K for models without 2K).
 */
export const GEMINI_PRICES: Record<string, GeminiPrice> = {
  "gemini-3-pro-image": { image: 120, text: 12, tokens: 1120 },
  "gemini-nano-banana-2.1": { image: 30, text: 7.5, tokens: 1680 },
  "gemini-3.1-flash-image": { image: 60, text: 3, tokens: 1680 },
  "gemini-3.1-flash-lite-image": { image: 30, text: 1.5, tokens: 1120 },
  "gemini-2.5-flash-image": { image: 30, tokens: 1290 },
};

/**
 * Gemini cost: reported image tokens (or the model's usual count) at the
 * image rate, plus reported thinking tokens at the text rate. Undefined for
 * an unknown model, or thinking tokens with no published rate.
 */
export function geminiCost(
  imageTokens: number | undefined,
  thinkingTokens = 0,
  model = "gemini-3-pro-image",
): number | undefined {
  const price = GEMINI_PRICES[model];
  if (!price) return undefined;
  if (thinkingTokens > 0 && price.text === undefined) return undefined;
  const tokens = imageTokens ?? price.tokens;
  return (tokens * price.image + thinkingTokens * (price.text ?? 0)) / 1_000_000;
}

/** Format a USD amount for display, or "?" when unknown. */
export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return "$?";
  return `$${usd.toFixed(3)}`;
}
