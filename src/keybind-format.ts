/**
 * Display form of a keybinding, e.g. "Shift+CmdOrCtrl+P" -> "⇧⌘P". Pure (no
 * DOM, no store) so it can be unit-tested; re-exported from settings.ts.
 */
export function formatKeybind(key: string): string {
  if (!key) return "—";
  return key
    // Split on separators only between parts, so the "-" / "+" keys themselves
    // (e.g. "CmdOrCtrl+-" for zoom out) survive as the final part.
    .split(/(?<=.)[-+](?=.)/)
    .map((part) => {
      switch (part) {
        case "Mod":
        case "CmdOrCtrl":
        case "Cmd":
        case "Meta":
          return "⌘";
        case "Ctrl":
        case "Control":
          return "⌃";
        case "Alt":
        case "Option":
          return "⌥";
        case "Shift":
          return "⇧";
        case "Enter":
          return "↩";
        case "Tab":
          return "⇥";
        case "Space":
          return "␣";
        case "Backspace":
          return "⌫";
        case "ArrowUp":
          return "↑";
        case "ArrowDown":
          return "↓";
        case "ArrowLeft":
          return "←";
        case "ArrowRight":
          return "→";
        // Zoom keys, shown the way macOS apps label them (⌘+ also works; see init.ts).
        case "=":
          return "+";
        case "-":
          return "−";
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join("");
}
