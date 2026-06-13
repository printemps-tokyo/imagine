/**
 * Build a self-contained HTML contact sheet that shows every generated image
 * side by side for comparison. Zero dependencies: it references the saved image
 * files by relative name, so it must live in the same directory as them.
 */

export interface ContactSheetItem {
  provider: string;
  /** Relative file name of the saved image (same dir as the html). */
  file: string;
  label?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildContactSheet(prompt: string, items: ContactSheetItem[]): string {
  const cards = items
    .map(
      (it) => `    <figure>
      <img src="${escapeHtml(it.file)}" alt="${escapeHtml(it.provider)}" loading="lazy" />
      <figcaption><strong>${escapeHtml(it.provider)}</strong>${
        it.label ? ` &middot; ${escapeHtml(it.label)}` : ""
      }</figcaption>
    </figure>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>imagine contact sheet</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #111; color: #eee; }
    h1 { font-size: 16px; font-weight: 600; }
    p.prompt { color: #aaa; max-width: 80ch; }
    .grid { display: flex; flex-wrap: wrap; gap: 16px; }
    figure { margin: 0; background: #1c1c1c; border-radius: 8px; padding: 8px; }
    figure img { max-width: 420px; height: auto; display: block; border-radius: 4px; }
    figcaption { margin-top: 8px; font-size: 13px; color: #ccc; }
  </style>
</head>
<body>
  <h1>imagine contact sheet</h1>
  <p class="prompt">${escapeHtml(prompt)}</p>
  <div class="grid">
${cards}
  </div>
</body>
</html>
`;
}
