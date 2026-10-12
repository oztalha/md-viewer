/**
 * Mermaid diagrams in the preview (```mermaid fences).
 *
 * The markdown pipeline is synchronous and cached per block, but Mermaid
 * renders asynchronously and is large, so the fence renders as a placeholder
 * (`.mermaid-block`, carrying its source) and this module fills placeholders in
 * after each preview update. Mermaid is loaded only when a document has a
 * diagram. SVGs are cached by theme + source, so typing elsewhere never
 * re-renders a diagram; a theme switch re-renders them in the new colours.
 */

type MermaidApi = typeof import("mermaid").default;

let loading: Promise<MermaidApi> | null = null;
let configuredTheme = "";
const cache = new Map<string, string>();
let counter = 0;

function isDark(): boolean {
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced) return forced === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

async function mermaid(): Promise<MermaidApi> {
  loading ??= import("mermaid").then((m) => m.default);
  const api = await loading;
  const theme = isDark() ? "dark" : "default";
  if (theme !== configuredTheme) {
    // `strict`: labels are sanitized and click handlers/scripts are disabled.
    // suppressErrorRendering: on a syntax error Mermaid otherwise appends its
    // own "Syntax error" graphic to <body>, outside the preview, which wrecks
    // the whole window layout. We show the error inside the block instead.
    api.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme,
      fontFamily: "inherit",
      suppressErrorRendering: true,
    });
    configuredTheme = theme;
  }
  return api;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Render every diagram placeholder under `root` that isn't current. */
export async function renderMermaid(root: ParentNode): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>(".mermaid-block")];
  const theme = isDark() ? "dark" : "light";
  const todo = blocks.filter((b) => b.dataset.rendered !== theme);
  if (todo.length === 0) return;
  const api = await mermaid();
  for (const block of todo) {
    // The source is the placeholder's code block (the sanitizer drops data-
    // attributes); once drawn it's kept on the element for redraws.
    const source = block.dataset.source ?? block.querySelector("code")?.textContent ?? "";
    block.dataset.source = source;
    const key = `${theme}\n${source}`;
    let svg = cache.get(key);
    if (svg === undefined) {
      const id = `mdv-mermaid-${++counter}`;
      try {
        // Validate first, so a bad diagram never reaches the renderer.
        await api.parse(source);
        ({ svg } = await api.render(id, source));
      } catch (err) {
        // Belt and braces: drop any scratch element Mermaid left in <body>.
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
        const message = err instanceof Error ? err.message : String(err);
        svg = `<div class="mermaid-error">Mermaid: ${escapeHtml(message)}</div><pre class="mermaid-source"><code>${escapeHtml(source)}</code></pre>`;
      }
      cache.set(key, svg);
    }
    // The block may have been replaced while we waited.
    if (!block.isConnected) continue;
    block.innerHTML = svg;
    block.dataset.rendered = theme;
  }
}

/** Re-render diagrams in every preview (after a theme change). */
export function rerenderAllMermaid(): void {
  for (const preview of document.querySelectorAll(".preview-content")) void renderMermaid(preview);
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rerenderAllMermaid);

