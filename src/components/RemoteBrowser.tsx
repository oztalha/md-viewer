import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useSettings } from "../settings";
import { confirmOverwrite, confirmReplaceRemote, copyToClipboard, downloadRemote, listRemoteDir, pickDownloadPath, uploadRemote } from "../ipc";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { CopyButton } from "./CopyButton";
import type { RemoteListing } from "../ipc";
import { isValidHost } from "../remote";
import { basename, displayTitle } from "../types";

const HOST_KEY = "remoteBrowserHost";
const dirKey = (host: string) => `remoteBrowserDir:${host}`;
const DOC_RE = /\.(md|markdown|mdown|mkdn|mkd|txt|csv|tsv|json)$/i;
/** Files that can't be opened as text: clicking one downloads it instead. */
const BINARY_RE =
  /\.(zip|gz|tgz|bz2|xz|zst|7z|rar|tar|jar|war|whl|dmg|pkg|iso|bin|exe|so|dylib|o|a|class|pyc|png|jpe?g|gif|webp|heic|ico|bmp|tiff?|pdf|docx?|xlsx?|pptx?|mp3|mp4|mov|wav|avi|mkv|parquet|db|sqlite)$/i;
/** `host:/path` or `host:~/path` pasted into the path bar switches host too. */
const SPEC_RE = /^([A-Za-z0-9._@[\]-]+):((?:~|\/).*)$/;

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

function parentOf(path: string): string {
  const i = path.replace(/\/+$/, "").lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

function FolderIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 16 13" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1.5 1h4.3l1.5 1.6h7.2c.6 0 1 .4 1 1V11c0 .6-.4 1-1 1H1.5c-.6 0-1-.4-1-1V2c0-.6.4-1 1-1Z"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 15" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        d="M1.5.8h6l3.7 3.7v9c0 .4-.3.7-.7.7h-9a.7.7 0 0 1-.7-.7V1.5c0-.4.3-.7.7-.7Z"
      />
    </svg>
  );
}

/**
 * Remote file browser, shared by "Open Remote…" and "Save to Remote…". Lists
 * directories over the system `ssh` (so ~/.ssh/config aliases and proxies
 * apply). Remembers the last host and, per host, the last folder.
 */
export function RemoteBrowser() {
  const mode = useStore((s) => s.remoteBrowser);
  // Mount fresh per open so state (listing, drafts) always starts clean.
  return mode ? <Browser mode={mode} /> : null;
}

