import { expect, test } from "bun:test";
import { idFromLink, pageMatches, protectedPageId } from "../src/publishSearch";

// Finding the file behind a link: pasted links carry extras (some services
// append a title slug), so a plain substring match on the stored link isn't enough.
const page = {
  title: "WEEKLY_REVIEW_NOTES",
  key: "devbox:/home/me/reports/WEEKLY_REVIEW_NOTES.md",
  url: "https://notes.example.com/doc/Xk3pQ9rT2mLa",
  id: "Xk3pQ9rT2mLa",
  targetLabel: "Team Notes",
};

test("a pasted link with a slug finds its page", () => {
  expect(pageMatches(page, "https://notes.example.com/doc/Xk3pQ9rT2mLa/Weekly-review-notes")).toBe(true);
  expect(pageMatches(page, "https://notes.example.com/doc/zzzzzzzzzzzz/Weekly")).toBe(false);
});

test("words match title, file and target, in any order", () => {
  expect(pageMatches(page, "team weekly")).toBe(true);
  expect(pageMatches(page, "devbox reports")).toBe(true);
  expect(pageMatches(page, "gist weekly")).toBe(false);
  expect(pageMatches(page, "  ")).toBe(true);
});

test("an existing page's id comes from its link", () => {
  const notes = { kind: "mcp", urlTemplate: "https://notes.example.com/doc/{id}" };
  expect(idFromLink("https://notes.example.com/doc/Xk3pQ9rT2mLa/Weekly-review", notes)).toBe("Xk3pQ9rT2mLa");
  expect(idFromLink("https://notes.example.com/doc/Xk3pQ9rT2mLa", notes)).toBe("Xk3pQ9rT2mLa");
  expect(idFromLink("https://other.example.org/doc/Xk3pQ9rT2mLa", notes)).toBeNull();
  expect(idFromLink("https://gist.github.com/someone/0a1b2c3d4e5f", { kind: "gist" })).toBe("0a1b2c3d4e5f");
  expect(idFromLink("https://x.dev/a", { kind: "mcp" })).toBeNull();
});

test("protected-page links: github.io or the account's custom domain", () => {
  const id = "0123456789abcdef0123456789abcdef";
  expect(protectedPageId(`https://someone.github.io/md-viewer-pages/${id}.html`)).toBe(id);
  expect(protectedPageId(`https://example.org/md-viewer-pages/${id}.html?v=2`)).toBe(id);
  expect(protectedPageId(`http://example.org/md-viewer-pages/${id}.html`)).toBeNull();
  expect(protectedPageId(`https://example.org/other/${id}.html`)).toBeNull();
  expect(protectedPageId("https://example.org/md-viewer-pages/short.html")).toBeNull();
  expect(idFromLink(`https://example.org/md-viewer-pages/${id}.html`, { kind: "pages" })).toBe(id);
});
