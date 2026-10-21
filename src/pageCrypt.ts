/**
 * Password-protected pages: the rendered page is encrypted here, in the app,
 * and published as a small page that asks for the password and decrypts in
 * the reader's browser. The host (GitHub Pages) only ever sees ciphertext.
 *
 * PBKDF2-SHA256 → AES-256-GCM, a fresh salt and IV per publish. The reader page
 * embeds `decryptPayload` itself (via toString), so both sides share one
 * implementation of the format; a test round-trips through it.
 */

import { THEME_INIT } from "./pageTheme";

export const ITERATIONS = 600_000;
export const MIN_PASSWORD = 12;

export interface Payload {
  v: 1;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

/** No look-alikes (I, O, l, 0, 1), so a password can be read out or retyped. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 20 random characters (~117 bits) in groups of five: xxxxx-xxxxx-xxxxx-xxxxx. */
export function generatePassword(): string {
  const out: string[] = [];
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  while (out.length < 20) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < limit && out.length < 20) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join("").replace(/(.{5})(?=.)/g, "$1-");
}

/** A random page name (128 bits, hex): says nothing about the document. */
export function newPageId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/**
 * A page's salt: fixed per page (derived from its random id), so the same
 * password gives the same key across updates and a reader's remembered key
 * keeps working; a new password changes the key, which forgets it everywhere.
 * Every publish still uses a fresh IV.
 */
export async function pageSalt(pageId: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`md-viewer page ${pageId}`));
  return new Uint8Array(digest).slice(0, 16);
}

export async function encryptPayload(text: string, password: string, salt: Uint8Array): Promise<Payload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  return { v: 1, iter: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), ct: toBase64(ct) };
}

/**
 * Runs in the reader's browser (embedded in the page), so it must stay
 * self-contained: only its arguments and browser globals. Decrypts with the
 * password, or with a key remembered from an earlier visit (`savedKey`), and
 * returns the key so the page can remember it. Throws if either is wrong
 * (AES-GCM authentication fails).
 */
export async function decryptPayload(
  payload: Payload,
  password: string,
  savedKey?: string,
): Promise<{ html: string; key: string }> {
  const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const key = savedKey
    ? await crypto.subtle.importKey("raw", bytes(savedKey), "AES-GCM", true, ["decrypt"])
    : await crypto.subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt: bytes(payload.salt), iterations: payload.iter },
        await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]),
        { name: "AES-GCM", length: 256 },
        true,
        ["decrypt"],
      );
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(payload.iv) }, key, bytes(payload.ct));
  let raw = "";
  for (const b of new Uint8Array(await crypto.subtle.exportKey("raw", key))) raw += String.fromCharCode(b);
  return { html: new TextDecoder().decode(plain), key: btoa(raw) };
}

const PROMPT_DARK = "--bg: #1e1e20; --fg: #f5f5f7; --muted: #a1a1a6; --line: #3a3a3c; --accent: #4c9bff;";

/**
 * The published page: a password prompt that decrypts and shows `html`, and
 * can remember the page's key in this browser so the next visit skips the
 * prompt. `marker` (this publish's random IV) appears in the page, so the app
 * can tell when the host serves this version.
 */
export async function encryptPage(
  html: string,
  password: string,
  pageId: string,
): Promise<{ page: string; marker: string }> {
  const payload = await encryptPayload(html, password, await pageSalt(pageId));
  // Only base64 and numbers: safe inside <script>.
  const data = JSON.stringify(payload);
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Protected page</title>
<script>${THEME_INIT}</script>
<style>
:root { color-scheme: light dark; --bg: #fff; --fg: #1d1d1f; --muted: #6e6e73; --line: #d2d2d7; --accent: #0a66d8; }
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; ${PROMPT_DARK} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${PROMPT_DARK} } }
html, body { height: 100%; margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
form { width: min(360px, 100%); display: grid; gap: 10px; }
form[hidden] { display: none; }
h1 { margin: 0; font-size: 19px; }
p { margin: 0; color: var(--muted); font-size: 13.5px; }
input, button { font: inherit; padding: 9px 12px; border-radius: 9px; border: 1px solid var(--line); background: transparent; color: var(--fg); }
button { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
button:disabled { opacity: .6; cursor: default; }
label { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 13.5px; }
label input { padding: 0; }
#e { color: #d93025; min-height: 1.5em; }
</style>
</head>
<body>
<form id="f" hidden>
<h1>Protected page</h1>
<p>Enter the password you were given to read this page.</p>
<input id="p" type="password" autocomplete="current-password" required aria-label="Password">
<label><input id="r" type="checkbox" checked> Remember on this device</label>
<button id="b">Open</button>
<p id="e" role="alert"></p>
</form>
<script type="application/json" id="d">${data}</script>
<script>
const decryptPayload = ${decryptPayload.toString()};
const payload = JSON.parse(document.getElementById("d").textContent);
const storageKey = "md-viewer-page:" + location.pathname;
const form = document.getElementById("f");
const show = async (html) => {
  // Replacing the page only works once it has finished loading; a remembered
  // key can decrypt before that.
  if (document.readyState === "loading") {
    await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }
  document.open();
  document.write(html);
  document.close();
};
const store = (fn) => {
  try {
    return fn(localStorage);
  } catch {
    return null; // storage blocked (private mode, settings): just ask each time
  }
};
(async () => {
  // A key remembered on this device opens the page straight away; a new
  // password (or a broken entry) fails here and falls back to the prompt.
  const saved = store((s) => s.getItem(storageKey));
  if (saved) {
    try {
      return await show((await decryptPayload(payload, "", saved)).html);
    } catch {
      store((s) => s.removeItem(storageKey));
    }
  }
  form.hidden = false;
  document.getElementById("p").focus();
})();
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("b");
  const error = document.getElementById("e");
  button.disabled = true;
  error.textContent = "";
  try {
    const result = await decryptPayload(payload, document.getElementById("p").value);
    if (document.getElementById("r").checked) store((s) => s.setItem(storageKey, result.key));
    else store((s) => s.removeItem(storageKey));
    await show(result.html);
  } catch {
    error.textContent = "That password didn't work.";
    button.disabled = false;
  }
});
</script>
</body>
</html>
`;
  return { page, marker: payload.iv };
}
