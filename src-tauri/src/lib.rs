use std::sync::Mutex;

mod publish;
mod watch;

use tauri::menu::{
    Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, State, Wry};

#[derive(serde::Deserialize)]
struct RecentItem {
    /// Open spec (local path or mdviewer:// URL) used as the menu item id suffix.
    spec: String,
    label: String,
}

/// Files the OS asked us to open before the frontend was ready to receive events.
#[derive(Default)]
struct PendingFiles {
    paths: Vec<String>,
    frontend_ready: bool,
}

struct AppState(Mutex<PendingFiles>);

/// Allow the asset protocol to serve files (images) from a document's folder.
/// The static asset scope is empty; access is granted per opened document
/// instead of blanket filesystem access.
fn allow_assets_near(app: &AppHandle, path: &str) {
    if let Some(parent) = std::path::Path::new(path).parent() {
        let _ = app.asset_protocol_scope().allow_directory(parent, true);
    }
}

#[tauri::command]
fn read_file(app: AppHandle, path: String) -> Result<String, String> {
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Could not read {path}: {e}"))?;
    allow_assets_near(&app, &path);
    Ok(contents)
}

#[tauri::command]
fn write_file(app: AppHandle, path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Could not write {path}: {e}"))?;
    allow_assets_near(&app, &path);
    Ok(())
}

/// Single-quote a path for a remote POSIX shell, leaving a leading `~/` (home)
/// unquoted so the remote shell still expands it.
fn shell_quote(path: &str) -> String {
    let quote = |s: &str| format!("'{}'", s.replace('\'', "'\\''"));
    if path == "~" {
        "~".to_string()
    } else if let Some(rest) = path.strip_prefix("~/") {
        format!("~/{}", quote(rest))
    } else {
        quote(path)
    }
}

/// Reject anything that isn't a plain `[user@]host` token. Critically this
/// blocks a leading `-`, which `ssh` would otherwise treat as an option
/// (e.g. `-oProxyCommand=…` = arbitrary command execution) — reachable via the
/// mdviewer:// URL scheme, so this is a hard gate, not just hygiene.
fn validate_host(host: &str) -> Result<(), String> {
    let ok = !host.is_empty()
        && !host.starts_with('-')
        && host.chars().all(|c| {
            c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '@' | ':' | '[' | ']')
        });
    if ok {
        Ok(())
    } else {
        Err(format!("Invalid SSH host: {host:?}"))
    }
}

fn ssh_base() -> std::process::Command {
    let mut cmd = std::process::Command::new("ssh");
    cmd.arg("-o").arg("ConnectTimeout=12").arg("-o").arg("BatchMode=yes");
    cmd
}

