import { useStore } from "../store";
import { startSortDrag } from "../dragSort";
import { showTileContextMenu } from "../contextMenu";
import { displayTitle, isDirty } from "../types";
import { useModHeld } from "../keybindings/useModHeld";
import { CloseIcon, SwapIcon } from "./icons";

/**
 * Browser-style tab strip: every open document, in tab order. Clicking a tab
 * activates it; the ✕ closes it; dragging a tab left/right reorders it. While
 * ⌘/Ctrl is held, the first nine tabs show a ⌘N keycap (jump-to-tab hint).
 */
export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const docs = useStore((s) => s.docs);
  const activeId = useStore((s) => s.activeId);
  const selectTab = useStore((s) => s.selectTab);
  const closeTab = useStore((s) => s.closeTab);
  const newDoc = useStore((s) => s.newDoc);
  const modHeld = useModHeld();

  // Drag a tab left/right to reorder it; selecting happens on pointerdown.
  const startTabDrag = (event: React.PointerEvent, docId: string) => {
    if (event.button !== 0) return;
    selectTab(docId);
    startSortDrag(event, {
      axis: "x",
      items: ".tab",
      onDrop: (_from, to) => useStore.getState().reorderTab(docId, to),
    });
  };

  return (
    <div className="tabbar">
      <div className="tab-list">
        {tabs.map((docId, i) => {
          const doc = docs[docId];
          if (!doc) return null;
          const active = docId === activeId;
          return (
            <div
              key={docId}
              className={`tab${active ? " active" : ""}`}
              onPointerDown={(e) => startTabDrag(e, docId)}
              onContextMenu={(e) => {
                e.preventDefault();
                void showTileContextMenu(docId);
              }}
              title={displayTitle(doc)}
            >
              {modHeld && i < 9 && <span className="tab-keycap">⌘{i + 1}</span>}
              {doc.remote && (
                <span className="remote-badge" data-tip={`SSH · ${doc.remote.host}`}>
                  <SwapIcon size={11} />
                </span>
              )}
              <span className="tab-name">{displayTitle(doc)}</span>
              {isDirty(doc) && <span className="dirty-dot" aria-label="Unsaved changes" />}
              <button
                className="tab-close"
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
      </div>
      <button className="tab-new" data-tip="New file · ⌘N" onClick={newDoc}>
        ＋
      </button>
    </div>
  );
}
