import { listen } from "@tauri-apps/api/event";
import { readRemoteFile, readTextFile, remoteStat, watchFiles } from "./ipc";
import { useSettings } from "./settings";
import { useStore } from "./store";
import { getEditorView } from "./editor/registry";

/** How often the visible remote tab is checked for changes (ms). */
const REMOTE_POLL_MS = 4000;

/**
 * Reload open files when they change outside the app (an agent rewriting a
 * report, another editor, `git pull`, …).
 *
 * Local files: the backend watches them with FSEvents and emits `file-changed`.
 * Remote files: there are no events over ssh, so the visible remote tab's
 * mtime+size is polled while the window is focused, and once on focus.
 *
 * A change is judged by comparing the file's new text with the editor's: equal
 * means it was our own save (nothing to do); no unsaved edits means reload in
 * place; unsaved edits means show the "changed on disk" bar instead.
 */
export function initAutoReload(): void {
  // Keep the backend watching exactly the open local files.
  let watched = "";
  const syncWatches = () => {
    const on = useSettings.getState().settings.autoReload;
    const paths = on
      ? [...new Set(Object.values(useStore.getState().docs).flatMap((d) => (d.path ? [d.path] : [])))].sort()
      : [];
    const key = paths.join("\n");
    if (key === watched) return;
    watched = key;
    void watchFiles(paths).catch(() => {});
  };
  useStore.subscribe(syncWatches);
  useSettings.subscribe(syncWatches);
  syncWatches();

  // Editors often write a file in several steps; act once it settles.
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  void listen<string>("file-changed", (event) => {
    const path = event.payload;
    clearTimeout(timers.get(path));
    timers.set(
      path,
      setTimeout(() => {
        timers.delete(path);
        const doc = Object.values(useStore.getState().docs).find((d) => d.path === path);
        if (doc) void check(doc.id);
      }, 200),
    );
  });

  // Remote: poll the visible tab only.
  const signatures = new Map<string, string>();
  let polling = false;
  const pollRemote = async () => {
    if (polling || !useSettings.getState().settings.autoReload || !document.hasFocus()) return;
    const { activeId, docs } = useStore.getState();
    const doc = docs[activeId];
    if (!doc?.remote) return;
    polling = true;
    try {
      const sig = await remoteStat(doc.remote.host, doc.remote.path);
      const prev = signatures.get(doc.id);
      signatures.set(doc.id, sig);
      if (prev !== undefined && prev !== sig) await check(doc.id);
    } catch {
      // Offline, file gone, ssh hiccup: try again next tick.
    } finally {
      polling = false;
    }
  };
  setInterval(() => void pollRemote(), REMOTE_POLL_MS);
  window.addEventListener("focus", () => void pollRemote());
}

/** Re-read a doc's file and reload it, or flag it if it has unsaved edits. */
async function check(docId: string): Promise<void> {
  const doc = useStore.getState().docs[docId];
  if (!doc || (!doc.path && !doc.remote)) return;
  let disk: string;
  try {
    disk = doc.remote ? await readRemoteFile(doc.remote.host, doc.remote.path) : await readTextFile(doc.path!);
  } catch {
    return; // deleted or mid-write; the next change event will tell us
  }
  const state = useStore.getState();
  const current = state.docs[docId];
  if (!current) return;
  const live = getEditorView(docId)?.state.doc.toString() ?? current.content;
  if (disk === live) {
    // Our own save (or the same text): just make sure it counts as saved.
    if (current.saved !== disk) state.applyExternal(docId, disk);
    return;
  }
  if (disk === current.saved) return; // nothing new on disk
  if (live === current.saved) state.applyExternal(docId, disk);
  else state.setChangedOnDisk(docId, true);
}
