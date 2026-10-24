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
body { min-height: 100vh; display: flex; flex-direction: column; }
main { flex: 1 0 auto; width: 100%; max-width: 46rem; }
.page-footer { width: 100%; max-width: 46rem; }
.pages-head { display: flex; align-items: center; gap: 14px; margin: .4em 0 1.4em; }
.pages-head img { width: 48px; height: 48px; border-radius: 50%; border: 1px solid var(--border); flex: none; }
.pages-head h1 { margin: 0; font-size: 1.6em; border: none; padding: 0; }
.pages-owner { margin: .15em 0 0; color: var(--fg-muted); font-size: .9em; }
.pages-owner a { color: inherit; }
.pages-filter { width: 100%; box-sizing: border-box; margin: 0 0 1em; padding: 8px 12px; font: inherit; font-size: .92em; color: var(--fg); background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; outline: none; }
.pages-filter:focus { border-color: var(--accent); }
.pages-index { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.pages-index li { margin: 0; }
.pages-index a { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; color: var(--fg); text-decoration: none; transition: background .12s, border-color .12s; }
.pages-index a:hover { background: var(--bg-secondary); border-color: var(--accent); text-decoration: none; }
.pages-title { flex: 1; min-width: 0; font-weight: 500; overflow-wrap: anywhere; }
.pages-index .lock { color: var(--fg-muted); flex: none; }
.pages-index time { flex: none; color: var(--fg-muted); font-size: .85em; font-variant-numeric: tabular-nums; }
.pages-empty, .pages-none { color: var(--fg-muted); text-align: center; padding: 2em 0; }
@media (max-width: 520px) { .pages-index a { flex-wrap: wrap; } .pages-title { flex-basis: 100%; } }
`.trim();

/** Above this many pages the index gets a filter box. */
const FILTER_FROM = 6;

const FILTER_SCRIPT = `(function () {
  var box = document.querySelector(".pages-filter"), none = document.querySelector(".pages-none");
  if (!box) return;
  box.addEventListener("input", function () {
    var q = box.value.trim().toLowerCase(), shown = 0;
    document.querySelectorAll(".pages-index li").forEach(function (li) {
      var hit = li.textContent.toLowerCase().indexOf(q) >= 0;
      li.hidden = !hit;
      if (hit) shown++;
    });
    none.hidden = shown > 0;
  });
})();`;

const DATE = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

/** The index's body (newest first) with its list embedded for the next update. */
export function renderIndexBody(entries: IndexEntry[], owner: string): string {
  const sorted = [...entries].sort((a, b) => b.at - a.at);
  const items = sorted
    .map((e) => {
      const day = new Date(e.at).toISOString().slice(0, 10);
      return `<li><a href="${escapeHtml(e.url)}"><span class="pages-title">${escapeHtml(e.title || "Untitled")}</span>${e.locked ? LOCK : ""}<time datetime="${day}">${DATE.format(e.at)}</time></a></li>`;
    })
    .join("\n");
  // `<` escaped, so a title can't end the script element early.
  const data = JSON.stringify(sorted).replace(/</g, "\\u003c");
  const who = escapeHtml(owner);
  const count = `${sorted.length} page${sorted.length === 1 ? "" : "s"}`;
  const list = sorted.length
    ? `${sorted.length >= FILTER_FROM ? `<input class="pages-filter" type="search" placeholder="Filter ${count}" aria-label="Filter pages">\n` : ""}<ul class="pages-index">\n${items}\n</ul>
<p class="pages-none" hidden>No page matches.</p>`
    : `<p class="pages-empty">Nothing listed yet.</p>`;
  return `<header class="pages-head">
<img src="https://github.com/${who}.png?size=96" alt="" onerror="this.remove()">
<div><h1>Pages</h1><p class="pages-owner">by <a href="https://github.com/${who}">${who}</a> · ${count}</p></div>
</header>
${list}
<script type="application/json" id="${DATA_ID}">${data}</script>${sorted.length >= FILTER_FROM ? `\n<script>${FILTER_SCRIPT}</script>` : ""}`;
}
