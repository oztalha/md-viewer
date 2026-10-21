import type { Doc } from "./types";
import { basename, displayTitle } from "./types";
import { keyForDoc } from "./annotations";
import { useStore } from "./store";
import { buildExportHtml } from "./export";
import { getEditorView } from "./editor/registry";
import {
  copyToClipboard,
  gistDelete,
  gistExists,
  mcpCall,
  pagesDelete,
  pagesPasswordGet,
  pagesPasswordSet,
  publishPages,
  mcpClose,
  mcpOpen,
  publishCommand,
  publishGist,
  publishStepCommand,
  publishTargets,
  readRemoteFile,
  readTextFile,
  remoteStat,
  writePublishTemp,
} from "./ipc";
import { isGithubHost, splitGithubSpec } from "./remote";
import { encryptPage, MIN_PASSWORD, newPageId } from "./pageCrypt";
import { localDocLinks, resolveLink, rewriteLinks } from "./docLinks";
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
  /** GitHub documents: republish when the file changes on GitHub. */
  sync?: boolean;
  /** GitHub documents: the blob sha last published by sync. */
  sha?: string;
  /** Gists: the gh account that owns it (only it can update it); unset = gh's active one. */
  account?: string;
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

function removeRecord(key: string, targetId: string): void {
  const records = loadRecords();
  if (!records[key]?.[targetId]) return;
  delete records[key][targetId];
  if (Object.keys(records[key]).length === 0) delete records[key];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  useStore.getState().setPublishError(publishErrorKey(key, targetId), null);
  useStore.getState().bumpPublished();
}

const verified = new Set<string>();

/**
 * Forget gists that were deleted on github.com, so the document no longer
 * shows as published and Publish creates a new one. Once per document per
 * session unless `force`; if GitHub can't be reached, the links are kept.
 */
export async function verifyPublished(doc: Doc | undefined, force = false): Promise<void> {
  const key = keyForDoc(doc);
  if (!key || (!force && verified.has(key))) return;
  verified.add(key);
  const records = Object.entries(publishedFor(doc));
  if (records.length === 0) return;
  let targets: PublishTarget[];
  try {
    targets = await publishTargets();
  } catch {
    return; // a broken publish.json shows its error in the dialog
  }
  for (const [targetId, rec] of records) {
    if (targets.find((t) => t.id === targetId)?.kind !== "gist") continue;
    try {
      if (!(await gistExists(rec.id, rec.account ?? null))) removeRecord(key, targetId);
    } catch {
      // offline or gh trouble: keep the link
    }
  }
}

/**
 * Take a document down from a target: delete the gist or protected page, then
 * forget the record. Other targets have no delete step, so only the record is
 * forgotten (the caller says so). Linked documents stay published.
 */
export async function unpublish(
  doc: Doc,
  target: PublishTarget,
): Promise<"deleted" | "forgotten"> {
  const key = keyForDoc(doc);
  const rec = publishedFor(doc)[target.id];
  if (!key || !rec) return "forgotten";
  let result: "deleted" | "forgotten" = "forgotten";
  if (target.kind === "gist") {
    await gistDelete(rec.id, rec.account ?? null);
    result = "deleted";
  } else if (target.kind === "pages") {
    await pagesDelete(rec.id, rec.account ?? null);
    result = "deleted";
  }
  removeRecord(key, target.id);
  return result;
}

/** Turn "keep in sync with GitHub" on or off for one published copy. */
export function setSync(doc: Doc, targetId: string, on: boolean): void {
  const rec = publishedFor(doc)[targetId];
  if (!rec) return;
  // No sha when turning on: the first sync then republishes from GitHub, so
  // the published copy matches GitHub even if it was published with local edits.
  saveRecord(doc, targetId, { ...rec, sync: on || undefined, sha: undefined });
  const key = keyForDoc(doc);
  if (key) useStore.getState().setPublishError(publishErrorKey(key, targetId), null);
  useStore.getState().bumpPublished();
  if (on) void syncGithubPublished();
}

