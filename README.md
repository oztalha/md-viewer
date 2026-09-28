# md-viewer

A minimal, fast, native-feeling markdown editor/viewer for macOS. Tauri 2 + CodeMirror 6.

**Works on remote machines.** Browse, open, edit and save markdown on any host
you can `ssh` to — a dev box, a cloud desktop, the machine your coding agent
runs on — as if it were local. It uses your system `ssh`, so `~/.ssh/config`
aliases, keys, jump hosts and `ProxyCommand` just work. See
[Remote files](#remote-files).

![Remote files open as tabs, with the host shown in the title bar](docs/remote-tabs.png)

## Install (Apple Silicon)

Download the latest `Markdown_<version>_aarch64.dmg` from
[Releases](https://github.com/oztalha/md-viewer/releases), open it, and drag
**Markdown.app** to Applications.

The build is not code-signed, so macOS may refuse to open it ("damaged" or
"unidentified developer"). Clear the download quarantine once:

```sh
xattr -dr com.apple.quarantine /Applications/Markdown.app
```

Or build it yourself — see [Build](#build).

![Preview mode](docs/markdown-preview.png)

![Split editor/preview](docs/markdown-split.png)

- Semi-WYSIWYG editing: `**bold**` renders bold with the markers still visible
- Browser-style tabs: opening a file takes over the view as a tab; drag to reorder, ⌘1–9 to jump, ⌘N keycaps while ⌘ is held, plus a resizable sidebar listing open files
- Per-document editor / split / preview modes, with ⇧⌘V to flip editor ⇄ preview while keeping your place (anchored by source line)
- Incremental preview rendering (per-block caching + DOM patching) — stays smooth on large documents
- CSV/TSV table view, GitHub-style sanitized HTML, image drag-in
- Preview annotations: select text to highlight or attach a comment (saved per file)
- Click a relative file link in the preview to open it; Open Recent menu
- Format with Prettier (Edit → Format, or on save)
- Browse, open, edit and save files on remote hosts over SSH (see [Remote files](#remote-files)); reload with ⌘R, copy the path with ⌥⌘C
- Native menus, file associations, drag & drop, system light/dark

## Remote files

![Remote file browser](docs/remote-browser.png)

Open files on another host over SSH — handy for editing things a remote agent
(e.g. a dev box / homespace) produced, locally. Reads/writes shell out to your
system `ssh`, so `~/.ssh/config` aliases, keys, agent, and jump hosts all apply.
Saving writes back atomically (temp file + `mv`).

Ways to open a remote file:

- **File → Open Remote…** (⇧⌘O) opens a remote file browser: pick a host
  (any `~/.ssh/config` alias), click through folders, click a file to open it.
  You can also paste `host:/path/to/file.md` into its path bar.
- **CLI:** `mdv host:/path/to/file.md` (via the `mdv` launcher)
- **Deep link:** open `mdviewer://open?host=HOST&path=/abs/path` — clickable
  links route to the app (requires the installed/registered `.app`)

To save a document to a remote host (e.g. a new ⌘N file), use
**File → Save to Remote…** (⇧⌘S): the same browser, plus a filename field. The
document then becomes remote, so later ⌘S writes back over SSH. The browser
remembers your last host and, per host, the last folder.

**⌘R** reloads the document from disk or the remote host. **⌥⌘C** copies its
path — the bare path by default, or `host:/path` if you turn on *Copy path
includes host* in Settings. The title bar shows `host:` for remote documents.

Set a **default host** in Settings (⌘,) to omit it — then `:/path`,
`mdv :/path`, or `mdviewer://open?path=/abs/path` all use it.

For an agent on the remote box to hand you an openable link, have it print the
absolute path and either form:

```
mdviewer://open?host=<your-ssh-alias>&path=/abs/path/to/file.md
# or, if a default host is set:
mdv :/abs/path/to/file.md
```

## Develop

```sh
bun install
bun run tauri dev
```

## Build

```sh
bun run tauri build
# → src-tauri/target/release/bundle/macos/Markdown.app
```

## CLI launcher (`mdv`)

`scripts/mdv` runs the compiler-built release binary directly (building it from
source on first use), which avoids binary-authorization tools (e.g. Santa) that
block unsigned `.app` bundles but allow locally compiled binaries. Put it on
your `PATH`:

```sh
ln -s "$PWD/scripts/mdv" ~/bin/mdv      # or copy it into your dotfiles' bin/
mdv notes.md                            # open a local file
mdv coder.box:/home/me/plan.md          # open over SSH
```

Override the source location with `MDV_DIR`; force a rebuild with `mdv --rebuild`.

## Midnight Commander integration

Browse local and remote trees in Midnight Commander and open Markdown files in
md-viewer with a keypress (remote files open live over SSH). See
[docs/midnight-commander-integration.md](docs/midnight-commander-integration.md).

## Shortcuts

| Action | Keys |
| --- | --- |
| Settings | ⌘, |
| New / Open / Save | ⌘N / ⌘O / ⌘S |
| Save As… (local) | ⌥⌘S |
| Open Remote… / Save to Remote… | ⇧⌘O / ⇧⌘S |
| Reload | ⌘R |
| Copy path | ⌥⌘C |
| Export as HTML… | ⇧⌘E |
| Go to tab 1–9 | ⌘1 … ⌘9 |
| Next / previous tab | ⌃Tab / ⌃⇧Tab, or ⇧⌘] / ⇧⌘[ |
| Close tab | ⌘W |
| Editor · Split · Preview | ⌥⌘1 · ⌥⌘2 · ⌥⌘3 |
| Toggle editor ⇄ preview | ⇧⌘V |
| Toggle outline | ⌃⌘O |
| Select all | ⌘A |
| Paste and match style | ⌥⇧⌘V |
| Zoom in / out / reset | ⌘+ / ⌘− / ⌘0 |
| Bold / Italic / Code / Strike / Link | ⌘B / ⌘I / ⌘E / ⇧⌘X / ⌘K |
| Toggle task checkbox | ⌘↩ |
| Format document | ⇧⌥F |
| Next / previous table cell | Tab / ⇧Tab |

Most shortcuts are rebindable in Settings (⌘,).
