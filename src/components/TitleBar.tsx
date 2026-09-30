import { useCallback, useState } from "react";
import { useStore } from "../store";
import { formatKeybind, keybindFor, useSettings } from "../settings";
import { useModHeld } from "../keybindings/useModHeld";
import { openUrl } from "@tauri-apps/plugin-opener";
import { displayTitle, isDirty } from "../types";
import type { ViewMode } from "../types";
import { getEditorView } from "../editor/registry";
import { insertTable } from "../editor/commands";
import { showTileContextMenu } from "../contextMenu";
import { latestPublished, publishedFor } from "../publish";

const MODES: { mode: ViewMode; label: string }[] = [
  { mode: "editor", label: "Editor only" },
  { mode: "split", label: "Editor & preview" },
  { mode: "preview", label: "Preview only" },
];

function ModeIcon({ mode }: { mode: ViewMode }) {
  return (
    <svg width="18" height="13" viewBox="0 0 18 13" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="17"
        height="12"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {mode === "editor" && (
        <rect x="3" y="3" width="5.5" height="7" rx="1" fill="currentColor" />
      )}
      {mode === "split" && (
        <line x1="9" y1="1" x2="9" y2="12" stroke="currentColor" strokeWidth="1.2" />
      )}
      {mode === "preview" && (
        <rect x="9.5" y="3" width="5.5" height="7" rx="1" fill="currentColor" />
      )}
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="14"
        height="12"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <line x1="0.5" y1="4.5" x2="14.5" y2="4.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5.5" y1="4.5" x2="5.5" y2="12.5" stroke="currentColor" strokeWidth="1" />
      <line x1="10" y1="4.5" x2="10" y2="12.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function PublishIcon() {
  return (
    <svg width="15" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 10.5V2.5M5 5.5l3-3 3 3M3 9.5v3c0 .6.4 1 1 1h8c.6 0 1-.4 1-1v-3"
      />
    </svg>
  );
}

/** Shortcut badge shown under a title-bar button while ⌘ is held. */
function Keycap({ show, label }: { show: boolean; label: string }) {
  return show && label ? <span className="btn-keycap">{label}</span> : null;
}

function OpenLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3c0 .6-.4 1-1 1H3.5c-.6 0-1-.4-1-1V5c0-.6.4-1 1-1h3"
      />
    </svg>
  );
}

/**
 * Publish (opens the dialog; a dot shows it's published somewhere) and, once
 * published, Open published page (most recent link, straight to the browser).
 */
function PublishButtons({ docId, modHeld, keyFor }: { docId: string; modHeld: boolean; keyFor: (id: string) => string }) {
  const doc = useStore((s) => s.docs[docId]);
  const tick = useStore((s) => s.publishTick); // re-read saved links after a publish
  const published = Object.keys(publishedFor(doc, tick)).length > 0;
  const latest = latestPublished(doc, tick);
  return (
    <>
      {latest && (
        <button
          className="titlebar-btn"
          data-tip={`Open published page · ${keyFor("open-published")}`}
          onClick={() => void openUrl(latest.url)}
        >
          <OpenLinkIcon />
          <Keycap show={modHeld} label={keyFor("open-published")} />
        </button>
      )}
      <button
        className="titlebar-btn publish-btn"
        data-tip={`${published ? "Published" : "Publish"} · ${keyFor("publish")}`}
        onClick={() => useStore.getState().setPublishOpen(true)}
      >
        <PublishIcon />
        {published && <span className="publish-dot" />}
        <Keycap show={modHeld} label={keyFor("publish")} />
      </button>
    </>
  );
}

