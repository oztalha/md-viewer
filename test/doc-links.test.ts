import { describe, expect, test } from "bun:test";
import { localDocLinks, resolveLink, rewriteLinks } from "../src/docLinks";

// Publishing with linked documents rewrites links in place, so the scanner
// must find exactly the local .md links, and leave code and everything else.
describe("linked documents", () => {
  const md = [
    "# Readout",
    "See [findings](/r/FINDINGS.md) and [access](./ACCESS.md#who \"Access\").",
    "Also [web](https://x.dev/a.md), [anchor](#top), ![img](pic.md), [log](run.log).",
    "Inline `[not](code.md)` stays, [spaced](<my notes.md>) works.",
    "```",
    "[fenced](fenced.md)",
    "```",
    "[ref]: ../other/REF.md",
  ].join("\n");

  test("finds local markdown links only", () => {
    expect(localDocLinks(md)).toEqual([
      "/r/FINDINGS.md",
      "./ACCESS.md#who",
      "my notes.md",
      "../other/REF.md",
    ]);
  });

  test("rewrites them in place, keeping titles and everything else", () => {
    const urls = new Map([
      ["/r/FINDINGS.md", "https://p/1"],
      ["./ACCESS.md#who", "https://p/2"],
      ["my notes.md", "https://p/3"],
      ["../other/REF.md", "https://p/4"],
    ]);
    const out = rewriteLinks(md, urls);
    expect(out).toContain("[findings](https://p/1)");
    expect(out).toContain('[access](https://p/2 "Access")');
    expect(out).toContain("[spaced](https://p/3)");
    expect(out).toContain("[ref]: https://p/4");
    expect(out).toContain("`[not](code.md)`");
    expect(out).toContain("[fenced](fenced.md)");
    expect(out).toContain("![img](pic.md)");
  });

  test("resolves against the document's folder", () => {
    expect(resolveLink("/a/b", "./ACCESS.md#who")).toBe("/a/b/ACCESS.md");
    expect(resolveLink("/a/b", "../other/REF.md")).toBe("/a/other/REF.md");
    expect(resolveLink("/a/b", "my%20notes.md")).toBe("/a/b/my notes.md");
    expect(resolveLink(null, "x.md")).toBeNull();
    expect(resolveLink("/a", "bad%zz.md")).toBeNull();
  });
});
