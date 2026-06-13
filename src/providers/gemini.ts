import { geminiCost } from "../cost.js";
import type { GenerateRequest, HttpRequest, ParsedImage, Provider } from "./types.js";

/** Whether a Gemini image model accepts imageSize "2K" (Pro / 3.1 families). */
export function geminiSupports2K(model: string): boolean {
  return /pro/i.test(model) || model.includes("3.1");
}

/**
 * Google Gemini "Nano Banana Pro" (gemini-3-pro-image) via generateContent.
 * - aspect ratio is set through generationConfig.imageConfig.aspectRatio
 *   (only fixed ratios; arbitrary pixels are not supported)
 * - imageSize "2K" is supported on Pro / 3.1 models
 * - response image is base64 in candidates[0].content.parts[].inlineData
 * - strong design sense and reliable CJK text rendering
 *
 * Note: do not put pixel coordinates or "safe zone" numbers in the prompt —
 * the model may literally draw them as an inner frame.
 */
export const gemini: Provider = {
  id: "gemini",
  label: "Gemini Nano Banana Pro",
  model: "gemini-3-pro-image",

  buildRequest(req: GenerateRequest, apiKey: string): HttpRequest {
    const model = req.model ?? this.model;
    const imageConfig: Record<string, string> = {
      aspectRatio: req.preset.geminiAspect,
    };
    // imageSize "2K" is only accepted by Pro / 3.1 models; omit for flash models.
    if (geminiSupports2K(model)) {
      imageConfig.imageSize = "2K";
    }
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: req.prompt }] }],
        generationConfig: { imageConfig },
      }),
    };
  },

  parseResponse(json: unknown): ParsedImage {
    const d = json as {
      error?: { message?: string };
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
      }>;
      usageMetadata?: { candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    if (d.error) {
      throw new Error(d.error.message ?? "Gemini API error");
    }
    const parts = d.candidates?.[0]?.content?.parts;
    if (!parts) {
      throw new Error("Gemini returned no content (possibly blocked by safety filters)");
    }
    const image = parts.find((p) => p.inlineData?.data);
    if (!image?.inlineData?.data) {
      throw new Error("Gemini response contained no image data");
    }
    return {
      // inlineData.mimeType is authoritative (Pro returns JPEG, not always PNG).
      b64: image.inlineData.data,
      mimeType: image.inlineData.mimeType ?? "image/png",
      costUsd: geminiCost(
        d.usageMetadata?.candidatesTokenCount,
        d.usageMetadata?.thoughtsTokenCount,
      ),
    };
  },
};
