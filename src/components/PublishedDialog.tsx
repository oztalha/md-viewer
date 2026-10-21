import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../store";
import { publishedPages } from "../publish";
import { pageMatches } from "../publishSearch";
import { basename } from "../types";
import { CopyButton } from "./CopyButton";

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
          {pages.length === 0 ? (
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
