# Releasing

Releases are built and published by GitHub Actions
([`.github/workflows/release.yml`](../.github/workflows/release.yml)) when a
version tag is pushed. Nothing is built on your machine.

## Cut a release

1. Bump the version in all three places (they must match):
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml` (then run `cargo check` in `src-tauri/` so
     `Cargo.lock` picks it up)
2. Add a `## [X.Y.Z] — YYYY-MM-DD` section to [`CHANGELOG.md`](../CHANGELOG.md),
   plus its link at the bottom. This section becomes the release notes.
3. Commit, push, then tag and push the tag:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

4. Watch it in the **Actions** tab (or `gh run watch`). When it finishes, the
   release appears under **Releases** with two copies of the DMG:
   `Markdown_X.Y.Z_aarch64.dmg`, and `Markdown_aarch64.dmg`, the stable name
   the README's download link points at
   (`releases/latest/download/Markdown_aarch64.dmg`).

## What the workflow does

On a `v*` tag it runs on GitHub's Apple Silicon runner (`macos-14`):

1. Fails fast if the tag doesn't match the version in `tauri.conf.json`.
2. Installs Bun and Rust, then runs `bun run tauri build` (app + DMG).
3. Takes that version's section from `CHANGELOG.md`, appends install steps,
   and publishes a GitHub release with the DMG.

It builds for Apple Silicon only. The app isn't code-signed or notarized, which
is why the install steps include clearing the quarantine attribute.

## If it fails

Fix the problem, then move the tag to the fixed commit and push it again:

```sh
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
# commit + push the fix, then:
git tag vX.Y.Z
git push origin vX.Y.Z
```

If the release was already created (the failure was after publishing), delete
it first: `gh release delete vX.Y.Z --yes`.

## Cost

GitHub Actions is free for public repositories, macOS runners included. A
release build takes about 5–10 minutes.
