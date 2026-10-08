import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  open as openDialog,
  save as saveDialog,
  ask,
  confirm,
  message,
} from "@tauri-apps/plugin-dialog";

const MARKDOWN_FILTER = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkdn", "mkd", "txt"] },
  { name: "CSV", extensions: ["csv", "tsv"] },
  { name: "JSON", extensions: ["json", "jsonl", "ndjson"] },
  { name: "Code", extensions: ["py", "js", "ts", "tsx", "sh", "rs", "go", "java", "yaml", "yml", "toml", "sql"] },
  { name: "All Files", extensions: ["*"] },
];

export function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

export function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke<void>("write_file", { path, contents });
}

/** Permit the asset protocol to serve a specific local file (e.g. a dropped image). */
export function allowAsset(path: string): Promise<void> {
  return invoke<void>("allow_asset", { path });
}

/** Whether a local path exists (gating file-link navigation). */
export function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

/** Rebuild the native File → Open Recent submenu. */
export function setRecentFiles(items: { spec: string; label: string }[]): Promise<void> {
  return invoke<void>("set_recent_files", { items });
}

/** Watch these local files; changes arrive as `file-changed` events. */
export function watchFiles(paths: string[]): Promise<void> {
  return invoke<void>("watch_files", { paths });
}

/** Change signature (mtime + size) of a remote file, for polling. */
export function remoteStat(host: string, path: string): Promise<string> {
  return invoke<string>("remote_stat", { host, path });
}

/** Read a remote file over SSH. */
export function readRemoteFile(host: string, path: string): Promise<string> {
  return invoke<string>("read_remote", { host, path });
}

export interface RemoteListing {
  /** Resolved absolute directory. */
  dir: string;
  entries: { name: string; isDir: boolean }[];
}

/** List a remote directory over SSH (for the remote file browser). */
export function listRemoteDir(host: string, path: string): Promise<RemoteListing> {
  return invoke<RemoteListing>("list_remote", { host, path });
}

/** Write a remote file over SSH (atomic on the remote side). */
export function writeRemoteFile(host: string, path: string, contents: string): Promise<void> {
  return invoke<void>("write_remote", { host, path, contents });
}

/** Update native menu accelerators (id → accelerator; empty string clears). */
export function setMenuAccelerators(accelerators: Record<string, string>): Promise<void> {
  return invoke<void>("set_menu_accelerators", { accelerators });
}

/** Tell the backend we're listening; returns files queued before startup. */
export function frontendReady(): Promise<string[]> {
  return invoke<string[]>("frontend_ready");
}

export function quitApp(): Promise<void> {
  return invoke<void>("quit_app");
}

