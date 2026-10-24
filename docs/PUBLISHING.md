# Publishing

**File → Publish…** (⇧⌘P) sends the current document somewhere you can share
it, and copies the link. From the keyboard: ⇧⌘P, Enter to publish, Enter
again to open the page (or ⌘↩ to open an existing link without publishing).
You can close the dialog while it publishes (or while GitHub Pages builds):
it carries on, and a small panel in the corner shows progress, then the link.
**⇧⌘L** opens a document's most recent published link straight away. Publishing the same document to the same place again
**updates** it, so the link stays the same. The publish icon in the title bar
shows where a document is published, with clickable links.

**Unpublish:** for a published document, the dialog's **Unpublish (delete
it)…** deletes the gist or GitHub Pages page (after a confirmation), so the link
stops working; a protected page's saved password is forgotten too. For other
targets md-viewer can't delete the copy, so **Forget this link…** only forgets
it here. Linked documents published along with it stay published.

**Linked documents:** when a document links to other local markdown files
(`[findings](FINDINGS.md)`, relative or absolute, on the same machine or the
same ssh host), the dialog offers to publish those too. They go first, each to
the same place (updating its earlier copy, so its link stays the same), and
the published document links to their pages instead of the local paths. Only
one hop: links inside the linked files are left as they are. Your file isn't
changed; only the published copy is.

**Keeping a GitHub document in sync:** for a document opened from a GitHub
repo (see *Remote files* in the README), the dialog offers *Keep in sync with
GitHub*. While md-viewer is open, it checks on launch and every five minutes,
and republishes the document when its file changed on GitHub, so the link
follows the repo whoever pushes. Linked documents aren't republished by sync;
links to ones already published to the same place point at their pages. If a
sync fails, the publish icon's dot turns red and its tooltip says why.
Limits: nothing syncs while the app is closed, and relative images in a
private repo won't load on the published page.

**GitHub Pages:** built in, nothing to set up beyond your `gh` login.
md-viewer renders the document and publishes it to your own GitHub Pages, with
a password (**Require a password**, on by default) or without.

*Without a password*, the page is plain HTML: anyone with the link can read
it, search engines may find it, and so can anyone looking through the public
repo `<you>/md-viewer-pages`, listed or not.

*Your index page*, `https://<you>.github.io/md-viewer-pages/`, lists the pages
you choose: **Show on my index page** is on by default for pages without a
password and off for protected ones. A listed protected page shows its title
with a lock; reading it still needs the password. Each publish updates the
index from the copy in the repo, so it stays one list when you publish from
more than one Mac; unpublishing a listed page takes it off. Linked documents
published along with a page aren't added to the index. If the index can't be
updated, the page is still published and the dialog says why.

*With a password*, md-viewer **encrypts the page in the app** and publishes
only the encrypted page. Readers open the link, type the password, and read
the page; they need no account.
- The password is filled in with a strong generated one (**Show**, **New**,
  copy). Send it to readers separately from the link.
- The first publish creates a public repo `<you>/md-viewer-pages` and turns on
  GitHub Pages. It's public because free GitHub Pages needs that; pages get
  random names, and commit messages say nothing about the document. A new page
  is live about a minute later. (Repos created by md-viewer before public pages
  existed keep the description "Encrypted pages…"; edit it on GitHub if you
  publish public pages there.)
- The password is kept in your macOS Keychain, so updating (or syncing a
  GitHub document) keeps the same link and password without asking. Typing a
  different password before **Update** changes it; send readers the new one.
- Readers are asked once per device: *Remember on this device* (on by
  default) keeps the page's key, not the password, in that browser, so later
  visits open straight away, also after you update the page. Changing the
  password locks out every remembered device.
- The page follows the reader's light or dark mode; the toggle in its corner
  picks one, and the password prompt remembers it too.
- Encryption: PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM, a salt fixed
  per page (from its random id) and a fresh IV every publish, decrypted in the reader's browser with no external
  scripts. Passwords need at least 12 characters, since anyone can download
  the encrypted page and try passwords offline.
- Limits: anyone with the link and the password can read the page, and you
  can't shut out one person (change the password instead). Older encrypted
  versions stay in the repo's git history. Browsers treat all of
  `<you>.github.io` as one site, so another GitHub Pages site of yours that
  runs scripts could read keys remembered for these pages.

