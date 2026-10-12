import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useStore } from "./store";
import { keybindFor, useSettings } from "./settings";
import { copyToClipboard, downloadRemote, pickDownloadPath, showError } from "./ipc";
import { isPinned, removeRecent, togglePin } from "./recent";
import { remoteUrl } from "./remote";
import { parseOpenSpec } from "./remote";
import { basename } from "./types";

/**
 * Native right-click menu for a tab/document. Built fresh each time so it
 * reflects the current document (e.g. "Reveal in Finder" only when saved to
 * disk). `docId` is the document the menu acts on (the active doc's id).
 */
export async function showTileContextMenu(docId: string): Promise<void> {
  const state = useStore.getState();
  const doc = state.docs[docId];
  if (!doc) return;
  const path = doc.path ?? null;
  // Reload/Copy Path need a backing file (local path or remote SSH ref).
  const hasFile = !!(doc.path || doc.remote);
  state.selectTab(docId);

  // Open spec for pinning: the same string Recents uses.
  const spec = doc.remote ? remoteUrl(doc.remote) : (doc.path ?? "");

  const separator = () => PredefinedMenuItem.new({ item: "Separator" });
  // Show each action's shortcut (the user's current binding) in the menu.
  const settings = useSettings.getState().settings;
  const item = (text: string, action: () => void, keyId?: string) => {
    const accelerator = keyId ? keybindFor(settings, keyId) : "";
    return MenuItem.new({ text, action, ...(accelerator ? { accelerator } : {}) });
  };

  const items = await Promise.all([
    ...(hasFile
      ? [
          item("Reload", () => void useStore.getState().reloadDoc(docId), "reload"),
          item("Copy Path", () => void useStore.getState().copyDocPath(docId), "copy-path"),
          MenuItem.new({
            text: isPinned(spec) ? "Unpin" : "Pin",
            action: () => togglePin(spec, basename(spec)),
          }),
        ]
      : []),
    // No leading separator on an untitled doc (the menu is then just Close Tab).
    ...(hasFile ? [separator()] : []),
    ...(path ? [item("Reveal in Finder", () => void revealItemInDir(path))] : []),
    ...(doc.remote ? [item("Download…", () => void downloadDoc(docId))] : []),
    item("Close Tab", () => void useStore.getState().closeTab(docId), "close-pane"),
  ]);

  const menu = await Menu.new({ items });
  await menu.popup();
}

/**
 * Copy a remote document's file to this Mac (save dialog, then Finder shows
 * it). It's the file as saved on the remote machine; unsaved edits aren't in it.
 */
async function downloadDoc(docId: string): Promise<void> {
  const doc = useStore.getState().docs[docId];
  if (!doc?.remote) return;
  const name = doc.remote.path.split("/").pop() || "download.md";
  const local = await pickDownloadPath(name);
  if (!local) return;
  try {
    await downloadRemote(doc.remote.host, doc.remote.path, local);
    void revealItemInDir(local);
  } catch (err) {
    await showError(String(err));
  }
}

/** Right-click on a Recent entry in the sidebar. */
export async function showRecentContextMenu(spec: string): Promise<void> {
  const parsed = parseOpenSpec(spec, "");
  // Same rules as Copy Path (⇧⌘C): bare path unless "include host" is on.
  const withHost = useSettings.getState().settings.copyPathWithHost;
  const path =
    parsed.kind === "remote"
      ? withHost
        ? `${parsed.ref.host}:${parsed.ref.path}`
        : parsed.ref.path
      : parsed.path;

  const pinned = isPinned(spec);
  const label = basename(parsed.kind === "remote" ? parsed.ref.path : parsed.path);

  const items = await Promise.all([
    MenuItem.new({ text: "Open", action: () => void useStore.getState().openPaths([spec]) }),
    MenuItem.new({ text: "Copy Path", action: () => void copyToClipboard(path) }),
    PredefinedMenuItem.new({ item: "Separator" }),
    MenuItem.new({ text: pinned ? "Unpin" : "Pin", action: () => togglePin(spec, label) }),
    MenuItem.new({
      text: pinned ? "Remove" : "Remove from Recents",
      action: () => removeRecent(spec),
    }),
  ]);
  const menu = await Menu.new({ items });
  await menu.popup();
}
