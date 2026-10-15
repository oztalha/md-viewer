import { invoke } from "@tauri-apps/api/core";
import type { RemoteRef } from "./types";

/**
 * Images in remote documents. The preview can only load local files and URLs,
 * so a relative (or remote-absolute) `<img>` in a document on another machine
 * is fetched over ssh and shown from a blob URL. Fetches are cached per
 * `host:path` for the session, so re-rendering a block never re-fetches.
 */

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
};

const cache = new Map<string, Promise<string>>();

/** Resolve `src` against the document's folder, collapsing `.` and `..`. */
function resolve(dir: string, src: string): string {
  const raw = decodeURI(src.split(/[?#]/)[0]);
  const joined = raw.startsWith("/") || raw.startsWith("~") ? raw : `${dir}/${raw}`;
  const out: string[] = [];
  for (const part of joined.split("/")) {
    if (part === "..") out.pop();
    else if (part !== "." && (part !== "" || out.length === 0)) out.push(part);
  }
  return out.join("/") || "/";
}

function fetchImage(host: string, path: string): Promise<string> {
  const key = `${host}:${path}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = invoke<string>("read_remote_bytes", { host, path }).then((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      return URL.createObjectURL(new Blob([bytes], { type: MIME[ext] ?? "application/octet-stream" }));
    });
    hit.catch(() => cache.delete(key)); // let a later render retry
    cache.set(key, hit);
  }
  return hit;
}

/** Point the remote document's local-looking `<img>`s at their fetched copies. */
export function loadRemoteImages(root: ParentNode, remote: RemoteRef): void {
  const dir = remote.path.slice(0, remote.path.lastIndexOf("/")) || "/";
  for (const img of root.querySelectorAll<HTMLImageElement>("img")) {
    let src = img.dataset.remoteSrc ?? img.getAttribute("src") ?? "";
    // The markdown pipeline turns absolute paths into local asset URLs; in a
    // remote document they mean paths on the remote machine.
    // (asset://localhost/<path> or http://asset.localhost/<path>, %-encoded).
    if (/^(?:asset:|https?:\/\/asset\.localhost)/i.test(src)) {
      const path = decodeURIComponent(new URL(src).pathname);
      src = path.startsWith("//") ? path.slice(1) : path;
    }
    // Real URLs (https:, data:, blob:) load on their own.
    if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) continue;
    img.dataset.remoteSrc = src;
    const path = resolve(dir, src);
    img.removeAttribute("src"); // don't let the webview try the bogus local URL
    fetchImage(remote.host, path).then(
      (url) => {
        if (img.dataset.remoteSrc === src) img.src = url;
      },
      (err) => {
        // WebKit shows nothing for an <img> with no src; say what's missing.
        const note = document.createElement("span");
        note.className = "img-missing";
        note.textContent = `Image not found: ${remote.host}:${path}`;
        note.title = String(err);
        if (img.isConnected && img.dataset.remoteSrc === src) img.replaceWith(note);
      },
    );
  }
}
