//! Pages on the publisher's own GitHub Pages: a public repo
//! `<login>/md-viewer-pages` holding pages named by random ids, either
//! encrypted by the app (src/pageCrypt.ts; GitHub only stores ciphertext) or
//! public, plus an optional `index.html` listing the pages the user chose
//! (src/pageIndex.ts). Passwords live in the macOS Keychain so republishing
//! keeps the same password without asking.

use crate::publish::{account_token, gh_as};
use std::process::{Command, Stdio};

const REPO: &str = "md-viewer-pages";
const KEYCHAIN_SERVICE: &str = "md-viewer pages";

/// Page ids are 128 random bits as lowercase hex (see `newPageId`).
fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

fn page_url(login: &str, id: &str) -> String {
    format!("https://{}.github.io/{REPO}/{id}.html", login.to_lowercase())
}

fn index_url(login: &str) -> String {
    format!("https://{}.github.io/{REPO}/", login.to_lowercase())
}

/// `gh api …` as the chosen account: Ok(stdout), or Err((is_404, message)).
fn api(token: &Option<String>, args: &[&str]) -> Result<String, (bool, String)> {
    let out = gh_as(token)
        .arg("api")
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| (false, format!("Could not run gh: {e}")))?;
    if out.status.success() {
        return Ok(String::from_utf8_lossy(&out.stdout).trim().to_string());
    }
    let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
    Err((err.contains("HTTP 404"), err))
}

fn api_ok(token: &Option<String>, args: &[&str]) -> Result<String, String> {
    api(token, args).map_err(|(_, e)| e)
}

fn login(token: &Option<String>) -> Result<String, String> {
    api_ok(token, &["user", "--jq", ".login"])
}

#[derive(serde::Serialize)]
pub struct PagesStatus {
    /// `login/md-viewer-pages`
    repo: String,
    exists: bool,
}

/// Whether the account already has its pages repo (the dialog says it'll be
/// created on first publish).
#[tauri::command]
pub async fn pages_status(account: Option<String>) -> Result<PagesStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = account_token(&account)?;
        let login = login(&token)?;
        let exists = match api(&token, &[&format!("repos/{login}/{REPO}"), "--jq", ".name"]) {
            Ok(_) => true,
            Err((true, _)) => false,
            Err((false, e)) => return Err(e),
        };
        Ok(PagesStatus { repo: format!("{login}/{REPO}"), exists })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
pub struct PageListing {
    id: String,
    url: String,
}

