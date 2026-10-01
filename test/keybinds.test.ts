// Guards drift between the configurable shortcut list (src/settings.ts) and the
// native menu (src-tauri/src/lib.rs): both define each menu shortcut's default,
// and they have gone out of sync before.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const settings = readFileSync("src/settings.ts", "utf8");
const rust = readFileSync("src-tauri/src/lib.rs", "utf8");

const menuDefaults = [
  ...settings.matchAll(/\{ id: "([\w-]+)", label: "[^"]*", kind: "menu", defaultKey: "([^"]+)" \}/g),
].map((m) => ({ id: m[1], key: m[2] }));

// Rust: MenuItemBuilder::with_id("id", "Label") ... .accelerator("Key")
const rustAccel = new Map(
  [...rust.matchAll(/with_id\("([\w-]+)",\s*"[^"]*"\)\s*\.accelerator\("((?:[^"\\]|\\.)+)"\)/g)].map(
    // Both files are compared as source text, so escapes (e.g. "\\\\") match as written.
    (m) => [m[1], m[2]],
  ),
);

test("settings lists menu shortcuts", () => {
  expect(menuDefaults.length).toBeGreaterThan(10);
});

test.each(menuDefaults.map((d) => [d.id, d.key]))(
  "menu item %s has the same default shortcut in settings.ts and lib.rs",
  (id, key) => {
    expect(rustAccel.get(id)).toBe(key);
  },
);

test("no two menu shortcuts share a default key", () => {
  const seen = new Map<string, string>();
  for (const { id, key } of menuDefaults) {
    expect(seen.get(key) ?? id).toBe(id);
    seen.set(key, id);
  }
});
