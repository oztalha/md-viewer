/**
 * Light/dark choice for published and exported pages. Scripts as strings, inlined
 * into the pages. Every page on one origin shares the saved choice, so the
 * password prompt and the page behind it agree.
 */

const THEME_KEY = "md-viewer-theme";

// Before the stylesheet paints, so a saved choice doesn't flash the other theme.
export const THEME_INIT = `try {
  const t = localStorage.getItem("${THEME_KEY}");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch {}`;

/** Auto → light → dark, remembered in this browser. Added by script, so a host
 *  that strips scripts doesn't show a button that does nothing. */
export const THEME_TOGGLE = `(() => {
  const root = document.documentElement;
  const icons = {
    auto: '<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/>',
    light: '<circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/>',
    dark: '<path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7z"/>',
  };
  const labels = { auto: "Theme: match system", light: "Theme: light", dark: "Theme: dark" };
  const next = { auto: "light", light: "dark", dark: "auto" };
  const button = document.createElement("button");
  button.className = "theme-toggle";
  const render = () => {
    const mode = root.dataset.theme || "auto";
    button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">' + icons[mode] + "</svg>";
    button.title = labels[mode];
    button.setAttribute("aria-label", labels[mode]);
  };
  button.addEventListener("click", () => {
    const mode = next[root.dataset.theme || "auto"];
    if (mode === "auto") delete root.dataset.theme;
    else root.dataset.theme = mode;
    try {
      if (mode === "auto") localStorage.removeItem("${THEME_KEY}");
      else localStorage.setItem("${THEME_KEY}", mode);
    } catch {} // storage blocked: the choice lasts for this visit
    render();
  });
  render();
  document.body.appendChild(button);
})();`;
