//! Publishing: send the current document to a "publish target" defined in
//! `~/.config/md-viewer/publish.json`.
//!
//! Targets come in three kinds:
//! - `mcp`: a sequence of tool calls on a local MCP server (stdio). The app
//!   only speaks the open MCP protocol, so service-specific details (which
//!   server, which tools, which arguments) live in the user's config file.
//! - `gist`: built in, via the user's logged-in `gh` CLI.
//! - `command`: a shell command that prints the published URL.
//!
//! Security: the webview never supplies commands. It names a target id; the
//! backend resolves the server/command from the config file itself, and MCP
//! tool calls are limited to the tools that target's steps list.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

const INIT_TIMEOUT: Duration = Duration::from_secs(30);
const CALL_TIMEOUT: Duration = Duration::from_secs(120);
const PROTOCOL_VERSION: &str = "2025-06-18";

// --- config ------------------------------------------------------------------

#[derive(Deserialize, Serialize, Clone, Default)]
struct ServerCfg {
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    env: HashMap<String, String>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct Step {
    tool: String,
    #[serde(default)]
    args: Value,
    #[serde(default)]
    save: HashMap<String, String>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct Target {
    id: String,
    label: String,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default, skip_serializing)]
    server: Option<String>,
    #[serde(default, skip_serializing)]
    command: Option<String>,
    #[serde(default)]
    create: Vec<Step>,
    #[serde(default)]
    update: Vec<Step>,
    #[serde(default, rename = "urlTemplate", skip_serializing_if = "Option::is_none")]
    url_template: Option<String>,
    #[serde(default)]
    public: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    format: Option<String>,
}

impl Target {
    fn kind(&self) -> &str {
        match self.kind.as_deref() {
            Some(k) => k,
            None if self.command.is_some() => "command",
            None => "mcp",
        }
    }
}

#[derive(Deserialize, Default)]
struct Config {
    /// Extra folders to search for commands, before the defaults.
    #[serde(default)]
    path: Vec<String>,
    #[serde(default)]
    servers: HashMap<String, ServerCfg>,
    #[serde(default)]
    targets: Vec<Target>,
}

fn config_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join(".config/md-viewer/publish.json")
}

/// Used when there's no config file yet: just the built-in gist target.
fn default_targets() -> Vec<Target> {
    vec![Target {
        id: "gist".into(),
        label: "GitHub Gist".into(),
        kind: Some("gist".into()),
        server: None,
        command: None,
        create: vec![],
        update: vec![],
        url_template: None,
        public: false,
        format: None,
    }]
}

fn load_config() -> Result<Config, String> {
    let path = config_path();
    match std::fs::read_to_string(&path) {
        Ok(text) => {
            let mut config = serde_json::from_str::<Config>(&text)
                .map_err(|e| format!("{} is not valid: {e}", path.display()))?;
            // Resolve the kind once so the frontend gets it explicitly.
            for t in &mut config.targets {
                t.kind = Some(t.kind().to_string());
            }
            Ok(config)
        }
        Err(_) => Ok(Config { path: vec![], servers: HashMap::new(), targets: default_targets() }),
    }
}

fn find_target(config: &Config, id: &str) -> Result<Target, String> {
    config
        .targets
        .iter()
        .find(|t| t.id == id)
        .cloned()
        .ok_or_else(|| format!("No publish target named {id:?} in {}", config_path().display()))
}

const STARTER_CONFIG: &str = r#"{
  "_readme": "Publish targets for md-viewer. Format: https://github.com/oztalha/md-viewer/blob/main/docs/PUBLISHING.md",
  "servers": {},
  "targets": [
    { "id": "gist", "label": "GitHub Gist", "kind": "gist", "public": false }
  ]
}
"#;

/// The targets (without commands) for the Publish dialog.
#[tauri::command]
pub fn publish_targets() -> Result<Vec<Target>, String> {
    Ok(load_config()?.targets)
}

/// Make sure the config file exists (writing a starter one if not) and open it
/// in the default text editor.
#[tauri::command]
pub fn publish_edit_config() -> Result<String, String> {
    let path = config_path();
    if !path.exists() {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, STARTER_CONFIG).map_err(|e| e.to_string())?;
    }
    Command::new("open")
        .arg("-t")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Could not open {}: {e}", path.display()))?;
    Ok(path.display().to_string())
}

