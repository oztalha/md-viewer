import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../store";
import {
  ghAccounts,
  pagesPasswordGet,
  pagesStatus,
  publishTargets,
} from "../ipc";
import { generatePassword, MIN_PASSWORD } from "../pageCrypt";
import type { PublishTarget } from "../ipc";
import {
  isGithubDoc,
  linkedDocs,
  publishDoc,
  publishErrorKey,
  publishedFor,
  setSync,
  verifyPublished,
} from "../publish";
import { keyForDoc } from "../annotations";
import { displayTitle } from "../types";
import { CopyButton } from "./CopyButton";
import { Select } from "./Select";

const LAST_TARGET_KEY = "publishLastTarget";
const LINKED_KEY = "publishLinked";
const ACCOUNT_KEY = "publishGistAccount";

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
  | { kind: "busy"; label: string; detail?: string }
  | {
      kind: "done";
      url: string;
      updated: boolean;
      label: string;
      linked: number;
      skipped: string[];
    }
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
  const [selected, setSelected] = useState<string>(
    localStorage.getItem(LAST_TARGET_KEY) ?? "",
  );
  const [asNew, setAsNew] = useState(false);
  // On unless turned off once: otherwise links to local files break once published.
  const [withLinked, setWithLinked] = useState(
    localStorage.getItem(LINKED_KEY) !== "0",
  );
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // gh accounts for gists: the last one picked if still logged in, else gh's active one.
  const [accounts, setAccounts] = useState<{
    logins: string[];
    active: string | null;
  } | null>(null);
  const [account, setAccount] = useState("");
  useEffect(() => {
    ghAccounts()
      .then((list) => {
        setAccounts(list);
        const last = localStorage.getItem(ACCOUNT_KEY) ?? "";
        setAccount(
          list.logins.includes(last)
            ? last
            : (list.active ?? list.logins[0] ?? ""),
        );
      })
      .catch(() => setAccounts({ logins: [], active: null })); // no gh: publishing shows the real error
  }, []);
  const tick = useStore((s) => s.publishTick);
  const records = publishedFor(doc, tick);
  const linked = linkedDocs(doc);

  // Switching documents while the dialog is open starts fresh; a previous
  // document's result would otherwise show as if it were this one's.
  const docId = doc?.id;
  useEffect(() => {
    setStatus((cur) => (cur.kind === "busy" ? cur : { kind: "idle" }));
    setAsNew(false);
    void verifyPublished(useStore.getState().docs[docId ?? ""], true);
  }, [docId]);

  const load = () =>
    publishTargets()
      .then((list) => {
        setTargets(list);
        setLoadError(null);
        setSelected((cur) =>
          list.some((t) => t.id === cur) ? cur : (list[0]?.id ?? ""),
        );
      })
      .catch((err) => setLoadError(String(err)));

  // Latest publish(), for the window-level Enter handler below.
  const publishRef = useRef<() => void>(() => {});
  const openSavedRef = useRef<() => void>(() => {});
  const inFlight = useRef(false);
  const publishButton = useRef<HTMLButtonElement | null>(null);

  // Targets (re)load on open and after the targets editor closes.
  const editingTargets = useStore((s) => s.targetsEditorOpen);
  useEffect(() => {
    if (!editingTargets) void load();
  }, [editingTargets]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The targets editor is on top and handles its own keys.
      if (useStore.getState().targetsEditorOpen) return;
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
  const docKey = keyForDoc(doc);
  const syncError = useStore((s) =>
    target && docKey
      ? s.publishErrors[publishErrorKey(docKey, target.id)]
      : undefined,
  );
  const busy = status.kind === "busy";

  // Password-protected pages: a strong generated password for a new page, the
  // saved one (Keychain) for an existing page, so republishing changes nothing.
  const protectedPage = target?.kind === "pages";
  const [password, setPassword] = useState("");
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pagesRepo, setPagesRepo] = useState<{
    repo: string;
    exists: boolean;
  } | null>(null);
  const pageId = protectedPage && existing && !asNew ? existing.id : null;
  useEffect(() => {
    if (!protectedPage) return;
    setSavedPassword(null);
    if (!pageId) {
      setPassword(generatePassword());
      return;
    }
    let live = true;
    pagesPasswordGet(pageId)
      .then((saved) => {
        if (!live) return;
        setSavedPassword(saved);
        setPassword(saved ?? "");
      })
      .catch(() => live && setPassword(""));
    return () => {
      live = false;
    };
  }, [protectedPage, pageId, docId]);
  // Whether the first publish will create the repo (said in the dialog).
  const updatingPage = !!existing && !asNew;
  const pagesAccount = updatingPage
    ? (existing?.account ?? null)
    : account || null;
  useEffect(() => {
    if (!protectedPage || updatingPage) return setPagesRepo(null);
    let live = true;
    pagesStatus(pagesAccount)
      .then((st) => live && setPagesRepo(st))
      .catch(() => live && setPagesRepo(null));
    return () => {
      live = false;
    };
  }, [protectedPage, pagesAccount, updatingPage]);
  const passwordTooShort = protectedPage && password.length < MIN_PASSWORD;

  const publish = async () => {
    if (!doc || !target || busy || inFlight.current || passwordTooShort) return;
    inFlight.current = true;
    localStorage.setItem(LAST_TARGET_KEY, target.id);
    setStatus({ kind: "busy", label: target.label });
    try {
      const out = await publishDoc(doc, target, {
        asNew,
        linked: withLinked && linked.length > 0,
        account:
          target.kind === "gist" || target.kind === "pages"
            ? account || undefined
            : undefined,
        password: target.kind === "pages" ? password : undefined,
        onProgress: (detail) =>
          setStatus({ kind: "busy", label: target.label, detail }),
      });
      setStatus({ kind: "done", ...out, label: target.label });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inFlight.current = false;
    }
  };
  // Open a published page in the browser and close the dialog.
  const openAndClose = (url: string) => {
    void openUrl(url);
    close();
  };

  const primary = () =>
    status.kind === "done" ? openAndClose(status.url) : void publish();
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
                <label
                  key={t.id}
                  className={`publish-target${t.id === selected ? " selected" : ""}`}
                >
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
                    <a
                      className="publish-target-link"
                      href={rec.url}
                      onClick={link(rec.url)}
                      title={rec.url}
                    >
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

        {(target?.kind === "gist" || protectedPage) &&
          accounts &&
          accounts.logins.length > 0 && (
            <label className="publish-asnew publish-account">
              Account
              {existing && !asNew ? (
                // Only the account that created a gist can update it.
                <Select
                  value={existing.account ?? ""}
                  options={[
                    {
                      value: existing.account ?? "",
                      label:
                        existing.account ??
                        "gh's active account (when it was published)",
                    },
                  ]}
                  disabled
                  title="A gist can only be updated by the account that created it"
                />
              ) : (
                <Select
                  value={account}
                  disabled={busy}
                  options={accounts.logins.map((login) => ({
                    value: login,
                    label:
                      login === accounts.active ? `${login} (active)` : login,
                  }))}
                  onChange={(value) => {
                    setAccount(value);
                    localStorage.setItem(ACCOUNT_KEY, value);
                  }}
                />
              )}
            </label>
          )}

        {protectedPage && (
          <div className="publish-password">
            <span className="publish-password-label">Password</span>
            <input
              className="remote-prompt-input"
              type={showPassword ? "text" : "password"}
              value={password}
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              className="rb-github-btn"
              onClick={() => setShowPassword((v) => !v)}
              disabled={busy}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
            <button
              className="rb-github-btn"
              onClick={() => {
                setPassword(generatePassword());
                setShowPassword(true);
              }}
              disabled={busy}
              title="Make a new strong password"
            >
              New
            </button>
            <CopyButton text={password} tip="Copy password" />
          </div>
        )}
        {protectedPage && passwordTooShort && password && (
          <p className="publish-status rb-error">
            Use at least {MIN_PASSWORD} characters: the page is public, only the
            password protects it.
          </p>
        )}
        {protectedPage && pageId && savedPassword === null && !password && (
          <p className="publish-status">
            This page's password isn't saved on this Mac. Enter it, or set a new
            one.
          </p>
        )}
        {protectedPage &&
          pageId &&
          savedPassword &&
          password !== savedPassword && (
            <p className="publish-status">
              Updating will change the password: send readers the new one.
            </p>
          )}
        {protectedPage && pagesRepo && !pagesRepo.exists && (
          <p className="publish-status">
            First time: this creates the public repo <b>{pagesRepo.repo}</b> for
            your encrypted pages. Pages get random names, and nobody can read
            one without its password.
          </p>
        )}

        {existing && (
          <div className="publish-current">
            <a
              href={existing.url}
              onClick={link(existing.url)}
              title={existing.url}
            >
              {existing.url.replace(/^https?:\/\//, "")}
            </a>
            <CopyButton text={existing.url} tip="Copy link" />
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

        {existing && target && doc && isGithubDoc(doc) && (
          <label className="publish-asnew">
            <input
              type="checkbox"
              checked={!!existing.sync}
              disabled={busy}
              onChange={(event) =>
                setSync(doc, target.id, event.target.checked)
              }
            />
            Keep in sync with GitHub (checked every few minutes while md-viewer
            is open)
          </label>
        )}
        {existing?.sync && syncError && (
          <p className="publish-status rb-error">
            Couldn't sync with GitHub: {syncError}
          </p>
        )}

        {linked.length > 0 && (
          <label
            className="publish-asnew"
            title={linked.map((l) => l.doc.title).join("\n")}
          >
            <input
              type="checkbox"
              checked={withLinked}
              disabled={busy}
              onChange={(event) => {
                setWithLinked(event.target.checked);
                localStorage.setItem(
                  LINKED_KEY,
                  event.target.checked ? "1" : "0",
                );
              }}
            />
            Also publish {linked.length} linked document
            {linked.length === 1 ? "" : "s"}, and link to them
          </label>
        )}

        {status.kind === "busy" && (
          <p className="publish-status">
            Publishing to {status.label}…
            {status.detail ? ` ${status.detail}` : ""}
          </p>
        )}
        {status.kind === "error" && (
          <p className="publish-status rb-error">{status.message}</p>
        )}
        {status.kind === "done" && (
          <p className="publish-status publish-done">
            {status.updated ? "Updated on" : "Published to"} {status.label}
            {status.linked > 0
              ? `, with ${status.linked} linked document${status.linked === 1 ? "" : "s"}`
              : ""}
            . Link copied:{" "}
            <a href={status.url} onClick={link(status.url)}>
              {status.url}
            </a>
          </p>
        )}
        {status.kind === "done" && protectedPage && (
          <p className="publish-status">
            Live in about a minute. Send the password separately from the link
            (copy it above).
          </p>
        )}
        {status.kind === "done" && status.skipped.length > 0 && (
          <p className="publish-status rb-error">
            Couldn't publish (links to these stay as they were):{"\n"}
            {status.skipped.join("\n")}
          </p>
        )}

        <div className="remote-prompt-actions">
          <button
            className="publish-edit"
            onClick={() => useStore.getState().setTargetsEditorOpen(true)}
            disabled={busy}
          >
            Edit targets…
          </button>
          <button
            className="remote-prompt-cancel"
            onClick={close}
            disabled={busy}
          >
            {status.kind === "done" ? "Close" : "Cancel"}
          </button>
          {existing && status.kind !== "done" && (
            <button
              className="publish-open"
              onClick={() => openAndClose(existing.url)}
              disabled={busy}
              data-tip="Open the published page without updating · ⌘↩"
            >
              Open ↗
            </button>
          )}
          <button
            ref={publishButton}
            className="remote-prompt-open"
            onClick={primary}
            disabled={
              !target || busy || (status.kind !== "done" && passwordTooShort)
            }
            data-tip={
              status.kind === "done"
                ? "Open in browser · ↩"
                : existing
                  ? "⌘↩ opens the published page"
                  : undefined
            }
          >
            {busy
              ? "Publishing…"
              : status.kind === "done"
                ? "Open ↗"
                : existing && !asNew
                  ? "Update"
                  : protectedPage && pagesRepo && !pagesRepo.exists
                    ? "Create & publish"
                    : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