/** Native open dialog. Returns selected paths (possibly empty). */
export async function pickFilesToOpen(): Promise<string[]> {
  const result = await openDialog({ multiple: true, filters: MARKDOWN_FILTER });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

/** Native save dialog. Returns the chosen path or null if cancelled. */
export async function pickSavePath(suggestedName: string): Promise<string | null> {
  const result = await saveDialog({
    defaultPath: suggestedName,
    filters: MARKDOWN_FILTER,
  });
  return result ?? null;
}

/** Copy text to the system clipboard. */
export function copyToClipboard(text: string): Promise<void> {
  return writeText(text);
}

/** Confirm discarding unsaved edits before reloading from disk/remote. */
export function confirmReloadDiscard(title: string): Promise<boolean> {
  return confirm(`Reloading will discard the unsaved changes you made to “${title}”. Reload anyway?`, {
    title: "Unsaved Changes",
    kind: "warning",
    okLabel: "Reload",
    cancelLabel: "Cancel",
  });
}

/**
 * A file that's gone (moved or deleted). With `inRecents`, offer to drop it
 * from Recents; resolves true if the user chose to.
 */
export async function reportMissingFile(where: string, inRecents: boolean): Promise<boolean> {
  const name = where.split("/").pop() || where;
  const text = `“${name}” isn't there anymore; it may have been moved or deleted.\n\n${where}`;
  if (!inRecents) {
    await message(text, { title: "File Not Found", kind: "warning" });
    return false;
  }
  return confirm(`${text}\n\nRemove it from Recents?`, {
    title: "File Not Found",
    kind: "warning",
    okLabel: "Remove",
    cancelLabel: "Keep",
  });
}

/** Confirm replacing an existing file (remote save). */
export function confirmOverwrite(name: string): Promise<boolean> {
  return confirm(`“${name}” already exists. Do you want to replace it?`, {
    title: "Replace File",
    kind: "warning",
    okLabel: "Replace",
    cancelLabel: "Cancel",
  });
}

/** "Save before closing?" — true means save, false means discard. */
export function askToSave(title: string): Promise<boolean> {
  return ask(`Do you want to save the changes you made to “${title}”?`, {
    title: "Unsaved Changes",
    kind: "warning",
    okLabel: "Save",
    cancelLabel: "Don't Save",
  });
}

/** Confirm quitting/closing with unsaved changes. */
export function confirmDiscardAll(count: number): Promise<boolean> {
  const what = count === 1 ? "1 document has" : `${count} documents have`;
  return confirm(`${what} unsaved changes. Close anyway?`, {
    title: "Unsaved Changes",
    kind: "warning",
    okLabel: "Close",
    cancelLabel: "Cancel",
  });
}

export async function showError(text: string): Promise<void> {
  await message(text, { title: "Markdown", kind: "error" });
}

// --- publishing (see src-tauri/src/publish.rs) ------------------------------

export interface PublishStep {
  tool: string;
  args?: unknown;
  save?: Record<string, string>;
}

export interface PublishTarget {
  id: string;
  label: string;
  kind: "mcp" | "gist" | "command";
  create: PublishStep[];
  update: PublishStep[];
  urlTemplate?: string;
  public?: boolean;
  format?: "markdown" | "html";
}

/** Publish targets from ~/.config/md-viewer/publish.json (gist only if absent). */
export function publishTargets(): Promise<PublishTarget[]> {
  return invoke<PublishTarget[]>("publish_targets");
}

/** Create the config file if needed and open it in the default text editor. */
export function editPublishConfig(): Promise<string> {
  return invoke<string>("publish_edit_config");
}

export function writePublishTemp(name: string, contents: string): Promise<string> {
  return invoke<string>("publish_write_temp", { name, contents });
}

export function mcpOpen(targetId: string): Promise<number> {
  return invoke<number>("publish_mcp_open", { targetId });
}

export function mcpCall(session: number, tool: string, args: unknown): Promise<McpResult> {
  return invoke<McpResult>("publish_mcp_call", { session, tool, args });
}

export function mcpClose(session: number): Promise<void> {
  return invoke<void>("publish_mcp_close", { session });
}

export interface McpResult {
  content?: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

export function publishGist(
  targetId: string,
  file: string,
  title: string,
  existing: string | null,
): Promise<{ id: string; url: string }> {
  return invoke("publish_gist", { targetId, file, title, existing });
}

export function publishCommand(
  targetId: string,
  file: string,
  title: string,
  existing: string | null,
): Promise<{ id: string; url: string }> {
  return invoke("publish_command", { targetId, file, title, existing });
}

/** Copy local files/folders into a remote directory over scp. */
export function uploadRemote(host: string, localPaths: string[], dir: string): Promise<void> {
  return invoke<void>("upload_remote", { host, localPaths, dir });
}

/** Confirm replacing items that already exist in a remote folder (upload). */
export function confirmReplaceRemote(names: string[], where: string): Promise<boolean> {
  const what =
    names.length === 1 ? `“${names[0]}” already exists` : `${names.length} items already exist (${names.join(", ")})`;
  return confirm(`${what} in ${where}. Replace?`, {
    title: "Replace on Remote",
    kind: "warning",
    okLabel: "Replace",
    cancelLabel: "Cancel",
  });
}

/** Copy a remote file/folder to a local path (picked in a save dialog). */
export function downloadRemote(host: string, remotePath: string, localPath: string): Promise<void> {
  return invoke<void>("download_remote", { host, remotePath, localPath });
}

/** Save dialog for a download, starting in Downloads. Null if cancelled. */
export async function pickDownloadPath(name: string): Promise<string | null> {
  const { downloadDir, join } = await import("@tauri-apps/api/path");
  const result = await saveDialog({ defaultPath: await join(await downloadDir(), name) });
  return result ?? null;
}
