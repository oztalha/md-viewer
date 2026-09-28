# md-viewer

A fast, native-feeling markdown editor and viewer for macOS — **for files on
your Mac or on any machine you can `ssh` to.**

Open, edit and save markdown on a dev box, a cloud desktop, or the machine your
coding agent runs on, as if it were local. md-viewer uses your system `ssh`, so
your `~/.ssh/config` aliases, keys, jump hosts and `ProxyCommand` just work —
nothing to install on the remote side.

![Remote files open as tabs, with the host shown in the title bar](docs/remote-tabs.png)

## Install (Apple Silicon)

Download `Markdown_<version>_aarch64.dmg` from
[Releases](https://github.com/oztalha/md-viewer/releases), open it, and drag
**Markdown.app** to Applications. The app isn't code-signed yet, so clear the
download quarantine once:

```sh
xattr -dr com.apple.quarantine /Applications/Markdown.app
```

Or [build it yourself](#build-from-source). See [CHANGELOG.md](CHANGELOG.md)
for what's new in each version.

## Features

**Remote files over SSH**
- Browse a remote machine and open files with **Open Remote…** (⇧⌘O); save new
  or local documents to any host with **Save to Remote…** (⇧⌘S)
- Edits save straight back over SSH, atomically; **⌘R** reloads the latest version
- Open from the terminal (`mdv host:/path/file.md`) or a clickable
  `mdviewer://` link — handy when an agent on the remote box writes a report

**Tabs**
- Every file opens as a tab; drag to reorder, **⌘1–9** to jump, **⌃Tab** to cycle
- Resizable sidebar listing open files; the title bar shows `host:` for remote files

**Editing and preview**
- Editor, split, or preview per document; **⇧⌘V** flips between editor and
  preview and keeps your place
- Semi-WYSIWYG editing: `**bold**` renders bold with the markers still visible
- GitHub-flavored preview: tables, task lists, alerts, footnotes, highlighted
  code, images; CSV/TSV files open as tables
- Highlight passages and attach notes in the preview
- Format with Prettier, export to HTML, light and dark themes

![Editor and preview side by side](docs/editor-split.png)

## Remote files

![Remote file browser](docs/remote-browser.png)

**Open Remote…** (⇧⌘O) opens a file browser for a remote host. Type any host you
can `ssh` to (an alias from `~/.ssh/config` works), click through folders, and
click a file to open it. You can also paste `host:/path/to/file.md` into the path
bar. **Save to Remote…** (⇧⌘S) uses the same browser with a filename field; after
that the document is remote, so ⌘S writes back to that host. The browser
remembers your last host and the last folder on each host.

**⌥⌘C** copies the document's path — the bare path by default, or `host:/path`
if you turn on *Copy path includes host* in Settings.

Set a **default host** in Settings (⌘,) and you can leave the host out:
`mdv :/path/to/file.md` or `mdviewer://open?path=/abs/path`.

To have an agent on the remote box hand you a link it can open, print either:

```
mdviewer://open?host=<your-ssh-alias>&path=/abs/path/to/file.md
mdv <your-ssh-alias>:/abs/path/to/file.md
```

## Keyboard shortcuts

<details>
<summary>All shortcuts (most are rebindable in Settings, ⌘,)</summary>

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

</details>

## Command-line launcher (`mdv`)

`scripts/mdv` opens files from the terminal. It runs the locally compiled
release binary (building it on first use), which also works on machines where
binary-authorization tools such as Santa block unsigned `.app` bundles.

```sh
ln -s "$PWD/scripts/mdv" ~/bin/mdv      # put it on your PATH
mdv notes.md                            # open a local file
mdv devbox:/home/me/plan.md             # open over SSH
```

Override the source location with `MDV_DIR`; force a rebuild with `mdv --rebuild`.

## Midnight Commander integration

Browse local and remote trees in Midnight Commander and open markdown in
md-viewer with a keypress. See
[docs/midnight-commander-integration.md](docs/midnight-commander-integration.md).

## Build from source

Requires [Bun](https://bun.sh) and a Rust toolchain.

```sh
bun install
bun run tauri dev      # run in development
bun run tauri build    # → src-tauri/target/release/bundle/macos/Markdown.app (+ .dmg)
```

Built with Tauri 2 and CodeMirror 6.