export function isGithubDoc(doc: Doc | undefined): boolean {
  return !!doc?.remote && isGithubHost(doc.remote.host);
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
  update: boolean,
  vars: Record<string, string>,
): Promise<void> {
  const steps: PublishStep[] = update ? target.update : target.create;
  // Started on the first tool step, so command-only lists don't spawn a server.
  let session: number | undefined;
  try {
    for (const [index, step] of steps.entries()) {
      let data: unknown;
      if (step.run) {
        data = await publishStepCommand(target.id, update, index, vars);
      } else {
        session ??= await mcpOpen(target.id);
        const result = await mcpCall(session, step.tool, fill(step.args ?? {}, vars));
        if (result.isError) {
          throw new Error(`${target.label} (${step.tool}): ${resultText(result) || "failed"}`);
        }
        data = resultData(result);
      }
      for (const [name, path] of Object.entries(step.save ?? {})) {
        const value = pick(data, path);
        if (value != null && value !== "") vars[name] = String(value);
      }
    }
  } finally {
    if (session !== undefined) void mcpClose(session);
  }
}

export interface PublishOutcome {
  url: string;
  /** Protected pages: in the page once the host serves this version (see pagesLive). */
  marker?: string;
  updated: boolean;
  /** Linked documents published along with it. */
  linked: number;
  /** Linked documents that couldn't be published, with why. */
  skipped: string[];
}

/** The text to publish: the live editor (unsaved edits included), else the doc. */
function liveMarkdown(doc: Doc): string {
  const view = getEditorView(doc.id);
  return view ? view.state.doc.toString() : doc.content;
}

/** A local markdown file a document links to, and the hrefs that point at it. */
export interface LinkedDoc {
  doc: Doc;
  hrefs: string[];
}

/**
 * The other local markdown files a document links to (one hop), resolved like
 * a click in the preview. A remote document's links stay on its host.
 */
export function linkedDocs(doc: Doc | undefined): LinkedDoc[] {
  if (!doc || doc.image) return [];
  const where = doc.remote?.path ?? doc.path;
  const baseDir = where ? where.slice(0, where.lastIndexOf("/")) : null;
  const self = keyForDoc(doc);
  const byKey = new Map<string, LinkedDoc>();
  for (const href of localDocLinks(liveMarkdown(doc))) {
    const path = resolveLink(baseDir, href);
    if (!path) continue;
    const linked: Doc = {
      id: "",
      path: doc.remote ? null : path,
      remote: doc.remote ? { ...doc.remote, path } : null,
      title: path.slice(path.lastIndexOf("/") + 1),
      content: "",
      saved: "",
    };
    const key = keyForDoc(linked);
    if (!key || key === self) continue;
    const entry = byKey.get(key);
    if (entry) entry.hrefs.push(href);
    else byKey.set(key, { doc: linked, hrefs: [href] });
  }
  return [...byKey.values()];
}

/** A linked file's text: from its open tab if it has one (unsaved edits too). */
async function readLinked(linked: Doc): Promise<string> {
  const key = keyForDoc(linked);
  const open = Object.values(useStore.getState().docs).find((d) => keyForDoc(d) === key);
  if (open) return liveMarkdown(open);
  return linked.remote ? readRemoteFile(linked.remote.host, linked.remote.path) : readTextFile(linked.path!);
}