/// The protected pages in the account's repo, so pages published from an
/// unsaved document or another Mac still show up in Published Documents.
/// No repo yet: none.
#[tauri::command]
pub async fn pages_list(account: Option<String>) -> Result<Vec<PageListing>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = account_token(&account)?;
        let login = login(&token)?;
        let names = match api(&token, &[&format!("repos/{login}/{REPO}/contents"), "--jq", ".[].name"]) {
            Ok(names) => names,
            Err((true, _)) => return Ok(vec![]),
            Err((false, e)) => return Err(e),
        };
        Ok(names
            .lines()
            .filter_map(|name| name.strip_suffix(".html"))
            .filter(|id| valid_id(id))
            .map(|id| PageListing { id: id.to_string(), url: page_url(&login, id) })
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Create the repo (public: free GitHub Pages needs that; the content is
/// encrypted) and turn on Pages, if not done yet. Returns the default branch.
fn ensure_repo(token: &Option<String>, login: &str) -> Result<String, String> {
    let repo = format!("repos/{login}/{REPO}");
    let branch = match api(token, &[&repo, "--jq", ".default_branch"]) {
        Ok(branch) => branch,
        Err((true, _)) => api_ok(
            token,
            &[
                "-X", "POST", "user/repos",
                "-f", &format!("name={REPO}"),
                "-f", "description=Pages published by md-viewer.",
                "-F", "private=false",
                "-F", "auto_init=true",
                "-F", "has_issues=false",
                "-F", "has_wiki=false",
                "-F", "has_projects=false",
                "--jq", ".default_branch",
            ],
        )?,
        Err((false, e)) => return Err(e),
    };
    // Serve files as they are: skips Jekyll, so builds are quicker and fail less.
    if let Err((true, _)) = api(token, &[&format!("{repo}/contents/.nojekyll"), "--jq", ".name"]) {
        api_ok(
            token,
            &[
                "-X", "PUT", &format!("{repo}/contents/.nojekyll"),
                "-f", "message=Serve pages as they are",
                "-f", "content=",
                "-f", &format!("branch={branch}"),
                "--jq", ".content.name",
            ],
        )?;
    }
    match api(token, &[&format!("{repo}/pages"), "--jq", ".url"]) {
        Ok(_) => {}
        Err((true, _)) => {
            // A just-created repo can take a moment before Pages accepts it.
            let mut last = String::new();
            for attempt in 0..5 {
                if attempt > 0 {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                }
                match api(
                    token,
                    &[
                        "-X", "POST", &format!("{repo}/pages"),
                        "-f", &format!("source[branch]={branch}"),
                        "-f", "source[path]=/",
                    ],
                ) {
                    Ok(_) => return Ok(branch),
                    Err((_, e)) if e.contains("already enabled") || e.contains("HTTP 409") => return Ok(branch),
                    Err((_, e)) => last = e,
                }
            }
            return Err(format!("Could not turn on GitHub Pages for {login}/{REPO}:\n{last}"));
        }
        Err((false, e)) => return Err(e),
    }
    Ok(branch)
}

/// The blob sha of `name` on `branch`, or None if it doesn't exist yet.
fn file_sha(token: &Option<String>, login: &str, branch: &str, name: &str) -> Result<Option<String>, String> {
    let path = format!("repos/{login}/{REPO}/contents/{name}");
    match api(token, &[&path, "-f", &format!("ref={branch}"), "-X", "GET", "--jq", ".sha"]) {
        Ok(sha) => Ok(Some(sha)),
        Err((true, _)) => Ok(None),
        Err((false, e)) => Err(e),
    }
}

/// Create or replace `name` in the repo. A conflict (another Mac wrote it in
/// between) re-reads the sha and tries once more.
fn put_file(token: &Option<String>, login: &str, branch: &str, name: &str, bytes: &[u8]) -> Result<(), String> {
    use base64::Engine;
    let path = format!("repos/{login}/{REPO}/contents/{name}");
    let content = base64::engine::general_purpose::STANDARD.encode(bytes);
    let mut last = String::new();
    for _ in 0..2 {
        // Generic message: nothing about the document goes into the repo.
        let mut body = serde_json::json!({ "message": "Update page", "content": content, "branch": branch });
        if let Some(sha) = file_sha(token, login, branch, name)? {
            body["sha"] = sha.into();
        }
        // Through a file: a page can be larger than a command line allows.
        let input = std::env::temp_dir().join(format!("md-viewer-pages-{}.json", name.replace('.', "-")));
        std::fs::write(&input, body.to_string()).map_err(|e| e.to_string())?;
        let result = api(token, &["-X", "PUT", &path, "--input", &input.display().to_string(), "--jq", ".content.name"]);
        let _ = std::fs::remove_file(&input);
        match result {
            Ok(_) => return Ok(()),
            Err((_, e)) if e.contains("HTTP 409") => last = e,
            Err((_, e)) => return Err(e),
        }
    }
    Err(last)
}

#[derive(serde::Serialize)]
pub struct PublishedPage {
    id: String,
    url: String,
}

/// Upload a page (a file the frontend wrote, encrypted or not) as `<id>.html`,
/// creating the repo on first use. The same id updates the same page.
#[tauri::command]
pub async fn publish_pages(file: String, id: String, account: Option<String>) -> Result<PublishedPage, String> {
    if !valid_id(&id) {
        return Err(format!("Invalid page id: {id:?}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let token = account_token(&account)?;
        let login = login(&token)?;
        let branch = ensure_repo(&token, &login)?;
        let bytes = std::fs::read(&file).map_err(|e| format!("Could not read {file}: {e}"))?;
        put_file(&token, &login, &branch, &format!("{id}.html"), &bytes)?;
        Ok(PublishedPage { url: page_url(&login, &id), id })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
pub struct PagesIndex {
    /// The index page's link (`https://<login>.github.io/md-viewer-pages/`).
    url: String,
    /// The current index.html, or None if there's none yet.
    html: Option<String>,
}

/// The account's index page as it is in the repo now (not the possibly stale
/// copy GitHub Pages serves), so every Mac updates the same list.
#[tauri::command]
pub async fn pages_index_get(account: Option<String>) -> Result<PagesIndex, String> {
    use base64::Engine;
    tauri::async_runtime::spawn_blocking(move || {
        let token = account_token(&account)?;
        let login = login(&token)?;
        let url = index_url(&login);
        let branch = match api(&token, &[&format!("repos/{login}/{REPO}"), "--jq", ".default_branch"]) {
            Ok(branch) => branch,
            Err((true, _)) => return Ok(PagesIndex { url, html: None }),
            Err((false, e)) => return Err(e),
        };
        let path = format!("repos/{login}/{REPO}/contents/index.html");
        let encoded = match api(&token, &[&path, "-f", &format!("ref={branch}"), "-X", "GET", "--jq", ".content"]) {
            Ok(encoded) => encoded,
            Err((true, _)) => return Ok(PagesIndex { url, html: None }),
            Err((false, e)) => return Err(e),
        };
        // The API wraps base64 at 60 columns.
        let clean: String = encoded.chars().filter(|c| !c.is_whitespace()).collect();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(clean)
            .map_err(|e| format!("Could not read the index page: {e}"))?;
        let html = String::from_utf8(bytes).map_err(|e| format!("Could not read the index page: {e}"))?;
        Ok(PagesIndex { url, html: Some(html) })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Write the index page (a file the frontend built), creating the repo on
/// first use. Returns its link.
#[tauri::command]
pub async fn pages_index_put(file: String, account: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = account_token(&account)?;
        let login = login(&token)?;
        let branch = ensure_repo(&token, &login)?;
        let bytes = std::fs::read(&file).map_err(|e| format!("Could not read {file}: {e}"))?;
        put_file(&token, &login, &branch, "index.html", &bytes)?;
        Ok(index_url(&login))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Only links this module makes: `https://<login>.github.io/md-viewer-pages/<id>.html`.
fn valid_page_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let Some((host, path)) = rest.split_once('/') else { return false };
    let Some(login) = host.strip_suffix(".github.io") else { return false };
    let id = path.strip_prefix(&format!("{REPO}/")).and_then(|p| p.strip_suffix(".html"));
    !login.is_empty()
        && login.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && id.is_some_and(valid_id)
}

/// Whether GitHub Pages serves this publish yet: the page contains its
/// `marker` (the random salt), so an older version doesn't count. The query
/// string skips the CDN's cache. Redirects are followed (HTTPS only): with a
/// custom domain on the account, `<login>.github.io/...` answers with a 301.
#[tauri::command]
pub async fn pages_live(url: String, marker: String) -> Result<bool, String> {
    if !valid_page_url(&url) {
        return Err(format!("Not a protected-page link: {url}"));
    }
    if marker.is_empty() || !marker.chars().all(|c| c.is_ascii_alphanumeric() || "+/=".contains(c)) {
        return Err("Invalid marker".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        let out = Command::new("/usr/bin/curl")
            .args(["-s", "-L", "--max-redirs", "3", "--proto-redir", "=https", "--max-time", "10"])
            .args(["-H", "Cache-Control: no-cache", &format!("{url}?v={nonce}")])
            .stdin(Stdio::null())
            .output()
            .map_err(|e| format!("Could not run curl: {e}"))?;
        Ok(out.status.success() && String::from_utf8_lossy(&out.stdout).contains(&marker))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Delete a page (Unpublish) and forget its password. Already gone counts as
/// done. Git history keeps older encrypted versions; the docs say so.
#[tauri::command]
pub async fn pages_delete(id: String, account: Option<String>) -> Result<(), String> {
    if !valid_id(&id) {
        return Err(format!("Invalid page id: {id:?}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let token = account_token(&account)?;
        let login = login(&token)?;
        let repo = format!("repos/{login}/{REPO}");
        let branch = match api(&token, &[&repo, "--jq", ".default_branch"]) {
            Ok(branch) => branch,
            Err((true, _)) => return forget_password(&id),
            Err((false, e)) => return Err(e),
        };
        let path = format!("{repo}/contents/{id}.html");
        match api(&token, &[&path, "-f", &format!("ref={branch}"), "-X", "GET", "--jq", ".sha"]) {
            Ok(sha) => {
                api_ok(
                    &token,
                    &[
                        "-X", "DELETE", &path,
                        "-f", "message=Remove page",
                        "-f", &format!("sha={sha}"),
                        "-f", &format!("branch={branch}"),
                        "--jq", ".commit.sha",
                    ],
                )?;
            }
            Err((true, _)) => {}
            Err((false, e)) => return Err(e),
        }
        forget_password(&id)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn forget_password(id: &str) -> Result<(), String> {
    // Not found is fine: nothing to forget.
    let _ = security()
        .args(["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", id])
        .output()
        .map_err(|e| format!("Could not update the Keychain: {e}"))?;
    Ok(())
}

fn security() -> Command {
    let mut cmd = Command::new("/usr/bin/security");
    cmd.stdin(Stdio::null());
    cmd
}

/// The saved password for a page, if any.
#[tauri::command]
pub async fn pages_password_get(id: String) -> Result<Option<String>, String> {
    if !valid_id(&id) {
        return Err(format!("Invalid page id: {id:?}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let out = security()
            .args(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", &id, "-w"])
            .output()
            .map_err(|e| format!("Could not read the Keychain: {e}"))?;
        if !out.status.success() {
            return Ok(None); // not saved (or access denied): the dialog asks
        }
        Ok(Some(String::from_utf8_lossy(&out.stdout).trim_end_matches('\n').to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Save a page's password in the login Keychain. `security` takes it as an
/// argument; macOS only shows a process's arguments to the same user or root,
/// and the process exits at once.
#[tauri::command]
pub async fn pages_password_set(id: String, password: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err(format!("Invalid page id: {id:?}"));
    }
    if password.is_empty() || password.len() > 512 || password.chars().any(char::is_control) {
        return Err("That password can't be saved.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let out = security()
            .args([
                "add-generic-password", "-U",
                "-s", KEYCHAIN_SERVICE,
                "-a", &id,
                "-l", "md-viewer protected page",
                "-w", &password,
            ])
            .output()
            .map_err(|e| format!("Could not save to the Keychain: {e}"))?;
        if out.status.success() {
            Ok(())
        } else {
            Err(format!("Could not save to the Keychain: {}", String::from_utf8_lossy(&out.stderr).trim()))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    #[test]
    fn page_ids_and_urls() {
        assert!(super::valid_id("0123456789abcdef0123456789abcdef"));
        for bad in ["", "0123456789ABCDEF0123456789abcdef", "../../etc/passwd", "0123456789abcdef0123456789abcde"] {
            assert!(!super::valid_id(bad), "{bad}");
        }
        let id = "0123456789abcdef0123456789abcdef";
        assert!(super::valid_page_url(&super::page_url("SenaOz", id)));
        for bad in [
            "http://senaoz.github.io/md-viewer-pages/0123456789abcdef0123456789abcdef.html",
            "https://evil.example/md-viewer-pages/0123456789abcdef0123456789abcdef.html",
            "https://senaoz.github.io.evil.example/md-viewer-pages/0123456789abcdef0123456789abcdef.html",
            "https://senaoz.github.io/other/0123456789abcdef0123456789abcdef.html",
        ] {
            assert!(!super::valid_page_url(bad), "{bad}");
        }
        assert_eq!(
            super::page_url("SenaOz", "ab"),
            "https://senaoz.github.io/md-viewer-pages/ab.html"
        );
        assert_eq!(super::index_url("SenaOz"), "https://senaoz.github.io/md-viewer-pages/");
    }
}
