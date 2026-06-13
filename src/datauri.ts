/**
 * Parse a base64 data URI ("data:image/png;base64,AAAA...") into its mime type
 * and raw base64 payload. Used for fal's sync_mode inline responses.
 */
export interface DataUri {
  mimeType: string;
  base64: string;
}

export function isDataUri(value: string): boolean {
  return value.startsWith("data:");
}

export function parseDataUri(uri: string): DataUri {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri);
  if (!match || !match[2]) {
    throw new Error("not a base64 data URI");
  }
  return {
    mimeType: match[1] || "application/octet-stream",
    base64: match[3] ?? "",
  };
}
