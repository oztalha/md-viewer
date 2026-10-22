/**
 * Mermaid diagrams in published and exported pages. The fence arrives as the
 * preview's placeholder (source as code), and this module script draws it with
 * the CDN build of the Mermaid version the app renders with, redrawing when the
 * reader's theme changes. Offline, or on a bad diagram, the source stays shown.
 */
import mermaidPackage from "mermaid/package.json";

const MERMAID_JS = `https://cdn.jsdelivr.net/npm/mermaid@${mermaidPackage.version}/dist/mermaid.esm.min.mjs`;

export const MERMAID_CSS = `
.mermaid-block { margin: 1em 0; text-align: center; overflow-x: auto; }
.mermaid-block svg { max-width: 100%; height: auto; }
.mermaid-block pre { text-align: left; }
`.trim();

// Same settings as the app (mermaid.ts): strict security, no gradient borders.
export const MERMAID_SCRIPT = `import mermaid from "${MERMAID_JS}";
const root = document.documentElement;
const blocks = [...document.querySelectorAll(".mermaid-block")];
const sources = blocks.map((b) => b.querySelector("code")?.textContent ?? "");
const media = matchMedia("(prefers-color-scheme: dark)");
let drawn = "";
let n = 0;
const draw = async () => {
  const theme = (root.dataset.theme ? root.dataset.theme === "dark" : media.matches) ? "dark" : "default";
  if (theme === drawn) return;
  drawn = theme;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme, fontFamily: "inherit", suppressErrorRendering: true, themeVariables: { useGradient: false } });
  for (const [i, block] of blocks.entries()) {
    const id = "mdv-mermaid-" + ++n;
    try {
      block.innerHTML = (await mermaid.render(id, sources[i])).svg;
    } catch {
      document.getElementById("d" + id)?.remove();
    }
  }
};
let queue = draw();
const redraw = () => { queue = queue.then(draw, draw); };
new MutationObserver(redraw).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
media.addEventListener("change", redraw);`;
