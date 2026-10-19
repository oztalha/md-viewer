import TurndownService from "turndown";
// @ts-expect-error -- the plugin ships no types
import { gfm } from "turndown-plugin-gfm";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

/**
 * Paste rich text (from Slack, a browser, Docs, Notion, …) as markdown: links,
 * bold/italic, `code`, code blocks, lists, quotes, headings and tables come
 * across instead of being flattened to plain text. ⌥⇧⌘V (Paste and Match
 * Style) still pastes plain text.
 *
 * Only HTML that carries markdown-worthy structure is converted. Code editors
 * (VS Code, Xcode) put styled-but-structureless HTML on the clipboard; that,
 * and anything pasted inside a code block, goes in as plain text.
 */

const STRUCTURE = /<(a\s[^>]*href|strong|b|em|i|code|pre|ul|ol|li|h[1-6]|table|blockquote|del|s)\b/i;

let service: TurndownService | null = null;
function turndown(): TurndownService {
  if (service) return service;
  service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    br: "\n",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });
  service.use(gfm);
  // Drop what has no markdown meaning (and would leak as text).
  service.remove(["style", "script", "meta", "title", "head"]);
  // Slack's code blocks are a bare <pre> (no <code> inside); fence them too.
  service.addRule("barePre", {
    filter: (node) => node.nodeName === "PRE" && !node.querySelector("code"),
    replacement: (_content, node) => {
      const text = (node as HTMLElement).innerText ?? node.textContent ?? "";
      return `\n\n\`\`\`\n${text.replace(/\n$/, "")}\n\`\`\`\n\n`;
    },
  });
  // Slack and others mark bold/italic with styled spans rather than tags.
  service.addRule("styledSpan", {
    filter: (node) =>
      node.nodeName === "SPAN" &&
      /font-weight:\s*(bold|[6-9]00)|font-style:\s*italic/i.test((node as HTMLElement).getAttribute("style") ?? ""),
    replacement: (content, node) => {
      if (!content.trim()) return content;
      const style = (node as HTMLElement).getAttribute("style") ?? "";
      let out = content;
      if (/font-style:\s*italic/i.test(style)) out = `*${out}*`;
      if (/font-weight:\s*(bold|[6-9]00)/i.test(style)) out = `**${out}**`;
      return out;
    },
  });
  return service;
}

/** Markdown for clipboard HTML, or null if it should paste as plain text. */
export function htmlToMarkdown(html: string): string | null {
  if (!STRUCTURE.test(html)) return null;
  // Clipboard HTML often wraps the fragment in a full document.
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const fragment = body.replace(/<!--(?:Start|End)Fragment-->/g, "");
  const md = turndown()
    .turndown(fragment)
    // Turndown pads list markers to four columns ("-   item"); use one space.
    .replace(/^(\s*)([-*+]|\d+\.) {2,}/gm, "$1$2 ")
    // Clipboard HTML uses &nbsp; around inline tags; keep ordinary spaces.
    .replace(/\u00a0/g, " ")
    // A trailing <br> becomes a hard break ("  ") at the end of a block.
    .replace(/ {2,}$/gm, "")
    .trim();
  return md || null;
}

function inCode(view: EditorView, pos: number): boolean {
  for (let node = syntaxTree(view.state).resolveInner(pos, -1); node; node = node.parent!) {
    if (/FencedCode|CodeBlock|InlineCode|CodeText/.test(node.name)) return true;
    if (!node.parent) break;
  }
  return false;
}

export const richPaste = EditorView.domEventHandlers({
  paste(event, view) {
    const data = event.clipboardData;
    const html = data?.getData("text/html");
    if (!html) return false;
    const { from, to } = view.state.selection.main;
    if (inCode(view, from)) return false;
    const md = htmlToMarkdown(html);
    if (md === null) return false;
    // A copy from our own editor carries the same text; keep it as-is.
    const plain = data?.getData("text/plain") ?? "";
    if (plain.trim() === md) return false;
    event.preventDefault();
    view.dispatch({
      changes: { from, to, insert: md },
      selection: { anchor: from + md.length },
      scrollIntoView: true,
      userEvent: "input.paste",
    });
    return true;
  },
});
