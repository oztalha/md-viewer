# Architecture

A map of md-viewer for contributors: how the pieces fit, and the non-obvious
decisions behind them. Tauri 2 (Rust backend) + React/TypeScript frontend +
CodeMirror 6 editor. One window.

## Layout

```
src/                     frontend (React, zustand)
  store.ts               app state: docs, tabs, views, sidebar; file actions
  settings.ts            preferences + KEYBINDS (default shortcuts, rebindable)
  init.ts                native menu events -> actions; window-level wiring
  markdown.ts            markdown-it pipeline, per-block render cache
  json.ts, code.ts       JSON / code files, rendered as one fenced block
  publish.ts             publish flow (create/update steps, saved links)
  recent.ts, annotations.ts   small localStorage-backed stores
  components/            TitleBar, TabBar, Sidebar, Tile (editor+preview), dialogs
src-tauri/src/
  lib.rs                 native menu, file + SSH commands, app setup
  publish.rs             publish backend: MCP client, gist, command targets
src-tauri/capabilities/  Tauri ACL: which core commands the webview may call
```

## Model

- **Tabs, one visible document.** `store.tabs` is the ordered list of doc ids;
  `activeId` is the visible one. Each doc has a per-document view in
  `views[id]` (`mode`: editor / split / preview, split ratio). Opening a file
  adds or activates a tab, never a second copy (in-flight opens are tracked in
  `opening` so a slow SSH read can't open duplicates).
- **Remote files** are docs with `remote: { host, path }`. Reads/writes and
  directory listings shell out to the system `ssh`, so `~/.ssh/config`
  (aliases, keys, ProxyCommand) applies. Writes are atomic (temp file + `mv`).
  Dropping files onto the open remote browser copies them into its folder with
  `scp -r` (`upload_remote`), after confirming any replacements.
  Download is `download_remote` (`scp -r` to a path from a save dialog, which
  avoids a macOS privacy prompt for Downloads).
- **Sidebar** has two tabs: Files (open + recent) and Outline. Each has its own
  shortcut; pressing the key of the showing tab hides the sidebar.

## Rendering

- `renderBlocks` renders each top-level markdown block separately and caches
  by block source, so typing only re-renders the edited block; the preview DOM
  is patched block by block.
- Each block's HTML gets `data-source-line` (its editor line), injected
  **after** the cache lookup so cached HTML stays line-agnostic. These anchors
  drive editor ⇄ preview scroll sync (split view and the ⇧⌘V toggle) by
  source line, not scroll percentage (raw and rendered heights differ).
- All rendered HTML goes through DOMPurify. KaTeX (math) is synchronous, so it
  fits the per-block cache.
- Tables wider than the text column get `.table-wide` (measured after render
  and on resize) and use the full pane width via container units.

## Publishing

`~/.config/md-viewer/publish.json` defines targets (see PUBLISHING.md). The
webview only ever passes a **target id**; `publish.rs` resolves servers and
commands from the file, and a target may only call the MCP tools named in its
own steps. Nothing service-specific lives in this repo (a test enforces it).

## Traps we hit (read before changing these areas)

- **React Compiler memoizes.** A component reading localStorage (published
  links, etc.) must pass a store value it depends on into the call
  (`publishedFor(doc, publishTick)`), or the compiler reuses a stale result.
- **Store selectors must return stable values.** Don't select freshly built
  objects (e.g. `activeLeaf()`) with `useStore`; select primitives.
- **WebKit doesn't focus a clicked `<button>`.** Key handling that needs focus
  (shortcut recorder, dialogs) listens on `window` instead.
- **Tauri ACL.** Calling a core window API (`start_dragging`, `destroy`, …)
  needs its permission in `capabilities/default.json`, or it fails at runtime.
- **macOS privacy prompts.** Anything the app (or its child processes)
  touches under Downloads/Desktop/Documents prompts the user. Tool lookup uses
  a *non-interactive* login shell and skips those folders.
- **Shortcuts are defined twice:** `KEYBINDS` in settings.ts and the native
  menu in lib.rs. Keep them identical (a test checks). ⇧⌘3/4/5 belong to macOS.
- **The web view's own context menu** (Reload = reload the whole UI, Inspect)
  is suppressed outside text fields; give new surfaces a real menu.
- **Single instance.** A rebuilt app only takes effect after a full quit.

## Checks and releases

`bun run check` = typecheck/build + guardrail tests + Rust tests (CI runs the
same). Releases: see RELEASING.md. The bundle is ad-hoc signed (needed for
"Open Anyway"); it is not notarized.
