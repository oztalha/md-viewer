import type MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import type Token from "markdown-it/lib/token.mjs";
import { BARE_DOC_PATH, isBareDocPath } from "./docLinks";

/**
 * Bare markdown file names and paths in prose (`methods.md`, `notes/plan.md`,
 * `../a.md`) become links to those files, like `[methods.md](methods.md)`.
 *
 * Also undoes a linkify quirk: `.md` is a real top-level domain (Moldova), so
 * linkify turns `methods.md` into `http://methods.md`. A linkified name with
 * no scheme, `www.` or path that ends in a markdown extension is a file.
 */
export function bareDocLinks(md: MarkdownIt): void {
  md.core.ruler.after("linkify", "bare_doc_links", (state: StateCore) => {
    for (const block of state.tokens) {
      if (block.type !== "inline" || !block.children) continue;
      block.children = relink(state, block.children);
    }
  });
}

function relink(state: StateCore, tokens: Token[]): Token[] {
  const out: Token[] = [];
  let depth = 0; // inside a link: leave its text alone
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "link_open") {
      const text = tokens[i + 1]?.type === "text" ? tokens[i + 1].content : "";
      if (t.markup === "linkify" && isLinkifiedDocName(text)) t.attrSet("href", text);
      depth++;
    } else if (t.type === "link_close") {
      depth--;
    } else if (t.type === "text" && depth === 0) {
      out.push(...splitText(state, t));
      continue;
    }
    out.push(t);
  }
  return out;
}

function isLinkifiedDocName(text: string): boolean {
  return !text.includes("/") && !text.includes(":") && isBareDocPath(text) && /\.(md|markdown|mdown|mkdn|mkd)$/i.test(text);
}

/** A text token, split into text and links around any bare paths in it. */
function splitText(state: StateCore, token: Token): Token[] {
  const text = token.content;
  const parts: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(BARE_DOC_PATH)) {
    if (!isBareDocPath(m[2])) continue;
    const at = m.index + m[1].length;
    if (at > last) parts.push(textToken(state, text.slice(last, at), token.level));
    const open = new state.Token("link_open", "a", 1);
    open.attrSet("href", m[2]);
    open.markup = "bare-path";
    const label = textToken(state, m[2], token.level + 1);
    const close = new state.Token("link_close", "a", -1);
    close.markup = "bare-path";
    parts.push(open, label, close);
    last = at + m[2].length;
  }
  if (parts.length === 0) return [token];
  if (last < text.length) parts.push(textToken(state, text.slice(last), token.level));
  return parts;
}

function textToken(state: StateCore, content: string, level: number): Token {
  const t = new state.Token("text", "", 0);
  t.content = content;
  t.level = level;
  return t;
}
