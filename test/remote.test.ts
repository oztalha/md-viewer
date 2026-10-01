import { expect, test } from "bun:test";
import { isValidHost, parseOpenSpec } from "../src/remote";

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