Out of the box you can publish to a **GitHub Gist** (secret by default). It uses
your logged-in [`gh`](https://cli.github.com) CLI, so install it and run
`gh auth login` once. If you're logged in to several GitHub accounts, the
dialog's **Account** menu picks which one owns a new gist (default: the one
you used last, else gh's active account). Updates always use the account that
created the gist, since only it can change it.

Other places are added in a config file, `~/.config/md-viewer/publish.json`.
**Edit targets…** in the Publish dialog edits it in the app: pick a target to
change it, or **+ Add a target** to start from an example (secret or public
gist, your web server over `scp`, a rendered HTML page, cloud storage with
`rclone`, an MCP server). **Open JSON file…** there opens the file itself.

## The config file

```json
{
  "servers": {
    "notes": { "command": "notes-mcp", "args": [], "env": {} }
  },
  "targets": [
    {
      "id": "notes",
      "label": "Team Notes",
      "server": "notes",
      "create": [
        { "tool": "create_page",
          "args": { "title": "{title}", "markdown": "{content}" },
          "save": { "id": "page.id", "url": "page.url" } }
      ],
      "update": [
        { "tool": "update_page",
          "args": { "id": "{id}", "markdown": "{content}" } }
      ],
      "urlTemplate": "https://notes.example.com/p/{id}"
    },
    { "id": "gist", "label": "GitHub Gist", "kind": "gist", "public": false },
    { "id": "share", "label": "My upload script", "command": "my-upload \"$MDV_FILE\"" }
  ]
}
```

### `servers`

MCP servers that md-viewer can start, in the same shape as the `mcpServers`
entries in Claude or Kiro config: `command`, optional `args` and `env`. Only
local (stdio) servers are supported. `~` is expanded, and bare command names
are looked up in the top-level `"path"` list (e.g. `"path": ["~/tools/bin"]`),
then the `PATH` your login shell's profile files set (`~/.zprofile` and friends,
not `~/.zshrc`), then `~/.local/bin`, `~/.cargo/bin`, `~/.bun/bin` and Homebrew.
If a tool is only on your `PATH` through `~/.zshrc`, add its folder to `"path"`
or give its full path as `command`. Folders under
Downloads, Desktop, Documents and iCloud Drive are skipped, so macOS never asks
to grant the app access to them.

### `targets`

Each target has an `id` (used to remember where a document was published), a
`label` for the menu, and one of three kinds:

**MCP (`server`)**: a list of tool calls.
- `create` runs the first time a document is published to this target;
  `update` runs after that. With no `update` steps, every publish creates a new
  copy. The dialog also has *Publish as a new copy*.
- In `args`, these placeholders are filled in:
  - `{file}`: path to a temporary file holding the document (unsaved edits
    included). Its name is `<title>.md`.
  - `{content}`: the document text.
  - `{title}`: the document title, without the extension.
  - `{id}`: the id saved from the first publish (in `update`).
  - Anything an earlier step saved.
- `save` picks values out of a tool's reply (its structured content, or the JSON
  in its text) by dotted path, e.g. `"page.id"`. Two names are special: `id`
  identifies the published document, and `url` is the link.
- `urlTemplate` builds the link from saved values (e.g. `{id}`) when the reply
  doesn't include one. The link from the first publish is kept on updates.
- A step can be `{ "command": "..." }` instead of a tool call, for things the
  server has no tool for (e.g. turning on link sharing after `create`). It runs
  with `sh -c`, with every value so far in the environment as `MDV_<NAME>`
  (`MDV_ID`, `MDV_URL`, `MDV_FILE`, `MDV_TITLE`, …; not `content`, which is in
  `MDV_FILE`). If it prints JSON, `save` can pick from it; a failing command
  stops the publish and shows its error.

**`"kind": "gist"`**: a GitHub Gist via `gh`. `"public": true` makes new gists
public.

**`command`**: a shell command that prints the published link. The document
path, title and saved id are passed as the environment variables `MDV_FILE`,
`MDV_TITLE` and `MDV_ID` (never pasted into the command string). The first
`https://` link in its output is used.

Add `"format": "html"` to any target to publish the rendered HTML (like
Export as HTML) instead of the markdown.

## Safety

- Only commands and servers from this file ever run. Documents, links and
  remote files can't supply them.
- Password-protected pages are encrypted before they leave the app; GitHub
  only stores ciphertext, and the password stays in your Keychain. Their
  titles reach GitHub only if you list them on your index page.
- Saving a new or changed command or MCP server from Edit targets… asks first
  in a native macOS dialog that lists exactly what will run; the app's web
  view can't show or answer that dialog itself.
- A target can only call the tools listed in its own steps.
- Each tool call times out after two minutes. Errors from the server (e.g. an
  expired login) are shown in the dialog.
- Where a document was published is stored locally in the app, so publishing
  the same file from another Mac creates a new copy.
