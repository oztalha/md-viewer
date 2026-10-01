import { setRecentFiles } from "./ipc";

/** An entry in the File → Open Recent menu. */
export interface RecentEntry {
  /** Open spec: a local path or an mdviewer:// URL. */
  spec: string;
  label: string;
}

const STORAGE_KEY = "recentFiles";
const PINS_KEY = "pinnedFiles";
/** Sidebar keeps the last 100 (it scrolls); the native menu shows the newest 20. */
const MAX = 100;
const MENU_MAX = 20;

function load(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

function loadPins(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

let entries = load();
/** Pinned files: kept above Recent, in their own order, never evicted. */
let pins = loadPins();
const listeners = new Set<() => void>();

function persist(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  void setRecentFiles([...pins, ...entries].slice(0, MENU_MAX)).catch(() => {});
  listeners.forEach((fn) => fn());
}

/** Current recents, most recent first. */
export function getRecents(): RecentEntry[] {
  return entries;
}

/** Re-render on changes (the sidebar's Recent section). */
export function subscribeRecents(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function removeRecent(spec: string): void {
  entries = entries.filter((e) => e.spec !== spec);
  pins = pins.filter((e) => e.spec !== spec);
  persist();
}

/** Pinned files, in the user's order. */
export function getPins(): RecentEntry[] {
  return pins;
}

export function isPinned(spec: string): boolean {
  return pins.some((e) => e.spec === spec);
}

/** Pin a file (moves it out of Recent), or unpin it (back into Recent). */
export function togglePin(spec: string, label: string): void {
  if (isPinned(spec)) {
    pins = pins.filter((e) => e.spec !== spec);
    entries = [{ spec, label }, ...entries.filter((e) => e.spec !== spec)].slice(0, MAX);
  } else {
    pins = [...pins, { spec, label }];
    entries = entries.filter((e) => e.spec !== spec);
  }
  persist();
}

/** Move a pinned file to a new index (drag-to-reorder). */
export function reorderPin(spec: string, toIndex: number): void {
  const from = pins.findIndex((e) => e.spec === spec);
  if (from === -1) return;
  const clamped = Math.max(0, Math.min(pins.length - 1, toIndex));
  if (from === clamped) return;
  const next = pins.filter((e) => e.spec !== spec);
  next.splice(clamped, 0, pins[from]);
  pins = next;
  persist();
}

/** Record a freshly opened/saved document; most recent first, de-duplicated. */
export function addRecent(spec: string, label: string): void {
  // A pinned file stays in Pinned; only its label refreshes.
  if (isPinned(spec)) {
    pins = pins.map((e) => (e.spec === spec ? { spec, label } : e));
    persist();
    return;
  }
  entries = [{ spec, label }, ...entries.filter((e) => e.spec !== spec)].slice(0, MAX);
  persist();
}

/** Clear Recent; pinned files stay. */
export function clearRecents(): void {
  entries = [];
  persist();
}

/** Push the persisted list into the native menu (after the menu is built). */
export function initRecents(): void {
  const menu = [...pins, ...entries].slice(0, MENU_MAX);
  if (menu.length) void setRecentFiles(menu).catch(() => {});
}
