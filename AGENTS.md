# AGENTS.md

Guidance for AI coding agents (and humans) working on md-viewer.

- **Read first:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), especially
  "Traps we hit". Publishing format: [docs/PUBLISHING.md](docs/PUBLISHING.md).
  Releases: [docs/RELEASING.md](docs/RELEASING.md).
- **Setup:** `bun install`. Run: `bun run tauri dev`. Build the app:
  `bun run tauri build`.
- **Before committing:** `bun run check` (typecheck + guardrail tests + Rust
  tests). CI runs the same on every push and PR.
- **Tests are guardrails, not coverage.** Add one only for a regression that
  actually happened or a cross-file invariant (see `test/`). Keep them fast and
  free of DOM/tauri dependencies; put testable logic in small pure modules.
- **Public repo:** never commit service-specific publish setups, internal
  hostnames or URLs. They belong in the user's `publish.json`; a test fails on
  common internal names.
- **Shortcuts:** change a default in both `src/settings.ts` (KEYBINDS) and
  `src-tauri/src/lib.rs` (menu). The keybinds test checks they match.
- **User-facing changes** go under `## [Unreleased]` in CHANGELOG.md; keep the
  README shortcut table current.
- **Style:** match the surrounding code; comments explain *why*, briefly.
