# Changelog

All notable changes to md-viewer. Versions follow [semver](https://semver.org);
the format is based on [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Changed
- Publishing no longer holds the dialog open: close it (Esc, Close, or click
  outside) and the publish carries on, with progress, the GitHub Pages wait
  and then **Open ↗** and **Copy link** in a small panel in the corner.
- The GitHub Pages target is called **GitHub Pages** everywhere, including
  publish settings saved when it was still "Password-protected page".
- A new look for your GitHub Pages index page: your avatar and page count,
  pages as cards with readable dates, a filter box once there are six or
  more, and the footer at the bottom of the window. It takes effect on the
  next publish that updates the index.

### Fixed
- Publishing to GitHub Pages without a password hid the **Account** picker,
  so the page went to whichever account was used last.
### Added
- Published and exported pages that open with a title keep it in a slim
  bar at the top once you scroll past it; click it to go back to the top.

### Changed
- The outline on published and exported pages slides open and closed on
  hover instead of snapping.
- On phones and narrow windows, published and exported pages get the outline
  as a menu behind a button at the top left (it was hidden there).

### Fixed
- Mermaid diagrams now draw in published pages and exported HTML (they
  showed as code). The app draws them when it builds the page, in light and
  dark, so pages (password-protected ones included) run no diagram script
  from anywhere else. A diagram that can't be drawn shows its source.
- After a failed publish, **Unpublish** showed the old error instead of its
  own progress, and Publish stayed clickable while the page was being
  removed.

## [0.17.4] — 2026-10-23

### Fixed
- Updating a document with **Also publish linked documents** unchecked put
  its links back to local file paths in the published copy. Links to linked
  documents already published to the same place now keep pointing at their
  pages; only the main document is republished.

## [0.17.3] — 2026-10-23

### Added
- **Show in File Browser** in the right-click menu of a remote document: the
  remote browser opens at the file's folder with the file highlighted, like
  Reveal in Finder for local files.

## [0.17.2] — 2026-10-23

### Added
- **Copy** in the preview's right-click menu when text is selected (the same
  clean copy as ⌘C).

## [0.17.1] — 2026-10-22

### Fixed
- A file reached through a symlinked folder (say `/home/me/x.md` and
  `/local/home/me/x.md`) counted as two files for publishing, so publishing it
  (or a document linking to it) through the other path made a second page.
  Publish records now follow the file's real path; existing records still
  match.
- A rare editor error ("scanTile …") when switching from the preview back to
  the editor (⇧⌘V): the editor looked up a line that wasn't laid out yet.

## [0.17.0] — 2026-10-21

### Added
- **GitHub Pages** (was *Password-protected page*) can publish without a
  password: uncheck **Require a password** for a plain public page.
  Switching an existing page between protected and public publishes a new
  page with a new link (the dialog says so first), so a link shared as
  protected never starts showing the page in plain text. Linked documents
  published before keep their own protection and password.
- An index page for your GitHub Pages, `<you>.github.io/md-viewer-pages/`,
  listing the pages you choose with **Show on my index page** (on by default
  for public pages, off for protected ones, which show with a lock). It stays
  one list across Macs, and unpublishing takes a page off it.
- Published and exported HTML pages have an outline: a rail of dashes at the
  left, one per heading, that opens into the list of headings on hover and
  marks the section you're reading. Hidden on narrow screens and in print.
- Published and exported HTML pages (password-protected pages, HTML gists,
  **Export as HTML**) have a light/dark toggle in the corner: match the system,
  light, or dark, remembered in the reader's browser. The password prompt uses
  the same choice.
- Pages md-viewer publishes (GitHub Pages, the index page, HTML gists) end
  with a small "Published with md-viewer" footer. Export as HTML doesn't add it.

### Changed
- Checkboxes and radio buttons use the theme's colors (yellow accent, theme
  background, dark mode) instead of the system blue, matching the dropdowns.
- The password prompt of a protected page uses md-viewer's colors (yellow
  button, warm accents) instead of blue.

### Fixed
- Code blocks in published and exported HTML pages had no syntax colors; they
  are highlighted now, in light and dark.

