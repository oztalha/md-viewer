import { useCallback, useEffect, useRef } from "react";
import type { LeafNode } from "../types";
import { useStore } from "../store";
import { showTileContextMenu } from "../contextMenu";
import { getEditorView } from "../editor/registry";
import { EditorView } from "@codemirror/view";
import { Editor } from "./Editor";
import { Preview } from "./Preview";
import { Outline } from "./Outline";

/** 1-based markdown line at the top of the editor viewport. */
function editorTopLine(view: EditorView): number {
  const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
  return view.state.doc.lineAt(block.from).number;
}

/** Source line of the block at the top of the preview viewport, if known. */
function previewTopLine(container: HTMLElement): number | null {
  const top = container.getBoundingClientRect().top;
  let line: number | null = null;
  for (const el of container.querySelectorAll<HTMLElement>("[data-source-line]")) {
    if (el.getBoundingClientRect().top <= top + 4) line = Number(el.dataset.sourceLine);
    else break;
  }
  return line;
}

/** Scroll the preview so the block for `line` (or nearest above) sits at top. */
function scrollPreviewToLine(container: HTMLElement, line: number): void {
  let anchor: HTMLElement | null = null;
  for (const el of container.querySelectorAll<HTMLElement>("[data-source-line]")) {
    if (Number(el.dataset.sourceLine) <= line) anchor = el;
    else break;
  }
  if (!anchor) return;
  container.scrollTop += anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;
}

/**
 * Rendered blocks' source lines and their offsets within the preview's scroll
 * content, in document order — the anchors used to map between the panes.
 */
function previewAnchors(container: HTMLElement): { line: number; y: number }[] {
  const base = container.getBoundingClientRect().top - container.scrollTop;
  const out: { line: number; y: number }[] = [];
  for (const el of container.querySelectorAll<HTMLElement>("[data-source-line]")) {
    out.push({ line: Number(el.dataset.sourceLine), y: el.getBoundingClientRect().top - base });
  }
  return out;
}

/** Linear interpolation across sorted (x -> y) anchor pairs, clamped at the ends. */
function interpolate(points: { x: number; y: number }[], x: number): number | null {
  if (points.length === 0) return null;
  if (x <= points[0].x) return points[0].y;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (x < b.x) return b.x === a.x ? a.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return points[points.length - 1].y;
}

/**
 * Keep split view aligned while scrolling: map the scrolled pane's top edge to
 * the other pane through the source-line anchors (interpolating inside a
 * block), so both show the same paragraph. Proportional scrolling drifts
 * because raw markdown and rendered HTML have different heights.
 */
function syncPanes(view: EditorView, preview: HTMLElement, from: "editor" | "preview"): void {
  const anchors = previewAnchors(preview);
  if (anchors.length === 0) return;
  // Each anchor's position in the editor (document y of its source line).
  const doc = view.state.doc;
  const pairs = anchors.map((a) => ({
    editor: view.lineBlockAt(doc.line(Math.max(1, Math.min(a.line, doc.lines))).from).top,
    preview: a.y,
  }));
  if (from === "editor") {
    const y = interpolate(pairs.map((p) => ({ x: p.editor, y: p.preview })), view.scrollDOM.scrollTop);
    if (y != null) preview.scrollTop = y;
  } else {
    const y = interpolate(pairs.map((p) => ({ x: p.preview, y: p.editor })), preview.scrollTop);
    if (y != null) view.scrollDOM.scrollTop = y;
  }
}

/** Scroll the editor so `line` sits at the top of its viewport. */
function scrollEditorToLine(view: EditorView, line: number): void {
  const n = Math.max(1, Math.min(line, view.state.doc.lines));
  const pos = view.state.doc.line(n).from;
  view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start" }) });
}

