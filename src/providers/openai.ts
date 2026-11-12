import { openaiCost } from "../cost.js";
import type { GenerateRequest, HttpRequest, ParsedImage, Provider } from "./types.js";

/**
 * OpenAI GPT Image via /v1/images/generations (default gpt-image-2.6-flare;
 * gpt-image-2 is deprecated, removed from the API on 2027-02-10).
 * - size is an explicit WxH; both dimensions must be multiples of 16
 * - quality xhigh and max exist on the 2.5 and 2.6 models only
 * - response is base64 in data[0].b64_json
 * - faithful composition and reliable CJK text rendering
 */
/** Whether an OpenAI image model takes the xhigh and max qualities. */
export function openaiHasHigherQualities(model: string): boolean {
  return /^gpt-image-2\.[5-9]|^gpt-image-[3-9]/.test(model);
}

export const openai: Provider = {
  id: "openai",
  label: "OpenAI GPT Image 2.6 Flare",
  model: "gpt-image-2.6-flare",

  buildRequest(req: GenerateRequest, apiKey: string): HttpRequest {
    const model = req.model ?? this.model;
    if ((req.quality === "xhigh" || req.quality === "max") && !openaiHasHigherQualities(model)) {
      throw new Error(`quality "${req.quality}" needs gpt-image-2.5 or 2.6 (model is ${model})`);
    }
    return {
      url: "https://api.openai.com/v1/images/generations",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: req.prompt,
        size: `${req.preset.width}x${req.preset.height}`,
        quality: req.quality,
        output_format: req.outputFormat,
      }),
    };
  },

  parseResponse(json: unknown, req?: GenerateRequest): ParsedImage {
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
      mimeType: req?.outputFormat === "png" ? "image/png" : "image/jpeg",
      costUsd: openaiCost(d.usage?.output_tokens, req?.model ?? this.model),
    };
  },
};
