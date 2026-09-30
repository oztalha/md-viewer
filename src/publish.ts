import type { Doc } from "./types";
import { displayTitle } from "./types";
import { keyForDoc } from "./annotations";
import { useStore } from "./store";
import { buildExportHtml } from "./export";
import { getEditorView } from "./editor/registry";
import {
  copyToClipboard,
  mcpCall,
  mcpClose,
  mcpOpen,
  publishCommand,
  publishGist,
  writePublishTemp,
} from "./ipc";
import type { McpResult, PublishStep, PublishTarget } from "./ipc";

/**
 * Publishing a document to a target from ~/.config/md-viewer/publish.json.
 * The first publish to a target runs its `create` steps; later ones run
 * `update` against the saved id, so the published link stays the same.
 */

export interface PublishRecord {
  id: string;
  url: string;
  at: number;
}

const STORAGE_KEY = "published";

type Records = Record<string, Record<string, PublishRecord>>;

function loadRecords(): Records {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Records;
  } catch {
    return {};
  }
}

/**
 * Where (and at which link) a document has been published, by target id.
 * Reads localStorage, which React can't see: components pass the store's
 * `publishTick` as `version` so the React Compiler doesn't reuse a stale result.
 */
export function publishedFor(doc: Doc | undefined, _version = 0): Record<string, PublishRecord> {
  const key = keyForDoc(doc);
  return key ? (loadRecords()[key] ?? {}) : {};
}

/** The most recently published link for a document, if any. */
export function latestPublished(doc: Doc | undefined, version = 0): PublishRecord | undefined {
  return Object.values(publishedFor(doc, version)).sort((x, y) => y.at - x.at)[0];
}

function saveRecord(doc: Doc, targetId: string, record: PublishRecord): void {
  const key = keyForDoc(doc);
  if (!key) return; // unsaved scratch docs have no stable identity
  const records = loadRecords();
  records[key] = { ...(records[key] ?? {}), [targetId]: record };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/** Fill `{name}` placeholders in every string inside `value`. Unknown names stay as-is. */
function fill(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
  }
  if (Array.isArray(value)) return value.map((v) => fill(v, vars));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)]));
  }
  return value;
}

function resultText(result: McpResult): string {
  return (result.content ?? [])
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}

/** A tool reply as data: structured content, else JSON text, else the raw text. */
function resultData(result: McpResult): unknown {
  if (result.structuredContent) return result.structuredContent;
  const text = resultText(result);
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

/** Read a dotted path ("result.version.id") out of a reply. */
function pick(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

async function runSteps(
  target: PublishTarget,
  steps: PublishStep[],
  vars: Record<string, string>,
): Promise<void> {
  const session = await mcpOpen(target.id);
  try {
    for (const step of steps) {
      const result = await mcpCall(session, step.tool, fill(step.args ?? {}, vars));
      if (result.isError) {
        throw new Error(`${target.label} (${step.tool}): ${resultText(result) || "failed"}`);
      }
      const data = resultData(result);
      for (const [name, path] of Object.entries(step.save ?? {})) {
        const value = pick(data, path);
        if (value != null && value !== "") vars[name] = String(value);
      }
    }
  } finally {
    void mcpClose(session);
  }
}

export interface PublishOutcome {
  url: string;
  updated: boolean;
}

/** Publish (or republish) a document to a target and copy the link. */
export async function publishDoc(
  doc: Doc,
  target: PublishTarget,
  options: { asNew?: boolean } = {},
): Promise<PublishOutcome> {
  const view = getEditorView(doc.id);
  const markdown = view ? view.state.doc.toString() : doc.content;
  const title = displayTitle(doc).replace(/\.(md|markdown|mdown|mkdn|mkd|txt)$/i, "");
  const html = target.format === "html";
  const contents = html ? buildExportHtml(markdown, title) : markdown;
  const file = await writePublishTemp(`${title || "document"}.${html ? "html" : "md"}`, contents);

  const previous = options.asNew ? undefined : publishedFor(doc)[target.id];
  let id = "";
  let url = "";

  if (target.kind === "gist" || target.kind === "command") {
    const run = target.kind === "gist" ? publishGist : publishCommand;
    const res = await run(target.id, file, title, previous?.id ?? null);
    ({ id, url } = res);
  } else {
    const updating = !!previous && target.update.length > 0;
    const vars: Record<string, string> = { file, title, content: contents };
    if (updating) vars.id = previous.id;
    await runSteps(target, updating ? target.update : target.create, vars);
    id = vars.id ?? "";
    if (!id) throw new Error(`${target.label}: couldn't find the new document's id in the reply`);
    // Keep the link from the first publish (update replies may be less friendly),
    // else use one from the reply, else build it from the template.
    url =
      previous?.url ||
      vars.url ||
      (target.urlTemplate ? String(fill(target.urlTemplate, vars)) : "");
    if (!url) throw new Error(`${target.label}: no link in the reply and no "urlTemplate" set`);
  }

  saveRecord(doc, target.id, { id, url, at: Date.now() });
  useStore.getState().bumpPublished();
  await copyToClipboard(url);
  return { url, updated: !!previous };
}
