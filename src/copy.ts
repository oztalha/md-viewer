/**
 * Copy from the rendered preview.
 *
 * WebKit's own copy puts every element's computed styles inline (margins,
 * fonts, colours, `white-space`), with no newlines between blocks. Slack and
 * other rich-text targets read that HTML and drop the paragraph breaks. We
 * write clean, semantic HTML instead (tags kept, styling dropped, a newline
 * after each block) plus the same plain text WebKit would give. It goes through
 * the native clipboard: WebKit re-sanitizes HTML set via the copy event, which
 * re-adds the inline styles and strips the newlines.
 */
import { writeHtml } from "@tauri-apps/plugin-clipboard-manager";

const BLOCKS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "UL", "OL", "PRE", "BLOCKQUOTE",
  "TABLE", "TR", "HR", "DIV", "SECTION", "DL", "DT", "DD", "FIGURE",
]);

/** Attributes worth keeping on the clipboard; everything else is ours. */
const KEEP: Record<string, string[]> = { A: ["href"], IMG: ["src", "alt"], TD: ["colspan", "rowspan"], TH: ["colspan", "rowspan"] };

function clean(node: Node): void {
  for (const child of [...node.childNodes]) {
    if (!(child instanceof HTMLElement || child instanceof SVGElement)) continue;
    // Our UI inside the preview (copy buttons, annotation badges): drop it.
    if (child.matches("button, .copy-btn, .annotation-badge, .cm-format-bar")) {
      child.remove();
      continue;
    }
    if (child instanceof HTMLElement) {
      const keep = KEEP[child.tagName] ?? [];
      for (const attr of [...child.attributes]) if (!keep.includes(attr.name)) child.removeAttribute(attr.name);
      clean(child);
      if (BLOCKS.has(child.tagName)) child.after("\n");
    }
  }
}

export function onPreviewCopy(event: ClipboardEvent): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !event.clipboardData) return;
  const holder = document.createElement("div");
  for (let i = 0; i < selection.rangeCount; i++) holder.append(selection.getRangeAt(i).cloneContents());
  clean(holder);
  const html = holder.innerHTML;
  const text = selection.toString();
  // Synchronous fallback first, then replace it with the clean native copy.
  event.clipboardData.setData("text/html", html);
  event.clipboardData.setData("text/plain", text);
  event.preventDefault();
  // After WebKit has written its copy (it does so once this handler returns).
  setTimeout(() => {
    writeHtml(`<meta charset="utf-8">${html}`, text).catch((err) =>
      void import("@tauri-apps/api/core").then((m) => m.invoke("log_error", { message: `copy: ${err}` })),
    );
  }, 50);
}
