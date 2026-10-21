import { renderDocumentHtml } from "./markdown";
import katexPackage from "katex/package.json";
import { THEME_INIT, THEME_TOGGLE } from "./pageTheme";

// Exported files are standalone, so math styling comes from the CDN build of
// the same KaTeX version the app renders with (fonts load from there too).
const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@${katexPackage.version}/dist/katex.min.css`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DARK_VARS = `
    --fg: #e8e8ea; --fg-muted: #98989f; --bg: #1e1e20; --bg-secondary: #29292c;
    --border: rgba(255,255,255,.1); --code-bg: rgba(255,255,255,.06); --accent: #ffd23f;`;

/**
 * Self-contained stylesheet for exported documents — a compact, theme-aware
 * mirror of the in-app preview styling, so the .html looks like the preview
 * when opened anywhere with no external assets. It follows the system theme
 * unless the reader picks one with the toggle (`data-theme` on <html>).
 */
const EXPORT_CSS = `
:root {
  color-scheme: light dark;
  --fg: #1d1d1f; --fg-muted: #73737a; --bg: #fff; --bg-secondary: #f5f5f6;
  --border: rgba(0,0,0,.1); --code-bg: rgba(0,0,0,.05); --accent: #8a6500;
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark;${DARK_VARS}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${DARK_VARS}
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
main { max-width: 64rem; margin: 0 auto; padding: 48px 28px 96px; }
h1, h2, h3, h4, h5, h6 { font-weight: 700; line-height: 1.3; letter-spacing: -.01em; margin: 1.4em 0 .5em; }
h1 { font-size: 1.9em; letter-spacing: -.02em; } h2 { font-size: 1.5em; } h3 { font-size: 1.22em; }
h1:first-child, h2:first-child { margin-top: 0; }
p { margin: .7em 0; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .88em; background: var(--code-bg); padding: .15em .4em; border-radius: 4px; }
pre { background: var(--code-bg); border-radius: 8px; padding: 14px 16px; overflow-x: auto; }
pre code { background: none; padding: 0; font-size: .85em; }
blockquote { margin: .8em 0; padding: .1em 0 .1em 1em; border-left: 3px solid var(--fg-muted); color: var(--fg-muted); }
ul, ol { padding-left: 1.5em; } li { margin: .25em 0; }
/* Tables fill the text column and may grow past it up to 90rem (centered);
   beyond the window they scroll inside themselves, never widening the page. */
table { border-collapse: collapse; margin: 1em 0; display: block; overflow-x: auto; width: max-content; min-width: 100%; max-width: min(90rem, calc(100vw - 32px)); position: relative; left: 50%; transform: translateX(-50%); }
th, td { border: 1px solid var(--border); padding: 6px 12px; text-align: left; overflow-wrap: break-word; }
th { background: var(--bg-secondary); font-weight: 600; }
hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
img { max-width: 100%; border-radius: 6px; }
.frontmatter { display: grid; grid-template-columns: max-content 1fr; gap: 4px 18px; margin: 0 0 1.5em; padding: 12px 16px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 10px; font-size: .88em; }
.frontmatter-row { display: contents; } .frontmatter-key { color: var(--fg-muted); font-weight: 500; }
.markdown-alert { margin: .9em 0; padding: 2px 0 2px 14px; border-left: 3px solid var(--fg-muted); }
.markdown-alert-title { display: flex; align-items: center; gap: 7px; font-weight: 600; margin: .2em 0 .4em; }
.task-list-item { list-style: none; } ul.contains-task-list { padding-left: .4em; }
/* shiki emits both themes' colors as --shiki-light / --shiki-dark. */
.shiki, .shiki span { color: var(--shiki-light); }
:root[data-theme="dark"] .shiki, :root[data-theme="dark"] .shiki span { color: var(--shiki-dark); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .shiki, :root:not([data-theme="light"]) .shiki span { color: var(--shiki-dark); }
}
.theme-toggle {
  position: fixed; top: 12px; right: 12px; width: 32px; height: 32px; padding: 0;
  display: grid; place-items: center; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--border); background: var(--bg); color: var(--fg-muted);
}
.theme-toggle:hover { color: var(--fg); background: var(--bg-secondary); }
@media print { .theme-toggle { display: none; } }
`.trim();

/** Build a complete standalone HTML document from markdown source. */
export function buildExportHtml(source: string, title: string): string {
  const body = renderDocumentHtml(source);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<script>${THEME_INIT}</script>
${body.includes('class="katex') ? `<link rel="stylesheet" href="${KATEX_CSS}">\n` : ""}<style>
${EXPORT_CSS}
</style>
</head>
<body>
<main>
${body}
</main>
<script>${THEME_TOGGLE}</script>
</body>
</html>
`;
}
