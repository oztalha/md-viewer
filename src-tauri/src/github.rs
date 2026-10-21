//! GitHub as a read-only remote "host". A location is the host
//! `github:OWNER/REPO@REF` plus a path inside the repo (`/docs/notes.md`), so
//! the frontend's remote documents, browser, images and polling work unchanged.
//! Everything goes through the user's logged-in `gh` CLI (`gh api`), with
//! arguments passed as argv, never through a shell.

use crate::publish::base_command;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};

const PREFIX: &str = "github:";

pub const READ_ONLY: &str = "GitHub files are read-only in md-viewer. Use Save As… to keep a local copy.";

#[derive(Debug, PartialEq)]
pub struct Repo {
    owner: String,
    name: String,
    git_ref: String,
}

impl Repo {
    fn full_name(&self) -> String {
        format!("{}/{}", self.owner, self.name)
    }
}

pub fn is_github(host: &str) -> bool {
    host.starts_with(PREFIX)
}

fn valid_owner(s: &str) -> bool {
    !s.is_empty() && !s.starts_with('-') && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn valid_repo(s: &str) -> bool {
    !s.is_empty()
        && !s.starts_with('-')
        && s != "."
        && s != ".."
        && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

/// Git's own ref rules, roughly: nothing that could read as an option or
/// escape the URL path it's placed in.
fn valid_ref(s: &str) -> bool {
    !s.is_empty()
        && !s.starts_with('-')
        && !s.starts_with('/')
        && !s.ends_with('/')
        && !s.contains("..")
        && !s.contains("//")
        && s.chars().all(|c| !c.is_whitespace() && !c.is_control() && !"~^:?*[\\%#".contains(c))
}

/// `github:OWNER/REPO@REF` → its parts. Rejects anything malformed: the host
/// can arrive from an `mdviewer://` link.
pub fn parse_host(host: &str) -> Result<Repo, String> {
    let invalid = || format!("Invalid GitHub location: {host:?} (expected github:owner/repo@branch)");
    let rest = host.strip_prefix(PREFIX).ok_or_else(invalid)?;
    let (repo, git_ref) = rest.split_once('@').ok_or_else(invalid)?;
    let (owner, name) = repo.split_once('/').ok_or_else(invalid)?;
    if !valid_owner(owner) || !valid_repo(name) || !valid_ref(git_ref) {
        return Err(invalid());
    }
    Ok(Repo { owner: owner.into(), name: name.into(), git_ref: git_ref.into() })
}

fn encode(s: &str, keep_slash: bool) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-._~".contains(&b) || (keep_slash && b == b'/') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(b) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// A repo path as the browser sees it: absolute, no trailing slash. `~` (the
/// remote browser's "home") and "" are the repo root.
fn clean_path(path: &str) -> String {
    let trimmed = path.trim().trim_start_matches('~').trim_matches('/');
    format!("/{trimmed}")
}

fn contents_endpoint(repo: &Repo, path: &str) -> Result<String, String> {
    let rel = clean_path(path);
    let rel = rel.trim_start_matches('/');
    if rel.split('/').any(|seg| seg == "..") {
        return Err(format!("Invalid path: {path:?}"));
    }
    Ok(format!(
        "repos/{}/{}/contents/{}?ref={}",
        repo.owner,
        repo.name,
        encode(rel, true),
        encode(&repo.git_ref, false)
    ))
}

fn gh_run(args: &[&str], token: Option<&str>) -> Result<Vec<u8>, String> {
    let mut cmd = base_command("gh");
    cmd.arg("api").args(args).stdin(Stdio::null());
    if let Some(token) = token {
        cmd.env("GH_TOKEN", token);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("Could not run gh (install the GitHub CLI and run `gh auth login`): {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(output.stdout)
}

/// Logged-in gh accounts on github.com, as (login, active).
fn accounts() -> Vec<(String, bool)> {
    let Ok(out) = base_command("gh").args(["auth", "status", "--json", "hosts"]).stdin(Stdio::null()).output() else {
        return vec![];
    };
    let value: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap_or_default();
    value["hosts"]["github.com"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter(|a| a["state"] == "success")
                .filter_map(|a| Some((a["login"].as_str()?.to_string(), a["active"] == true)))
                .collect()
        })
        .unwrap_or_default()
}

/// Logged-in gh accounts other than the active one.
fn other_accounts() -> Vec<String> {
    accounts().into_iter().filter(|(_, active)| !active).map(|(login, _)| login).collect()
}

#[derive(serde::Serialize)]
pub struct Accounts {
    logins: Vec<String>,
    active: Option<String>,
}

/// The gh accounts to offer for publishing (e.g. which one owns a gist).
#[tauri::command]
pub async fn gh_accounts() -> Result<Accounts, String> {
    blocking(|| {
        let list = accounts();
        let active = list.iter().find(|(_, a)| *a).map(|(l, _)| l.clone());
        Ok(Accounts { logins: list.into_iter().map(|(l, _)| l).collect(), active })
    })
    .await
}

pub(crate) fn account_token(login: &str) -> Option<String> {
    static TOKENS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    let tokens = TOKENS.get_or_init(Default::default);
    if let Some(token) = tokens.lock().ok()?.get(login) {
        return Some(token.clone());
    }
    let out = base_command("gh")
        .args(["auth", "token", "--hostname", "github.com", "--user", login])
        .stdin(Stdio::null())
        .output()
        .ok()?;
    let token = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !out.status.success() || token.is_empty() {
        return None;
    }
    tokens.lock().ok()?.insert(login.to_string(), token.clone());
    Some(token)
}

/// `gh api` as a logged-in account that can see `repo` ("owner/name"): the
/// active one first, then the others, since GitHub answers 404 for a private
/// repo a token can't see. The account that worked is remembered per repo
/// (`None` = the active one), so later 404s are real ones.
fn gh_api(repo: &str, args: &[&str]) -> Result<Vec<u8>, String> {
    static WORKS: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    let works = WORKS.get_or_init(Default::default);
    let remembered = works.lock().map_err(|e| e.to_string())?.get(repo).cloned();
    let err = match &remembered {
        Some(Some(login)) => gh_run(args, account_token(login).as_deref()),
        _ => gh_run(args, None),
    };
    let err = match err {
        Ok(out) => {
            works.lock().map_err(|e| e.to_string())?.entry(repo.to_string()).or_insert(None);
            return Ok(out);
        }
        Err(err) => err,
    };
    if !err.contains("HTTP 404") || remembered.is_some() {
        return Err(err);
    }
    for login in other_accounts() {
        let Some(token) = account_token(&login) else { continue };
        if let Ok(out) = gh_run(args, Some(&token)) {
            works.lock().map_err(|e| e.to_string())?.insert(repo.to_string(), Some(login));
            return Ok(out);
        }
    }
    Err(format!(
        "{err}\nIf the repository is private, none of your gh accounts can see it. \
         Sign in with one that can: `gh auth login` (see `gh auth status`)."
    ))
}

fn raw(host: &str, path: &str) -> Result<Vec<u8>, String> {
    let repo = parse_host(host)?;
    let endpoint = contents_endpoint(&repo, path)?;
    gh_api(&repo.full_name(), &["-H", "Accept: application/vnd.github.raw", &endpoint])
        .map_err(|e| format!("Could not read {host}:{path}\n{e}"))
}

pub fn read(host: &str, path: &str) -> Result<String, String> {
    String::from_utf8(raw(host, path)?).map_err(|_| "File is not valid UTF-8".to_string())
}

pub fn read_bytes(host: &str, path: &str, limit: usize) -> Result<Vec<u8>, String> {
    let bytes = raw(host, path)?;
    if bytes.len() > limit {
        return Err(format!("{host}:{path} is larger than {} MB", limit / (1024 * 1024)));
    }
    Ok(bytes)
}

/// The file's blob sha: changes exactly when its content does.
pub fn stat(host: &str, path: &str) -> Result<String, String> {
    let repo = parse_host(host)?;
    let endpoint = contents_endpoint(&repo, path)?;
    let out = gh_api(&repo.full_name(), &[&endpoint, "--jq", ".sha"])?;
    Ok(String::from_utf8_lossy(&out).trim().to_string())
}

/// A folder's entries as (name, is_dir), with the cleaned folder path.
pub fn list(host: &str, path: &str) -> Result<(String, Vec<(String, bool)>), String> {
    let repo = parse_host(host)?;
    let endpoint = contents_endpoint(&repo, path)?;
    let out = gh_api(&repo.full_name(), &[&endpoint]).map_err(|e| format!("Could not list {host}:{path}\n{e}"))?;
    let value: serde_json::Value = serde_json::from_slice(&out).map_err(|e| e.to_string())?;
    let items = value.as_array().ok_or_else(|| format!("{path} is a file, not a folder"))?;
    let entries = items
        .iter()
        .filter_map(|item| {
            let name = item.get("name")?.as_str()?.to_string();
            match item.get("type")?.as_str()? {
                "dir" => Some((name, true)),
                "file" | "symlink" => Some((name, false)),
                _ => None, // submodules
            }
        })
        .collect();
    Ok((clean_path(path), entries))
}

/// The pieces of a github.com URL: owner, repo, "tree"/"blob" (or none), and
/// the segments after it (the ref, then the path — split where the ref ends
/// needs the API).
#[derive(Debug, PartialEq)]
struct UrlParts {
    owner: String,
    name: String,
    kind: Option<String>,
    rest: Vec<String>,
}

fn split_url(url: &str) -> Option<UrlParts> {
    let s = url.trim();
    let s = s.strip_prefix("https://").or_else(|| s.strip_prefix("http://")).unwrap_or(s);
    let s = s.strip_prefix("www.").unwrap_or(s);
    let s = s.strip_prefix("github.com/")?;
    let s = s.split(['?', '#']).next().unwrap_or("");
    let mut segs = s.split('/').filter(|p| !p.is_empty()).map(decode);
    let owner = segs.next()?;
    let name = segs.next()?.trim_end_matches(".git").to_string();
    let kind = segs.next();
    if let Some(k) = &kind {
        if k != "tree" && k != "blob" {
            return None;
        }
    }
    let rest: Vec<String> = segs.collect();
    if kind.is_some() && rest.is_empty() {
        return None;
    }
    Some(UrlParts { owner, name, kind, rest })
}

#[derive(serde::Serialize)]
pub struct Resolved {
    host: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

/// A github.com URL (repo, `tree/…` or `blob/…`) → a GitHub location. Branch
/// names can contain `/`, so the shortest prefix that names a commit is the
/// ref; git forbids both `a` and `a/b` as branches, so that's unambiguous.
pub fn resolve_url(url: &str) -> Result<Resolved, String> {
    let parts = split_url(url).ok_or_else(|| format!("Not a GitHub repository link: {url}"))?;
    if !valid_owner(&parts.owner) || !valid_repo(&parts.name) {
        return Err(format!("Not a GitHub repository link: {url}"));
    }
    let base = format!("repos/{}/{}", parts.owner, parts.name);
    let host = |git_ref: &str| format!("{PREFIX}{}/{}@{git_ref}", parts.owner, parts.name);

    // Also tells "no access" (private repo, wrong gh account) from "no such branch".
    let full_name = format!("{}/{}", parts.owner, parts.name);
    let out = gh_api(&full_name, &[&base, "--jq", ".default_branch"])
        .map_err(|e| format!("Could not open {}/{}\n{e}", parts.owner, parts.name))?;
    let Some(kind) = parts.kind else {
        let branch = String::from_utf8_lossy(&out).trim().to_string();
        parse_host(&host(&branch))?;
        return Ok(Resolved { host: host(&branch), path: "/".into(), is_dir: true });
    };

    let mut last_err = String::new();
    for i in 1..=parts.rest.len() {
        let git_ref = parts.rest[..i].join("/");
        if !valid_ref(&git_ref) {
            continue;
        }
        match gh_api(&full_name, &[&format!("{base}/commits/{}", encode(&git_ref, true)), "--jq", ".sha"]) {
            Ok(_) => {
                return Ok(Resolved {
                    host: host(&git_ref),
                    path: format!("/{}", parts.rest[i..].join("/")),
                    is_dir: kind == "tree",
                })
            }
            Err(e) => last_err = e,
        }
    }
    Err(format!("Could not find that branch in {}/{}\n{last_err}", parts.owner, parts.name))
}

/// Run a blocking GitHub call off the async runtime.
pub async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn github_resolve_url(url: String) -> Result<Resolved, String> {
    blocking(move || resolve_url(&url)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hosts() {
        assert_eq!(
            parse_host("github:oztalha/md-viewer@feat/x").unwrap(),
            Repo { owner: "oztalha".into(), name: "md-viewer".into(), git_ref: "feat/x".into() }
        );
        for bad in [
            "github:-o/r@main",
            "github:o/r",
            "github:o@main",
            "github:o/r@-x",
            "github:o/r@a..b",
            "github:o/r@a b",
            "github:o/..@main",
            "github:o/r@main?x=1",
            "o/r@main",
        ] {
            assert!(parse_host(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn builds_endpoints() {
        let repo = parse_host("github:o/r@feat/x").unwrap();
        assert_eq!(contents_endpoint(&repo, "~").unwrap(), "repos/o/r/contents/?ref=feat%2Fx");
        assert_eq!(
            contents_endpoint(&repo, "/docs/my notes.md").unwrap(),
            "repos/o/r/contents/docs/my%20notes.md?ref=feat%2Fx"
        );
        assert!(contents_endpoint(&repo, "/docs/../x").is_err());
    }

    #[test]
    fn splits_urls() {
        assert_eq!(
            split_url("https://github.com/oihs/front/tree/sis-sync/docs/sis?tab=x").unwrap(),
            UrlParts {
                owner: "oihs".into(),
                name: "front".into(),
                kind: Some("tree".into()),
                rest: vec!["sis-sync".into(), "docs".into(), "sis".into()],
            }
        );
        assert_eq!(split_url("github.com/o/r.git").unwrap().kind, None);
        assert_eq!(split_url("https://github.com/o/r/blob/main/a%20b.md").unwrap().rest[1], "a b.md");
        assert!(split_url("https://github.com/o/r/pulls").is_none());
        assert!(split_url("https://gitlab.com/o/r").is_none());
    }
}
