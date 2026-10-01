import { renderBlocks } from "./markdown";

/** A code fence longer than any backtick run in `text`, so it can't close early. */
export function fenceFor(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * Preview for a .json document: pretty-printed (2-space indent) and
 * highlighted, by rendering it as a json code block through the markdown
 * pipeline. Invalid JSON shows the parse error above the raw text.
 */
export function renderJsonBlocks(source: string): string[] {
  if (!source.trim()) return [];
  try {
    const pretty = JSON.stringify(JSON.parse(source), null, 2);
    const fence = fenceFor(pretty);
    return renderBlocks(`${fence}json\n${pretty}\n${fence}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fence = fenceFor(source);
    return renderBlocks(`> [!WARNING]\n> Invalid JSON: ${message.replace(/\n/g, " ")}\n\n${fence}text\n${source}\n${fence}\n`);
  }
}

/** Pretty-print JSON text, or null if it doesn't parse. */
export function formatJson(source: string): string | null {
  try {
    return JSON.stringify(JSON.parse(source), null, 2) + "\n";
  } catch {
    return null;
  }
}
