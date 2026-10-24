/**
 * A slim bar pinned to the top of published and exported pages, carrying the
 * document's H1 once it has scrolled out of view. Only when the page opens
 * with an H1 (after any frontmatter); clicking it goes back to the top.
 */

export const TITLE_BAR_CSS = `
.page-title-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 4; height: 56px; padding: 0 64px 0 20px; display: flex; align-items: center; background: var(--bg); border-bottom: 1px solid var(--border); font-size: 15px; cursor: pointer; transform: translateY(-100%); opacity: 0; transition: transform .2s ease, opacity .2s ease; }
.page-title-bar span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.page-title-bar.shown { transform: none; opacity: 1; }
.theme-toggle { z-index: 5; }
@media (prefers-reduced-motion: reduce) { .page-title-bar { transition: none; } }
@media print { .page-title-bar { display: none; } }
`.trim();

export const TITLE_BAR_SCRIPT = `(() => {
  const first = [...document.querySelectorAll("main > *")].find((el) => !el.classList.contains("frontmatter"));
  if (!first || first.tagName !== "H1") return;
  const bar = document.createElement("div");
  bar.className = "page-title-bar";
  bar.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = first.textContent.trim();
  bar.append(text);
  bar.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
  document.body.append(bar);
  new IntersectionObserver(([entry]) => {
    bar.classList.toggle("shown", !entry.isIntersecting && entry.boundingClientRect.top < 0);
  }).observe(first);
})();`;
