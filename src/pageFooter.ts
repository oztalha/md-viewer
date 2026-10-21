import { REPO_URL } from "./links";

/** "Published with md-viewer", on pages md-viewer publishes (not on Export as HTML). */
export const FOOTER_HTML = `<footer class="page-footer">Published with <a href="${REPO_URL}">md-viewer</a></footer>`;

export const FOOTER_CSS = `
.page-footer { max-width: 64rem; margin: 0 auto; padding: 18px 28px 32px; border-top: 1px solid var(--border); color: var(--fg-muted); font-size: 13px; text-align: center; }
.page-footer a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.page-footer a:hover { color: var(--fg); }
@media print { .page-footer { display: none; } }
`.trim();
