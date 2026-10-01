import { expect, test } from "bun:test";
import { formatKeybind } from "../src/keybind-format";

test.each([
  ["Shift+CmdOrCtrl+P", "⇧⌘P"],
  ["CmdOrCtrl+-", "⌘−"], // the "-" key itself once got dropped (showed just "⌘")
  ["CmdOrCtrl+=", "⌘+"],
  ["CmdOrCtrl+\\", "⌘\\"],
  ["Mod-Shift-x", "⌘⇧X"],
  ["Ctrl+Shift+Tab", "⌃⇧⇥"],
  ["", "—"],
])("formatKeybind(%p) -> %p", (input, out) => {
  expect(formatKeybind(input)).toBe(out);
});
