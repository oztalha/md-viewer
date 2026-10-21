/**
 * Password-protected pages: the rendered page is encrypted here, in the app,
 * and published as a small page that asks for the password and decrypts in
 * the reader's browser. The host (GitHub Pages) only ever sees ciphertext.
 *
 * PBKDF2-SHA256 → AES-256-GCM, a fresh salt and IV per publish. The reader page
 * embeds `decryptPayload` itself (via toString), so both sides share one
 * implementation of the format; a test round-trips through it.
 */

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

export async function encryptPayload(
  text: string,
  password: string,
): Promise<Payload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(text),
    ),
  );
  return {
    v: 1,
    iter: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(ct),
  };
}

/**
 * Runs in the reader's browser (embedded in the page), so it must stay
 * self-contained: only its arguments and browser globals. Throws on a wrong
 * password (AES-GCM authentication fails).
 */
export async function decryptPayload(
  payload: Payload,
  password: string,
): Promise<string> {
  const bytes = (b64: string) =>
    Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: bytes(payload.salt),
      iterations: payload.iter,
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(payload.iv) },
    key,
    bytes(payload.ct),
  );
  return new TextDecoder().decode(plain);
}

/**
 * The published page: a password prompt that decrypts and shows `html`.
 * `marker` (this publish's random salt) appears in the page, so the app can
 * tell when the host serves this version.
 */
export async function encryptPage(
  html: string,
  password: string,
): Promise<{ page: string; marker: string }> {
  const payload = await encryptPayload(html, password);
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
<style>
:root { color-scheme: light dark; --bg: #fff; --fg: #1d1d1f; --muted: #6e6e73; --line: #d2d2d7; --accent: #0a66d8; }
@media (prefers-color-scheme: dark) { :root { --bg: #1e1e20; --fg: #f5f5f7; --muted: #a1a1a6; --line: #3a3a3c; --accent: #4c9bff; } }
html, body { height: 100%; margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
form { width: min(360px, 100%); display: grid; gap: 10px; }
h1 { margin: 0; font-size: 19px; }
p { margin: 0; color: var(--muted); font-size: 13.5px; }
input, button { font: inherit; padding: 9px 12px; border-radius: 9px; border: 1px solid var(--line); background: transparent; color: var(--fg); }
button { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
button:disabled { opacity: .6; cursor: default; }
#e { color: #d93025; min-height: 1.5em; }
</style>
</head>
<body>
<form id="f">
<h1>Protected page</h1>
<p>Enter the password you were given to read this page.</p>
<input id="p" type="password" autocomplete="current-password" autofocus required aria-label="Password">
<button id="b">Open</button>
<p id="e" role="alert"></p>
</form>
<script type="application/json" id="d">${data}</script>
<script>
const decryptPayload = ${decryptPayload.toString()};
document.getElementById("f").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("b");
  const error = document.getElementById("e");
  button.disabled = true;
  error.textContent = "";
  try {
    const payload = JSON.parse(document.getElementById("d").textContent);
    const html = await decryptPayload(payload, document.getElementById("p").value);
    document.open();
    document.write(html);
    document.close();
  } catch {
    error.textContent = "That password didn't work.";
    button.disabled = false;
  }
});
</script>
</body>
</html>
`;
  return { page, marker: payload.salt };
}
