import type { PresetSize } from "../presets.js";

export type ProviderId = "openai" | "gemini" | "fal";

export type Quality = "low" | "medium" | "high";
export type OutputFormat = "jpeg" | "png";

export interface GenerateRequest {
  prompt: string;
  preset: PresetSize;
  presetName: string;
  quality: Quality;
  outputFormat: OutputFormat;
  /** Override the provider's default model id. */
  model?: string;
  /** fal only: request an inline base64 data URI instead of a hosted URL. */
  falSyncMode?: boolean;
  /** Seed for reproducible generation (honored by fal; ignored elsewhere). */
  seed?: number;
}

/** A pure description of the HTTP call to make. No IO happens here. */
export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * Result of parsing a provider response. Exactly one of `b64` / `url` is set:
 * - `b64`: inline base64 image bytes (OpenAI, Gemini)
 * - `url`: a URL the caller must download (fal)
 */
export interface ParsedImage {
  b64?: string;
  url?: string;
  mimeType: string;
  costUsd?: number;
}

export interface Provider {
  id: ProviderId;
  label: string;
  /** Default model id used for generation. */
  model: string;
  /** Build the HTTP request for a generation. Pure. */
  buildRequest(req: GenerateRequest, apiKey: string): HttpRequest;
  /**
   * Parse the JSON response into image data. Pure. Throws on API errors.
   * `req` is optional; when given, providers that do not echo a mime type
   * (OpenAI, fal) use req.outputFormat to label the bytes correctly.
   */
  parseResponse(json: unknown, req?: GenerateRequest): ParsedImage;
}