## [0.16.4] — 2026-10-21

### Added
- A **Published documents** button in the title bar, next to Publish (⌘P).

## [0.16.3] — 2026-10-21

### Changed
- **Published Documents…** is now ⌘P (was ⌥⇧⌘P).
- Published Documents also lists the password-protected pages in your GitHub
  Pages repo that this Mac's history doesn't know about (published from an
  unsaved document or another Mac), each with **Copy password**.

## [0.16.2] — 2026-10-21

### Fixed
- Publishing a password-protected page stayed on "Getting ready…" forever
  when the GitHub account has a custom domain for its Pages (GitHub then
  redirects `<login>.github.io` there). The page was live; the check didn't
  follow the redirect.
- An unsaved (Untitled) document published as a password-protected page got a
  new page and a new password each time, so the password shown didn't match
  the published page. Publish… now asks you to save the document first.
- **Update an existing page instead…** accepts password-protected page links,
  including the account's custom-domain form.

### Added
- **Copy password** in **Published Documents…** (⌥⇧⌘P) for password-protected
  pages. Paste any protected-page link into its search to get its password,
  even for a page that isn't in the list, if the password is saved on this Mac.

## [0.16.1] — 2026-10-21

### Fixed
- A bare file name like `methods.md` in the text linked to the website
  `http://methods.md` (`.md` is a real web domain). It now opens the file,
  like `[methods.md](methods.md)`.

### Added
- Bare markdown paths in the text (`notes/plan.md`, `../summary.md`,
  `/abs/path/a.md`) are links to those files too, and **Publish…** treats them
  as linked documents. Web addresses and code are left alone.

## [0.16.0] — 2026-10-21

### Fixed
- A document whose gist was deleted on github.com no longer shows as
  published; publishing again creates a new gist.

### Added
- **Published Documents…** (File menu, ⌥⇧⌘P): everything you've published,
  newest first, with when it was first published and last updated. Search by
  title, file or link; paste a published link to find the file behind it, and
  click the file to open it. Every publish is now kept in a history, so
  publishing as a new copy no longer loses the earlier link.
- **Update an existing page:** a document this Mac hasn't published yet (say,
  one you published from another Mac) can be linked to its page: in
  **Publish…**, click **Update an existing page instead…** and paste the link.
  Publishing then updates that page instead of creating a new one.
- **Unpublish:** the Publish dialog can delete a published gist or protected
  page (after a confirmation), or forget the link for other targets.
- **Password-protected pages:** Publish… → *Password-protected page* encrypts
  the rendered document in the app (AES-256-GCM, key from the password) and
  publishes it to your own GitHub Pages; readers type the password to read it.
  A strong password is generated for you and kept in the Keychain, so updates
  keep the same link and password. The first publish creates the repo
  `md-viewer-pages`; nothing else to set up. Readers can let a device
  remember the page, so they type the password once.
- **GitHub repos as a remote source:** paste a github.com link (repo, folder
  or file) into Open Remote… (⇧⌘O), pass it to `mdv`, or type
  `github:owner/repo@branch` as the host. Folders browse like an SSH host and
  files open read-only, with images. Uses your `gh` login; if the active
  account can't see a private repo, your other `gh` accounts are tried.
  **Open from GitHub…** in the remote browser takes a link or `owner/repo`.
- **Choose the gist account:** with several `gh` accounts logged in, the
  Publish dialog's Account menu picks which one owns a new gist. Updates and
  syncs keep using the account that created it.
- **Edit targets in the app:** Edit targets… opens an editor with examples
  (gists, your web server, a rendered page, cloud storage, an MCP server)
  instead of the JSON file. New or changed commands need a yes in a native
  dialog that shows exactly what will run.
- **Open all .md files:** the remote browser can open every markdown file in
  the folder it shows, each in its own tab.
- **Keep a published copy in sync with GitHub:** for a document opened from
  GitHub, Publish… offers *Keep in sync with GitHub*. While md-viewer is open
  it checks every few minutes and republishes when the file changed on GitHub,
  so the shared link follows the repo no matter who pushes.

## [0.15.0] — 2026-10-21