/// A cheap change signature for a remote file: modification time and size.
/// GNU `stat -c` first, BSD `stat -f` as the fallback (macOS remotes).
#[tauri::command]
async fn remote_stat(host: String, path: String) -> Result<String, String> {
    validate_host(&host)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let q = shell_quote(&path);
        let output = ssh_base()
            .arg("--")
            .arg(&host)
            .arg(format!("stat -c '%Y %s' -- {q} 2>/dev/null || stat -f '%m %z' -- {q}"))
            .output()
            .map_err(|e| format!("Could not run ssh: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Read a file from a remote host over SSH (`ssh HOST cat -- PATH`).
#[tauri::command]
async fn read_remote(host: String, path: String) -> Result<String, String> {
    validate_host(&host)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let output = ssh_base()
            // `--` ends ssh option parsing; the host can never be read as a flag.
            .arg("--")
            .arg(&host)
            .arg(format!("cat -- {}", shell_quote(&path)))
            .output()
            .map_err(|e| format!("Could not run ssh: {e}"))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "Could not read {host}:{path}\n{}",
                err.trim()
            ));
        }
        String::from_utf8(output.stdout).map_err(|_| "File is not valid UTF-8".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
struct RemoteEntry {
    name: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

#[derive(serde::Serialize)]
struct RemoteListing {
    /// Absolute, resolved directory (`~` expanded by the remote shell).
    dir: String,
    entries: Vec<RemoteEntry>,
}

/// List a remote directory over SSH, for the remote file browser. Prints the
/// resolved directory, then one entry per line; `ls -p` marks directories with
/// a trailing `/` and `-L` follows symlinks so linked folders browse as folders.
#[tauri::command]
async fn list_remote(host: String, path: String) -> Result<RemoteListing, String> {
    validate_host(&host)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<RemoteListing, String> {
        let q = shell_quote(if path.is_empty() { "~" } else { &path });
        let output = ssh_base()
            // `--` ends ssh option parsing; the host can never be read as a flag.
            .arg("--")
            .arg(&host)
            .arg(format!("cd -- {q} && pwd && {{ ls -1ApL 2>/dev/null || true; }}"))
            .output()
            .map_err(|e| format!("Could not run ssh: {e}"))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Could not list {host}:{path}\n{}", err.trim()));
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let mut lines = text.lines();
        let dir = lines.next().unwrap_or("/").to_string();
        let entries = lines
            .filter(|l| !l.is_empty())
            .map(|l| match l.strip_suffix('/') {
                Some(name) => RemoteEntry { name: name.to_string(), is_dir: true },
                None => RemoteEntry { name: l.to_string(), is_dir: false },
            })
            .collect();
        Ok(RemoteListing { dir, entries })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Copy local files or folders into a remote directory (drag-and-drop onto the
/// remote browser). Uses the system `scp`, so `~/.ssh/config` (aliases, keys,
/// ProxyCommand) applies, and binary files are fine.
#[tauri::command]
async fn upload_remote(host: String, local_paths: Vec<String>, dir: String) -> Result<(), String> {
    validate_host(&host)?;
    if local_paths.is_empty() {
        return Ok(());
    }
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let target = format!("{host}:{}/", dir.trim_end_matches('/'));
        let output = std::process::Command::new("/usr/bin/scp")
            .args(["-o", "ConnectTimeout=12", "-o", "BatchMode=yes", "-r", "-q", "--"])
            .args(&local_paths)
            .arg(&target)
            .output()
            .map_err(|e| format!("Could not run scp: {e}"))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Could not copy to {target}\n{}", err.trim()));
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Copy a remote file or folder to a local path the user picked in a save
/// dialog (so macOS grants access without a privacy prompt). `scp -r`.
#[tauri::command]
async fn download_remote(host: String, remote_path: String, local_path: String) -> Result<(), String> {
    validate_host(&host)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let source = format!("{host}:{remote_path}");
        let output = std::process::Command::new("/usr/bin/scp")
            .args(["-o", "ConnectTimeout=12", "-o", "BatchMode=yes", "-r", "-q", "--"])
            .arg(&source)
            .arg(&local_path)
            .output()
            .map_err(|e| format!("Could not run scp: {e}"))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Could not download {source}\n{}", err.trim()));
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Write a file to a remote host over SSH, atomically (temp file + mv).
#[tauri::command]
async fn write_remote(host: String, path: String, contents: String) -> Result<(), String> {
    use std::io::Write;
    use std::process::Stdio;

    validate_host(&host)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let q = shell_quote(&path);
        // Write to a sibling temp file, then atomically move it into place so a
        // dropped connection can't truncate the original. `mv --` guards against
        // a path that begins with `-`.
        let remote = format!("tmp={q}.mdtmp.$$; cat > \"$tmp\" && mv -f -- \"$tmp\" {q}");
        let mut child = ssh_base()
            // `--` ends ssh option parsing; the host can never be read as a flag.
            .arg("--")
            .arg(&host)
            .arg(remote)
            .stdin(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Could not run ssh: {e}"))?;

        child
            .stdin
            .take()
            .ok_or("Could not open ssh stdin")?
            .write_all(contents.as_bytes())
            .map_err(|e| e.to_string())?;

        let output = child
            .wait_with_output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Could not save {host}:{path}\n{}", err.trim()));
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Allow a single dropped/referenced image file to be served by the asset protocol.
#[tauri::command]
fn allow_asset(app: AppHandle, path: String) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_file(std::path::Path::new(&path))
        .map_err(|e| e.to_string())
}

/// Whether a local path exists (used to decide if a clicked file link is openable).
#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

/// Frontend startup errors land here so release builds (no devtools) are debuggable.
#[tauri::command]
fn log_error(message: String) {
    eprintln!("[frontend] {message}");
}

fn find_submenu_in(sub: &Submenu<Wry>, id: &str) -> Option<Submenu<Wry>> {
    for kind in sub.items().ok()? {
        if let Some(s) = kind.as_submenu() {
            if s.id().0 == id {
                return Some(s.clone());
            }
            if let Some(found) = find_submenu_in(s, id) {
                return Some(found);
            }
        }
    }
    None
}

fn find_submenu(menu: &Menu<Wry>, id: &str) -> Option<Submenu<Wry>> {
    for kind in menu.items().ok()? {
        if let Some(s) = kind.as_submenu() {
            if s.id().0 == id {
                return Some(s.clone());
            }
            if let Some(found) = find_submenu_in(s, id) {
                return Some(found);
            }
        }
    }
    None
}

/// Rebuild the File → Open Recent submenu from the frontend's recent list.
#[tauri::command]
fn set_recent_files(app: AppHandle, items: Vec<RecentItem>) -> Result<(), String> {
    let menu = app.menu().ok_or("application menu is not available")?;
    let submenu = find_submenu(&menu, "recent-menu").ok_or("recent menu not found")?;

    while let Ok(Some(_)) = submenu.remove_at(0) {}

    if items.is_empty() {
        let empty = MenuItemBuilder::with_id("recent-empty", "No Recent Files")
            .enabled(false)
            .build(&app)
            .map_err(|e| e.to_string())?;
        submenu.append(&empty).map_err(|e| e.to_string())?;
        return Ok(());
    }

    for item in &items {
        let entry = MenuItemBuilder::with_id(format!("recent:{}", item.spec), &item.label)
            .build(&app)
            .map_err(|e| e.to_string())?;
        submenu.append(&entry).map_err(|e| e.to_string())?;
    }
    submenu
        .append(&PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let clear = MenuItemBuilder::with_id("clear-recent", "Clear Menu")
        .build(&app)
        .map_err(|e| e.to_string())?;
    submenu.append(&clear).map_err(|e| e.to_string())?;
    Ok(())
}

fn find_menu_item(
    menu: &tauri::menu::Menu<tauri::Wry>,
    id: &str,
) -> Option<tauri::menu::MenuItem<tauri::Wry>> {
    if let Some(kind) = menu.get(id) {
        if let Some(item) = kind.as_menuitem() {
            return Some(item.clone());
        }
    }
    for kind in menu.items().ok()? {
        if let Some(submenu) = kind.as_submenu() {
            if let Some(found) = submenu.get(id) {
                if let Some(item) = found.as_menuitem() {
                    return Some(item.clone());
                }
            }
        }
    }
    None
}

/// Update menu item accelerators (configurable keybindings). An empty string
/// clears the accelerator.
#[tauri::command]
fn set_menu_accelerators(
    app: AppHandle,
    accelerators: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let Some(menu) = app.menu() else {
        return Err("application menu is not available".into());
    };
    for (id, accelerator) in accelerators {
        if let Some(item) = find_menu_item(&menu, &id) {
            let value: Option<&str> = if accelerator.is_empty() {
                None
            } else {
                Some(accelerator.as_str())
            };
            item.set_accelerator(value).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Called by the frontend once its event listeners are installed.
/// Returns any file paths that were requested before that point (Finder
/// "Open With", double-click on an associated file, CLI args).
#[tauri::command]
fn frontend_ready(state: State<'_, AppState>) -> Vec<String> {
    let mut pending = state.0.lock().unwrap();
    pending.frontend_ready = true;
    std::mem::take(&mut pending.paths)
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Make this app the default handler for Markdown files. Only meaningful for
/// the bundled release build (the dev binary has no registered bundle).
#[cfg(all(target_os = "macos", not(debug_assertions)))]
fn register_as_default_markdown_app() {
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
            handler_bundle_id: CFStringRef,
        ) -> i32;
        fn LSSetDefaultHandlerForURLScheme(
            url_scheme: CFStringRef,
            handler_bundle_id: CFStringRef,
        ) -> i32;
    }

    const ROLES_ALL: u32 = 0xFFFF_FFFF;
    let bundle_id = CFString::new("com.maxleiter.md-viewer");
    for uti in ["net.daringfireball.markdown", "public.markdown"] {
        let content_type = CFString::new(uti);
        unsafe {
            LSSetDefaultRoleHandlerForContentType(
                content_type.as_concrete_TypeRef(),
                ROLES_ALL,
                bundle_id.as_concrete_TypeRef(),
            );
        }
    }

    // Claim the mdviewer:// URL scheme (remote-file deep links).
    let scheme = CFString::new("mdviewer");
    unsafe {
        LSSetDefaultHandlerForURLScheme(
            scheme.as_concrete_TypeRef(),
            bundle_id.as_concrete_TypeRef(),
        );
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<()> {
    let app_menu = SubmenuBuilder::new(app, "Markdown")
        // Our own About window (not the predefined panel): macOS's native one
        // only shows plain text, so the project link couldn't be clickable.
        .item(&MenuItemBuilder::with_id("about", "About Markdown").build(app)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("settings", "Settings…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(
            &MenuItemBuilder::with_id("quit", "Quit Markdown")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?,
        )
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("new", "New")
                .accelerator("CmdOrCtrl+N")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open", "Open…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open-remote", "Open Remote…")
                .accelerator("Shift+CmdOrCtrl+O")
                .build(app)?,
        )
        .item(
            &SubmenuBuilder::with_id(app, "recent-menu", "Open Recent")
                .item(
                    &MenuItemBuilder::with_id("recent-empty", "No Recent Files")
                        .enabled(false)
                        .build(app)?,
                )
                .build()?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("save-as", "Save As…")
                .accelerator("Alt+CmdOrCtrl+S")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("save-remote", "Save to Remote…")
                .accelerator("Shift+CmdOrCtrl+S")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("publish", "Publish…")
                .accelerator("Shift+CmdOrCtrl+P")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open-published", "Open Published Page")
                .accelerator("Shift+CmdOrCtrl+L")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("export-html", "Export as HTML…")
                .accelerator("Shift+CmdOrCtrl+E")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("reload", "Reload")
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("close-pane", "Close Tab")
                .accelerator("CmdOrCtrl+W")
                .build(app)?,
        )
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .item(
            &MenuItemBuilder::with_id("paste-plain", "Paste and Match Style")
                .accelerator("Shift+Alt+CmdOrCtrl+V")
                .build(app)?,
        )
        // Custom (not the predefined item): the native selectAll does nothing when
        // no text field has focus — e.g. in preview mode. The frontend picks the
        // right target (input, editor, or rendered preview).
        .item(
            &MenuItemBuilder::with_id("select-all", "Select All")
                .accelerator("CmdOrCtrl+A")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("copy-path", "Copy Path")
                .accelerator("Shift+CmdOrCtrl+C")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("format", "Format Document")
                .accelerator("Shift+Alt+F")
                .build(app)?,
        )
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id("mode-editor", "Editor Only")
                .accelerator("Shift+CmdOrCtrl+7")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("mode-split", "Editor & Preview")
                .accelerator("Shift+CmdOrCtrl+8")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("mode-preview", "Preview Only")
                .accelerator("Shift+CmdOrCtrl+9")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("toggle-preview", "Toggle Editor / Preview")
                .accelerator("Shift+CmdOrCtrl+V")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("toggle-sidebar", "Toggle Sidebar")
                .accelerator("CmdOrCtrl+\\")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("show-files", "Files")
                .accelerator("Shift+CmdOrCtrl+F")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("toggle-outline", "Outline")
                .accelerator("Shift+CmdOrCtrl+0")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("toggle-line-numbers", "Line Numbers")
                .accelerator("Shift+CmdOrCtrl+N")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("zoom-in", "Zoom In")
                .accelerator("CmdOrCtrl+=")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("zoom-out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("zoom-reset", "Actual Size")
                .accelerator("CmdOrCtrl+0")
                .build(app)?,
        )
        .build()?;

    // Browser-style tab navigation.
    let tabs_menu = SubmenuBuilder::new(app, "Tabs")
        .item(
            &MenuItemBuilder::with_id("focus-next", "Next Tab")
                .accelerator("Ctrl+Tab")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("focus-prev", "Previous Tab")
                .accelerator("Ctrl+Shift+Tab")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("tab-next", "Select Next Tab")
                .accelerator("Shift+CmdOrCtrl+]")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("tab-prev", "Select Previous Tab")
                .accelerator("Shift+CmdOrCtrl+[")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("tab-1", "Tab 1")
                .accelerator("CmdOrCtrl+1")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("tab-2", "Tab 2")
                .accelerator("CmdOrCtrl+2")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("tab-3", "Tab 3")
                .accelerator("CmdOrCtrl+3")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("tab-4", "Tab 4")
                .accelerator("CmdOrCtrl+4")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("tab-5", "Tab 5")
                .accelerator("CmdOrCtrl+5")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("tab-6", "Tab 6")
                .accelerator("CmdOrCtrl+6")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("tab-7", "Tab 7")
                .accelerator("CmdOrCtrl+7")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("tab-8", "Tab 8")
                .accelerator("CmdOrCtrl+8")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("tab-9", "Tab 9")
                .accelerator("CmdOrCtrl+9")
                .build(app)?,
        )
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .item(&PredefinedMenuItem::maximize(app, Some("Zoom"))?)
        .separator()
        .fullscreen()
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("help-github", "md-viewer on GitHub").build(app)?)
        .item(&MenuItemBuilder::with_id("help-issue", "Report an Issue…").build(app)?)
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &tabs_menu,
            &window_menu,
            &help_menu,
        ])
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin: a second launch (e.g. `mdv file.md`)
        // forwards its file/remote args to the running window instead of
        // spawning another app instance.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let specs: Vec<String> = argv
                .into_iter()
                .skip(1)
                .filter(|a| !a.starts_with('-'))
                .collect();
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
            if !specs.is_empty() {
                let _ = app.emit("open-files", specs);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState(Mutex::new(PendingFiles::default())))
        .manage(publish::SessionState::default())
        .manage(watch::WatchState::default())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            read_remote,
            remote_stat,
            watch::watch_files,
            list_remote,
            upload_remote,
            download_remote,
            publish::publish_targets,
            publish::publish_edit_config,
            publish::publish_write_temp,
            publish::publish_mcp_open,
            publish::publish_mcp_call,
            publish::publish_mcp_close,
            publish::publish_gist,
            publish::publish_command,
            write_remote,
            allow_asset,
            path_exists,
            log_error,
            set_recent_files,
            set_menu_accelerators,
            frontend_ready,
            quit_app
        ])
        .setup(|app| {
            // Files passed as CLI arguments (e.g. `markdown notes.md`).
            let args: Vec<String> = std::env::args()
                .skip(1)
                .filter(|a| !a.starts_with('-'))
                .collect();
            if !args.is_empty() {
                let state: State<'_, AppState> = app.state();
                state.0.lock().unwrap().paths.extend(args);
            }
            // A menu failure (e.g. an accelerator the OS rejects) shouldn't
            // prevent the app from starting.
            if let Err(err) = build_menu(app.handle()) {
                eprintln!("failed to build application menu: {err}");
            }
            #[cfg(all(target_os = "macos", not(debug_assertions)))]
            register_as_default_markdown_app();
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().as_ref().to_string());
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS: files opened via Finder ("Open With", double-click) arrive
            // as Apple events, not CLI args.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                // File opens arrive as file:// URLs; mdviewer:// deep links
                // (remote files) pass through as their raw string for the
                // frontend to classify.
                let paths: Vec<String> = urls
                    .iter()
                    .map(|u| {
                        u.to_file_path()
                            .map(|p| p.to_string_lossy().into_owned())
                            .unwrap_or_else(|_| u.to_string())
                    })
                    .collect();
                if paths.is_empty() {
                    return;
                }
                let state: State<'_, AppState> = app.state();
                let mut pending = state.0.lock().unwrap();
                if pending.frontend_ready {
                    drop(pending);
                    let _ = app.emit("open-files", paths);
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.set_focus();
                    }
                } else {
                    pending.paths.extend(paths);
                }
            }
        });
}
