//! Password-protected pages on the publisher's own GitHub Pages: a public repo
//! `<login>/md-viewer-pages` holding pages the app encrypted (src/pageCrypt.ts),
//! named by random ids. GitHub only stores ciphertext. Passwords live in the
//! macOS Keychain so republishing keeps the same password without asking.

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
                "-f", "description=Encrypted pages published by md-viewer. Each page needs its password.",
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

#[derive(serde::Serialize)]
pub struct PublishedPage {
    id: String,
    url: String,
}

/// Upload an encrypted page (a file the frontend wrote) as `<id>.html`,
/// creating the repo on first use. The same id updates the same page.
#[tauri::command]
pub async fn publish_pages(file: String, id: String, account: Option<String>) -> Result<PublishedPage, String> {
    use base64::Engine;
    if !valid_id(&id) {
        return Err(format!("Invalid page id: {id:?}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let token = account_token(&account)?;
        let login = login(&token)?;
        let branch = ensure_repo(&token, &login)?;
        let path = format!("repos/{login}/{REPO}/contents/{id}.html");
        let sha = match api(&token, &[&path, "-f", &format!("ref={branch}"), "-X", "GET", "--jq", ".sha"]) {
            Ok(sha) => Some(sha),
            Err((true, _)) => None,
            Err((false, e)) => return Err(e),
        };
        let bytes = std::fs::read(&file).map_err(|e| format!("Could not read {file}: {e}"))?;
        // Generic message: nothing about the document goes into the repo.
        let mut body = serde_json::json!({
            "message": "Update page",
            "content": base64::engine::general_purpose::STANDARD.encode(bytes),
            "branch": branch,
        });
        if let Some(sha) = sha {
            body["sha"] = sha.into();
        }
        // Through a file: a page can be larger than a command line allows.
        let input = std::env::temp_dir().join(format!("md-viewer-pages-{id}.json"));
        std::fs::write(&input, body.to_string()).map_err(|e| e.to_string())?;
        let result = api_ok(&token, &["-X", "PUT", &path, "--input", &input.display().to_string(), "--jq", ".content.name"]);
        let _ = std::fs::remove_file(&input);
        result?;
        Ok(PublishedPage { url: page_url(&login, &id), id })
    })
    .await
    .map_err(|e| e.to_string())?
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
        assert_eq!(
            super::page_url("SenaOz", "ab"),
            "https://senaoz.github.io/md-viewer-pages/ab.html"
        );
    }
}
