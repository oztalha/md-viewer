/**
 * Outline for published and exported pages: a rail of dashes at the side, one
 * per heading, that opens into the list of headings on hover or focus. The
 * current section's dash is highlighted. A script string inlined into the
 * page; pages with fewer than two headings (the index page) get none.
 */

export const OUTLINE_CSS = `
.page-outline { position: fixed; left: 16px; top: 96px; z-index: 5; max-height: calc(100vh - 128px); display: flex; }
.page-outline ol { list-style: none; margin: 0; padding: 8px; border-radius: 12px; border: 1px solid transparent; overflow: hidden auto; scrollbar-width: none; transition: background-color .2s ease, border-color .2s ease, box-shadow .2s ease; }
.page-outline li { margin: 0; }
.page-outline button { display: flex; align-items: center; width: 100%; padding: 4px 6px; border: 0; border-radius: 7px; background: none; color: var(--fg-muted); font: inherit; font-size: 14.5px; line-height: 1.45; text-align: left; cursor: pointer; }
.po-dash { flex: none; height: 3px; border-radius: 2px; background: currentColor; opacity: .55; }
/* The titles slide open: width, gap and indent grow from 0 (display can't animate). */
.po-text { max-width: 0; margin-left: 0; padding-left: 0; opacity: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; transition: max-width .22s ease, margin-left .22s ease, padding-left .22s ease, opacity .15s ease; }
.page-outline button[aria-current="true"] { color: var(--fg); }
.page-outline button[aria-current="true"] .po-dash { background: var(--outline-active); opacity: 1; }
.page-outline:hover ol, .page-outline:focus-within ol { background: var(--bg); border-color: var(--border); box-shadow: 0 6px 24px rgba(0,0,0,.12); }
.page-outline:hover .po-text, .page-outline:focus-within .po-text { max-width: 300px; margin-left: 14px; padding-left: var(--po-indent); opacity: 1; }
.page-outline:hover button:hover, .page-outline button:focus-visible { background: var(--bg-secondary); color: var(--fg); outline: none; }
:root { --outline-active: #2f5fb3; }
:root[data-theme="dark"] { --outline-active: #6b9cf0; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --outline-active: #6b9cf0; } }
@media (prefers-reduced-motion: reduce) { .page-outline ol, .po-text { transition: none; } }
.page-outline .po-toggle { display: none; }
/* Narrow screens (phones): a list button at the top left opens the headings
   as a menu; dashes and hover don't work there. */
@media (max-width: 1180px) {
  .page-outline { top: 12px; left: 12px; max-height: calc(100vh - 24px); flex-direction: column; align-items: flex-start; }
  .page-outline .po-toggle { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--fg-muted); }
  .page-outline .po-toggle:hover { color: var(--fg); background: var(--bg-secondary); }
  .page-outline ol { display: none; margin-top: 6px; max-width: calc(100vw - 24px); background: var(--bg); border-color: var(--border); box-shadow: 0 6px 24px rgba(0,0,0,.12); transition: none; }
  .page-outline.open ol { display: block; }
  .po-dash { display: none; }
  .po-text, .page-outline:hover .po-text, .page-outline:focus-within .po-text { max-width: none; margin-left: 0; padding-left: var(--po-indent); opacity: 1; transition: none; }
  .page-outline ~ .page-title-bar { padding-left: 56px; }
}
@media print { .page-outline { display: none; } }
`.trim();

export const OUTLINE_SCRIPT = `(() => {
  const headings = [...document.querySelectorAll("main h1, main h2, main h3, main h4")];
  if (headings.length < 2) return;
  const top = Math.min(...headings.map((h) => +h.tagName[1]));
  const widths = [28, 22, 16, 12];
  const nav = document.createElement("nav");
  nav.className = "page-outline";
  nav.setAttribute("aria-label", "Outline");
  const list = document.createElement("ol");
  const buttons = headings.map((h) => {
    const depth = +h.tagName[1] - top;
    const item = document.createElement("li");
    const button = document.createElement("button");
    const dash = document.createElement("span");
    dash.className = "po-dash";
    dash.style.width = widths[depth] + "px";
    dash.style.marginRight = (widths[0] - widths[depth]) + "px";
    const text = document.createElement("span");
    text.className = "po-text";
    text.textContent = h.textContent.trim();
    text.style.setProperty("--po-indent", depth * 16 + "px");
    button.title = text.textContent;
    button.append(dash, text);
    button.addEventListener("click", () => h.scrollIntoView({ behavior: "smooth", block: "start" }));
    item.append(button);
    list.append(item);
    return button;
  });
  const toggle = document.createElement("button");
  toggle.className = "po-toggle";
  toggle.setAttribute("aria-label", "Outline");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6"/></svg>';
  const setOpen = (open) => {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
  list.addEventListener("click", () => setOpen(false));
  document.addEventListener("click", (e) => { if (!nav.contains(e.target)) setOpen(false); });
  nav.append(toggle, list);
  document.body.append(nav);
  // The current section: the last heading scrolled past the top (the first
  // before any), or the last one once the page is scrolled to the end.
  let queued = false;
  const update = () => {
    queued = false;
    let current = 0;
    headings.forEach((h, i) => { if (h.getBoundingClientRect().top <= 96) current = i; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = headings.length - 1;
    buttons.forEach((b, i) => b.setAttribute("aria-current", String(i === current)));
  };
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  update();
})();`;
