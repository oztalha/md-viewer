/**
 * The running publish, kept in the store rather than the Publish dialog, so
 * the dialog can close while it runs (and while GitHub Pages builds) and the
 * corner indicator (PublishProgress) takes over.
 */
import { pagesLive } from "./ipc";
import type { PublishTarget } from "./ipc";
import { publishDoc } from "./publish";
import type { PublishOutcome } from "./publish";
import { useStore } from "./store";
import type { Doc } from "./types";
import { displayTitle } from "./types";

export type PublishJobStatus =
  | { kind: "busy"; detail?: string }
  | ({
      kind: "done";
      /** GitHub Pages: published with a password. */
      locked?: boolean;
    } & PublishOutcome)
  | { kind: "error"; message: string };

export interface PublishJob {
  id: number;
  docId: string;
  targetId: string;
  /** The document's title, for the indicator. */
  title: string;
  /** The target's label. */
  label: string;
  status: PublishJobStatus;
  /** GitHub Pages: whether the host serves this version yet (pagesLive). */
  live: "waiting" | "live" | "slow" | null;
}

let lastId = 0;

/** A publish is running (one at a time). */
export function publishing(): boolean {
  return useStore.getState().publishJob?.status.kind === "busy";
}

export async function startPublish(
  doc: Doc,
  target: PublishTarget,
  options: Omit<NonNullable<Parameters<typeof publishDoc>[2]>, "onProgress"> & {
    locked?: boolean;
  },
): Promise<void> {
  if (publishing()) return;
  const id = ++lastId;
  const { locked, ...publishOptions } = options;
  const s = useStore.getState();
  s.setPublishJob({
    id,
    docId: doc.id,
    targetId: target.id,
    title: displayTitle(doc),
    label: target.label,
    status: { kind: "busy" },
    live: null,
  });
  // A newer job (or a dismissed one) ignores this one's updates.
  const current = () => useStore.getState().publishJob?.id === id;
  const update = (patch: Partial<PublishJob>) => {
    const job = useStore.getState().publishJob;
    if (job?.id === id) useStore.getState().setPublishJob({ ...job, ...patch });
  };

  let out: PublishOutcome;
  try {
    out = await publishDoc(doc, target, {
      ...publishOptions,
      onProgress: (detail) => update({ status: { kind: "busy", detail } }),
    });
  } catch (err) {
    update({ status: { kind: "error", message: err instanceof Error ? err.message : String(err) } });
    return;
  }
  update({ status: { kind: "done", ...out, locked }, live: out.marker ? "waiting" : null });
  if (!out.marker) return;

  // GitHub Pages serves the new version after a build: wait for it so Open
  // never shows a broken or stale page.
  const started = Date.now();
  while (current()) {
    const ok = await pagesLive(out.url, out.marker).catch(() => false);
    if (ok) return update({ live: "live" });
    if (Date.now() - started > 180_000) return update({ live: "slow" });
    await new Promise((r) => setTimeout(r, 4000));
  }
}
