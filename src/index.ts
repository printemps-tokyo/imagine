/**
 * imagine — public API.
 * Fan one prompt out to multiple AI image-generation providers from the CLI.
 */
export * from "./presets.js";
export * from "./keys.js";
export * from "./cost.js";
export * from "./datauri.js";
export { buildContactSheet, type ContactSheetItem } from "./contact-sheet.js";
export {
  PROVIDERS,
  PROVIDER_IDS,
  getProvider,
  isProviderId,
  parseProviderList,
  parseModelOverrides,
  resolveModelAlias,
  MODEL_ALIASES,
  openai,
  gemini,
  fal,
  type Provider,
  type ProviderId,
  type GenerateRequest,
  type HttpRequest,
  type ParsedImage,
  type Quality,
  type OutputFormat,
} from "./providers/index.js";
export {
  generateOne,
  generateAll,
  isRetriableStatus,
  type GenerateOptions,
  type GeneratedImage,
  type GenerateAllResult,
} from "./generate.js";

/** Pick a file extension from a mime type ("image/jpeg" -> "jpg"). */
export function extensionForMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}
