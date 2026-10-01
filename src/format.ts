import { codeLanguage } from "./code";
import { isJsonPath, isJsonlPath } from "./types";
import { formatJson, formatJsonl } from "./json";
import { EditorSelection } from "@codemirror/state";
import { getEditorView } from "./editor/registry";
import { showError } from "./ipc";

/** Format markdown source with Prettier (lazy-loaded to keep startup lean). */
export async function formatMarkdown(source: string): Promise<string | null> {
  try {
    const [prettier, markdownPlugin] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/markdown"),
    ]);
    const formatted = await prettier.format(source, {
      parser: "markdown",
      plugins: [markdownPlugin.default],
      proseWrap: "preserve",
    });
    return formatted;
  } catch (err) {
    await showError(`Could not format: ${String(err)}`);
    return null;
  }
}

/** Format the document in an editor view, preserving the caret line/column. */
export async function formatDocument(docId: string): Promise<void> {
  const view = getEditorView(docId);
  if (!view) return;
  const source = view.state.doc.toString();
  // JSON documents are pretty-printed; everything else goes through Prettier.
  const { useStore } = await import("./store");
  const stored = useStore.getState().docs[docId];
  const path = stored?.path ?? stored?.remote?.path ?? "";
  // Code and data files aren't markdown: never run the markdown formatter on them.
  if (codeLanguage(path) && !isJsonPath(path) && !isJsonlPath(path)) return;
  const formatted = isJsonPath(path)
    ? formatJson(source)
    : isJsonlPath(path)
      ? formatJsonl(source)
      : await formatMarkdown(source);
  if (formatted === null || formatted === source) return;

  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const row = line.number;
  const col = head - line.from;

  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: formatted },
  });

  // Best-effort caret restore at the same line/column.
  const doc = view.state.doc;
  if (row <= doc.lines) {
    const target = doc.line(row);
    const pos = Math.min(target.from + col, target.to);
    view.dispatch({ selection: EditorSelection.cursor(pos) });
  }
  view.focus();
}
