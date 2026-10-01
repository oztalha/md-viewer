/**
 * Drag-to-reorder for a row of tabs or a list of rows. The held item lifts and
 * follows the pointer; the others slide aside to open a gap where it will
 * land; the store order changes once, on drop. (Reordering live on every
 * midpoint crossing made the item jump instead of glide.)
 */
export function startSortDrag(
  event: React.PointerEvent,
  opts: {
    axis: "x" | "y";
    /** Selector for the sortable siblings inside the item's parent. */
    items: string;
    onDrop(fromIndex: number, toIndex: number): void;
  },
): void {
  if (event.button !== 0) return;
  const item = event.currentTarget as HTMLElement;
  const list = item.parentElement;
  if (!list) return;
  const els = Array.from(list.querySelectorAll<HTMLElement>(opts.items));
  const from = els.indexOf(item);
  if (from < 0) return;

  const horizontal = opts.axis === "x";
  const pos = (ev: { clientX: number; clientY: number }) => (horizontal ? ev.clientX : ev.clientY);
  const start = pos(event);
  const rects = els.map((el) => el.getBoundingClientRect());
  const startOf = (r: DOMRect) => (horizontal ? r.left : r.top);
  const sizeOf = (r: DOMRect) => (horizontal ? r.width : r.height);
  const centre = (r: DOMRect) => startOf(r) + sizeOf(r) / 2;
  // Distance one slot moves: the held item's size plus any gap.
  const step =
    from + 1 < rects.length
      ? startOf(rects[from + 1]) - startOf(rects[from])
      : from > 0
        ? startOf(rects[from]) - startOf(rects[from - 1])
        : sizeOf(rects[from]);
  const translate = (d: number) => (horizontal ? `translateX(${d}px)` : `translateY(${d}px)`);

  let dragging = false;
  let to = from;

  const move = (ev: PointerEvent) => {
    const delta = pos(ev) - start;
    if (!dragging) {
      if (Math.abs(delta) < 5) return;
      dragging = true;
      document.body.classList.add("sort-dragging");
      item.classList.add("sort-held");
      els.forEach((el) => el !== item && el.classList.add("sort-shifting"));
    }
    item.style.transform = translate(delta);
    const held = centre(rects[from]) + delta;
    to = from;
    els.forEach((el, i) => {
      if (i === from) return;
      let shift = 0;
      if (i > from && held > centre(rects[i])) {
        shift = -step;
        to = Math.max(to, i);
      } else if (i < from && held < centre(rects[i])) {
        shift = step;
        to = Math.min(to, i);
      }
      el.style.transform = shift ? translate(shift) : "";
    });
  };

  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    if (!dragging) return;
    document.body.classList.remove("sort-dragging");
    // Clear the visual offsets and commit the order in the same frame, so the
    // re-rendered list appears exactly where the items were drawn.
    for (const el of els) {
      el.classList.remove("sort-held", "sort-shifting");
      el.style.transform = "";
    }
    if (to !== from) opts.onDrop(from, to);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}