### Added
- **Save into a new remote folder:** in **Save to Remote…**, typing a folder
  that doesn't exist yet (e.g. `~/docs/`) offers **Create Folder** instead of
  an error, and **Save** creates it (and any missing parents) before saving.
  A name with folders in it (`notes/today.md`) creates those too, and a name
  ending in `/` opens that folder.

## [0.14.1] — 2026-10-20

### Changed
- The About window links to the license instead of a credit line, and the
  app now includes the full MIT license text (`Contents/Resources/LICENSE`).

## [0.14.0] — 2026-10-20

### Added
- **Publish linked documents:** if a document links to other local markdown
  files, **Publish…** can publish them too and point the links at their
  published pages, so links in the shared copy work. Republishing updates
  them in place. One hop: links inside the linked files stay as they are.

## [0.13.1] — 2026-10-20

### Fixed
- After switching from the editor to the preview (⇧⌘V), ⌘A selected nothing
  visible until you clicked the preview: the hidden editor kept keyboard
  focus, so typing could also change text you couldn't see. The preview now
  takes focus, so ⌘A, arrow keys and Page Up/Down work right away.

## [0.13.0] — 2026-10-19

### Added
- **Command steps in publish targets:** a server target's `create` or `update`
  list can include `{ "command": "..." }` steps, for things the server has no
  tool for (such as turning on link sharing after a document is created). The
  document's id, link, file and title are passed in `MDV_*` environment
  variables. See [docs/PUBLISHING.md](docs/PUBLISHING.md).

## [0.12.0] — 2026-10-19

### Added
- **Paste keeps formatting:** pasting rich text (Slack, a browser, Google
  Docs, Notion, …) into the editor turns it into markdown, so links, bold,
  italics, `code`, code blocks, lists, quotes, headings and tables survive.
  Code-editor copies and pastes inside a code block stay plain text, and
  **Paste and Match Style** (⌥⇧⌘V) always pastes plain text.

### Changed
- The preview shows text as typed, like GitHub: `(c)` no longer becomes ©,
  `--` no longer becomes a dash, and quotes stay straight (so copied
  commands and JSON still work).

## [0.11.0] — 2026-10-14

### Added
- **Open images directly:** PNG, JPG, GIF, WebP and other images open in a
  tab as a picture (scaled to fit, on a checkerboard so transparency shows),
  locally or over ssh. In the remote browser, clicking one opens it instead
  of downloading it (right-click → Download… still works). SVG files open
  as the image with their source in the editor, so edits redraw it live.
- **Images in remote documents:** `![](img/diagram.png)` and absolute paths
  in a document on another machine are fetched over ssh and shown in the
  preview (PNG, JPG, GIF, WebP, SVG, up to 25 MB each). A missing image says
  which file it couldn't find.

### Fixed
- Copying from the preview and pasting into Slack (and other rich-text apps)
  lost the line breaks between paragraphs and list items. The preview now
  copies clean HTML: headings, lists, links and bold kept, styling dropped.

## [0.10.0] — 2026-10-12

### Added
- The active tab shows the document's word and character count under its name.

