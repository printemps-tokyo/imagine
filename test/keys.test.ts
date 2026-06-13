import { describe, expect, it } from "vitest";
import { resolveKey, maskKey, ENV_VARS } from "../src/keys.js";

describe("resolveKey", () => {
  it("reads the provider's env var", () => {
    const env = { OPENAI_API_KEY: "sk-test-123", GEMINI_API_KEY: "g-456" };
    expect(resolveKey("openai", env)).toBe("sk-test-123");
    expect(resolveKey("gemini", env)).toBe("g-456");
    expect(resolveKey("fal", env)).toBeUndefined();
  });

  it("trims whitespace and treats blanks as unset", () => {
    expect(resolveKey("openai", { OPENAI_API_KEY: "  sk-x  " })).toBe("sk-x");
    expect(resolveKey("openai", { OPENAI_API_KEY: "   " })).toBeUndefined();
  });

  it("maps each provider to the expected env var", () => {
    expect(ENV_VARS).toEqual({
      openai: "OPENAI_API_KEY",
      gemini: "GEMINI_API_KEY",
      fal: "FAL_KEY",
    });
  });
});

describe("maskKey", () => {
  it("never reveals the full key", () => {
    const masked = maskKey("sk-proj-abcdefghijklmnop");
    expect(masked).toBe("sk-pro...(24 chars)");
    expect(masked).not.toContain("abcdefgh");
  });

  it("handles an unset key", () => {
    expect(maskKey(undefined)).toBe("(not set)");
  });
});