/** Publish (or republish) one document's text to a target and record the link. */
async function publishText(
  doc: Doc,
  markdown: string,
  target: PublishTarget,
  asNew: boolean,
  extra: { sha?: string; account?: string; password?: string } = {},
): Promise<{ url: string; updated: boolean; marker?: string }> {
  const title = displayTitle(doc).replace(
    /\.(md|markdown|mdown|mkdn|mkd|txt)$/i,
    "",
  );
  const html = target.format === "html";
  const contents = html ? buildExportHtml(markdown, title) : markdown;
  const previous = asNew ? undefined : publishedFor(doc)[target.id];
  let id = "";
  let url = "";
  let marker: string | undefined;
  // An update must come from the owner (gist, pages repo); a new one uses the chosen account.
  const owned = target.kind === "gist" || target.kind === "pages";
  const account = owned
    ? previous
      ? previous.account
      : extra.account
    : undefined;

  if (target.kind === "pages") {
    ({ id, url, marker } = await publishProtected(
      doc,
      markdown,
      title,
      previous?.id,
      account,
      extra.password,
    ));
  } else {
    const file = await writePublishTemp(
      `${title || "document"}.${html ? "html" : "md"}`,
      contents,
    );
    ({ id, url } = await publishTo(
      doc,
      target,
      file,
      title,
      contents,
      previous,
      account,
    ));
  }

  saveRecord(doc, target.id, {
    id,
    url,
    at: Date.now(),
    sync: previous?.sync,
    sha: extra.sha ?? previous?.sha,
    account,
  });
  useStore.getState().bumpPublished();
  return { url, updated: !!previous, marker };
}

/**
 * A password-protected page: the rendered page, encrypted here (the plaintext
 * never leaves the app), uploaded under a random name. Without a password
 * given (sync, republish), the one saved in the Keychain is used.
 */
async function publishProtected(
  doc: Doc,
  markdown: string,
  title: string,
  existingId: string | undefined,
  account: string | undefined,
  given: string | undefined,
): Promise<{ id: string; url: string; marker: string }> {
  const password =
    given ?? (existingId ? await pagesPasswordGet(existingId) : null);
  if (!password)
    throw new Error(
      `No saved password for “${displayTitle(doc)}”. Publish it from the Publish dialog.`,
    );
  if (password.length < MIN_PASSWORD)
    throw new Error(`Use a password of at least ${MIN_PASSWORD} characters.`);
  const pageId = existingId ?? newPageId();
  const { page, marker } = await encryptPage(buildExportHtml(markdown, title), password, pageId);
  const file = await writePublishTemp(`${pageId}.html`, page);
  const out = await publishPages(file, pageId, account ?? null);
  await pagesPasswordSet(out.id, password);
  return { ...out, marker };
}

async function publishTo(
  doc: Doc,
  target: PublishTarget,
  file: string,
  title: string,
  contents: string,
  previous: PublishRecord | undefined,
  account: string | undefined,
): Promise<{ id: string; url: string }> {
  let id = "";
  let url = "";
  if (target.kind === "gist") {
    try {
      ({ id, url } = await publishGist(
        target.id,
        file,
        title,
        previous?.id ?? null,
        account ?? null,
      ));
    } catch (err) {
      // Deleted on github.com: forget it, so the next publish makes a new gist.
      const key = keyForDoc(doc);
      if (
        previous &&
        key &&
        !(await gistExists(previous.id, account ?? null).catch(() => true))
      ) {
        removeRecord(key, target.id);
        throw new Error(
          "This gist was deleted on GitHub. Publish again to create a new one.",
        );
      }
      throw err;
    }
  } else if (target.kind === "command") {
    ({ id, url } = await publishCommand(
      target.id,
      file,
      title,
      previous?.id ?? null,
    ));
  } else {
    const updating = !!previous && target.update.length > 0;
    const vars: Record<string, string> = { file, title, content: contents };
    if (updating) vars.id = previous.id;
    await runSteps(target, updating, vars);
    id = vars.id ?? "";
    if (!id)
      throw new Error(
        `${target.label}: couldn't find the new document's id in the reply`,
      );
    // Keep the link from the first publish (update replies may be less friendly),
    // else use one from the reply, else build it from the template.
    url =
      previous?.url ||
      vars.url ||
      (target.urlTemplate ? String(fill(target.urlTemplate, vars)) : "");
    if (!url)
      throw new Error(
        `${target.label}: no link in the reply and no "urlTemplate" set`,
      );
  }
  return { id, url };
}