The tab redesign, word count and yellow accent are by
[@senaoz](https://github.com/senaoz) ([#1](https://github.com/oztalha/md-viewer/pull/1)).

### Changed
- Tabs are taller, with rounded tops; the active tab joins the document below
  it, and the close button shows on hover or on the active tab.
- With the sidebar open, tabs start over the document, and the Files | Outline
  switch sits in the tab bar, taller and rounder.
- The accent colour is yellow instead of blue (links, caret, buttons, focus
  rings); text on yellow fills is dark. In light mode, links and the caret
  use a darker amber so they stay readable on white. Selected text is a
  neutral grey, so it doesn't look like a search match.
- `bun run tauri dev` shows "Markdown" in the Dock, like the built app,
  instead of "md-viewer".

## [0.9.0] — 2026-10-11

### Added
- **Mermaid diagrams:** ```` ```mermaid ```` blocks render as diagrams in the
  preview (flowcharts, sequence, class, state, Gantt, …), in light and dark
  colours. A diagram with a syntax error shows the error and its source in
  place (Mermaid's own error graphic, which took over the window, is off).
  Mermaid is loaded only for documents that have a diagram.
- **Download…** in a remote tab's right-click menu copies the file to your Mac
  (a save dialog asks where; Finder shows it). It's the saved version on the
  remote machine.

## [0.8.0] — 2026-10-08

### Added
- **Find and replace** (⌘F, Edit menu): one compact bar, top right, for both
  the editor and the preview. It highlights every match, shows "3 of 12", and
  steps with Enter / ⇧Enter or ⌘G / ⇧⌘G. Toggles for match case, whole word
  and regular expressions sit in the field. The chevron opens a replace row
  (Enter replaces one, ⇧Enter replaces all). Replace edits the source, so it
  works from the preview too.

### Fixed
- The formatting toolbar no longer pops up over a match selected by find.

## [0.7.0] — 2026-10-07

Open files keep themselves current: when an agent (or anything else) rewrites
a file you're reading, locally or on a remote machine, it reloads in place.
Plus JSONL, pinned files, and drag-to-reorder everywhere in the sidebar.

### Added
- **Auto-reload:** when an open file changes outside the app (an agent
  rewriting a report, another editor, `git pull`), it reloads in place and
  keeps your place. Local files are watched by macOS (no polling); the remote
  tab you're looking at is checked every few seconds and when the window comes
  back to the front. With unsaved edits it never overwrites them: a bar offers
  **Reload** or **Keep mine**. Turn it off in Settings.
- **JSONL / NDJSON** (`.jsonl`, `.ndjson`) open in preview: one pretty-printed,
  highlighted block per record, each labelled with its line number.
  **Format Document** (⇧⌥F) re-serializes each record to one compact line.
- **Pin files** in the sidebar: right-click an open or recent file → **Pin**.
  Pinned files sit in their own section above Recent, are never evicted, and
  can be dragged to reorder.
- Drag recent files to reorder them too. Opening a file still moves it to
  the top of Recent; pin it to keep it in place.
- Drag open files in the sidebar up or down to reorder them (same order as
  the tabs); a grip appears on hover.

### Changed
- Hovering a tab or the title in the title bar shows the full path
  (`host:/path`), like the sidebar, so you no longer need Copy Path just to
  see where a file is.
- The sidebar remembers the last 100 recent files (was 20); the list
  scrolls. File → Open Recent still shows the newest 20.
- Dragging a tab or an open file is smooth: the item lifts and follows the
  pointer while the others slide aside, instead of jumping between slots.

### Fixed
- Right-clicking a tab did nothing; it now shows the tab menu (Reload, Copy
  Path, Pin, Reveal in Finder, Close Tab). New File and Open… are gone from
  that menu (they're in the File menu and the + button).
- Typing or pasting the path of an image or other non-text file into Open
  Remote's path bar showed "not a directory"; it now downloads the file (a
  save dialog asks where), like clicking it.

## [0.6.0] — 2026-10-01

md-viewer becomes a viewer for more than markdown (code, JSON, line numbers,
`file:LINE` jumps), and the remote browser becomes a small file manager
(copy files over, download them back).

### Added
- **`path:LINE`** (e.g. `notes.md:33`, as printed by tools and agents) opens
  the file and jumps to that line, in the editor and the preview. Works in
  `mdv`, links (also `line=` and `#L33`), Open Remote's path bar, and Open
  Recent.
- **Code files** (`.py`, `.js`/`.ts`, `.sh`, `.rs`, `.go`, `.java`, `.yaml`,
  `.toml`, `.sql`, … and `Dockerfile`/`Makefile`) open in preview,
  syntax-highlighted like a fenced code block. `file.py:33` jumps to line 33.
- **Line numbers** (⇧⌘N, the title-bar button, the View menu or Settings):
  in the editor gutter and in highlighted code in the preview (code files,
  JSON, fenced blocks).
- **JSON files:** `.json` opens in preview, pretty-printed and highlighted
  (invalid JSON shows the parse error and the raw text). **Format Document**
  (⇧⌥F) pretty-prints a JSON file.
- **Copy files to a remote machine:** drop files or folders onto the remote
  browser (⇧⌘O) to copy them into the folder it shows, over `scp` (your
  `~/.ssh/config` applies; binaries are fine).
- The remote browser has a copy button for the current folder's path, and
  shows the full path on hover. Copy buttons are now icons.
- Copying onto a remote folder asks before replacing items that already
  exist there.
- **Download from a remote machine:** right-click a file or folder in the
  remote browser → **Download…** (or just click a non-text file such as a zip,
  image or PDF). A save dialog picks the destination; Finder shows it when done.

### Changed
- **Open Remote…** (⇧⌘O) starts in the active remote document's folder. The
  host field is narrower so the path has room, and a breadcrumb row shows the
  full current folder (click a part to jump up).
- The remote browser's `~` (home) button is gone; type `~` in the path field.
- Open files in the sidebar show their host (or `local`) like Recent files.
- Recent files: the host label lines up on the right, and the ✕ appears in
  its place on hover instead of pushing it aside.
- Hovering an open or recent file shows its full path (`host:/path`).

### Fixed
- Sidebar ✕ tooltips (Close tab, Remove from recents) were cut off, and a
  tab's unsaved dot overlapped its ✕.
- Opening a recent file that was moved or deleted showed a raw `os error 2`;
  it now says the file isn't there and offers to remove it from Recents
  (local and remote).
- Clicking a link like `notes.md:33` in a document tried to open a file named
  `notes.md:33`; it now opens `notes.md` at line 33 (local and remote).
- Ticked task-list checkboxes were hard to see in dark mode (pale and dimmed);
  they're now solid blue with a white tick.
- A red "ResizeObserver loop completed with undelivered notifications" bar
  could appear while resizing; the wide-table check no longer triggers it.
- Dropping a non-text file (e.g. a `.tar.gz`) showed a raw UTF-8 error; it now
  explains how to copy it to a remote machine instead.
- Wide tables were squeezed into the text column (tall, narrow columns and a
  sideways scroll). A table wider than the text now uses the whole preview
  width, centred; tables that fit stay aligned with the text. Table cells are
  top-aligned.

## [0.5.0] — 2026-09-30

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
- Clicking a file several times while it was still loading (e.g. over a slow
  SSH connection) opened it in several tabs. It now opens once.
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

[0.17.4]: https://github.com/oztalha/md-viewer/releases/tag/v0.17.4
[0.17.3]: https://github.com/oztalha/md-viewer/releases/tag/v0.17.3
[0.17.2]: https://github.com/oztalha/md-viewer/releases/tag/v0.17.2
[0.17.1]: https://github.com/oztalha/md-viewer/releases/tag/v0.17.1
[0.17.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.17.0
[0.16.4]: https://github.com/oztalha/md-viewer/releases/tag/v0.16.4
[0.16.3]: https://github.com/oztalha/md-viewer/releases/tag/v0.16.3
[0.16.2]: https://github.com/oztalha/md-viewer/releases/tag/v0.16.2
[0.16.1]: https://github.com/oztalha/md-viewer/releases/tag/v0.16.1
[0.16.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.16.0
[0.15.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.15.0
[0.14.1]: https://github.com/oztalha/md-viewer/releases/tag/v0.14.1
[0.14.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.14.0
[0.13.1]: https://github.com/oztalha/md-viewer/releases/tag/v0.13.1
[0.13.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.13.0
[0.12.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.12.0
[0.11.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.11.0
[0.10.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.10.0
[0.9.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.9.0
[0.8.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.8.0
[0.7.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.7.0
[0.6.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.6.0
[0.5.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.5.0
[0.4.1]: https://github.com/oztalha/md-viewer/releases/tag/v0.4.1
[0.4.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.4.0
[0.3.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.3.0
[0.2.2]: https://github.com/oztalha/md-viewer/releases/tag/v0.2.2
[0.2.1]: https://github.com/oztalha/md-viewer/releases/tag/v0.2.1
[0.2.0]: https://github.com/oztalha/md-viewer/releases/tag/v0.2.0
[0.1.0]: https://github.com/MaxLeiter/md-viewer
