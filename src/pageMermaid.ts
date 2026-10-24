/**
 * Mermaid diagrams in published and exported pages. The app draws each
 * diagram when the page is built (see `drawDiagrams` in mermaid.ts), once in
 * the light and once in the dark theme, and the page shows the one matching
 * the reader's theme. No script is loaded: a password-protected page must not
 * run third-party code once it's decrypted, and pages share an origin.
 * A diagram that can't be drawn keeps its source, shown as code.
 */

export const MERMAID_CSS = `
.mermaid-block { margin: 1em 0; text-align: center; overflow-x: auto; }
.mermaid-block svg { max-width: 100%; height: auto; }
.mermaid-block pre { text-align: left; }
.mermaid-dark { display: none; }
:root[data-theme="dark"] .mermaid-light { display: none; }
:root[data-theme="dark"] .mermaid-dark { display: block; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .mermaid-light { display: none; }
  :root:not([data-theme="light"]) .mermaid-dark { display: block; }
}
`.trim();

/** A drawn diagram: both theme versions, one shown at a time by MERMAID_CSS. */
export function staticDiagram(lightSvg: string, darkSvg: string): string {
  return `<div class="mermaid-light">${lightSvg}</div><div class="mermaid-dark">${darkSvg}</div>`;
}
