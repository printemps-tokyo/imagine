# imagine

> Generate images across multiple AI providers from one prompt. Zero-dependency CLI.

[![CI](https://github.com/printemps-tokyo/imagine/actions/workflows/ci.yml/badge.svg)](https://github.com/printemps-tokyo/imagine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

`imagine` sends one prompt to several AI image-generation APIs at once and saves
each result side by side, so you can compare providers without juggling three
different request formats. Built on the findings of a hands-on comparison of
OpenAI, Google Gemini, and fal (2026-06).

## Providers

| Provider | Model | Strengths | CJK text |
| --- | --- | --- | --- |
| `openai` | gpt-image-2 | Faithful composition and layout | Reliable |
| `gemini` | Nano Banana Pro (gemini-3-pro-image) | Strong design sense, up to 2K | Reliable |
| `fal` | FLUX 2 Pro | Best photoreal texture, cheapest | Breaks (avoid) |

## Requirements

- Node.js >= 20 (uses the built-in `fetch`; no runtime dependencies)
- One or more API keys, provided via environment variables

## Install

```bash
npm install -g @printemps-tokyo/imagine
# or run once:
npx @printemps-tokyo/imagine "a cute banana mascot"
```

## API keys

Keys are read from environment variables only — nothing is read from disk or
written to the repo:

```bash
export OPENAI_API_KEY=sk-...
export GEMINI_API_KEY=AIza...
export FAL_KEY=...
```

By default `imagine` uses every provider that has a key set. Use `--provider`
to pick a subset. Check what is configured with `imagine providers`.

## Usage

```bash
imagine "a cute banana mascot" -s square
imagine -p ./prompt.txt -s a4yoko -o zoo
imagine --provider openai,gemini -s wide "infographic with Japanese text"
imagine --dry-run "test prompt"        # resolve everything, no API calls, no billing
imagine providers                      # list providers and key status
imagine presets                        # list size presets
```

Output files are named `<prefix>_<provider>.<ext>` (e.g. `zoo_openai.jpg`).

### Options

| Option | Description |
| --- | --- |
| `-p, --prompt <text\|file>` | Prompt text, or a path to a file containing it |
| `-s, --size <preset>` | `square`, `yoko`, `tate`, `a4yoko`, `a4tate`, `wide` (default: `a4yoko`) |
| `-q, --quality <level>` | `low`, `medium`, `high` (default: `high`; OpenAI only) |
| `-o, --out <prefix>` | Output filename prefix (default: `imagine`) |
| `--out-dir <dir>` | Directory to write images to (default: `.`) |
| `--provider <list>` | Comma list: `openai,gemini,fal` (default: all with a key) |
| `--model <list>` | Per-provider model override: `provider=model,...` |
| `--format <fmt>` | `jpeg` or `png` (default: `jpeg`) |
| `--fal-sync` | fal: return inline base64 instead of a hosted URL |
| `--contact-sheet` | Also write an HTML page showing all results side by side |
| `--seed <n>` | Seed for reproducible generation (fal only) |
| `--retries <n>` | Retries on transient errors (429 / 5xx / network; default 2) |
| `--dry-run` | Resolve everything and show the plan; no API calls, no billing |

Generation calls retry transient failures (rate limits, 5xx, network) with
exponential backoff. `--seed` is honored by fal/FLUX for reproducible output;
OpenAI and Gemini ignore it.

### Switching models

Each provider has a default model, but you can override it per provider — useful
for cheaper / faster variants:

```bash
# fast, cheap drafts on fal; original Nano Banana on Gemini
imagine --model "fal=fal-ai/flux/schnell,gemini=gemini-2.5-flash-image" "quick idea"
```

`imageSize: 2K` is sent to Gemini only for Pro / 3.1 models; flash models omit it
automatically. With `--fal-sync`, fal returns the image inline as a base64 data
URI instead of a hosted URL (the result is not stored on fal).

### Comparing results

`--contact-sheet` writes `<prefix>_contact.html` next to the images, showing each
provider's output side by side with its size and estimated cost — open it in a
browser to compare at a glance.

```bash
imagine --contact-sheet -o compare "a cozy reading nook, watercolor"
```

### Size presets

Each provider accepts a different size format, so presets map to all three:

| Preset | OpenAI / fal (px) | Gemini (aspect) |
| --- | --- | --- |
| `square` | 1024x1024 | 1:1 |
| `yoko` | 1536x1024 | 3:2 |
| `tate` | 1152x1536 | 3:4 |
| `a4yoko` | 1536x1088 | 3:2 |
| `a4tate` | 1088x1536 | 2:3 |
| `wide` | 1536x864 | 16:9 |

OpenAI requires both dimensions to be multiples of 16. Gemini accepts only
fixed aspect ratios (A4's 1.414 is approximated with 3:2 / 2:3).

## Choosing a provider

- Japanese (CJK) text in the image: `openai` or `gemini`. `fal` (FLUX) garbles it.
- Photoreal people / product shots / illustration: `fal` (FLUX) — comparable
  quality at roughly half the price.
- Design-forward layouts and infographics: `gemini` (design sense) or `openai`
  (most faithful to layout instructions).

Tip: with Gemini, do not write pixel coordinates or "safe zone" numbers in the
prompt — it may literally draw them as a frame. Say "centered with generous
margins" instead.

## Cost

`imagine` prints a rough per-image cost estimate based on 2026-06 public
pricing. The authoritative cost is whatever each provider bills.

| Provider | Approx. per image |
| --- | --- |
| OpenAI gpt-image-2 (high) | ~$0.165 |
| Gemini Nano Banana Pro (2K) | ~$0.14 |
| fal FLUX 2 Pro | ~$0.045 - 0.075 |

`fal` is prepaid: with a zero balance, calls fail with "User is locked. Reason:
Exhausted balance" (not an auth error).

## Programmatic API

```ts
import { generateAll, resolveKey } from "@printemps-tokyo/imagine";

const results = await generateAll(["openai", "fal"], {
  prompt: "a cute banana mascot",
  presetName: "square",
  env: process.env,
});

for (const r of results) {
  if (r.ok) console.log(r.provider, r.image!.bytes.length);
  else console.error(r.provider, r.error);
}
```

## License

[MIT](./LICENSE) (c) printemps.tokyo
