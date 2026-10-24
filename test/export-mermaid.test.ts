// Published pages (password-protected ones included) must run no third-party
// code: diagrams are drawn by the app when the page is built, in both themes.
import { expect, test } from "bun:test";
import { standalonePage } from "../src/export";
import { staticDiagram } from "../src/pageMermaid";

test("a page with a drawn diagram loads no script from anywhere else", () => {
  const block = `<div class="mermaid-block">${staticDiagram("<svg>light</svg>", "<svg>dark</svg>")}</div>`;
  const html = standalonePage(block, "Doc");
  expect(html).toContain("mermaid-light");
  expect(html).toContain("mermaid-dark");
  expect(html).not.toMatch(/<script[^>]*\bsrc=/);
  expect(html).not.toContain("import ");
  expect(html).not.toMatch(/https?:\/\/[^"' ]*\.m?js/);
});

test("a page without diagrams has no diagram styles", () => {
  expect(standalonePage("<p>Hi</p>", "Doc")).not.toContain("mermaid");
});
