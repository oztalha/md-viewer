import { useSyncExternalStore } from "react";
import { useStore } from "../store";
import { basename, displayTitle, isDirty } from "../types";
import {
  clearRecents,
  getRecents,
  removeRecent,
  subscribeRecents,
} from "../recent";
import type { RecentEntry } from "../recent";
import { parseOpenSpec, remoteUrl } from "../remote";
import { CloseIcon, SwapIcon } from "./icons";
import { showRecentContextMenu, showTileContextMenu } from "../contextMenu";
import { OutlineList } from "./Outline";
import { useModHeld } from "../keybindings/useModHeld";
import { formatKeybind, keybindFor, useSettings } from "../settings";

/** Name + a dim hint of where it lives: the host, or "local". */
function describeRecent(entry: RecentEntry): {
  name: string;
  hint: string;
  remote: boolean;
  title: string;
} {
  const spec = parseOpenSpec(entry.spec, "");
  if (spec.kind === "remote") {
    const { host, path } = spec.ref;
    return {
      name: basename(path),
      hint: host,
      remote: true,
      title: `${host}:${path}`,
    };
  }
  return {
    name: basename(spec.path),
    hint: "local",
    remote: false,
    title: spec.path,
  };
}

/**
 * Collapsible left rail. **Open**: every open document (mirrors the tab strip;
 * click to switch, ✕ to close). **Recent**: recently opened files that aren't
 * open now (click to reopen, local or remote; ✕ drops one from the list).
 */
export function Sidebar() {
  const tabs = useStore((s) => s.tabs);
  const docs = useStore((s) => s.docs);
  const activeId = useStore((s) => s.activeId);
  const recents = useSyncExternalStore(subscribeRecents, getRecents);

  // Hide recents that are already open (they're listed above).
  const openSpecs = new Set(
    tabs
      .map((id) => docs[id])
      .map((d) => (d?.remote ? remoteUrl(d.remote) : (d?.path ?? "")))
      .filter(Boolean),
  );
  const recentList = recents.filter((e) => !openSpecs.has(e.spec));
  const selectTab = useStore((s) => s.selectTab);
  const closeTab = useStore((s) => s.closeTab);
  const width = useStore((s) => s.sidebarWidth);
  const tab = useStore((s) => s.sidebarTab);
  const setTab = useStore((s) => s.setSidebarTab);
  const modHeld = useModHeld();
  const settings = useSettings((s) => s.settings);
  const filesKey = formatKeybind(keybindFor(settings, "show-files"));
  const outlineKey = formatKeybind(keybindFor(settings, "toggle-outline"));

  // Drag the right edge to resize; width is clamped + persisted in the store.
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    document.body.classList.add("resizing-x");
    const move = (ev: PointerEvent) => {
      useStore.getState().setSidebarWidth(startWidth + (ev.clientX - startX));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing-x");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "files"}
          className={tab === "files" ? "active" : ""}
          data-tip={`Files · ${filesKey}`}
          onClick={() => setTab("files")}
        >
          Files
          {modHeld && <span className="sidebar-tab-keycap">{filesKey}</span>}
        </button>
        <button
          role="tab"
          aria-selected={tab === "outline"}
          className={tab === "outline" ? "active" : ""}
          data-tip={`Outline · ${outlineKey}`}
          onClick={() => setTab("outline")}
        >
          Outline
          {modHeld && <span className="sidebar-tab-keycap">{outlineKey}</span>}
        </button>
      </div>
      {tab === "outline" ? (
        <OutlineList />
      ) : (
        <>
          <div className="sidebar-header">Open</div>
          <nav className="sidebar-list">
            {tabs.map((docId) => {
              const doc = docs[docId];
              if (!doc) return null;
              const active = docId === activeId;
              return (
                <div
                  key={docId}
                  className={`sidebar-item${active ? " active" : ""}`}
                  onPointerDown={() => selectTab(docId)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    void showTileContextMenu(docId);
                  }}
                  title={displayTitle(doc)}
                >
                  {doc.remote && (
                    <span
                      className="remote-badge"
                      data-tip={`SSH · ${doc.remote.host}`}
                    >
                      <SwapIcon size={11} />
                    </span>
                  )}
                  <span className="sidebar-name">{displayTitle(doc)}</span>
                  {isDirty(doc) && (
                    <span className="dirty-dot" aria-label="Unsaved changes" />
                  )}
                  <button
                    className="sidebar-close"
                    data-tip="Close tab · ⌘W"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      void closeTab(docId);
                    }}
                  >
                    <CloseIcon size={11} />
                  </button>
                </div>
              );
            })}
          </nav>
          {recentList.length > 0 && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-header sidebar-header-row">
                <span>Recent</span>
                <button
                  className="sidebar-clear"
                  onClick={clearRecents}
                  data-tip="Clear recent files"
                >
                  Clear
                </button>
              </div>
              <nav className="sidebar-list sidebar-recent">
                {recentList.map((entry) => {
                  const r = describeRecent(entry);
                  return (
                    <div
                      key={entry.spec}
                      className="sidebar-item"
                      title={r.title}
                      onClick={() =>
                        void useStore.getState().openPaths([entry.spec])
                      }
                      onContextMenu={(e) => {
                        e.preventDefault();
                        void showRecentContextMenu(entry.spec);
                      }}
                    >
                      {r.remote && (
                        <span className="remote-badge">
                          <SwapIcon size={11} />
                        </span>
                      )}
                      <span className="sidebar-name">{r.name}</span>
                      {r.hint && <span className="sidebar-hint">{r.hint}</span>}
                      <button
                        className="sidebar-close"
                        data-tip="Remove from recents"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecent(entry.spec);
                        }}
                      >
                        <CloseIcon size={11} />
                      </button>
                    </div>
                  );
                })}
              </nav>
            </>
          )}
        </>
      )}
      <div className="sidebar-resizer" onPointerDown={startResize} />
    </aside>
  );
}
