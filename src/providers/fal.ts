import { falFluxCost } from "../cost.js";
import type { GenerateRequest, HttpRequest, ParsedImage, Provider } from "./types.js";

/**
 * fal FLUX 2 Pro via fal.run (synchronous).
 * - image_size is an explicit {width, height}
 * - response is a URL in images[0].url that must be downloaded separately
 * - best photoreal texture and cheapest, but CJK text rendering is poor
 *
 * Note: fal is prepaid. With a zero balance, every call fails with
 * "User is locked. Reason: Exhausted balance" (not an auth error).
 */
export const fal: Provider = {
  id: "fal",
  label: "fal FLUX 2 Pro",
  model: "fal-ai/flux-2-pro",

  buildRequest(req: GenerateRequest, apiKey: string): HttpRequest {
    return {
      url: `https://fal.run/${this.model}`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: req.prompt,
        image_size: { width: req.preset.width, height: req.preset.height },
        output_format: req.outputFormat,
      }),
    };
  },

  parseResponse(json: unknown): ParsedImage {
    const d = json as {
      detail?: string | Array<{ msg?: string }>;
      message?: string;
      images?: Array<{ url?: string; width?: number; height?: number }>;
    };
    if (!d.images || d.images.length === 0) {
      const detail =
        typeof d.detail === "string"
          ? d.detail
          : Array.isArray(d.detail)
            ? d.detail.map((x) => x.msg).filter(Boolean).join("; ")
            : undefined;
      throw new Error(detail || d.message || "fal response contained no image");
    }
    const img = d.images[0];
    if (!img?.url) {
      throw new Error("fal response contained no image url");
    }
    const costUsd =
      img.width && img.height ? falFluxCost(img.width, img.height) : undefined;
    return { url: img.url, mimeType: "image/jpeg", costUsd };
  },
};
