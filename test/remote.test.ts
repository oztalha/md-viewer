import { expect, test } from "bun:test";
import { isGithubHost, isValidHost, parseOpenSpec } from "../src/remote";

test("local paths stay local", () => {
  expect(parseOpenSpec("/Users/me/notes.md", "")).toEqual({ kind: "local", path: "/Users/me/notes.md" });
});

test("host:/path and :/path (default host)", () => {
  expect(parseOpenSpec("box:/home/me/a.md", "")).toEqual({ kind: "remote", ref: { host: "box", path: "/home/me/a.md" } });
  expect(parseOpenSpec(":/home/me/a.md", "box")).toEqual({ kind: "remote", ref: { host: "box", path: "/home/me/a.md" } });
});

test("mdviewer:// deep links", () => {
  expect(parseOpenSpec("mdviewer://open?host=box&path=/a/b.md", "")).toEqual({ kind: "remote", ref: { host: "box", path: "/a/b.md" } });
});

test("hosts that ssh would read as options are rejected", () => {
  expect(isValidHost("-oProxyCommand=evil")).toBe(false);
  expect(isValidHost("user@box")).toBe(true);
});

test("path:LINE[:COL] suffixes become a line to jump to", () => {
  expect(parseOpenSpec("box:/tmp/a/prompt.md:33", "")).toEqual({ kind: "remote", ref: { host: "box", path: "/tmp/a/prompt.md" }, line: 33 });
  expect(parseOpenSpec("/Users/me/n.md:12:5", "")).toEqual({ kind: "local", path: "/Users/me/n.md", line: 12 });
  expect(parseOpenSpec("mdviewer://open?host=box&path=/a.md&line=7", "")).toMatchObject({ line: 7 });
  expect(parseOpenSpec("box:/tmp/plain.md", "")).toEqual({ kind: "remote", ref: { host: "box", path: "/tmp/plain.md" } });
});

// Same cases as `parses_hosts` in src-tauri/src/github.rs: the two gates must agree.
test("github:owner/repo@ref hosts", () => {
  expect(parseOpenSpec("github:o/r@feat/x:/docs/a.md", "")).toEqual({ kind: "remote", ref: { host: "github:o/r@feat/x", path: "/docs/a.md" } });
  expect(isGithubHost("github:oztalha/md-viewer@feat/x")).toBe(true);
  for (const bad of ["github:-o/r@main", "github:o/r", "github:o@main", "github:o/r@-x", "github:o/r@a..b", "github:o/r@a b", "github:o/..@main", "github:o/r@main?x=1"]) {
    expect(isGithubHost(bad)).toBe(false);
  }
});