function SidebarIcon() {
  return (
    <svg width="15" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function OutlineIcon() {
  return (
    <svg width="15" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <g fill="currentColor">
        <circle cx="2.5" cy="3" r="1.1" />
        <rect x="5" y="2.4" width="9" height="1.3" rx="0.6" />
        <circle cx="2.5" cy="8" r="1.1" />
        <rect x="5" y="7.4" width="9" height="1.3" rx="0.6" />
        <circle cx="2.5" cy="13" r="1.1" />
        <rect x="5" y="12.4" width="9" height="1.3" rx="0.6" />
      </g>
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6.3-1.6.9.7c.2.1.2.3.2.5l-1 1.8c-.1.2-.3.2-.5.2l-1.1-.4a5 5 0 0 1-1.2.7l-.2 1.2c0 .2-.2.4-.4.4H9c-.2 0-.4-.2-.4-.4l-.2-1.2a5 5 0 0 1-1.2-.7l-1.1.4c-.2 0-.4 0-.5-.2l-1-1.8c-.1-.2 0-.4.2-.5l.9-.7a5 5 0 0 1 0-1.8l-.9-.7c-.2-.1-.3-.3-.2-.5l1-1.8c.1-.2.3-.2.5-.2l1.1.4a5 5 0 0 1 1.2-.7l.2-1.2c0-.2.2-.4.4-.4h2c.2 0 .4.2.4.4l.2 1.2c.5.2.9.4 1.2.7l1.1-.4c.2 0 .4 0 .5.2l1 1.8c.1.2 0 .4-.2.5l-.9.7a5 5 0 0 1 0 1.8Z"
      />
    </svg>
  );
}

const GRID_COLS = 8;
const GRID_ROWS = 6;

function TableButton({ docId, leafId, mode }: { docId: string; leafId: string; mode: ViewMode }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  const setMode = useStore((s) => s.setMode);

  // Close when clicking anywhere outside the picker (bound while open via a
  // ref callback with cleanup — no effects).
  const attachPicker = useCallback((picker: HTMLDivElement | null) => {
    if (!picker) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = picker.parentElement;
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const choose = (rows: number, cols: number) => {
    const view = getEditorView(docId);
    if (!view) return;
    if (mode === "preview") setMode(leafId, "split");
    insertTable(view, rows, cols);
    setOpen(false);
    setHover({ rows: 0, cols: 0 });
  };

  return (
    <div className="table-button">
      <button
        className={`titlebar-btn${open ? " active" : ""}`}
        data-tip="Insert table"
        onClick={() => setOpen((value) => !value)}
      >
        <TableIcon />
      </button>
      {open && (
        <div className="table-picker" ref={attachPicker}>
          <div
            className="table-picker-grid"
            onMouseLeave={() => setHover({ rows: 0, cols: 0 })}
          >
            {Array.from({ length: GRID_ROWS }, (_, row) =>
              Array.from({ length: GRID_COLS }, (_, col) => (
                <button
                  key={`${row}-${col}`}
                  className={`table-cell${row < hover.rows && col < hover.cols ? " on" : ""}`}
                  onMouseEnter={() => setHover({ rows: row + 1, cols: col + 1 })}
                  onClick={() => choose(row + 1, col + 1)}
                  aria-label={`Insert ${col + 1} by ${row + 1} table`}
                />
              )),
            )}
          </div>
          <div className="table-picker-label">
            {hover.cols > 0 ? `${hover.cols} × ${hover.rows}` : "Insert table"}
          </div>
        </div>
      )}
    </div>
  );
}

export function TitleBar() {
  const activeId = useStore((s) => s.activeId);
  const doc = useStore((s) => s.docs[s.activeId] ?? null);
  const mode = useStore((s) => s.views[s.activeId]?.mode ?? "split");
  const outline = useStore((s) => s.sidebarOpen && s.sidebarTab === "outline");
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setMode = useStore((s) => s.setMode);
  const settings = useSettings((s) => s.settings);
  const modHeld = useModHeld();
  const keyFor = (id: string) => formatKeybind(keybindFor(settings, id));

  const dirty = doc ? isDirty(doc) : false;

  return (
    <header
      className="titlebar"
      data-tauri-drag-region
      onContextMenu={(event) => {
        event.preventDefault();
        void showTileContextMenu(activeId);
      }}
    >
      <div className="titlebar-title">
        {doc?.remote && <span className="titlebar-host">{doc.remote.host}:</span>}
        <span className="titlebar-name">{doc ? displayTitle(doc) : ""}</span>
        {dirty && <span className="dirty-dot" />}
      </div>
      {doc && (
        <div className="titlebar-actions">
          <PublishButtons docId={doc.id} modHeld={modHeld} keyFor={keyFor} />
          <button
            className={`titlebar-btn${sidebarOpen ? " active" : ""}`}
            data-tip={`Toggle sidebar · ${keyFor("toggle-sidebar")}`}
            onClick={() => useStore.getState().toggleSidebar()}
          >
            <SidebarIcon />
            <Keycap show={modHeld} label={keyFor("toggle-sidebar")} />
          </button>
          <button
            className={`titlebar-btn${outline ? " active" : ""}`}
            data-tip={`Outline · ${keyFor("toggle-outline")}`}
            onClick={() => useStore.getState().toggleOutline()}
          >
            <OutlineIcon />
            <Keycap show={modHeld} label={keyFor("toggle-outline")} />
          </button>
          <button
            className="titlebar-btn"
            data-tip="Settings · ⌘,"
            onClick={() => useSettings.getState().setOpen(true)}
          >
            <GearIcon />
            <Keycap show={modHeld} label="⌘," />
          </button>
          <TableButton docId={doc.id} leafId={activeId} mode={mode} />
          <div className="mode-switch">
            {MODES.map(({ mode: m, label }) => (
              <button
                key={m}
                className={mode === m ? "active" : ""}
                data-tip={`${label} · ${keyFor(`mode-${m}`)}`}
                onClick={() => setMode(activeId, m)}
              >
                <ModeIcon mode={m} />
                <Keycap show={modHeld} label={keyFor(`mode-${m}`)} />
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
