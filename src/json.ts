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

/** The lines of a JSONL document, numbered, blank lines skipped. */
function jsonlRecords(source: string): { line: number; text: string }[] {
  return source
    .split("\n")
    .map((text, i) => ({ line: i + 1, text: text.trim() }))
    .filter((r) => r.text.length > 0);
}

/**
 * Preview for a .jsonl / .ndjson document: one pretty-printed, highlighted
 * block per record, each headed by its line number so it lines up with the
 * editor. A record that doesn't parse is shown raw with a warning.
 */
export function renderJsonlBlocks(source: string): string[] {
  const records = jsonlRecords(source);
  if (records.length === 0) return [];
  const md = records
    .map(({ line, text }) => {
      try {
        const pretty = JSON.stringify(JSON.parse(text), null, 2);
        const fence = fenceFor(pretty);
        return `###### ${line}\n\n${fence}json\n${pretty}\n${fence}\n`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const fence = fenceFor(text);
        return `###### ${line}\n\n> [!WARNING]\n> Invalid JSON: ${message.replace(/\n/g, " ")}\n\n${fence}text\n${text}\n${fence}\n`;
      }
    })
    .join("\n");
  return renderBlocks(md);
}

/** Re-serialize each JSONL record compactly (one per line), or null if any fails. */
export function formatJsonl(source: string): string | null {
  const records = jsonlRecords(source);
  if (records.length === 0) return null;
  try {
    return records.map((r) => JSON.stringify(JSON.parse(r.text))).join("\n") + "\n";
  } catch {
    return null;
  }
}
