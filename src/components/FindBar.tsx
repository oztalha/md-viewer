import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";

/** Cap so a one-letter query on a huge file stays fast. */
const MAX_MATCHES = 5000;

/** The preview pane that's actually showing. */
function visiblePreview(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".tile .pane:not(.pane-hidden) .preview");
}

/** Every case-insensitive match of `query` in the preview's text, as DOM ranges. */
function findRanges(root: HTMLElement, query: string): Range[] {
  const needle = query.toLowerCase();
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node && ranges.length < MAX_MATCHES; node = walker.nextNode()) {
    const text = (node.nodeValue ?? "").toLowerCase();
    for (let i = text.indexOf(needle); i !== -1 && ranges.length < MAX_MATCHES; i = text.indexOf(needle, i + needle.length)) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + needle.length);
      ranges.push(range);
    }
  }
  return ranges;
}

/**
 * One long-lived Highlight per kind, updated in place. Replacing the registered
 * Highlight each keystroke left stale paint behind in WebKit (old matches
 * stayed coloured until something else repainted them).
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

function clearHighlights(): void {
  setHits(allHits, []);
  setHits(currentHit, []);
}

/**
 * Find in the rendered preview (⌘F when the editor isn't focused; the editor
 * has CodeMirror's own search). Matches are painted with the CSS Custom
 * Highlight API, so the preview DOM is never modified.
 */
export function FindBar() {
  const open = useStore((s) => s.findOpen);
  const focusTick = useStore((s) => s.findFocusTick);
  const activeId = useStore((s) => s.activeId);
  const content = useStore((s) => s.docs[s.activeId]?.content);
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const ranges = useRef<Range[]>([]);
  const input = useRef<HTMLInputElement | null>(null);

  const show = useCallback((i: number, scroll: boolean) => {
    const all = ranges.current;
    if (all.length === 0) {
      setHits(currentHit, []);
      return;
    }
    const range = all[i];
    setHits(currentHit, [range]);
    const pane = visiblePreview();
    if (!scroll || !pane) return;
    const r = range.getBoundingClientRect();
    const p = pane.getBoundingClientRect();
    if (r.top < p.top + 40 || r.bottom > p.bottom - 40) {
      pane.scrollTop += r.top - p.top - pane.clientHeight / 3;
    }
  }, []);

  // Re-search when the query, the document, or its rendering changes.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const pane = visiblePreview();
      const all = pane && query ? findRanges(pane, query) : [];
      ranges.current = all;
      setCount(all.length);
      setHits(allHits, all);
      setIndex((i) => {
        const next = Math.min(i, Math.max(0, all.length - 1));
        show(next, true);
        return next;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, query, content, activeId, show]);

  // ⌘F again focuses and selects the field.
  useEffect(() => {
    if (open) {
      input.current?.focus();
      input.current?.select();
    } else {
      clearHighlights();
    }
  }, [open, focusTick]);

  const step = useCallback(
    (delta: number) => {
      const n = ranges.current.length;
      if (!n) return;
      setIndex((i) => {
        const next = (i + delta + n) % n;
        show(next, true);
        return next;
      });
    },
    [show],
  );

  // ⌘G / ⇧⌘G from the menu.
  useEffect(() => {
    const onStep = (e: Event) => step((e as CustomEvent<number>).detail);
    window.addEventListener("mdv-find-step", onStep);
    return () => window.removeEventListener("mdv-find-step", onStep);
  }, [step]);

  if (!open) return null;
  const close = () => useStore.getState().setFindOpen(false);

  return (
    <div className="find-bar" role="search">
      <input
        ref={input}
        value={query}
        placeholder="Find in preview"
        spellCheck={false}
        onChange={(e) => {
          setIndex(0);
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      />
      <span className="find-count">{query ? (count ? `${index + 1} of ${count}${count >= MAX_MATCHES ? "+" : ""}` : "No matches") : ""}</span>
      <button data-tip="Previous · ⇧⌘G" onClick={() => step(-1)} disabled={!count}>
        ↑
      </button>
      <button data-tip="Next · ⌘G" onClick={() => step(1)} disabled={!count}>
        ↓
      </button>
      <button data-tip="Close · Esc" onClick={close}>
        ✕
      </button>
    </div>
  );
}
