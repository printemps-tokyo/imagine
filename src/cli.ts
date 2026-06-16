#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  PROVIDERS,
  PROVIDER_IDS,
  parseProviderList,
  parseModelOverrides,
  resolveKey,
  maskKey,
  resolvePreset,
  PRESETS,
  DEFAULT_PRESET,
  formatCost,
  extensionForMime,
  buildContactSheet,
  generateAll,
  getProvider,
  type ContactSheetItem,
  type Quality,
  type OutputFormat,
} from "./index.js";

const HELP = `imagine - generate images across multiple AI providers from one prompt

Usage:
  imagine [generate] [options] <prompt|prompt-file>
  imagine providers          Show providers and whether their API key is set
  imagine presets            Show size presets

Options:
  -p, --prompt <text|file>  Prompt text, or a path to a file containing it
  -s, --size <preset>       ${Object.keys(PRESETS).join(", ")} (default: ${DEFAULT_PRESET})
  -q, --quality <level>     low | medium | high (default: high; OpenAI only)
  -o, --out <prefix>        Output filename prefix (default: imagine)
      --out-dir <dir>       Directory to write images to (default: .)
      --provider <list>     Comma list: ${PROVIDER_IDS.join(",")} (default: all with a key)
      --model <list>        Per-provider override: provider=model,... (full id or an alias:
                              fal=schnell|dev|pro|flux2-pro, gemini=nano-banana|nano-banana-pro)
      --format <fmt>        jpeg | png (default: jpeg)
      --fal-sync            fal: return inline base64 instead of a hosted URL
      --contact-sheet       Also write an HTML page showing all results side by side
      --seed <n>            Seed for reproducible generation (fal only)
      --negative-prompt <t> What to avoid (fal models that support it; e.g. SDXL)
      --retries <n>         Retries on transient errors: 429 / 5xx / network (default: 2)
      --dry-run             Resolve everything and show the plan; no API calls, no billing
  -h, --help                Show this help
  -v, --version             Show version

Providers (verified 2026-06):
  openai   gpt-image-2        faithful composition, reliable CJK text
  gemini   Nano Banana Pro    strong design sense, reliable CJK text, 2K
  fal      FLUX 2 Pro         best photoreal + cheapest, but CJK text breaks

API keys are read from environment variables only:
  OPENAI_API_KEY, GEMINI_API_KEY, FAL_KEY

Examples:
  imagine "a cute banana mascot" -s square
  imagine -p ./prompt.txt -s a4yoko -o zoo
  imagine --provider openai,gemini -s wide "infographic with Japanese text"
  imagine --provider fal --model fal=fal-ai/flux/schnell "fast draft"
  imagine --contact-sheet -o compare "side-by-side comparison"
  imagine --dry-run "test prompt"
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const sub = argv[0];

  if (sub === "providers") return cmdProviders();
  if (sub === "presets") return cmdPresets();
  if (sub === "-v" || sub === "--version") {
    process.stdout.write((await readVersion()) + "\n");
    return 0;
  }

  const args = sub === "generate" ? argv.slice(1) : argv;
  return cmdGenerate(args);
}

async function cmdGenerate(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      prompt: { type: "string", short: "p" },
      size: { type: "string", short: "s" },
      quality: { type: "string", short: "q" },
      out: { type: "string", short: "o" },
      "out-dir": { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      format: { type: "string" },
      "fal-sync": { type: "boolean", default: false },
      "contact-sheet": { type: "boolean", default: false },
      seed: { type: "string" },
      "negative-prompt": { type: "string" },
      retries: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const promptArg = values.prompt ?? positionals[0];
  if (!promptArg) {
    process.stderr.write("error: no prompt\n\n" + HELP);
    return 1;
  }
  const prompt = await loadPrompt(promptArg);

  const presetName = values.size ?? DEFAULT_PRESET;
  const preset = resolvePreset(presetName); // validates
  const quality = (values.quality ?? "high") as Quality;
  const outputFormat = (values.format ?? "jpeg") as OutputFormat;
  const prefix = values.out ?? "imagine";
  const outDir = values["out-dir"] ?? ".";
  const models = values.model ? parseModelOverrides(values.model) : undefined;
  const falSyncMode = values["fal-sync"];
  const seed = values.seed !== undefined ? parseIntArg("seed", values.seed) : undefined;
  const negativePrompt = values["negative-prompt"];
  const retries = values.retries !== undefined ? parseIntArg("retries", values.retries) : undefined;

  const env = process.env;
  const requested = values.provider
    ? parseProviderList(values.provider)
    : PROVIDER_IDS.filter((id) => resolveKey(id, env));

  if (requested.length === 0) {
    process.stderr.write(
      "error: no providers available (set OPENAI_API_KEY / GEMINI_API_KEY / FAL_KEY)\n",
    );
    return 1;
  }

  // Split into providers that have keys vs. those that do not.
  const ready = requested.filter((id) => resolveKey(id, env));
  const missing = requested.filter((id) => !resolveKey(id, env));
  for (const id of missing) {
    process.stderr.write(`skip ${id}: API key not set\n`);
  }
  if (ready.length === 0) {
    process.stderr.write("error: none of the requested providers have a key set\n");
    return 1;
  }

  process.stdout.write(
    `prompt: ${truncate(prompt, 60)}\n` +
      `size: ${presetName} (${preset.width}x${preset.height}, gemini ${preset.geminiAspect})  ` +
      `quality: ${quality}  format: ${outputFormat}\n` +
      `providers: ${ready.join(", ")}\n`,
  );

  if (values["dry-run"]) {
    for (const id of ready) {
      const provider = getProvider(id);
      const model = models?.[id] ?? provider.model;
      const sync = id === "fal" && falSyncMode ? " sync_mode" : "";
      process.stdout.write(
        `[dry-run] ${id} (${model})${sync} key=${maskKey(resolveKey(id, env))}\n`,
      );
    }
    process.stdout.write("[dry-run] no API calls were made; nothing was billed.\n");
    return 0;
  }

  await mkdir(outDir, { recursive: true });

  const results = await generateAll(ready, {
    prompt,
    presetName,
    quality,
    outputFormat,
    models,
    falSyncMode,
    seed,
    negativePrompt,
    retries,
    env,
  });

  const sheet: ContactSheetItem[] = [];
  let failed = 0;
  for (const r of results) {
    if (r.ok && r.image) {
      const ext = extensionForMime(r.image.mimeType);
      const file = `${prefix}_${r.provider}.${ext}`;
      const path = join(outDir, file);
      await writeFile(path, r.image.bytes);
      const size = (await stat(path)).size;
      const cost = formatCost(r.image.costUsd);
      process.stdout.write(
        `[${r.provider}] saved ${path} (${formatBytes(size)}, est. ${cost})\n`,
      );
      sheet.push({ provider: r.provider, file, label: `${formatBytes(size)} · est. ${cost}` });
    } else {
      failed++;
      process.stderr.write(`[${r.provider}] error: ${r.error}\n`);
    }
  }

  if (values["contact-sheet"] && sheet.length > 0) {
    const sheetPath = join(outDir, `${prefix}_contact.html`);
    await writeFile(sheetPath, buildContactSheet(prompt, sheet));
    process.stdout.write(`contact sheet: ${sheetPath}\n`);
  }

  return failed === ready.length ? 1 : 0;
}

function cmdProviders(): number {
  const env = process.env;
  for (const p of PROVIDERS) {
    const key = resolveKey(p.id, env);
    const status = key ? `ready  ${maskKey(key)}` : "no key";
    process.stdout.write(`${p.id.padEnd(8)} ${p.label.padEnd(24)} ${status}\n`);
  }
  return 0;
}

function cmdPresets(): number {
  for (const [name, s] of Object.entries(PRESETS)) {
    process.stdout.write(
      `${name.padEnd(8)} ${`${s.width}x${s.height}`.padEnd(12)} gemini ${s.geminiAspect}\n`,
    );
  }
  return 0;
}

async function loadPrompt(arg: string): Promise<string> {
  try {
    const s = await stat(arg);
    if (s.isFile()) {
      return (await readFile(arg, "utf8")).trim();
    }
  } catch {
    // not a file; treat as literal text
  }
  return arg;
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n) + "..." : oneLine;
}

/** Parse a CLI value that must be a non-negative integer, or throw. */
function parseIntArg(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--${name} must be a non-negative integer (got "${value}")`);
  }
  return n;
}

function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

async function readVersion(): Promise<string> {
  const { fileURLToPath } = await import("node:url");
  const { dirname } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const raw = await readFile(join(here, "..", "package.json"), "utf8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    process.exit(1);
  });
