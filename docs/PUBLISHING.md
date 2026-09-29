# Publishing

**File → Publish…** (⇧⌘P) sends the current document somewhere you can share
it, and copies the link. Publishing the same document to the same place again
**updates** it, so the link stays the same. The publish icon in the title bar
shows where a document is published, with clickable links.

Out of the box you can publish to a **GitHub Gist** (secret by default). It uses
your logged-in [`gh`](https://cli.github.com) CLI, so install it and run
`gh auth login` once.

Other places are added in a config file, `~/.config/md-viewer/publish.json`.
**Edit targets…** in the Publish dialog creates and opens it.

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
local (stdio) servers are supported. Commands are looked up on your login
shell's `PATH`, and `~` is expanded.

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
- A target can only call the tools listed in its own steps.
- Each tool call times out after two minutes. Errors from the server (e.g. an
  expired login) are shown in the dialog.
- Where a document was published is stored locally in the app, so publishing
  the same file from another Mac creates a new copy.
