import { describe, expect, test } from "bun:test";
import { htmlToMarkdown } from "../src/editor/richPaste";

// Regressions from pasting Slack messages: WebKit's clipboard HTML puts &nbsp;
// beside inline tags, and Slack's code blocks are a bare <pre>.
describe("rich paste", () => {
  test("Slack-style HTML becomes clean markdown", () => {
    const html =
      '<div>See the&nbsp;<a href="https://x.dev/a">runbook</a>&nbsp;and run&nbsp;<code>make</code>.<br></div>' +
      "<ul><li>one</li><li>two</li></ul><pre>echo hi</pre>";
    expect(htmlToMarkdown(html)).toBe(
      "See the [runbook](https://x.dev/a) and run `make`.\n\n- one\n- two\n\n```\necho hi\n```",
    );
  });

  test("structureless HTML (code editors) pastes as plain text", () => {
    expect(htmlToMarkdown('<div style="color:#ccc"><span>const</span> x = 1;</div>')).toBeNull();
  });
});
