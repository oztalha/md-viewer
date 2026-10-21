import { describe, expect, test } from "bun:test";
import MarkdownIt from "markdown-it";
import { bareDocLinks } from "../src/bareDocLinks";
import { localDocLinks, rewriteLinks } from "../src/docLinks";

// `.md` is a real top-level domain, so linkify made `methods.md` a link to
// http://methods.md. Bare markdown names and paths link to the files instead.
const md = new MarkdownIt({ linkify: true }).use(bareDocLinks);
const render = (s: string) => md.renderInline(s);

describe("bare markdown file links", () => {
  test("names and paths link to the files", () => {
    expect(render("See methods.md.")).toBe('See <a href="methods.md">methods.md</a>.');
    expect(render("Read notes/plan.md, ../../up.md and /abs/a.md")).toBe(
      'Read <a href="notes/plan.md">notes/plan.md</a>, <a href="../../up.md">../../up.md</a> and <a href="/abs/a.md">/abs/a.md</a>',
    );
  });

  test("web addresses, code and existing links stay as they are", () => {
    expect(render("https://x.dev/a.md")).toBe('<a href="https://x.dev/a.md">https://x.dev/a.md</a>');
    expect(render("www.example.md")).toBe('<a href="http://www.example.md">www.example.md</a>');
    expect(render("`methods.md`")).toBe("<code>methods.md</code>");
    expect(render("[the methods](methods.md)")).toBe('<a href="methods.md">the methods</a>');
    expect(render("notmarkdown.txt and methods.mdx")).toBe("notmarkdown.txt and methods.mdx");
  });

  test("publishing finds and rewrites bare names too", () => {
    const doc = "See methods.md and [plan](notes/plan.md), not `code.md`.";
    expect(localDocLinks(doc)).toEqual(["methods.md", "notes/plan.md"]);
    const urls = new Map([["methods.md", "https://p/1"], ["notes/plan.md", "https://p/2"]]);
    expect(rewriteLinks(doc, urls)).toBe("See [methods.md](https://p/1) and [plan](https://p/2), not `code.md`.");
  });
});
