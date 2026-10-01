import { EditorView } from "@codemirror/view";
import { getEditorView } from "./editor/registry";

/**
 * Jump to a 1-based source line in a document: put the editor caret there and
 * scroll both the editor and the preview to it (whichever are visible). Runs
 * after the next frames so a freshly opened document has rendered.
 */
export function revealLine(docId: string, line: number, codeView = false): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const view = getEditorView(docId);
      if (view) {
        const n = Math.max(1, Math.min(line, view.state.doc.lines));
        const pos = view.state.doc.line(n).from;
        view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
      }
      const article = document.querySelector<HTMLElement>(`.preview-content[data-doc-id="${docId}"]`);
      const scroller = article?.closest<HTMLElement>(".preview");
      if (!article || !scroller) return;
      let anchor: HTMLElement | null = null;
      if (codeView) {
        // A code file is one highlighted block: target the exact line.
        anchor = article.querySelectorAll<HTMLElement>("pre .line")[line - 1] ?? null;
      } else {
        for (const el of article.querySelectorAll<HTMLElement>("[data-source-line]")) {
          if (Number(el.dataset.sourceLine) <= line) anchor = el;
          else break;
        }
      }
      if (anchor) {
        scroller.scrollTop += anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
        anchor.classList.add("reveal-flash");
        setTimeout(() => anchor?.classList.remove("reveal-flash"), 1200);
      }
    }),
  );
}