export function Tile({ leaf }: { leaf: LeafNode }) {
  const doc = useStore((s) => s.docs[leaf.docId]);
  const setRatio = useStore((s) => s.setRatio);

  // The markdown line the user is reading, tracked from whichever pane is
  // scrolled, so a view-mode toggle can land on the same line in the other pane.
  // Anchoring by source line (not pixel fraction) is exact — the raw source and
  // the rendered HTML have very different heights.
  const anchorLine = useRef(1);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const prev = useRef({ mode: leaf.mode, docId: leaf.docId });

  // One delegated scroll listener covers both panes (scroll events capture but
  // don't bubble). It records the reading line and roughly co-scrolls the other
  // pane while both are visible (split).
  const attachBody = useCallback(
    (body: HTMLDivElement | null) => {
      bodyRef.current = body;
      if (!body) return;

      let active: HTMLElement | null = null;
      let release: ReturnType<typeof setTimeout> | undefined;

      const onScroll = (event: Event) => {
        const target = event.target as HTMLElement;
        const isEditor = target.classList.contains("cm-scroller");
        const isPreview = target.classList.contains("preview");
        if (!isEditor && !isPreview) return;

        // Only follow the pane the user is actually scrolling.
        if (active && active !== target) return;
        active = target;
        clearTimeout(release);
        release = setTimeout(() => (active = null), 120);

        if (isEditor) {
          const view = getEditorView(leaf.docId);
          if (view) anchorLine.current = editorTopLine(view);
        } else {
          const line = previewTopLine(target);
          if (line != null) anchorLine.current = line;
        }

        // Co-scroll the other pane to the same source position (split view).
        const view = getEditorView(leaf.docId);
        const preview = body.querySelector<HTMLElement>(".preview");
        if (view && preview && useStore.getState().views[leaf.docId]?.mode === "split") {
          syncPanes(view, preview, isEditor ? "editor" : "preview");
        }
      };

      body.addEventListener("scroll", onScroll, { capture: true, passive: true });
      return () => {
        clearTimeout(release);
        body.removeEventListener("scroll", onScroll, { capture: true });
        bodyRef.current = null;
      };
    },
    [leaf.docId],
  );

  // On a view-mode toggle of the SAME document (e.g. ⌘⇧V), restore the reading
  // line in whichever pane is now visible. The editor uses CodeMirror's scroll
  // API (measures correctly even right after expanding); the preview waits for
  // its reflow to full width via a ResizeObserver before anchoring.
  useEffect(() => {
    const sameDoc = prev.current.docId === leaf.docId;
    const modeChanged = prev.current.mode !== leaf.mode;
    prev.current = { mode: leaf.mode, docId: leaf.docId };
    const body = bodyRef.current;
    if (!body || !sameDoc || !modeChanged) return;

    const line = anchorLine.current;
    const cleanups: (() => void)[] = [];

    if (leaf.mode !== "preview") {
      const raf = requestAnimationFrame(() => {
        const view = getEditorView(leaf.docId);
        if (view) scrollEditorToLine(view, line);
      });
      cleanups.push(() => cancelAnimationFrame(raf));
    }
    if (leaf.mode !== "editor") {
      const preview = body.querySelector<HTMLElement>(".preview");
      if (preview) {
        const run = () => scrollPreviewToLine(preview, line);
        const ro = new ResizeObserver(run);
        ro.observe(preview);
        const raf = requestAnimationFrame(() => requestAnimationFrame(run));
        const stop = setTimeout(() => ro.disconnect(), 400);
        cleanups.push(() => {
          cancelAnimationFrame(raf);
          clearTimeout(stop);
          ro.disconnect();
        });
      }
    }
    return () => cleanups.forEach((c) => c());
  }, [leaf.mode, leaf.docId]);

  if (!doc) return null;

  const empty = !/\S/.test(doc.content);
  const showEditor = leaf.mode !== "preview";
  const showPreview = leaf.mode !== "editor";
  const editorFlex = showEditor ? `${leaf.ratio * 100} 1 0%` : "0.0001 1 0%";
  const previewFlex = showPreview ? `${(1 - leaf.ratio) * 100} 1 0%` : "0.0001 1 0%";

  const startPaneDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    const body = (event.currentTarget as HTMLElement).parentElement;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    document.body.classList.add("resizing-x");

    const move = (ev: PointerEvent) => {
      const ratio = (ev.clientX - rect.left) / rect.width;
      setRatio(leaf.id, Math.min(0.85, Math.max(0.15, ratio)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing-x");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onContextMenu = (event: React.MouseEvent) => {
    // Inside the editor keep the native menu (copy/paste, spelling, …).
    if ((event.target as HTMLElement).closest(".cm-editor")) return;
    event.preventDefault();
    void showTileContextMenu(leaf.id);
  };

  return (
    <section className="tile" onContextMenu={onContextMenu}>
      <div className="tile-body" ref={attachBody}>
        {leaf.outline && <Outline leaf={leaf} />}
        <div className={`pane${showEditor ? "" : " pane-hidden"}`} style={{ flex: editorFlex }}>
          <Editor doc={doc} />
        </div>
        {leaf.mode === "split" && <div className="pane-divider" onPointerDown={startPaneDrag} />}
        <div className={`pane${showPreview ? "" : " pane-hidden"}`} style={{ flex: previewFlex }}>
          <Preview docId={doc.id} empty={empty} />
        </div>
      </div>
    </section>
  );
}
