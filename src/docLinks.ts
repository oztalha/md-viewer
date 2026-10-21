/**
 * Links from a markdown document to other local markdown files, for
 * publishing a document together with the documents it links to.
 *
 * A small scanner rather than markdown-it: we need source offsets to rewrite
 * links in place, and markdown-it's inline tokens don't carry them. It covers
 * inline links (`[x](a.md)`, `[x](<a b.md> "title")`) and reference
 * definitions (`[x]: a.md`), and skips fenced code, inline code and images.
 * Bare file names and paths in prose (`methods.md`, `notes/plan.md`) count as
 * links too, as the preview links them (see `bareDocLinks.ts`).
 */

const DOC_EXT = /\.(md|markdown|mdown|mkdn|mkd)$/i;

/** Resolve a relative/absolute link target against a base directory. */
export function resolveLink(baseDir: string | null, href: string): string | null {
  let clean: string;
  try {
    clean = decodeURI(href.split("#")[0].split("?")[0]);
  } catch {
    return null; // malformed %-escape
  }
  if (!clean) return null;
  if (clean.startsWith("/")) return normalizePath(clean);
  if (!baseDir) return null;
  return normalizePath(`${baseDir}/${clean}`);
}

/** Collapse `.` and `..` segments (so one file always gets one key). */
function normalizePath(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

/** An href that points at a markdown file on the same machine. */
export function isLocalDocHref(href: string): boolean {
  if (!href || href.startsWith("#") || href.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false; // https:, mailto:, file:, …
  return DOC_EXT.test(href.split("#")[0].split("?")[0]);
}

/**
 * A bare markdown file name or path in prose: `methods.md`, `notes/plan.md`,
 * `../a.md`, `/abs/a.md`. Group 1 is what precedes it (start of text, space or
 * an opening bracket/quote), so it can't be the tail of a URL or of a word;
 * group 2 is the path. `www.x.md` is excluded by `isBareDocPath`.
 */
export const BARE_DOC_PATH =
  /(^|[\s([{"'])((?:(?:\.{1,2}\/)+|\/)?(?:[\w@+-][\w.@+-]*\/)*[\w@+-][\w.@+-]*\.(?:md|markdown|mdown|mkdn|mkd))(?=$|[\s)\]}"',.;:!?])/g;

/** A bare path match that should become a link (not a `www.` web address). */
export function isBareDocPath(path: string): boolean {
  return !/^www\./i.test(path);
}

interface LinkSpan {
  href: string;
  /** Offsets of the destination (including any `<…>`) in the source. */
  start: number;
  end: number;
  /** A bare path in prose: rewriting it makes a `[path](url)` link. */
  bare?: boolean;
}

const INLINE = /(!?)\[(?:[^[\]\n]|\[[^[\]\n]*\])*\]\(\s*(<[^<>\n]*>|[^\s()<>]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
const REFERENCE = /^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^<>\n]*>|\S+)/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

function linkSpans(markdown: string): LinkSpan[] {
  const spans: LinkSpan[] = [];
  let fence: string | null = null;
  let offset = 0;
  for (const line of markdown.split("\n")) {
    const lineStart = offset;
    offset += line.length + 1;

    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }

    const ref = REFERENCE.exec(line);
    if (ref) {
      const dest = ref[1];
      const at = ref.index + ref[0].length - dest.length;
      spans.push(span(dest, lineStart + at));
      continue;
    }

    // Inline code spans hide links inside them.
    const code: [number, number][] = [];
    for (const m of line.matchAll(/(`+)[^`]*?\1/g)) code.push([m.index, m.index + m[0].length]);
    const inCode = (i: number) => code.some(([a, b]) => i >= a && i < b);

    // Inline links and images (text and destination) aren't bare paths.
    const links: [number, number][] = [];
    for (const m of line.matchAll(INLINE)) {
      links.push([m.index, m.index + m[0].length]);
      if (m[1] === "!" || inCode(m.index)) continue;
      const dest = m[2];
      const at = m.index + m[0].indexOf(`(`, m[0].lastIndexOf("]")) + 1;
      const destAt = line.indexOf(dest, at);
      spans.push(span(dest, lineStart + destAt));
    }
    const inLink = (i: number) => links.some(([a, b]) => i >= a && i < b);
    for (const m of line.matchAll(BARE_DOC_PATH)) {
      const at = m.index + m[1].length;
      if (inCode(at) || inLink(at) || !isBareDocPath(m[2])) continue;
      spans.push({ href: m[2], start: lineStart + at, end: lineStart + at + m[2].length, bare: true });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function span(dest: string, start: number): LinkSpan {
  const href = dest.startsWith("<") ? dest.slice(1, -1) : dest;
  return { href, start, end: start + dest.length };
}

/** Distinct hrefs (as written) of the local markdown files a document links to. */
export function localDocLinks(markdown: string): string[] {
  return [...new Set(linkSpans(markdown).map((s) => s.href).filter(isLocalDocHref))];
}

/** Replace link destinations: each href found in `urls` becomes its URL. */
export function rewriteLinks(markdown: string, urls: Map<string, string>): string {
  let out = "";
  let last = 0;
  for (const s of linkSpans(markdown)) {
    const url = urls.get(s.href);
    if (!url) continue;
    out += markdown.slice(last, s.start) + (s.bare ? `[${s.href}](${url})` : url);
    last = s.end;
  }
  return out + markdown.slice(last);
}
