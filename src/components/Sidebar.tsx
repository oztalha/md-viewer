import { useSyncExternalStore } from "react";
import { useStore } from "../store";
import { startSortDrag } from "../dragSort";
import { basename, displayTitle, isDirty } from "../types";
import {
  clearRecents,
  getPins,
  getRecents,
  removeRecent,
  reorderPin,
  subscribeRecents,
  togglePin,
} from "../recent";
import type { RecentEntry } from "../recent";
import { parseOpenSpec, remoteUrl } from "../remote";
import { CloseIcon, PinIcon, SwapIcon } from "./icons";
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
  const pins = useSyncExternalStore(subscribeRecents, getPins);

  // Hide recents that are already open (they're listed above).
  const openSpecs = new Set(
    tabs
      .map((id) => docs[id])
      .map((d) => (d?.remote ? remoteUrl(d.remote) : (d?.path ?? "")))
      .filter(Boolean),
  );
  const recentList = recents.filter((e) => !openSpecs.has(e.spec));
  // A pinned file that's open is shown in Open (with a pin badge), not twice.
  const pinList = pins.filter((e) => !openSpecs.has(e.spec));
  const pinnedSpecs = new Set(pins.map((e) => e.spec));
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

  // Drag a pinned file up/down to reorder it.
  const startPinDrag = (event: React.PointerEvent, spec: string) => {
    startSortDrag(event, {
      axis: "y",
      items: ".sidebar-pin-item",
      onDrop: (_from, to) => reorderPin(spec, to),
    });
  };

  // Drag an open file up/down to reorder it (same order as the tab strip).
  const startRowDrag = (event: React.PointerEvent, docId: string) => {
    if (event.button !== 0) return;
    selectTab(docId);
    startSortDrag(event, {
      axis: "y",
      items: ".sidebar-open-item",
      onDrop: (_from, to) => useStore.getState().reorderTab(docId, to),
    });
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
                  className={`sidebar-item sidebar-open-item${active ? " active" : ""}`}
                  onPointerDown={(e) => startRowDrag(e, docId)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    void showTileContextMenu(docId);
                  }}
                >
                  <span className="sidebar-grip" aria-hidden="true" />
                  {pinnedSpecs.has(doc.remote ? remoteUrl(doc.remote) : (doc.path ?? "")) && (
                    <span className="pin-badge" data-tip="Pinned">
                      <PinIcon size={10} />
                    </span>
                  )}
                  {doc.remote && (
                    <span
                      className="remote-badge"
                      data-tip={`SSH · ${doc.remote.host}`}
                    >
                      <SwapIcon size={11} />
                    </span>
                  )}
                  <span
                    className="sidebar-name"
                    title={doc.remote ? `${doc.remote.host}:${doc.remote.path}` : (doc.path ?? displayTitle(doc))}
                  >
                    {displayTitle(doc)}
                  </span>
                  {isDirty(doc) && (
                    <span className="dirty-dot" aria-label="Unsaved changes" />
                  )}
                  {(doc.remote || doc.path) && (
                    <span className="sidebar-hint">{doc.remote ? doc.remote.host : "local"}</span>
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
          {pinList.length > 0 && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-header">Pinned</div>
              <nav className="sidebar-list sidebar-pins">
                {pinList.map((entry) => {
                  const r = describeRecent(entry);
                  return (
                    <div
                      key={entry.spec}
                      className="sidebar-item sidebar-recent-item sidebar-pin-item"
                      onPointerDown={(e) => startPinDrag(e, entry.spec)}
                      onClick={() => void useStore.getState().openPaths([entry.spec])}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        void showRecentContextMenu(entry.spec);
                      }}
                    >
                      <span className="sidebar-grip" aria-hidden="true" />
                      <span className="pin-badge" data-tip="Pinned">
                        <PinIcon size={10} />
                      </span>
                      {r.remote && (
                        <span className="remote-badge">
                          <SwapIcon size={11} />
                        </span>
                      )}
                      <span className="sidebar-name" title={r.title}>
                        {r.name}
                      </span>
                      {r.hint && <span className="sidebar-hint">{r.hint}</span>}
                      <button
                        className="sidebar-close"
                        data-tip="Unpin"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(entry.spec, entry.label);
                        }}
                      >
                        <PinIcon size={11} />
                      </button>
                    </div>
                  );
                })}
              </nav>
            </>
          )}
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
                      className="sidebar-item sidebar-recent-item"
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
                      <span className="sidebar-name" title={r.title}>
                        {r.name}
                      </span>
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