/// Write the content to publish into a temp file whose name some services use
/// as the title / content type (e.g. `Notes.md`).
#[tauri::command]
pub fn publish_write_temp(name: String, contents: String) -> Result<String, String> {
    let safe: String = name
        .chars()
        .map(|c| if c == '/' || c == '\\' || c == ':' || c.is_control() { '-' } else { c })
        .collect();
    let dir = std::env::temp_dir().join("md-viewer-publish");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(if safe.trim().is_empty() { "document.md".to_string() } else { safe });
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

// --- environment -------------------------------------------------------------

/// PATH for finding tools. Apps launched from Finder get a minimal PATH, which
/// misses Homebrew and tools installed under your home directory.
///
/// Uses a *non-interactive* login shell (profile files, not ~/.zshrc): an
/// interactive startup runs commands, and zsh looks each one up along PATH, so
/// a PATH entry under e.g. ~/Downloads makes macOS prompt for Downloads access
/// on the app's behalf. Common per-user tool dirs are added explicitly instead.
fn login_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        // "path" from publish.json first, then common per-user tool dirs.
        let configured = load_config().map(|c| c.path).unwrap_or_default();
        let extras: Vec<String> = configured
            .iter()
            .map(|d| expand_home(d))
            .chain([".local/bin", ".cargo/bin", ".bun/bin"].iter().map(|d| format!("{home}/{d}")))
            .filter(|d| std::path::Path::new(d).is_dir())
            .collect();
        let fallback = format!(
            "{}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
            extras.join(":")
        );
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let out = Command::new(shell)
            .args(["-lc", "printf '__MDV__%s__MDV__' \"$PATH\""])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output();
        let found = out.ok().and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).to_string();
            let start = s.find("__MDV__")? + 7;
            let end = s[start..].find("__MDV__")? + start;
            Some(s[start..end].to_string())
        });
        let path = match found {
            Some(p) if !p.is_empty() => format!("{p}:{fallback}"),
            _ => fallback,
        };
        path.split(':').filter(|d| !is_protected_dir(d)).collect::<Vec<_>>().join(":")
    })
}

/// Folders macOS guards with a privacy prompt (TCC). Merely checking whether a
/// command exists in one of them (e.g. a PATH entry under ~/Downloads) makes
/// macOS ask the user to grant the app access, so they're left out of PATH.
fn is_protected_dir(dir: &str) -> bool {
    let home = std::env::var("HOME").unwrap_or_default();
    let dir = expand_home(dir);
    ["Downloads", "Desktop", "Documents", "Library/Mobile Documents"]
        .iter()
        .any(|p| {
            let root = format!("{home}/{p}");
            dir == root || dir.starts_with(&format!("{root}/"))
        })
}

fn expand_home(s: &str) -> String {
    match s.strip_prefix("~/") {
        Some(rest) => format!("{}/{rest}", std::env::var("HOME").unwrap_or_default()),
        None => s.to_string(),
    }
}

/// Resolve a bare command name against the login PATH.
fn resolve_command(cmd: &str) -> String {
    let cmd = expand_home(cmd);
    if cmd.contains('/') {
        return cmd;
    }
    for dir in login_path().split(':') {
        let candidate = PathBuf::from(expand_home(dir)).join(&cmd);
        if candidate.is_file() {
            return candidate.display().to_string();
        }
    }
    cmd
}

fn base_command(cmd: &str) -> Command {
    let mut c = Command::new(resolve_command(cmd));
    c.env("PATH", login_path());
    c
}

// --- MCP client --------------------------------------------------------------

