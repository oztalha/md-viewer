import type { RemoteRef } from "./types";

export type OpenSpec = (
  | { kind: "local"; path: string }
  | { kind: "remote"; ref: RemoteRef }
) & {
  /** 1-based line to jump to, from a `path:LINE[:COL]` suffix or `line=`. */
  line?: number;
};

/**
 * Split a trailing `:LINE` or `:LINE:COL` (as printed by compilers, grep and
 * agents) off a path. A real filename ending in ":<digits>" is rare enough.
 */
export function splitLineSuffix(path: string): { path: string; line?: number } {
  const m = /^(.*?):(\d+)(?::\d+)?$/.exec(path);
  if (!m || !m[1] || m[1].endsWith("/")) return { path };
  return { path: m[1], line: Number(m[2]) };
}

/**
 * A safe `[user@]host` token. Must match the backend's `validate_host` — most
 * importantly, no leading `-` (which ssh would treat as an option, e.g.
 * `-oProxyCommand=…`). Defense-in-depth for mdviewer:// deep-link hosts; the
 * Rust command is the authoritative gate.
 */
export function isValidHost(host: string): boolean {
  return host.length > 0 && !host.startsWith("-") && /^[A-Za-z0-9._@:[\]-]+$/.test(host);
}

/**
 * Classify a string passed to "open" — a local path, a remote `host:/path`
 * spec, or an `mdviewer://` deep link. An empty host falls back to the
 * configured default remote host.
 *
 * Accepted remote forms:
 *   mdviewer://open?host=HOST&path=/abs/path
 *   mdviewer://HOST/abs/path
 *   HOST:/abs/path        HOST:~/rel/path        :/abs/path (default host)
 */
export function parseOpenSpec(spec: string, defaultHost: string): OpenSpec {
  const parsed = parseOpenSpecRaw(spec, defaultHost);
  if (parsed.line) return parsed;
  if (parsed.kind === "local") {
    const { path, line } = splitLineSuffix(parsed.path);
    return line ? { kind: "local", path, line } : parsed;
  }
  const { path, line } = splitLineSuffix(parsed.ref.path);
  return line ? { kind: "remote", ref: { ...parsed.ref, path }, line } : parsed;
}

function parseOpenSpecRaw(spec: string, defaultHost: string): OpenSpec {
  const trimmed = spec.trim();

  if (/^mdviewer:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      let host = url.searchParams.get("host") ?? "";
      let path = url.searchParams.get("path") ?? "";
      if (!path) {
        // Path-style: mdviewer://HOST/abs/path
        host = host || decodeURIComponent(url.hostname);
        path = decodeURIComponent(url.pathname);
      }
      host = host || defaultHost;
      const lineParam = Number(url.searchParams.get("line")) || undefined;
      if (host && path && isValidHost(host)) return { kind: "remote", ref: { host, path }, line: lineParam };
    } catch {
      // fall through to local
    }
    return { kind: "local", path: trimmed };
  }

  // HOST:/path or :/path — a colon that is not part of a "scheme://" and comes
  // before any slash. Local absolute paths (/Users/…) never match.
  const match = /^([A-Za-z0-9._@-]*):(?!\/\/)(.+)$/.exec(trimmed);
  if (match) {
    const host = match[1] || defaultHost;
    if (host && isValidHost(host)) return { kind: "remote", ref: { host, path: match[2] } };
  }

  return { kind: "local", path: trimmed };
}

/** Build an mdviewer:// deep link for a remote file (for docs / sharing). */
export function remoteUrl(ref: RemoteRef): string {
  const params = new URLSearchParams({ host: ref.host, path: ref.path });
  return `mdviewer://open?${params.toString()}`;
}
