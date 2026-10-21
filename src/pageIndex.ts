/**
 * The index page on the user's GitHub Pages (`<you>.github.io/md-viewer-pages/`):
 * the pages they chose to list. Its entries live in the page itself, as JSON,
 * so the repo is the one list every Mac updates. Pure: the page shell (styles,
 * theme toggle) is added by the caller.
 */

export interface IndexEntry {
  id: string;
  title: string;
  url: string;
  /** Needs a password: listed with a lock (the title is still public). */
  locked: boolean;
  /** Last published (ms). */
  at: number;
}

const DATA_ID = "md-viewer-index";
const DATA_RE = new RegExp(`<script type="application/json" id="${DATA_ID}">([\\s\\S]*?)</script>`);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The entries in an index page (none if there's no page yet). Throws if the
 * page is there but its list can't be read, so a bad read never rewrites the
 * index as empty.
 */
export function parseIndex(html: string | null): IndexEntry[] {
  if (html == null) return [];
  const match = DATA_RE.exec(html);
  if (!match) throw new Error("The index page has no list md-viewer can read.");
  const data: unknown = JSON.parse(match[1]);
  if (!Array.isArray(data)) throw new Error("The index page's list is broken.");
  return data.filter(
    (e): e is IndexEntry =>
      !!e && typeof e.id === "string" && typeof e.title === "string" && typeof e.url === "string",
  );
}

/** Add or replace an entry (by page id). */
export function withEntry(entries: IndexEntry[], entry: IndexEntry): IndexEntry[] {
  return [...entries.filter((e) => e.id !== entry.id), entry];
}

export function withoutEntry(entries: IndexEntry[], id: string): IndexEntry[] {
  return entries.filter((e) => e.id !== id);
}

const LOCK =
  '<svg class="lock" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-label="Needs a password" role="img"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';

/** Styles the index adds to the shared page stylesheet. */
export const INDEX_CSS = `
.pages-index { list-style: none; padding: 0; }
.pages-index li { display: flex; align-items: baseline; gap: 10px; padding: 10px 0; margin: 0; border-bottom: 1px solid var(--border); }
.pages-index a { flex: 1; min-width: 0; }
.pages-index .lock { color: var(--fg-muted); flex: none; align-self: center; }
.pages-index time { color: var(--fg-muted); font-size: .85em; font-variant-numeric: tabular-nums; }
.pages-owner { color: var(--fg-muted); margin-top: -.3em; }
`.trim();

/** The index's body (newest first) with its list embedded for the next update. */
export function renderIndexBody(entries: IndexEntry[], owner: string): string {
  const sorted = [...entries].sort((a, b) => b.at - a.at);
  const items = sorted
    .map((e) => {
      const day = new Date(e.at).toISOString().slice(0, 10);
      return `<li><a href="${escapeHtml(e.url)}">${escapeHtml(e.title || "Untitled")}</a>${e.locked ? LOCK : ""}<time datetime="${day}">${day}</time></li>`;
    })
    .join("\n");
  // `<` escaped, so a title can't end the script element early.
  const data = JSON.stringify(sorted).replace(/</g, "\\u003c");
  return `<h1>Pages</h1>
<p class="pages-owner">Published by ${escapeHtml(owner)}</p>
${sorted.length ? `<ul class="pages-index">\n${items}\n</ul>` : "<p>Nothing listed yet.</p>"}
<script type="application/json" id="${DATA_ID}">${data}</script>`;
}
