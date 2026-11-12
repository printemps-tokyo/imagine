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
| `openai` | GPT Image 2.6 Flare (gpt-image-2.6-flare) | Faithful composition and layout | Reliable |
| `gemini` | Nano Banana Pro (gemini-3-pro-image) | Strong design sense, up to 2K | Reliable |
| `fal` | FLUX 2 Pro | Best photoreal texture, cheapest | Breaks (avoid) |

The strengths and CJK columns come from the 2026-06 comparison, when the
OpenAI default was gpt-image-2. That model is deprecated (removed from the API
on 2027-02-10), so the default is now gpt-image-2.6-flare, which OpenAI
recommends in its place; use `--model openai=image-2` for the old one while it
lasts.

## Requirements

- Node.js >= 22 (uses the built-in `fetch`; no runtime dependencies)
- One or more API keys, provided via environment variables

## Install

Not published to npm yet — install from source:

```bash
git clone https://github.com/printemps-tokyo/imagine
cd imagine
npm install && npm run build
npm link   # optional: puts the `imagine` command on your PATH
```

Then run `imagine …` (after `npm link`), or `node dist/cli.js …` from the clone.

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
| `-q, --quality <level>` | `low`, `medium`, `high`, `xhigh`, `max` (default: `high`; OpenAI only; `xhigh` and `max` need gpt-image-2.5 or 2.6) |
| `-o, --out <prefix>` | Output filename prefix (default: `imagine`) |
| `--out-dir <dir>` | Directory to write images to (default: `.`) |
| `--provider <list>` | Comma list: `openai,gemini,fal` (default: all with a key) |
| `--model <list>` | Per-provider model override: `provider=model,...` |
| `--format <fmt>` | `jpeg` or `png` (default: `jpeg`) |
| `--fal-sync` | fal: return inline base64 instead of a hosted URL |
| `--contact-sheet` | Also write an HTML page showing all results side by side |
| `--seed <n>` | Seed for reproducible generation (fal only) |
| `--negative-prompt <t>` | What to avoid (fal models that support it; FLUX ignores it) |
| `--metadata` | Write the prompt and settings into PNG output (see below) |
| `--retries <n>` | Retries on transient errors (429 / 5xx / network / timeout) for both the generation call and the image download (default 2) |
| `--timeout <sec>` | Per-request timeout in seconds (default 120, max 2147483) |
| `--dry-run` | Resolve everything and show the plan; no API calls, no billing |

Invalid `--quality` or `--format` values are rejected before any API call.
Both the generation call and the image download retry transient failures (rate
limits, 5xx, network errors, timeouts) with exponential backoff, using the same
`--retries` count and `--timeout` per attempt. `--timeout` bounds each HTTP
request so a hung provider cannot stall the CLI forever. A download that fails
every attempt fails only that provider's result; the other providers still run.
Values above 2147483 seconds are rejected because Node timers cap at
2^31-1 ms. `--seed` is honored by fal/FLUX for reproducible output;
OpenAI and Gemini ignore it. `--negative-prompt` is passed to fal for models
that support it (e.g. SDXL-based); FLUX and the other providers ignore it.

### Switching models

Each provider has a default model, but you can override it per provider — useful
for cheaper / faster variants:

```bash
# fast, cheap drafts on fal; original Nano Banana on Gemini (using aliases)
imagine --model "fal=schnell,gemini=nano-banana" "quick idea"
```

Short aliases expand to full model ids (a full id is accepted too):

| Provider | Alias | Model |
| --- | --- | --- |
| `fal` | `schnell` | `fal-ai/flux/schnell` |
| `fal` | `dev` | `fal-ai/flux/dev` |
| `fal` | `pro` | `fal-ai/flux-pro` |
| `fal` | `flux2-pro` | `fal-ai/flux-2-pro` |
| `fal` | `flux2-max` | `fal-ai/flux-2-max` |
| `fal` | `flux2-flex` | `fal-ai/flux-2-flex` |
| `fal` | `flux2-dev` | `fal-ai/flux-2-dev` |
| `fal` | `flux2-turbo` | `fal-ai/flux-2/turbo` |
| `fal` | `flux2-flash` | `fal-ai/flux-2/flash` |
| `gemini` | `nano-banana` | `gemini-2.5-flash-image` (removed from the API on 2027-03-15) |
| `gemini` | `nano-banana-2` | `gemini-3.1-flash-image` |
| `gemini` | `nano-banana-2.1` | `gemini-nano-banana-2.1` |
| `gemini` | `nano-banana-pro` | `gemini-3-pro-image` |
| `openai` | `flare` | `gpt-image-2.6-flare` |
| `openai` | `sunburst` | `gpt-image-2.6-sunburst` |
| `openai` | `image-2` | `gpt-image-2` (removed from the API on 2027-02-10) |

`imageSize: 2K` is sent to Gemini models that take it (Pro, 3.1 Flash, Nano
Banana 2.1); 2.5 Flash and 3.1 Flash-Lite get their 1K default. With `--fal-sync`, fal returns the image inline as a base64 data
URI instead of a hosted URL (the result is not stored on fal).

### Prompt and settings in the file

With `--metadata` (and `--format png`), each PNG carries what made it, as
standard PNG text chunks (iTXt, UTF-8): the prompt under `Description`,
`Software` and `Creation Time`, and the settings as JSON under `imagine`
(provider, model, size preset and pixels, quality, the negative prompt, and
the seed fal reports, so a fal image can be made again with `--seed`). Image
viewers, `exiftool` and Pillow (`Image.open(f).text`) read them. It is off by
default because anyone you send the file to can read the prompt. JPEG output
is written without it.

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

`imagine` prints a rough per-image cost estimate from the providers' public
pricing as checked on 2026-11-12. The authoritative cost is whatever each
provider bills. OpenAI's estimate uses the output tokens the response reports;
Gemini's uses the reported image and thinking tokens (or the model's usual
image tokens); fal's uses the output megapixels. A model imagine has no price
for shows `$?`.

| Model | Price |
| --- | --- |
| OpenAI gpt-image-2.6 / 2.5 (Flare, Sunburst), gpt-image-2 | $30 per 1M image output tokens |
| OpenAI gpt-image-1.5 / gpt-image-1-mini (removed 2026-12-01) | $32 / $8 per 1M image output tokens |
| Gemini Nano Banana Pro | $120 per 1M image tokens; 1K-2K image 1120 tokens (~$0.134) |
| Gemini Nano Banana 2 (3.1 Flash Image) | $60 per 1M; 2K image 1680 tokens (~$0.101) |
| Gemini Nano Banana 2.1 | $30 per 1M; 2K image 1680 tokens (~$0.050) |
| Gemini Nano Banana 2 Lite (3.1 Flash-Lite Image) | $30 per 1M; 1K image 1120 tokens (~$0.034) |
| Gemini Nano Banana (2.5 Flash Image) | ~$0.039 per image |
| fal FLUX 2 Pro | $0.03 the first megapixel, $0.015 each further one (rounded up) |
| fal FLUX 2 Max | $0.07 the first megapixel, $0.03 each further one (rounded up) |
| fal FLUX 2 Flex | $0.05 per megapixel (rounded up) |
| fal FLUX 2 [dev] / Turbo / Flash | $0.012 / $0.008 / $0.005 per megapixel |

The OpenAI quality levels `xhigh` and `max` exist on the 2.5 and 2.6 models
only; imagine refuses them for other models before calling the API.

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
