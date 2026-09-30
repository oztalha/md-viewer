# Changelog

All notable changes to md-viewer. Versions follow [semver](https://semver.org);
the format is based on [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Added
- **Recent files in the sidebar**, below the open documents: click to reopen
  (local or remote; each shows its host, or "local"), ✕ to drop one, *Clear*
  to empty the list. The list keeps the last 20 files.
- **Open published page** (⇧⌘L, and a ↗ button in the title bar once a
  document is published) opens its most recent link without the dialog. The
  Publish dialog also has an **Open ↗** button next to Update.
- Holding ⌘ shows each title-bar button's shortcut under it, not just the
  tabs'. Tooltips show your current bindings.
- **Toggle sidebar** has a shortcut: ⌘\\.
- Publish without the mouse: after publishing, the button becomes **Open ↗**
  and Enter opens the page in your browser. **⌘↩** opens the selected
  target's saved link at any time.

### Changed
- **One sidebar, two tabs: Files | Outline.** The outline moved from its own
  panel next to the editor into the sidebar. **⇧⌘F** shows Files and **⇧⌘0**
  shows Outline (pressing the key of the tab that's already showing hides the
  sidebar); the sidebar remembers the last tab.
- Shortcuts moved off ⌥⌘, which is awkward to press: Copy path is now ⇧⌘C,
  and the view modes are ⇧⌘7 (editor), ⇧⌘8 (editor & preview) and ⇧⌘9
  (preview), and Toggle outline is ⇧⌘0. Custom bindings you set in Settings
  are kept.
- Shortcut badges use the system font, so O and 0 no longer look alike.
- The title-bar publish icon opens the Publish dialog directly (it already
  lists each target's link), instead of a menu you had to click through.
- Filled buttons (Publish, Save, …) use a stronger blue in dark mode; the old
  pale blue looked disabled.

### Fixed
- Split view kept drifting apart while scrolling (panes were synced by scroll
  percentage, but raw markdown and rendered HTML have different heights). The
  panes now stay on the same paragraph, anchored by source line.
- The title bar didn't show the published dot / ↗ button until you switched
  tabs after publishing.
- Too much space between an alert's title (e.g. "Note") and its text.
- Right-clicking the sidebar (and other places without their own menu) showed
  the web view's **Reload** (reloads the whole app, closing your tabs) and
  **Inspect Element**. Open files now get the document menu, recents get
  Open / Copy Path / Remove from Recents, and the web-view menu only remains
  in text fields and the editor (for Cut/Copy/Paste). Menu items show their
  shortcuts.
- Enter didn't publish when the Publish dialog opened: focus stayed in the
  document. The Publish/Update button now gets focus, and Enter publishes
  from anywhere in the dialog (e.g. after picking a target).
- The Publish dialog kept showing the previous document's result after
  switching documents while it was open.

## [0.4.1] — 2026-09-29

### Fixed
- Publishing could make macOS ask to give the app access to the Downloads
  folder when a `PATH` entry pointed there (e.g. a tool unpacked in
  `~/Downloads`). The app now reads `PATH` from a non-interactive login shell
  and never searches Downloads, Desktop, Documents or iCloud Drive.
- **Open Remote…** focuses and selects the path field, so you can press ⌘V and
  Enter to open a path from the clipboard. A folder listing that finishes after
  you've typed or pasted no longer overwrites the path.

### Added
- `publish.json` accepts a top-level `"path"` list of extra folders to search
  for commands.

## [0.4.0] — 2026-09-28

### Added
- **Publish…** (⇧⌘P): share the document as a GitHub Gist (via `gh`), or to
  places you add in `~/.config/md-viewer/publish.json`: tool calls on a local
  MCP server, or a shell command. Republishing updates the same document, so
  the link stays the same; the link is copied when publishing finishes. See
  [docs/PUBLISHING.md](docs/PUBLISHING.md).
- A publish button in the title bar shows where the document is published,
  with clickable links.
- **About Markdown** opens the app's own About window with clickable links to
  the project and issue tracker.

### Fixed
- Settings showed Zoom out as just "⌘"; zoom shortcuts now read ⌘+ / ⌘−, and
  ⌘+ (⇧⌘=) zooms in as well as ⌘=.

## [0.3.0] — 2026-09-28

### Added
- **LaTeX math** with KaTeX: `$inline$`, `$$display$$`, and ```` ```math ````
  blocks (GitHub's syntax), including environments like `aligned` and
  `pmatrix`. Prices like "$5 and $10" stay plain text, and invalid TeX shows in
  red instead of breaking the page. Works offline; exported HTML includes the
  KaTeX stylesheet when a document has math.

## [0.2.2] — 2026-09-28

### Fixed
- Closing the window failed with "window|destroy not allowed by ACL" and
  left the app open.
- Downloaded builds no longer risk being reported as "damaged": the whole app
  bundle is now ad-hoc signed, so macOS offers **Open Anyway** in Privacy &
  Security on first launch.

### Added
- **Help** menu with *md-viewer on GitHub* and *Report an Issue…*; the About
  panel shows the project address.

## [0.2.1] — 2026-09-28

### Fixed
- Nested lists no longer have a paragraph-sized gap above them; sublists now
  sit directly under their parent item.

## [0.2.0] — 2026-09-28

### Added
- **Remote file browser.** Open Remote… (⇧⌘O) now browses folders on any SSH
  host instead of asking for a typed path, and the new **Save to Remote…**
  (⇧⌘S) saves a document to any host. Remembers the last host and, per host,
  the last folder.
- **Browser-style tabs.** Opening a file adds a tab and takes over the view.
  Drag tabs to reorder; ⌘1–9 jump to a tab (⌘N badges appear while ⌘ is held);
  ⌃Tab / ⌃⇧Tab and ⇧⌘] / ⇧⌘[ cycle; ⌘W closes.
- Resizable sidebar listing open files, toggled from the title bar.
- ⇧⌘V toggles between editor and preview and keeps your reading position.
- **Reload** (⌘R) re-reads the document from disk or the remote host.
- **Copy Path** (⌥⌘C), with a *Copy path includes host* setting (off by default).
- The title bar shows `host:` for remote documents.
- ⌘A selects all in the editor, the preview, or a focused text field.
- [Midnight Commander integration guide](docs/midnight-commander-integration.md).

### Changed
- Multi-file tiling (split panes, drag-to-tile) is replaced by tabs. The
  per-document editor / split / preview modes stay.
- View-mode shortcuts moved from ⌘1/2/3 to ⌥⌘1/2/3, freeing ⌘1–9 for tabs.
- Save As… (local) moved to ⌥⌘S; Paste and Match Style moved to ⌥⇧⌘V.
- Content widths are about 1.5× wider (narrow, normal, wide).

### Fixed
- The webview's default right-click Reload blanked the page for remote files.
- Window dragging failed with "start_dragging not allowed by ACL".
- The Settings shortcut recorder got stuck on "Press keys…".

## [0.1.0] — 2026-07-03

Initial version: semi-WYSIWYG markdown editor with live preview, tiled panes,
CSV/TSV tables, preview annotations, Prettier formatting, HTML export, and
opening/editing files over SSH.

[0.4.1]: https://github.com/oztalha/md-viewer/releases/tag/v0.4.1
[0.4.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.4.0
[0.3.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.3.0
[0.2.2]: https://github.com/oztalha/md-viewer/releases/tag/v0.2.2
[0.2.1]: https://github.com/oztalha/md-viewer/releases/tag/v0.2.1
[0.2.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.2.0
[0.1.0]: https://github.com/MaxLeiter/md-viewer
