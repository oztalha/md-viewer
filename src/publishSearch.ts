/** Fields of a published page that search looks at. */
export interface Searchable {
  title: string;
  key: string;
  url: string;
  id: string;
  targetLabel: string;
}

/**
 * Whether a published page matches a search. Every word must appear in the
 * title, file, link or target. A pasted link also matches when it merely
 * contains the page's link or id, since services add extras to the address
 * (some append a title slug: `/doc/<id>/Some-Title`).
 */
export function pageMatches(page: Searchable, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const url = page.url.toLowerCase();
  if (q.includes(url) || (page.id.length >= 6 && q.includes(page.id.toLowerCase()))) return true;
  const haystack = [page.title, page.key, url, page.targetLabel].join("\n").toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/**
 * The id of a password-protected page from its link: the GitHub Pages address
 * (`https://<login>.github.io/md-viewer-pages/<id>.html`) or the same path on
 * the account's custom domain, which GitHub redirects to.
 */
export function protectedPageId(link: string): string | null {
  return /^https:\/\/[\w.-]+\/md-viewer-pages\/([0-9a-f]{32})\.html(?:[?#]\S*)?$/.exec(link.trim())?.[1] ?? null;
}

/**
 * The id of a page from its link, for linking a document to a page published
 * before (e.g. from another Mac). Uses the target's `urlTemplate` (`{id}` is
 * the id; extra path after it, like a title slug, is fine), or the gist
 * id for gists. Null when the link doesn't fit.
 */
export function idFromLink(
  link: string,
  target: { kind: string; urlTemplate?: string },
): string | null {
  const url = link.trim();
  if (target.kind === "pages") return protectedPageId(url);
  if (target.kind === "gist") {
    return /^https:\/\/gist\.github\.com\/(?:[\w-]+\/)?([0-9a-f]{6,})\b/i.exec(url)?.[1] ?? null;
  }
  if (target.kind === "command") return /^https?:\/\/\S+$/.test(url) ? url : null;
  const template = target.urlTemplate;
  if (!template?.includes("{id}")) return null;
  const pattern = template
    .split(/(\{\w+\})/)
    .map((part) =>
      part === "{id}"
        ? "([^/?#]+)"
        : /^\{\w+\}$/.test(part)
          ? "[^/?#]+"
          : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return new RegExp(`^${pattern}(?:[/?#].*)?$`).exec(url)?.[1] ?? null;
}