struct Session {
    child: Child,
    stdin: ChildStdin,
    rx: Receiver<Value>,
    stderr: Arc<Mutex<VecDeque<String>>>,
    next_id: u64,
    allowed: HashSet<String>,
    label: String,
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Session {
    fn send(&mut self, msg: &Value) -> Result<(), String> {
        let line = serde_json::to_string(msg).map_err(|e| e.to_string())?;
        writeln!(self.stdin, "{line}")
            .and_then(|_| self.stdin.flush())
            .map_err(|e| self.failure(&format!("could not write to the server: {e}")))
    }

    fn failure(&self, what: &str) -> String {
        let tail: Vec<String> = self.stderr.lock().map(|q| q.iter().cloned().collect()).unwrap_or_default();
        if tail.is_empty() {
            format!("{}: {what}", self.label)
        } else {
            format!("{}: {what}\n{}", self.label, tail.join("\n"))
        }
    }

    /// Send a request and wait for its response, answering any requests the
    /// server makes of us in the meantime (we support none, so we decline).
    fn request(&mut self, method: &str, params: Value, timeout: Duration) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        self.send(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))?;
        let deadline = Instant::now() + timeout;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            let msg = match self.rx.recv_timeout(left) {
                Ok(m) => m,
                Err(RecvTimeoutError::Timeout) => {
                    return Err(self.failure(&format!("timed out waiting for {method}")))
                }
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(self.failure("the server exited unexpectedly"))
                }
            };
            if msg.get("method").is_some() {
                if let Some(req_id) = msg.get("id") {
                    let reply = json!({ "jsonrpc": "2.0", "id": req_id,
                        "error": { "code": -32601, "message": "Not supported by md-viewer" } });
                    self.send(&reply)?;
                }
                continue; // notifications (logging, progress) are ignored
            }
            if msg.get("id").and_then(Value::as_u64) != Some(id) {
                continue;
            }
            if let Some(err) = msg.get("error") {
                let text = err.get("message").and_then(Value::as_str).unwrap_or("unknown error");
                return Err(self.failure(text));
            }
            return Ok(msg.get("result").cloned().unwrap_or(Value::Null));
        }
    }
}

fn start_session(label: &str, server: &ServerCfg, allowed: HashSet<String>) -> Result<Session, String> {
    let mut child = base_command(&server.command)
        .args(&server.args)
        .envs(&server.env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{label}: could not start {:?}: {e}", server.command))?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr_pipe = child.stderr.take().ok_or("no stderr")?;

    let (tx, rx) = channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(v) = serde_json::from_str::<Value>(line.trim()) {
                if tx.send(v).is_err() {
                    break;
                }
            }
        }
    });
    // Keep the last few stderr lines for error messages (e.g. auth failures).
    let stderr = Arc::new(Mutex::new(VecDeque::new()));
    let sink = stderr.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr_pipe).lines().map_while(Result::ok) {
            if let Ok(mut q) = sink.lock() {
                q.push_back(line);
                if q.len() > 8 {
                    q.pop_front();
                }
            }
        }
    });

    let mut session = Session { child, stdin, rx, stderr, next_id: 1, allowed, label: label.to_string() };
    session.request(
        "initialize",
        json!({ "protocolVersion": PROTOCOL_VERSION, "capabilities": {},
                "clientInfo": { "name": "md-viewer", "version": env!("CARGO_PKG_VERSION") } }),
        INIT_TIMEOUT,
    )?;
    session.send(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }))?;
    Ok(session)
}

#[derive(Default)]
pub struct Sessions {
    next: u64,
    open: HashMap<u64, Session>,
}

pub type SessionState = Mutex<Sessions>;

/// Start the MCP server for a target; returns a session handle.
#[tauri::command]
pub async fn publish_mcp_open(
    state: tauri::State<'_, SessionState>,
    target_id: String,
) -> Result<u64, String> {
    let config = load_config()?;
    let target = find_target(&config, &target_id)?;
    let server_name = target.server.clone().ok_or_else(|| format!("{} has no \"server\"", target.label))?;
    let server = config
        .servers
        .get(&server_name)
        .cloned()
        .ok_or_else(|| format!("{}: no server named {server_name:?} under \"servers\"", target.label))?;
    let allowed = target.create.iter().chain(&target.update).map(|s| s.tool.clone()).collect();
    let label = target.label.clone();
    let session = tauri::async_runtime::spawn_blocking(move || start_session(&label, &server, allowed))
        .await
        .map_err(|e| e.to_string())??;
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.next += 1;
    let id = s.next;
    s.open.insert(id, session);
    Ok(id)
}