/**
 * Publish (or republish) a document to a target and copy the link. With
 * `linked`, the local markdown files it links to are published first (updated
 * in place if they were before, so their links stay put), and the published
 * copy links to them instead of to the local paths. One hop only.
 */
export async function publishDoc(
  doc: Doc,
  target: PublishTarget,
  options: {
    asNew?: boolean;
    linked?: boolean;
    account?: string;
    /** Password-protected pages: also used for the linked documents. */
    password?: string;
    onProgress?: (text: string) => void;
  } = {},
): Promise<PublishOutcome> {
  let markdown = liveMarkdown(doc);
  const skipped: string[] = [];
  let linkedCount = 0;

  if (options.linked) {
    const links = linkedDocs(doc);
    const urls = new Map<string, string>();
    for (const [i, { doc: linked, hrefs }] of links.entries()) {
      options.onProgress?.(`linked document ${i + 1} of ${links.length}: ${linked.title}`);
      try {
        const { url } = await publishText(
          linked,
          await readLinked(linked),
          target,
          false,
          {
            account: options.account,
            password: options.password,
          },
        );
        for (const href of hrefs) urls.set(href, url);
        linkedCount++;
      } catch (err) {
        skipped.push(`${linked.title}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    markdown = rewriteLinks(markdown, urls);
    options.onProgress?.(displayTitle(doc));
  }

  const out = await publishText(doc, markdown, target, !!options.asNew, {
    account: options.account,
    password: options.password,
  });
  await copyToClipboard(out.url);
  return { ...out, linked: linkedCount, skipped };
}

/** How often published GitHub documents are checked for changes (ms). */
const GITHUB_SYNC_MS = 5 * 60 * 1000;

/** A document's links to files already published to `targetId`, mapped to their pages. */
function publishedLinks(doc: Doc, targetId: string): Map<string, string> {
  const urls = new Map<string, string>();
  for (const { doc: linked, hrefs } of linkedDocs(doc)) {
    const url = publishedFor(linked)[targetId]?.url;
    if (url) for (const href of hrefs) urls.set(href, url);
  }
  return urls;
}

let syncing = false;

/**
 * Republish GitHub documents marked "keep in sync" whose file changed on
 * GitHub since their last publish. Linked documents aren't republished; links
 * to ones already published to the same target point at their pages.
 */
export async function syncGithubPublished(): Promise<void> {
  if (syncing) return;
  const due = Object.entries(loadRecords()).filter(
    ([key, byTarget]) => splitGithubSpec(key) && Object.values(byTarget).some((r) => r.sync),
  );
  if (due.length === 0) return;
  syncing = true;
  try {
    const targets = await publishTargets();
    for (const [key, byTarget] of due) {
      const remote = splitGithubSpec(key)!;
      for (const [targetId, rec] of Object.entries(byTarget)) {
        if (!rec.sync) continue;
        const errorKey = publishErrorKey(key, targetId);
        try {
          const target = targets.find((t) => t.id === targetId);
          if (!target) throw new Error(`The publish target "${targetId}" is no longer in publish.json`);
          const sha = await remoteStat(remote.host, remote.path);
          if (sha !== rec.sha) {
            const content = await readRemoteFile(remote.host, remote.path);
            const doc: Doc = { id: "", path: null, remote, title: basename(remote.path), content, saved: content };
            await publishText(doc, rewriteLinks(content, publishedLinks(doc, targetId)), target, false, { sha });
          }
          useStore.getState().setPublishError(errorKey, null);
        } catch (err) {
          useStore.getState().setPublishError(errorKey, err instanceof Error ? err.message : String(err));
        }
      }
    }
  } finally {
    syncing = false;
  }
}

export function publishErrorKey(docKey: string, targetId: string): string {
  return `${docKey}\n${targetId}`;
}

/** Sync now and every few minutes while the app runs. */
export function initGithubSync(): void {
  void syncGithubPublished();
  setInterval(() => void syncGithubPublished(), GITHUB_SYNC_MS);
}
