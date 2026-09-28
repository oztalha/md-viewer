# Changelog

All notable changes to md-viewer. Versions follow [semver](https://semver.org);
the format is based on [Keep a Changelog](https://keepachangelog.com).

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

[0.2.1]: https://github.com/oztalha/md-viewer/releases/tag/v0.2.1
[0.2.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.2.0
[0.1.0]: https://github.com/MaxLeiter/md-viewer
