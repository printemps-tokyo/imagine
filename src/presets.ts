/**
 * Size presets mapped to each provider's accepted format.
 *
 * - OpenAI gpt-image-2 accepts an explicit WxH, but both dimensions must be
 *   multiples of 16 (otherwise it returns HTTP 400).
 * - Gemini (Nano Banana Pro) only accepts a fixed aspectRatio, not arbitrary
 *   pixels. A4 (1.414) has no exact ratio, so it is approximated with 3:2 / 2:3.
 * - fal FLUX accepts an arbitrary {width, height}.
 */

export type PresetName = "square" | "yoko" | "tate" | "a4yoko" | "a4tate" | "wide";

export interface PresetSize {
  /** Pixel width used by OpenAI and fal. Always a multiple of 16. */
  width: number;
  /** Pixel height used by OpenAI and fal. Always a multiple of 16. */
  height: number;
  /** Aspect ratio string used by Gemini's imageConfig. */
  geminiAspect: string;
}

export const PRESETS: Record<PresetName, PresetSize> = {
  square: { width: 1024, height: 1024, geminiAspect: "1:1" },
  yoko: { width: 1536, height: 1024, geminiAspect: "3:2" },
  tate: { width: 1152, height: 1536, geminiAspect: "3:4" },
  a4yoko: { width: 1536, height: 1088, geminiAspect: "3:2" },
  a4tate: { width: 1088, height: 1536, geminiAspect: "2:3" },
  wide: { width: 1536, height: 864, geminiAspect: "16:9" },
};

export const DEFAULT_PRESET: PresetName = "a4yoko";

export function isPreset(name: string): name is PresetName {
  return Object.prototype.hasOwnProperty.call(PRESETS, name);
}

export function resolvePreset(name: string): PresetSize {
  if (!isPreset(name)) {
    throw new Error(
      `unknown preset "${name}" (expected: ${Object.keys(PRESETS).join(", ")})`,
    );
  }
  return PRESETS[name];
}
