import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { useStore } from "../store";
import { getEditorView } from "../editor/registry";

/** Cap so a one-letter query on a huge file stays fast. */
const MAX_MATCHES = 5000;

interface Options {
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

/** The preview pane that's actually showing. */
function visiblePreview(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".tile .pane:not(.pane-hidden) .preview");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The query as a global RegExp, or null if it's empty or an invalid pattern. */
function toRegExp(query: string, o: Options): RegExp | null {
  if (!query) return null;
  let source = o.regexp ? query : escapeRegExp(query);
  if (o.wholeWord) source = `\\b(?:${source})\\b`;
  try {
    return new RegExp(source, o.caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

/** Every match in the preview's text, as DOM ranges (matches don't span elements). */
function findRanges(root: HTMLElement, re: RegExp): Range[] {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node && ranges.length < MAX_MATCHES; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    re.lastIndex = 0;
    for (let m = re.exec(text); m && ranges.length < MAX_MATCHES; m = re.exec(text)) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      ranges.push(range);
    }
  }
  return ranges;
}

/**
 * One long-lived Highlight per kind, updated in place. Replacing the registered
 * Highlight each keystroke left stale paint behind in WebKit.
 */
const allHits = new Highlight();
const currentHit = new Highlight();

function setHits(target: Highlight, ranges: Range[]): void {
  target.clear();
  for (const r of ranges) target.add(r);
  // Re-registering forces WebKit to repaint the areas that lost a highlight.
  const name = target === allHits ? "find-all" : "find-current";
  CSS.highlights?.delete(name);
  if (ranges.length) CSS.highlights?.set(name, target);
}

function clearPreviewHits(): void {
  setHits(allHits, []);
  setHits(currentHit, []);
}

/** Matches in the editor and which one is selected (the current match). */
function editorCount(view: EditorView, q: SearchQuery): { count: number; index: number } {
  const sel = view.state.selection.main;
  let count = 0;
  let index = -1;
  const cursor = q.getCursor(view.state);
  for (let r = cursor.next(); !r.done && count < MAX_MATCHES; r = cursor.next()) {
    if (r.value.from === sel.from && r.value.to === sel.to) index = count;
    count++;
  }
  return { count, index };
}

const ICON = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/**
 * Find and replace (⌘F), one compact bar for both panes. Finding happens where
 * you're looking: the editor (CodeMirror's search, its panel hidden) or the
 * rendered preview (painted with the CSS Custom Highlight API, so the preview
 * DOM isn't touched). Replace always edits the source text, so it works from
 * the preview too; the preview then re-renders.
 */
export function FindBar() {
  const open = useStore((s) => s.findOpen);
  const focusTick = useStore((s) => s.findFocusTick);
  const target = useStore((s) => s.findTarget);
  const activeId = useStore((s) => s.activeId);
  const content = useStore((s) => s.docs[s.activeId]?.content);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [opts, setOpts] = useState<Options>({ caseSensitive: false, wholeWord: false, regexp: false });
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(-1);
  const ranges = useRef<Range[]>([]);
  const input = useRef<HTMLInputElement | null>(null);

  const view = () => getEditorView(useStore.getState().activeId) ?? null;
  const cmQuery = useCallback(
    () => new SearchQuery({ search: query, replace: replacement, ...opts, literal: !opts.regexp }),
    [query, replacement, opts],
  );

  /** Push the query into CodeMirror (for editor highlights and replace). */
  const syncEditor = useCallback(() => {
    const v = view();
    if (!v) return null;
    const q = cmQuery();
    openSearchPanel(v); // our hidden panel: turns on match highlighting
    v.dispatch({ effects: setSearchQuery.of(q) });
    return { v, q };
  }, [cmQuery]);

  const showPreviewHit = useCallback((i: number) => {
    const range = ranges.current[i];
    setHits(currentHit, range ? [range] : []);
    const pane = visiblePreview();
    if (!range || !pane) return;
    const r = range.getBoundingClientRect();
    const p = pane.getBoundingClientRect();
    if (r.top < p.top + 60 || r.bottom > p.bottom - 40) pane.scrollTop += r.top - p.top - pane.clientHeight / 3;
  }, []);

  // Re-search when the query, options, document or its rendering change.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const synced = syncEditor();
      if (target === "editor" && synced) {
        const { v, q } = synced;
        clearPreviewHits();
        if (!q.valid) {
          setCount(0);
          setIndex(-1);
          return;
        }
        let { count: n, index: i } = editorCount(v, q);
        if (n && i === -1) {
          // Jump to the first match at or after the caret, like other editors.
          v.dispatch({ selection: { anchor: v.state.selection.main.from } });
          findNext(v);
          ({ count: n, index: i } = editorCount(v, q));
        }
        setCount(n);
        setIndex(i);
        return;
      }
      const pane = visiblePreview();
      const re = toRegExp(query, opts);
      const all = pane && re ? findRanges(pane, re) : [];
      ranges.current = all;
      setHits(allHits, all);
      setCount(all.length);
      setIndex((i) => {
        const next = all.length ? Math.min(Math.max(i, 0), all.length - 1) : -1;
        showPreviewHit(next);
        return next;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, target, query, opts, content, activeId, syncEditor, showPreviewHit]);

  // ⌘F again focuses and selects the field; closing clears everything.
  useEffect(() => {
    if (open) {
      input.current?.focus();
      input.current?.select();
      return;
    }
    clearPreviewHits();
    const v = view();
    if (v) closeSearchPanel(v);
  }, [open, focusTick]);

  const step = useCallback(
    (delta: 1 | -1) => {
      if (target === "editor") {
        const synced = syncEditor();
        if (!synced) return;
        (delta === 1 ? findNext : findPrevious)(synced.v);
        const { count: n, index: i } = editorCount(synced.v, synced.q);
        setCount(n);
        setIndex(i);
        return;
      }
      const n = ranges.current.length;
      if (!n) return;
      setIndex((i) => {
        const next = (i + delta + n) % n;
        showPreviewHit(next);
        return next;
      });
    },
    [target, syncEditor, showPreviewHit],
  );

  const replace = (all: boolean) => {
    const synced = syncEditor();
    if (!synced || !synced.q.valid) return;
    (all ? replaceAll : replaceNext)(synced.v);
    if (target === "editor") {
      const { count: n, index: i } = editorCount(synced.v, synced.q);
      setCount(n);
      setIndex(i);
    }
    input.current?.focus();
  };

  // ⌘G / ⇧⌘G from the menu.
  useEffect(() => {
    const onStep = (e: Event) => step((e as CustomEvent<1 | -1>).detail);
    window.addEventListener("mdv-find-step", onStep);
    return () => window.removeEventListener("mdv-find-step", onStep);
  }, [step]);

  if (!open) return null;
  const close = () => {
    useStore.getState().setFindOpen(false);
    if (target === "editor") view()?.focus();
  };
  const toggle = (key: keyof Options) => setOpts((o) => ({ ...o, [key]: !o[key] }));
  const invalid = !!query && !toRegExp(query, opts);
  const keys = (e: React.KeyboardEvent, onEnter: (shift: boolean) => void) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnter(e.shiftKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="find-bar" role="search">
      <button
        className="find-chevron"
        data-tip={showReplace ? "Hide replace" : "Replace"}
        aria-expanded={showReplace}
        onClick={() => setShowReplace((s) => !s)}
      >
        <svg {...ICON} style={{ transform: showReplace ? "rotate(90deg)" : undefined }}>
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>
      <div className="find-rows">
        <div className="find-row">
          <div className={`find-field${invalid ? " invalid" : ""}`}>
            <input
              ref={input}
              value={query}
              placeholder="Find"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => keys(e, (shift) => step(shift ? -1 : 1))}
            />
            <button className={`find-opt${opts.caseSensitive ? " on" : ""}`} data-tip="Match case" onClick={() => toggle("caseSensitive")}>
              Aa
            </button>
            <button className={`find-opt${opts.wholeWord ? " on" : ""}`} data-tip="Whole word" onClick={() => toggle("wholeWord")}>
              <span className="find-word">ab</span>
            </button>
            <button className={`find-opt${opts.regexp ? " on" : ""}`} data-tip="Regular expression" onClick={() => toggle("regexp")}>
              .*
            </button>
          </div>
          <span className="find-count">
            {query ? (invalid ? "Bad pattern" : count ? `${index + 1 || "?"} of ${count}${count >= MAX_MATCHES ? "+" : ""}` : "No results") : ""}
          </span>
          <button className="find-icon" data-tip="Previous · ⇧⌘G" onClick={() => step(-1)} disabled={!count}>
            <svg {...ICON}><path d="M8 13V3M4 7l4-4 4 4" /></svg>
          </button>
          <button className="find-icon" data-tip="Next · ⌘G" onClick={() => step(1)} disabled={!count}>
            <svg {...ICON}><path d="M8 3v10M4 9l4 4 4-4" /></svg>
          </button>
          <button className="find-icon" data-tip="Close · Esc" onClick={close}>
            <svg {...ICON}><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        {showReplace && (
          <div className="find-row">
            <div className="find-field">
              <input
                value={replacement}
                placeholder="Replace"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                onChange={(e) => setReplacement(e.target.value)}
                onKeyDown={(e) => keys(e, (shift) => replace(shift))}
              />
            </div>
            <button className="find-text" data-tip="Replace this match · ↩" onClick={() => replace(false)} disabled={!count}>
              Replace
            </button>
            <button className="find-text" data-tip="Replace all matches · ⇧↩" onClick={() => replace(true)} disabled={!count}>
              Replace All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
