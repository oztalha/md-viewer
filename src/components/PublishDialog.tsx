import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../store";
import { copyToClipboard, editPublishConfig, publishTargets } from "../ipc";
import type { PublishTarget } from "../ipc";
import { publishDoc, publishedFor } from "../publish";
import { displayTitle } from "../types";

const LAST_TARGET_KEY = "publishLastTarget";

function timeAgo(at: number): string {
  const min = Math.round((Date.now() - at) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString();
}

type Status =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "done"; url: string; updated: boolean; label: string }
  | { kind: "error"; message: string };

/** File → Publish… (⇧⌘P): pick a target; the link is copied when done. */
export function PublishDialog() {
  const open = useStore((s) => s.publishOpen);
  return open ? <Publish /> : null;
}

function Publish() {
  const close = () => useStore.getState().setPublishOpen(false);
  const doc = useStore((s) => s.docs[s.activeId]);
  const [targets, setTargets] = useState<PublishTarget[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(localStorage.getItem(LAST_TARGET_KEY) ?? "");
  const [asNew, setAsNew] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const records = publishedFor(doc);

  // Switching documents while the dialog is open starts fresh; a previous
  // document's result would otherwise show as if it were this one's.
  const docId = doc?.id;
  useEffect(() => {
    setStatus((cur) => (cur.kind === "busy" ? cur : { kind: "idle" }));
    setAsNew(false);
  }, [docId]);

  const load = () =>
    publishTargets()
      .then((list) => {
        setTargets(list);
        setLoadError(null);
        setSelected((cur) => (list.some((t) => t.id === cur) ? cur : (list[0]?.id ?? "")));
      })
      .catch((err) => setLoadError(String(err)));

  // Latest publish(), for the window-level Enter handler below.
  const publishRef = useRef<() => void>(() => {});
  const openSavedRef = useRef<() => void>(() => {});
  const inFlight = useRef(false);
  const publishButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void load();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        useStore.getState().setPublishOpen(false);
        return;
      }
      if (event.key !== "Enter") return;
      // ⌘↩ opens the selected target's saved link, without publishing.
      if (event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        openSavedRef.current();
        return;
      }
      // Enter runs the primary button (Publish/Update, then Open) from anywhere
      // in the dialog, and never reaches the editor underneath. On a focused
      // button or link, let that element handle it natively.
      const el = event.target as HTMLElement | null;
      if (el?.closest("button, a")) return;
      event.preventDefault();
      event.stopPropagation();
      publishRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const target = targets?.find((t) => t.id === selected);
  const existing = target ? records[target.id] : undefined;
  const busy = status.kind === "busy";

  const publish = async () => {
    if (!doc || !target || busy || inFlight.current) return;
    inFlight.current = true;
    localStorage.setItem(LAST_TARGET_KEY, target.id);
    setStatus({ kind: "busy", label: target.label });
    try {
      const out = await publishDoc(doc, target, { asNew });
      setStatus({ kind: "done", url: out.url, updated: out.updated, label: target.label });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      inFlight.current = false;
    }
  };
  // Open a published page in the browser and close the dialog.
  const openAndClose = (url: string) => {
    void openUrl(url);
    close();
  };

  const primary = () => (status.kind === "done" ? openAndClose(status.url) : void publish());
  publishRef.current = primary;
  openSavedRef.current = () => {
    if (existing && !busy) openAndClose(existing.url);
  };

  // Keep the primary button focused so Enter presses it: once targets are in,
  // and again after publishing (it was disabled meanwhile, which drops focus).
  const ready = !!targets && !!target;
  useEffect(() => {
    if (ready) publishButton.current?.focus();
  }, [ready, status.kind]);

  const link = (href: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    void openUrl(href);
  };

  return (
    <div className="settings-backdrop" onClick={() => !busy && close()}>
      <div
        className="remote-prompt publish-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="remote-prompt-label">
          Publish {doc ? `“${displayTitle(doc)}”` : ""}
        </span>

        {loadError ? (
          <p className="rb-status rb-error">{loadError}</p>
        ) : !targets ? (
          <p className="rb-status">Loading targets…</p>
        ) : (
          <div className="publish-targets" role="radiogroup">
            {targets.map((t) => {
              const rec = records[t.id];
              return (
                <label key={t.id} className={`publish-target${t.id === selected ? " selected" : ""}`}>
                  <input
                    type="radio"
                    name="publish-target"
                    checked={t.id === selected}
                    disabled={busy}
                    onChange={() => {
                      // A new target starts fresh (so you can publish the same doc elsewhere).
                      setSelected(t.id);
                      setAsNew(false);
                      if (status.kind !== "busy") setStatus({ kind: "idle" });
                    }}
                  />
                  <span className="publish-target-label">{t.label}</span>
                  {rec ? (
                    <a className="publish-target-link" href={rec.url} onClick={link(rec.url)} title={rec.url}>
                      published ↗
                    </a>
                  ) : (
                    <span className="publish-target-new">new</span>
                  )}
                </label>
              );
            })}
          </div>
        )}

        {existing && (
          <div className="publish-current">
            <a href={existing.url} onClick={link(existing.url)} title={existing.url}>
              {existing.url.replace(/^https?:\/\//, "")}
            </a>
            <button
              className="publish-copy"
              onClick={() => {
                void copyToClipboard(existing.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <span className="publish-when">{timeAgo(existing.at)}</span>
          </div>
        )}

        {existing && (
          <label className="publish-asnew">
            <input
              type="checkbox"
              checked={asNew}
              disabled={busy}
              onChange={(event) => setAsNew(event.target.checked)}
            />
            Publish as a new copy instead of updating
          </label>
        )}

        {status.kind === "busy" && <p className="publish-status">Publishing to {status.label}…</p>}
        {status.kind === "error" && <p className="publish-status rb-error">{status.message}</p>}
        {status.kind === "done" && (
          <p className="publish-status publish-done">
            {status.updated ? "Updated on" : "Published to"} {status.label}. Link copied:{" "}
            <a href={status.url} onClick={link(status.url)}>
              {status.url}
            </a>
          </p>
        )}

        <div className="remote-prompt-actions">
          <button
            className="publish-edit"
            onClick={() => void editPublishConfig().then(() => setTimeout(load, 500))}
            disabled={busy}
          >
            Edit targets…
          </button>
          <button className="remote-prompt-cancel" onClick={close} disabled={busy}>
            {status.kind === "done" ? "Close" : "Cancel"}
          </button>
          <button
            ref={publishButton}
            className="remote-prompt-open"
            onClick={primary}
            disabled={!target || busy}
            data-tip={status.kind === "done" ? "Open in browser · ↩" : existing ? "⌘↩ opens the published page" : undefined}
          >
            {busy
              ? "Publishing…"
              : status.kind === "done"
                ? "Open ↗"
                : existing && !asNew
                  ? "Update"
                  : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