function Browser({ mode }: { mode: "open" | "save" }) {
  const close = () => useStore.getState().setRemoteBrowser(null);

  // Starting point: saving a doc that already lives remotely starts next to it;
  // otherwise the last host/folder used, then the configured default host.
  const [initial] = useState(() => {
    const s = useStore.getState();
    const doc = s.docs[s.activeId];
    const defaultHost = useSettings.getState().settings.defaultRemoteHost;
    // Start next to the active remote document (open or save), like most
    // apps' Open dialogs; otherwise the last host/folder used.
    if (doc?.remote) {
      return { host: doc.remote.host, dir: parentOf(doc.remote.path), name: basename(doc.remote.path) };
    }
    const host = localStorage.getItem(HOST_KEY) || defaultHost || "";
    const title = doc ? displayTitle(doc).replace(/[/\\:]/g, "-") : "Untitled";
    const name = doc?.path ? basename(doc.path) : /\.\w+$/.test(title) ? title : `${title}.md`;
    return { host, dir: (host && localStorage.getItem(dirKey(host))) || "~", name };
  });

  const [host, setHost] = useState(initial.host);
  const [hostDraft, setHostDraft] = useState(initial.host);
  const [pathDraft, setPathDraft] = useState(initial.dir);
  const [listing, setListing] = useState<RemoteListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [fileName, setFileName] = useState(initial.name);
  const request = useRef(0);
  // True once the user types/pastes in the path bar; a listing that finishes
  // afterwards must not overwrite what they entered.
  const pathEdited = useRef(false);

  const load = useCallback(async (h: string, dir: string, fromTyping = false) => {
    if (!fromTyping) pathEdited.current = false;
    if (!isValidHost(h)) {
      setListing(null);
      setError(h ? `Invalid SSH host: ${h}` : "Enter an SSH host (an alias from ~/.ssh/config works).");
      return;
    }
    // Ignore responses from superseded requests (fast clicking through folders).
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listRemoteDir(h, dir);
      if (id !== request.current) return;
      result.entries.sort((a, b) =>
        a.isDir !== b.isDir
          ? a.isDir
            ? -1
            : 1
          : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      );
      setListing(result);
      if (!pathEdited.current) setPathDraft(result.dir);
      localStorage.setItem(HOST_KEY, h);
      localStorage.setItem(dirKey(h), result.dir);
    } catch (err) {
      if (id === request.current) setError(String(err));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(initial.host, initial.dir);
  }, [load, initial]);

  // Escape closes (capture phase, so it beats other window-level handlers).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      useStore.getState().setRemoteBrowser(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const switchHost = (next: string) => {
    const h = next.trim();
    setHost(h);
    setHostDraft(h);
    void load(h, localStorage.getItem(dirKey(h)) || "~");
  };

  // Download a remote file/folder to a place picked in a save dialog.
  const download = async (path: string) => {
    const local = await pickDownloadPath(basename(path));
    if (!local) return;
    setUpload(`Downloading ${basename(path)} from ${host}…`);
    try {
      await downloadRemote(host, path, local);
      setUpload(`Downloaded to ${local}`);
      void revealItemInDir(local);
    } catch (err) {
      setUpload(null);
      setError(String(err));
    }
  };

  const showEntryMenu = async (path: string, isDir: boolean) => {
    const items = await Promise.all([
      ...(isDir
        ? [MenuItem.new({ text: "Open Folder", action: () => void load(host, path) })]
        : [MenuItem.new({ text: "Open", action: () => openFile(host, path) })]),
      MenuItem.new({ text: "Download…", action: () => void download(path) }),
      MenuItem.new({ text: "Copy Path", action: () => void copyToClipboard(copyWithHost ? `${host}:${path}` : path) }),
    ]);
    await (await Menu.new({ items })).popup();
  };

  const openFile = (h: string, path: string) => {
    close();
    void useStore.getState().openRemote(h, path);
  };

  const save = async (name = fileName.trim()) => {
    if (!listing || !name) return;
    const target = name.startsWith("/") || name.startsWith("~") ? name : joinPath(listing.dir, name);
    const exists = listing.entries.some((e) => !e.isDir && e.name === name);
    if (exists && !(await confirmOverwrite(name))) return;
    const s = useStore.getState();
    if (await s.saveToRemote(s.activeId, host, target)) close();
  };

  // Path bar: a folder navigates; a file path opens it (or, when saving,
  // selects its folder + name); a pasted `host:/path` switches host too.
  const submitPath = () => {
    let h = host;
    let p = pathDraft.trim() || "~";
    const spec = SPEC_RE.exec(p);
    if (spec && isValidHost(spec[1])) {
      h = spec[1];
      p = spec[2];
      setHost(h);
      setHostDraft(h);
    }
    if (DOC_RE.test(p)) {
      if (mode === "open") return openFile(h, p);
      setFileName(basename(p));
      p = parentOf(p);
    }
    void load(h, p);
  };

  // Files dropped onto the browser: copy them into the folder it's showing.
  const remoteDrop = useStore((st) => st.remoteDrop);
  const [upload, setUpload] = useState<string | null>(null);
  useEffect(() => {
    if (!remoteDrop) return;
    useStore.getState().setRemoteDrop(null);
    const dir = listing?.dir;
    if (!dir || !isValidHost(host)) {
      setError("Open a folder first, then drop files onto it.");
      return;
    }
    const paths = remoteDrop;
    const names = paths.map((p) => basename(p)).join(", ");
    const existing = new Set((listing?.entries ?? []).map((e) => e.name));
    const clashes = paths.map((p) => basename(p)).filter((n) => existing.has(n));
    void (async () => {
      // Confirm before replacing anything already in the folder.
      if (clashes.length && !(await confirmReplaceRemote(clashes, `${host}:${dir}`))) return;
      setUpload(`Copying ${names} to ${host}:${dir}…`);
      try {
        await uploadRemote(host, paths, dir);
        setUpload(`Copied ${names} to ${host}:${dir}`);
        void load(host, dir);
      } catch (err) {
        setUpload(null);
        setError(String(err));
      }
    })();
  }, [remoteDrop, listing, host, load]);
  const copyWithHost = useSettings((st) => st.settings.copyPathWithHost);

  const entries = (listing?.entries ?? []).filter((e) => showHidden || !e.name.startsWith("."));
  const dir = listing?.dir ?? null;

  return (
    <div className="settings-backdrop" onClick={close}>
      <div className="remote-prompt remote-browser" onClick={(event) => event.stopPropagation()}>
        <div className="rb-header">
          <span className="remote-prompt-label">
            {mode === "open" ? "Open remote file" : "Save to remote"}
          </span>
          <label className="rb-hidden-toggle">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => setShowHidden(event.target.checked)}
            />
            Hidden files
          </label>
        </div>

        <div className="rb-location">
          <input
            className="remote-prompt-input rb-host"
            placeholder="host"
            value={hostDraft}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => setHostDraft(event.target.value)}
            onBlur={() => hostDraft.trim() !== host && switchHost(hostDraft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                switchHost(hostDraft);
              }
            }}
          />
          <span className="rb-colon">:</span>
          <input
            className="remote-prompt-input rb-path"
            placeholder="~ for home, /abs/path, or paste host:/path"
            title={pathDraft}
            value={pathDraft}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            // Opening: focus and select the path so ⌘V replaces it and Enter opens.
            autoFocus={mode === "open"}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              pathEdited.current = true;
              setPathDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                pathEdited.current = false;
                submitPath();
              }
            }}
          />
          <CopyButton
            text={dir ? (copyWithHost ? `${host}:${dir}` : dir) : ""}
            tip="Copy this folder's path"
          />
        </div>

        {dir && (
          <nav className="rb-crumbs" aria-label="Current folder">
            <span className="rb-crumb-host">{host}</span>
            <span className="rb-crumb-sep">:</span>
            <button className="rb-crumb" onClick={() => void load(host, "/")}>
              /
            </button>
            {dir
              .split("/")
              .filter(Boolean)
              .map((part, i, parts) => (
                <span key={i} style={{ display: "contents" }}>
                  {i > 0 && <span className="rb-crumb-sep">/</span>}
                  <button
                    className={`rb-crumb${i === parts.length - 1 ? " current" : ""}`}
                    onClick={() => void load(host, "/" + parts.slice(0, i + 1).join("/"))}
                  >
                    {part}
                  </button>
                </span>
              ))}
          </nav>
        )}

        <div className="rb-list" aria-busy={loading}>
          {error ? (
            <div className="rb-status rb-error">{error}</div>
          ) : !listing ? (
            <div className="rb-status">Connecting…</div>
          ) : (
            <>
              {dir !== "/" && (
                <div className="rb-row rb-dir" onClick={() => void load(host, parentOf(dir!))}>
                  <FolderIcon />
                  <span className="rb-name">..</span>
                </div>
              )}
              {entries.map((entry) => {
                const doc = DOC_RE.test(entry.name);
                const selected = mode === "save" && !entry.isDir && entry.name === fileName;
                return (
                  <div
                    key={entry.name}
                    className={`rb-row${entry.isDir ? " rb-dir" : doc ? " rb-doc" : " rb-other"}${
                      selected ? " selected" : ""
                    }`}
                    title={entry.name}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      void showEntryMenu(joinPath(listing.dir, entry.name), entry.isDir);
                    }}
                    onClick={() => {
                      if (entry.isDir) void load(host, joinPath(listing.dir, entry.name));
                      else if (BINARY_RE.test(entry.name)) void download(joinPath(listing.dir, entry.name));
                      else if (mode === "open") openFile(host, joinPath(listing.dir, entry.name));
                      else setFileName(entry.name);
                    }}
                    onDoubleClick={() => {
                      if (!entry.isDir && mode === "save") void save(entry.name);
                    }}
                  >
                    {entry.isDir ? <FolderIcon /> : <FileIcon />}
                    <span className="rb-name">{entry.name}</span>
                  </div>
                );
              })}
              {entries.length === 0 && <div className="rb-status">Empty folder</div>}
            </>
          )}
          {loading && listing && <div className="rb-loading" />}
        </div>

        {mode === "save" && (
          <div className="rb-save">
            <span className="rb-save-label">Name</span>
            <input
              className="remote-prompt-input"
              value={fileName}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoFocus
              onChange={(event) => setFileName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void save();
                }
              }}
            />
          </div>
        )}

        <div className="remote-prompt-actions">
          <span className="rb-where" title={dir ? `${host}:${dir}` : ""}>
            {upload ?? (dir ? `${host}:${dir} · drop files here to copy them in` : "")}
          </span>
          <button className="remote-prompt-cancel" onClick={close}>
            Cancel
          </button>
          {mode === "save" && (
            <button
              className="remote-prompt-open"
              onClick={() => void save()}
              disabled={!listing || !fileName.trim()}
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
