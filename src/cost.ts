/**
 * Rough cost estimates (USD). These are heuristics for display only — the
 * authoritative cost is whatever each provider bills. Figures are based on
 * 2026-06 public pricing and may drift over time.
 */

/** fal FLUX 2 Pro: $0.03 for the first megapixel, $0.015 per additional MP, ceil. */
export function falFluxCost(width: number, height: number): number {
  const mp = Math.ceil((width * height) / 1_000_000);
  if (mp <= 0) return 0;
  return 0.03 + 0.015 * (mp - 1);
}

/** OpenAI gpt-image-2: image output billed at $30 / 1M output tokens. */
export function openaiCost(outputTokens: number | undefined): number | undefined {
  if (outputTokens === undefined) return undefined;
  return (outputTokens / 1_000_000) * 30;
}

/**
 * Gemini Nano Banana Pro: image output ~$120 / 1M tokens, plus thinking
 * tokens at ~$12 / 1M. When the response reports image token usage we use it;
 * otherwise fall back to ~1120 tokens (the observed cost of a 1K/2K image).
 * Thinking tokens are added only when reported.
 */
export function geminiCost(
  imageTokens: number | undefined,
  thinkingTokens = 0,
): number {
  const tokens = imageTokens ?? 1120;
  return (tokens * 120 + thinkingTokens * 12) / 1_000_000;
}

/** Format a USD amount for display, or "?" when unknown. */
export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return "$?";
  return `$${usd.toFixed(3)}`;
}
