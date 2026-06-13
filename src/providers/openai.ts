import { openaiCost } from "../cost.js";
import type { GenerateRequest, HttpRequest, ParsedImage, Provider } from "./types.js";

/**
 * OpenAI gpt-image-2 via /v1/images/generations.
 * - size is an explicit WxH; both dimensions must be multiples of 16
 * - response is base64 in data[0].b64_json
 * - faithful composition and reliable CJK text rendering
 */
export const openai: Provider = {
  id: "openai",
  label: "OpenAI gpt-image-2",
  model: "gpt-image-2",

  buildRequest(req: GenerateRequest, apiKey: string): HttpRequest {
    return {
      url: "https://api.openai.com/v1/images/generations",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: req.model ?? this.model,
        prompt: req.prompt,
        size: `${req.preset.width}x${req.preset.height}`,
        quality: req.quality,
        output_format: req.outputFormat,
      }),
    };
  },

  parseResponse(json: unknown): ParsedImage {
    const d = json as {
      error?: { message?: string };
      data?: Array<{ b64_json?: string }>;
      usage?: { output_tokens?: number };
    };
    if (d.error) {
      throw new Error(d.error.message ?? "OpenAI API error");
    }
    const b64 = d.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("OpenAI response contained no image data");
    }
    return {
      b64,
      mimeType: "image/jpeg",
      costUsd: openaiCost(d.usage?.output_tokens),
    };
  },
};
