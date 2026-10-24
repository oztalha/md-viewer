// Published and exported pages draw ```mermaid blocks in the browser; pages
// without one load nothing extra.
import { expect, test } from "bun:test";
import mermaidPackage from "mermaid/package.json";
import { standalonePage } from "../src/export";

const block = '<div class="mermaid-block"><pre><code>flowchart LR\n  A --&gt; B</code></pre></div>';

test("a page with a diagram loads the app's Mermaid version from the CDN", () => {
  const html = standalonePage(block, "Doc");
  expect(html).toContain(block);
  expect(html).toContain('<script type="module">');
  expect(html).toContain(`mermaid@${mermaidPackage.version}/dist/mermaid.esm.min.mjs`);
});

test("a page without diagrams loads no Mermaid", () => {
  expect(standalonePage("<p>Hi</p>", "Doc")).not.toContain("mermaid");
});