/// Call one tool in an open session. Returns the MCP `result` object.
#[tauri::command]
pub async fn publish_mcp_call(
    state: tauri::State<'_, SessionState>,
    session: u64,
    tool: String,
    args: Value,
) -> Result<Value, String> {
    let mut sess = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.open.remove(&session).ok_or("Publish session is closed")?
    };
    if !sess.allowed.contains(&tool) {
        return Err(format!("{}: tool {tool:?} isn't part of this target", sess.label));
    }
    let (sess, result) = tauri::async_runtime::spawn_blocking(move || {
        let r = sess.request("tools/call", json!({ "name": tool, "arguments": args }), CALL_TIMEOUT);
        (sess, r)
    })
    .await
    .map_err(|e| e.to_string())?;
    state.lock().map_err(|e| e.to_string())?.open.insert(session, sess);
    result
}

#[tauri::command]
pub fn publish_mcp_close(state: tauri::State<'_, SessionState>, session: u64) {
    if let Ok(mut s) = state.lock() {
        s.open.remove(&session); // Drop kills the server
    }
}

// --- gist and command targets ------------------------------------------------

#[derive(Serialize)]
pub struct Published {
    id: String,
    url: String,
}

fn first_url(text: &str) -> Option<String> {
    text.split_whitespace()
        .find(|w| w.starts_with("https://") || w.starts_with("http://"))
        .map(|w| w.trim_end_matches(|c: char| ",.;)\"'".contains(c)).to_string())
}

fn run(mut cmd: Command, what: &str) -> Result<String, String> {
    let out = cmd.stdin(Stdio::null()).output().map_err(|e| format!("Could not run {what}: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("{what} failed:\n{}", err.trim()));
    }
    Ok(stdout)
}

/// Create or update a gist with the file (uses the `gh` CLI's login).
#[tauri::command]
pub async fn publish_gist(
    target_id: String,
    file: String,
    title: String,
    existing: Option<String>,
) -> Result<Published, String> {
    let target = find_target(&load_config()?, &target_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let name = PathBuf::from(&file).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        if let Some(id) = existing {
            let mut cmd = base_command("gh");
            cmd.args(["gist", "edit", &id, "--filename", &name, &file]);
            run(cmd, "gh gist edit")?;
            return Ok(Published { url: format!("https://gist.github.com/{id}"), id });
        }
        let mut cmd = base_command("gh");
        cmd.args(["gist", "create", "--desc", &title]);
        if target.public {
            cmd.arg("--public");
        }
        cmd.arg(&file);
        let out = run(cmd, "gh gist create")?;
        let url = first_url(&out).ok_or("gh gist create didn't print a link")?;
        let id = url.rsplit('/').next().unwrap_or_default().to_string();
        Ok(Published { id, url })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Run a `command` target: `sh -c <command>` with MDV_FILE / MDV_TITLE /
/// MDV_ID in the environment (never interpolated into the command string).
#[tauri::command]
pub async fn publish_command(
    target_id: String,
    file: String,
    title: String,
    existing: Option<String>,
) -> Result<Published, String> {
    let target = find_target(&load_config()?, &target_id)?;
    let command = target.command.clone().ok_or_else(|| format!("{} has no \"command\"", target.label))?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = base_command("/bin/sh");
        cmd.args(["-c", &command])
            .env("MDV_FILE", &file)
            .env("MDV_TITLE", &title)
            .env("MDV_ID", existing.unwrap_or_default());
        let out = run(cmd, &target.label)?;
        let url = first_url(&out).ok_or_else(|| format!("{} didn't print a link", target.label))?;
        Ok(Published { id: url.clone(), url })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_first_url() {
        assert_eq!(first_url("Created https://gist.github.com/abc123.\n").as_deref(), Some("https://gist.github.com/abc123"));
        assert_eq!(first_url("no link here"), None);
    }

    #[test]
    fn skips_protected_dirs() {
        let home = std::env::var("HOME").unwrap();
        assert!(is_protected_dir(&format!("{home}/Downloads/apache-maven/bin")));
        assert!(is_protected_dir("~/Desktop"));
        assert!(!is_protected_dir(&format!("{home}/.local/bin")));
        assert!(!is_protected_dir(&format!("{home}/DownloadsX/bin")));
        assert!(!is_protected_dir("/opt/homebrew/bin"));
    }

    #[test]
    fn kind_defaults() {
        let t: Target = serde_json::from_str(r#"{"id":"a","label":"A","server":"s"}"#).unwrap();
        assert_eq!(t.kind(), "mcp");
        let t: Target = serde_json::from_str(r#"{"id":"a","label":"A","command":"x"}"#).unwrap();
        assert_eq!(t.kind(), "command");
    }
}
