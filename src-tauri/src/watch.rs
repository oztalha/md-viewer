//! Auto-reload support: tell the webview when an open file changes on disk.
//!
//! Local files are watched with the OS (FSEvents on macOS), no polling. We watch
//! each open file's *folder*, not the file: many editors and agents save by
//! writing a temp file and renaming it over the original, which replaces the
//! file a direct watch would be attached to. The webview decides what a change
//! means (it compares the new text with the editor's, so our own saves are
//! ignored there).
//!
//! Remote files have no change events over plain ssh, so the webview polls
//! `remote_stat` for the visible tab only.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatchState(Mutex<Inner>);

#[derive(Default)]
struct Inner {
    watcher: Option<RecommendedWatcher>,
    /// The open files themselves; events for anything else in a watched
    /// folder (logs, build output, …) are dropped before reaching the webview.
    /// Keyed by canonical path (FSEvents reports `/private/tmp/…` for `/tmp/…`),
    /// valued by the path the webview knows the document by.
    files: Arc<Mutex<HashMap<PathBuf, String>>>,
    /// Watched folder -> open files in it.
    dirs: HashMap<PathBuf, HashSet<PathBuf>>,
}

fn make_watcher(app: AppHandle, files: Arc<Mutex<HashMap<PathBuf, String>>>) -> Result<RecommendedWatcher, String> {
    notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
            return;
        }
        let Ok(files) = files.lock() else { return };
        for original in event.paths.iter().filter_map(|p| files.get(p)) {
            let _ = app.emit("file-changed", original.clone());
        }
    })
    .map_err(|e| format!("Could not watch files: {e}"))
}

/// Watch exactly these local files (replaces the previous set).
#[tauri::command]
pub fn watch_files(app: AppHandle, state: State<'_, WatchState>, paths: Vec<String>) -> Result<(), String> {
    let mut inner = state.0.lock().map_err(|_| "watch state poisoned".to_string())?;
    if inner.watcher.is_none() {
        inner.watcher = Some(make_watcher(app, inner.files.clone())?);
    }

    let mut wanted: HashMap<PathBuf, HashSet<PathBuf>> = HashMap::new();
    let mut names: HashMap<PathBuf, String> = HashMap::new();
    for p in paths {
        let Ok(file) = std::fs::canonicalize(&p) else { continue }; // gone: skip
        if let Some(dir) = file.parent() {
            wanted.entry(dir.to_path_buf()).or_default().insert(file.clone());
            names.insert(file, p);
        }
    }

    *inner.files.lock().map_err(|_| "watch state poisoned".to_string())? = names;
    let Inner { watcher, dirs, .. } = &mut *inner;
    let watcher = watcher.as_mut().expect("watcher created above");
    for dir in dirs.keys().filter(|d| !wanted.contains_key(*d)).cloned().collect::<Vec<_>>() {
        let _ = watcher.unwatch(&dir);
        dirs.remove(&dir);
    }
    for (dir, files) in wanted {
        if !dirs.contains_key(&dir) && watcher.watch(Path::new(&dir), RecursiveMode::NonRecursive).is_err() {
            continue; // folder gone or unreadable: nothing to watch
        }
        dirs.insert(dir, files);
    }
    Ok(())
}
