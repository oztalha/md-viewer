// The index page carries its own list (read back on the next publish, from any
// Mac). A title must never break out of it or wipe it.
import { expect, test } from "bun:test";
import { parseIndex, renderIndexBody, withEntry, withoutEntry } from "../src/pageIndex";
import type { IndexEntry } from "../src/pageIndex";

const page = (id: string, title: string, locked: boolean, at: number): IndexEntry => ({
  id,
  title,
  url: `https://me.github.io/md-viewer-pages/${id}.html`,
  locked,
  at,
});

test("the list round-trips through the page, titles stay escaped", () => {
  const evil = page("b".repeat(32), 'Plan </script><script>alert(1)</script> & <b>"x"</b>', false, 2);
  const entries = [page("a".repeat(32), "Notes", true, 1), evil];
  const html = renderIndexBody(entries, "me");
  expect(html).not.toContain("<script>alert");
  expect(html).not.toContain("<b>");
  expect(parseIndex(html)).toEqual([evil, entries[0]]); // newest first
});

test("only pages that need a password get the lock", () => {
  const html = renderIndexBody([page("a".repeat(32), "Open", false, 1)], "me");
  expect(html).not.toContain('class="lock"');
  expect(renderIndexBody([page("a".repeat(32), "Locked", true, 1)], "me")).toContain('class="lock"');
});

test("an unreadable index throws instead of starting over empty", () => {
  expect(parseIndex(null)).toEqual([]);
  expect(() => parseIndex("<h1>someone else's page</h1>")).toThrow();
  expect(() => parseIndex('<script type="application/json" id="md-viewer-index">{oops</script>')).toThrow();
});

test("entries are replaced by page id", () => {
  const a = page("a".repeat(32), "One", false, 1);
  const list = withEntry(withEntry([a], { ...a, title: "Renamed", at: 3 }), page("c".repeat(32), "Two", true, 2));
  expect(list.map((e) => e.title)).toEqual(["Renamed", "Two"]);
  expect(withoutEntry(list, a.id).map((e) => e.title)).toEqual(["Two"]);
});
