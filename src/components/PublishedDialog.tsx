import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../store";
import { publishedPages } from "../publish";
import { pageMatches, protectedPageId } from "../publishSearch";
import { copyToClipboard, pagesPasswordGet } from "../ipc";
import { basename } from "../types";
import { CopyButton } from "./CopyButton";

/** Copies a protected page's password from this Mac's Keychain. */
function CopyPassword({ id }: { id: string }) {
  const [note, setNote] = useState<string | null>(null);
  const copy = async () => {
    try {
      const saved = await pagesPasswordGet(id);
      if (saved) {
        await copyToClipboard(saved);
        setNote("Password copied");
      } else {
        setNote("Its password isn't saved on this Mac");
      }
    } catch (err) {
      setNote(String(err));
    }
    setTimeout(() => setNote(null), 2500);
  };
  return (
    <span className="pub-password">
      <button className="publish-edit" onClick={() => void copy()}>
        Copy password
      </button>
      {note && <span className="pub-note">{note}</span>}
    </span>
  );
}

function when(at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * File → Published Documents… (⌥⇧⌘P): everything published from this Mac,
 * newest first, searchable by title, file or link. Pasting a page's link
 * finds the file it was published from.
 */
export function PublishedDialog() {
  const open = useStore((s) => s.publishedOpen);
  return open ? <Published /> : null;
}

function Published() {
  const close = () => useStore.getState().setPublishedOpen(false);
  const tick = useStore((s) => s.publishTick);
  const [query, setQuery] = useState("");
  const pages = publishedPages(tick);
  const shown = pages.filter((p) => pageMatches({ ...p, title: p.title || basename(p.path) }, query));
  // A pasted protected-page link that isn't in the history (an unsaved doc, or
  // published from another Mac): still offer its password if it's saved here.
  const pastedPage = protectedPageId(query);
  const unlisted = pastedPage && !shown.some((p) => protectedPageId(p.url) === pastedPage) ? pastedPage : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      useStore.getState().setPublishedOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const openSource = (host: string | undefined, path: string) => {
    close();
    const s = useStore.getState();
    void (host ? s.openRemote(host, path) : s.openPaths([path]));
  };

  const link = (href: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    void openUrl(href);
  };

  return (
    <div className="settings-backdrop" onClick={close}>
      <div className="remote-prompt published-dialog" onClick={(event) => event.stopPropagation()}>
        <span className="remote-prompt-label">Published documents</span>
        <input
          className="remote-prompt-input"
          placeholder="Search by title, file or link (paste a link to find its file)"
          value={query}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="pub-list">
          {unlisted && (
            <div className="pub-row">
              <div className="pub-title">Password-protected page</div>
              <div className="pub-meta">Not in this Mac's publish history.</div>
              <div className="pub-link">
                <a href={query.trim()} onClick={link(query.trim())} title={query.trim()}>
                  {query.trim().replace(/^https?:\/\//, "")}
                </a>
                <CopyPassword id={unlisted} />
              </div>
            </div>
          )}
          {unlisted ? null : pages.length === 0 ? (
            <p className="rb-status">Nothing published yet. Publish a document with ⇧⌘P.</p>
          ) : shown.length === 0 ? (
            <p className="rb-status">No published document matches “{query.trim()}”.</p>
          ) : (
            shown.map((p) => (
              <div key={p.url} className="pub-row">
                <div className="pub-title">{p.title || basename(p.path).replace(/\.\w+$/, "")}</div>
                <button
                  className="pub-source"
                  title="Open this file"
                  onClick={() => openSource(p.host, p.path)}
                >
                  {p.host ? `${p.host}:${p.path}` : p.path}
                </button>
                <div className="pub-meta">
                  <span>{p.targetLabel}</span>
                  <span aria-hidden="true"> · </span>
                  <span>
                    {p.updates > 0
                      ? `published ${when(p.first)}, updated ${p.updates}× (last ${when(p.at)})`
                      : `published ${when(p.first)}`}
                  </span>
                </div>
                <div className="pub-link">
                  <a href={p.url} onClick={link(p.url)} title={p.url}>
                    {p.url.replace(/^https?:\/\//, "")}
                  </a>
                  <CopyButton text={p.url} tip="Copy link" />
                  {protectedPageId(p.url) && <CopyPassword id={protectedPageId(p.url)!} />}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="remote-prompt-actions">
          <span className="rb-where">
            {pages.length > 0 && `${shown.length} of ${pages.length}`}
          </span>
          <button className="remote-prompt-cancel" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
