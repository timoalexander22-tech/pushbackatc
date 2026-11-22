#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    error::Error,
    env,
    fs::{self, File},
    io::Write,
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const APP_PORT: u16 = 4173;

#[derive(Default)]
struct ChildProcesses(Mutex<Vec<Child>>);

impl ChildProcesses {
    fn stop(&self) {
        let mut children = self.0.lock().unwrap_or_else(|error| error.into_inner());
        for child in children.iter_mut() {
            if let Err(error) = child.kill() {
                eprintln!("Could not stop child process: {error}");
            }
            if let Err(error) = child.wait() {
                eprintln!("Could not wait for child process: {error}");
            }
        }
        children.clear();
    }

    fn add(&self, child: Child) {
        self.0
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .push(child);
    }
}

impl Drop for ChildProcesses {
    fn drop(&mut self) {
        self.stop();
    }
}

fn spawn_logged(
    executable: &Path,
    args: &[&str],
    current_dir: &Path,
    log_dir: &Path,
    name: &str,
    env: &[(&str, &str)],
) -> Result<Child, Box<dyn Error>> {
    let output = File::create(log_dir.join(format!("{name}.log")))?;
    let error = output.try_clone()?;
    let mut command = Command::new(executable);
    command
        .args(args)
        .current_dir(current_dir)
        .stdout(Stdio::from(output))
        .stderr(Stdio::from(error));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    for (key, value) in env {
        command.env(key, value);
    }
    Ok(command.spawn()?)
}

fn wait_for_server(port: u16) -> Result<(), Box<dyn Error>> {
    let address = format!("127.0.0.1:{port}");
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if TcpStream::connect(&address).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(200));
    }
    Err(format!("The local application server did not start on {address}.").into())
}

fn start_desktop_services<R: tauri::Runtime>(
    app: &tauri::App<R>,
    resources: &Path,
    data_dir: &Path,
) -> Result<u16, Box<dyn Error>> {
    let logs = data_dir.join("logs");
    fs::create_dir_all(&logs)?;
    TcpListener::bind(("127.0.0.1", APP_PORT))?;
    let app_port_string = APP_PORT.to_string();

    let node = resources.join("runtime").join("node.exe");
    let app_root = resources.join("app");
    let server = app_root.join("server").join("index.mjs");
    let server_arg = server.to_string_lossy().into_owned();
    let node_child = spawn_logged(
        &node,
        &[server_arg.as_str()],
        &app_root,
        &logs,
        "app-server",
        &[
            ("NITRO_HOST", "127.0.0.1"),
            ("NITRO_PORT", app_port_string.as_str()),
        ],
    )?;
    app.state::<ChildProcesses>().add(node_child);

    let stt = resources.join("speech").join("stt").join("local-stt.exe");
    let hf_home = data_dir.join("models").to_string_lossy().into_owned();
    let stt_child = spawn_logged(
        &stt,
        &[],
        data_dir,
        &logs,
        "stt",
        &[
            ("VGC_LOCAL_STT_PORT", "8788"),
            ("HF_HOME", hf_home.as_str()),
        ],
    )?;
    app.state::<ChildProcesses>().add(stt_child);

    let tts = resources.join("speech").join("tts").join("local-tts.exe");
    let piper_data_dir = data_dir.join("voices").to_string_lossy().into_owned();
    let tts_child = spawn_logged(
        &tts,
        &[],
        data_dir,
        &logs,
        "tts",
        &[
            ("VGC_TTS_PORT", "5000"),
            ("VGC_PIPER_VOICE", "en_US-lessac-medium"),
            ("VGC_PIPER_DATA_DIR", piper_data_dir.as_str()),
        ],
    )?;
    app.state::<ChildProcesses>().add(tts_child);

    let companion = resources.join("companion");
    let companion_script = companion.join("index.js");
    let companion_script_arg = companion_script.to_string_lossy().into_owned();
    let companion_data_dir = data_dir.join("companion").to_string_lossy().into_owned();
    let companion_child = spawn_logged(
        &node,
        &[companion_script_arg.as_str()],
        &companion,
        &logs,
        "companion",
        &[("VGC_COMPANION_DATA_DIR", companion_data_dir.as_str())],
    )?;
    app.state::<ChildProcesses>().add(companion_child);

    wait_for_server(APP_PORT)?;
    Ok(APP_PORT)
}

fn app_data_dir<R: tauri::Runtime>(app: &tauri::App<R>) -> Result<PathBuf, Box<dyn Error>> {
    let path = app.path().app_data_dir()?;
    fs::create_dir_all(&path)?;
    Ok(path)
}

#[derive(Clone, Serialize, Deserialize)]
struct PluginInfo {
    id: String,
    name: String,
    version: String,
    author: String,
    description: String,
    entry_point: String,
    api_version: String,
    folder: String,
    error: Option<String>,
}

fn inspect_plugin_folder(folder: &Path) -> Option<PluginInfo> {
    let manifest_path = folder.join("plugin.json");
    if !manifest_path.is_file() {
        return None;
    }
    let raw = match fs::read_to_string(&manifest_path) {
        Ok(raw) => raw,
        Err(error) => {
            return Some(PluginInfo {
                id: folder.file_name()?.to_string_lossy().into_owned(),
                name: folder.file_name()?.to_string_lossy().into_owned(),
                version: "0.0.0".into(),
                author: "".into(),
                description: "".into(),
                entry_point: "".into(),
                api_version: "".into(),
                folder: folder.to_string_lossy().into_owned(),
                error: Some(format!("Manifest konnte nicht gelesen werden: {error}")),
            });
        }
    };
    let value: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(error) => {
            return Some(PluginInfo {
                id: folder.file_name()?.to_string_lossy().into_owned(),
                name: folder.file_name()?.to_string_lossy().into_owned(),
                version: "0.0.0".into(),
                author: "".into(),
                description: "".into(),
                entry_point: "".into(),
                api_version: "".into(),
                folder: folder.to_string_lossy().into_owned(),
                error: Some(format!("Manifest ist ungültig: {error}")),
            });
        }
    };
    let id = value["id"].as_str().unwrap_or("").to_string();
    let entry_point = value["entryPoint"].as_str().unwrap_or("").to_string();
    let mut errors = Vec::new();
    if id.is_empty() { errors.push("id fehlt".to_string()); }
    if entry_point.is_empty() { errors.push("entryPoint fehlt".to_string()); }
    if value["apiVersion"].as_str() != Some("1.0") {
        errors.push("API-Version 1.0 wird benötigt".to_string());
    }
    if !entry_point.is_empty() && !folder.join(&entry_point).is_file() {
        errors.push(format!("Entry-Point fehlt: {entry_point}"));
    }
    Some(PluginInfo {
        id: id.clone(),
        name: value["name"].as_str().unwrap_or(&id).to_string(),
        version: value["version"].as_str().unwrap_or("0.0.0").to_string(),
        author: value["author"].as_str().unwrap_or("Unbekannt").to_string(),
        description: value["description"].as_str().unwrap_or("").to_string(),
        entry_point,
        api_version: value["apiVersion"].as_str().unwrap_or("").to_string(),
        folder: folder.to_string_lossy().into_owned(),
        error: if errors.is_empty() { None } else { Some(errors.join("; ")) },
    })
}

#[tauri::command]
fn list_plugins(app: tauri::AppHandle) -> Result<Vec<PluginInfo>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let community = data_dir.join("community");
    fs::create_dir_all(&community).map_err(|e| e.to_string())?;
    let mut plugins = Vec::new();
    let mut roots = vec![community];
    if let Ok(resources) = app.path().resource_dir() {
        let bundled = resources.join("community");
        if bundled.is_dir() {
            roots.push(bundled);
        }
    }
    let mut seen_folders = std::collections::HashSet::new();
    for root in roots {
        if root.join("plugin.json").is_file() {
            if let Some(plugin) = inspect_plugin_folder(&root) {
                if seen_folders.insert(plugin.folder.clone()) { plugins.push(plugin); }
            }
        }
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(plugin) = inspect_plugin_folder(&path) {
                        if seen_folders.insert(plugin.folder.clone()) { plugins.push(plugin); }
                    }
                }
            }
        }
    }
    plugins.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(plugins)
}

#[tauri::command]
fn open_plugin_folder(app: tauri::AppHandle) -> Result<String, String> {
    let community = app.path().app_data_dir().map_err(|e| e.to_string())?.join("community");
    fs::create_dir_all(&community).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    Command::new("explorer")
        .arg(&community)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(community.to_string_lossy().into_owned())
}

#[tauri::command]
fn write_app_log(app: tauri::AppHandle, level: String, message: String) -> Result<(), String> {
    let logs = app.path().app_data_dir().map_err(|e| e.to_string())?.join("logs");
    fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs.join("application.log"))
        .map_err(|e| e.to_string())?;
    writeln!(file, "{} [{}] {}", chrono_now(), level.to_uppercase(), message)
        .map_err(|e| e.to_string())
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seconds = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!("epoch-{seconds}")
}

#[tauri::command]
fn backup_app_config(app: tauri::AppHandle, browser_config: String) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backup_dir = data_dir
        .join("backups")
        .join(format!("pre-update-{}", chrono_now()));
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    fs::write(
        backup_dir.join("browser-settings.json"),
        browser_config.as_bytes(),
    )
    .map_err(|e| e.to_string())?;
    let community = data_dir.join("community");
    if community.is_dir() {
        copy_directory(&community, &backup_dir.join("community"))?;
    }
    Ok(backup_dir.to_string_lossy().into_owned())
}

fn normalize_github_repository(repository: &str) -> Result<String, String> {
    let trimmed = repository.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("GitHub-Repository darf nicht leer sein.".to_string());
    }
    let candidate = if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        reqwest::Url::parse(trimmed)
            .map_err(|_| "Ungültige GitHub-Repository-Adresse.".to_string())?
            .host_str()
            .filter(|host| *host == "github.com")
            .map(|_| ())
            .ok_or_else(|| "Nur GitHub-Repositories werden unterstützt.".to_string())?;
        let url = reqwest::Url::parse(trimmed).unwrap();
        url.path()
            .trim_matches('/')
            .trim_end_matches(".git")
            .to_string()
    } else {
        trimmed
            .strip_prefix("github.com/")
            .unwrap_or(trimmed)
            .trim_end_matches(".git")
            .to_string()
    };
    let parts: Vec<&str> = candidate.split('/').filter(|part| !part.is_empty()).collect();
    if parts.len() != 2
        || parts.iter().any(|part| part.chars().any(|ch| ch.is_whitespace()))
    {
        return Err("Repository-Format: Besitzer/Repository oder vollständige GitHub-URL.".to_string());
    }
    Ok(format!("{}/{}", parts[0], parts[1]))
}

fn github_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .connect_timeout(Duration::from_secs(5))
        .user_agent("Virtual-Ground-Crew")
        .build()
        .map_err(|error| format!("GitHub-Client konnte nicht initialisiert werden: {error}"))
}

async fn github_get_with_retry(
    client: &reqwest::Client,
    url: &str,
    token: Option<&str>,
) -> Result<reqwest::Response, String> {
    let mut last_error = "GitHub-Anfrage fehlgeschlagen".to_string();
    for attempt in 0..=2 {
        let mut request = client
            .get(url)
            .header(reqwest::header::ACCEPT, "application/vnd.github+json")
            .header(reqwest::header::USER_AGENT, "Virtual-Ground-Crew")
            .header("X-GitHub-Api-Version", "2022-11-28");
        if let Some(token) = token {
            if !token.trim().is_empty() {
                request = request.bearer_auth(token.trim());
            }
        }
        match request.send().await {
            Ok(response) => {
                if response.status().is_success()
                    || !matches!(response.status().as_u16(), 429 | 500..=599)
                {
                    return Ok(response);
                }
                last_error = format!("GitHub-API HTTP {}", response.status().as_u16());
            }
            Err(error) => {
                last_error = format!("GitHub-Verbindung fehlgeschlagen: {error}");
            }
        }
        if attempt < 2 {
            thread::sleep(Duration::from_millis(300 * (attempt as u64 + 1)));
        }
    }
    Err(last_error)
}

#[tauri::command]
async fn test_github_connection(
    repository: String,
    branch: Option<String>,
) -> Result<serde_json::Value, String> {
    let repository = normalize_github_repository(&repository)?;
    let client = github_client()?;
    let token = env::var("VGC_GITHUB_TOKEN").ok();

    let repository_url = format!("https://api.github.com/repos/{repository}");
    let repository_response =
        match github_get_with_retry(&client, &repository_url, token.as_deref()).await {
            Ok(response) => response,
            Err(error) => {
                return Ok(serde_json::json!({
                    "success": false,
                    "repositoryReachable": false,
                    "authenticatedUser": null,
                    "repositoryId": null,
                    "defaultBranch": null,
                    "usedBranch": null,
                    "permissions": null,
                    "error": error,
                    "recommendedSolution": "Prüfen Sie Repository-Name, Netzwerk/Proxy und optional VGC_GITHUB_TOKEN."
                }));
            }
        };
    if !repository_response.status().is_success() {
        let status = repository_response.status();
        let (error, solution) = match status.as_u16() {
            404 => (
                "Repository nicht gefunden oder kein Zugriff.".to_string(),
                "Repository-Adresse und Token-Berechtigung (repo für private Repositorys) prüfen.",
            ),
            401 => (
                "GitHub-Authentifizierung fehlgeschlagen.".to_string(),
                "VGC_GITHUB_TOKEN ersetzen oder Ablauf des Tokens prüfen.",
            ),
            403 => (
                "GitHub-Zugriff verweigert oder Rate-Limit erreicht.".to_string(),
                "Token-Rechte und GitHub-API-Ratelimit prüfen.",
            ),
            code => (
                format!("GitHub-API HTTP {code}"),
                "GitHub-Service-Status und Netzwerkverbindung prüfen.",
            ),
        };
        return Ok(serde_json::json!({
            "success": false,
            "repositoryReachable": false,
            "authenticatedUser": null,
            "repositoryId": null,
            "defaultBranch": null,
            "usedBranch": null,
            "permissions": null,
            "error": error,
            "recommendedSolution": solution
        }));
    }
    let repository_data: serde_json::Value = repository_response
        .json()
        .await
        .map_err(|error| format!("GitHub-Repositorystatus konnte nicht gelesen werden: {error}"))?;
    let default_branch = repository_data
        .get("default_branch")
        .and_then(|value| value.as_str())
        .unwrap_or("main");
    let used_branch = branch
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default_branch.to_string());

    let mut authenticated_user: Option<String> = None;
    if token.as_deref().is_some_and(|value| !value.trim().is_empty()) {
        if let Ok(response) =
            github_get_with_retry(&client, "https://api.github.com/user", token.as_deref()).await
        {
            if response.status().is_success() {
                if let Ok(user) = response.json::<serde_json::Value>().await {
                    authenticated_user = user
                        .get("login")
                        .and_then(|value| value.as_str())
                        .map(str::to_string);
                }
            }
        }
    }

    let encoded_branch = used_branch.replace('/', "%2F");
    let branch_url =
        format!("https://api.github.com/repos/{repository}/branches/{encoded_branch}");
    let branch_response =
        github_get_with_retry(&client, &branch_url, token.as_deref()).await;
    let branch_reachable = matches!(&branch_response, Ok(response) if response.status().is_success());
    let error = if branch_reachable {
        None
    } else {
        match branch_response {
            Ok(response) => Some(format!(
                "Branch '{}' ist nicht erreichbar (HTTP {}).",
                used_branch,
                response.status().as_u16()
            )),
            Err(error) => Some(error),
        }
    };

    Ok(serde_json::json!({
        "success": error.is_none(),
        "repositoryReachable": true,
        "authenticatedUser": authenticated_user,
        "repositoryId": repository_data.get("id").and_then(|value| value.as_u64()),
        "defaultBranch": default_branch,
        "usedBranch": used_branch,
        "permissions": repository_data.get("permissions"),
        "error": error,
        "recommendedSolution": if branch_reachable {
            serde_json::Value::Null
        } else {
            serde_json::Value::String("Prüfen Sie den konfigurierten Branch-Namen und die Repository-Berechtigungen.".to_string())
        }
    }))
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url)
        .map_err(|_| "Ungültige externe Adresse.".to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("Nur HTTP- und HTTPS-Adressen werden unterstützt.".to_string());
    }

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler").arg(parsed.as_str());
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(parsed.as_str());
        command
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(parsed.as_str());
        command
    };

    command
        .spawn()
        .map_err(|error| format!("Externe Adresse konnte nicht geöffnet werden: {error}"))?;
    Ok(())
}

#[tauri::command]
fn open_microphone_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg("ms-settings:privacy-microphone")
            .spawn()
            .map_err(|error| {
                format!("Windows-Mikrofoneinstellungen konnten nicht geöffnet werden: {error}")
            })?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Diese Funktion ist nur unter Windows verfügbar.".to_string())
    }
}

#[tauri::command]
async fn check_latest_release(
    repository: String,
    channel: Option<String>,
) -> Result<serde_json::Value, String> {
    let repository = normalize_github_repository(&repository)?;
    let channel = channel.unwrap_or_else(|| "stable".to_string()).to_lowercase();
    if !matches!(channel.as_str(), "stable" | "beta" | "development") {
        return Err("Ungültiger Update-Kanal.".to_string());
    }
    let client = github_client()?;
    let token = env::var("VGC_GITHUB_TOKEN").ok();
    let url = if channel == "stable" {
        format!("https://api.github.com/repos/{repository}/releases/latest")
    } else {
        format!("https://api.github.com/repos/{repository}/releases?per_page=100")
    };
    let response = github_get_with_retry(&client, &url, token.as_deref())
        .await?;
    if !response.status().is_success() {
        return Err(format!(
            "GitHub-API HTTP {}",
            response.status().as_u16()
        ));
    }
    let release_payload: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("GitHub-Antwort konnte nicht gelesen werden: {error}"))?;
    let release = if channel == "stable" {
        release_payload
    } else {
        let releases = release_payload
            .as_array()
            .cloned()
            .unwrap_or_default();
        releases
            .into_iter()
            .find(|item| {
                if item
                    .get("draft")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false)
                {
                    return false;
                }
                let tag = item
                    .get("tag_name")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                if channel == "beta" {
                    tag.to_lowercase().contains("beta") || item
                        .get("prerelease")
                        .and_then(|value| value.as_bool())
                        .unwrap_or(false)
                } else {
                    true
                }
            })
            .unwrap_or(serde_json::Value::Null)
    };
    if release.is_null() {
        return Ok(serde_json::json!({ "release": null, "configured": true }));
    }
    let tag = release
        .get("tag_name")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let version = tag.trim().trim_start_matches('v');
    if release
        .get("draft")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
    {
        return Ok(serde_json::json!({ "release": null, "configured": true }));
    }
    let assets = release
        .get("assets")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|asset| {
                    Some(serde_json::json!({
                        "name": asset.get("name")?.as_str()?,
                        "browser_download_url": asset.get("browser_download_url")?.as_str()?,
                        "size": asset.get("size").and_then(|value| value.as_u64()).unwrap_or(0),
                    }))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(serde_json::json!({
        "release": {
            "version": version,
            "name": release.get("name").and_then(|value| value.as_str()).unwrap_or(tag),
            "notes": release.get("body").and_then(|value| value.as_str()).unwrap_or("Keine Änderungsbeschreibung veröffentlicht."),
            "pageUrl": release.get("html_url").and_then(|value| value.as_str()).unwrap_or(""),
            "publishedAt": release.get("published_at"),
            "assets": assets,
        },
        "configured": true
    }))
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let target = destination.join(entry.file_name());
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        if metadata.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn download_installer(
    app: tauri::AppHandle,
    url: String,
    sha256: Option<String>,
) -> Result<String, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Ungültige Download-Adresse".to_string())?;
    if parsed.scheme() != "https"
        || !matches!(
            parsed.host_str(),
            Some(host) if host == "github.com"
                || host.ends_with(".github.com")
                || host == "githubusercontent.com"
                || host.ends_with(".githubusercontent.com")
        )
    {
        return Err("Der Download stammt nicht von GitHub".to_string());
    }
    let file_name = parsed
        .path()
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or("Virtual-Ground-Crew-Update.exe");
    let download_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("updates");
    fs::create_dir_all(&download_dir).map_err(|e| e.to_string())?;
    let destination = download_dir.join(file_name);

    let response = reqwest::Client::new()
        .get(parsed)
        .send()
        .await
        .map_err(|e| format!("Download fehlgeschlagen: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("GitHub-Download HTTP {}", response.status()));
    }
    let total = response.content_length();
    let mut downloaded = 0u64;
    let mut hasher = Sha256::new();
    let mut file = File::create(&destination).map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        let percent = total.map(|size| if size == 0 { 0 } else { downloaded * 100 / size });
        let _ = app.emit("update-download-progress", serde_json::json!({
            "downloaded": downloaded,
            "total": total,
            "percent": percent
        }));
    }
    file.sync_all().map_err(|e| e.to_string())?;
    if let Some(expected) = sha256 {
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected.trim()) {
            let _ = fs::remove_file(&destination);
            return Err("SHA-256-Prüfsumme stimmt nicht überein".to_string());
        }
    }
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
fn run_installer(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let installer = PathBuf::from(path);
    if !installer.is_file() {
        return Err("Das heruntergeladene Update wurde nicht gefunden".to_string());
    }
    let extension = installer
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let result = if extension == "msi" {
        Command::new("msiexec")
            .args(["/i"])
            .arg(&installer)
            .arg("/norestart")
            .spawn()
    } else {
        Command::new(&installer)
            .arg("/S")
            .arg("/NCRC")
            .spawn()
    };
    result.map_err(|e| format!("Installer konnte nicht gestartet werden: {e}"))?;
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(750));
        app.state::<ChildProcesses>().stop();
        let _ = write_app_log(app.clone(), "info".to_string(), "Application shutdown: update installer started".to_string());
        app.exit(0);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalize_github_repository;

    #[test]
    fn normalizes_github_repository_formats() {
        assert_eq!(
            normalize_github_repository("timoalexander22-tech/pushbackatc").unwrap(),
            "timoalexander22-tech/pushbackatc"
        );
        assert_eq!(
            normalize_github_repository("https://github.com/timoalexander22-tech/pushbackatc.git")
                .unwrap(),
            "timoalexander22-tech/pushbackatc"
        );
    }

    #[test]
    fn rejects_invalid_github_repository_formats() {
        assert!(normalize_github_repository("").is_err());
        assert!(normalize_github_repository("pushbackatc").is_err());
        assert!(normalize_github_repository("https://example.com/owner/repository").is_err());
    }
}

fn main() {
    tauri::Builder::default()
        .manage(ChildProcesses::default())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle();
                app.state::<ChildProcesses>().stop();
                let _ = write_app_log(
                    app.clone(),
                    "info".to_string(),
                    "Application shutdown: main window closed".to_string(),
                );
                app.exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler!(
            list_plugins,
            open_plugin_folder,
            write_app_log,
            backup_app_config,
            open_external_url,
            open_microphone_settings,
            test_github_connection,
            check_latest_release,
            download_installer,
            run_installer
        ))
        .setup(|app| {
            let url = if cfg!(debug_assertions) {
                "http://localhost:5173".to_owned()
            } else {
                let resources = app.path().resource_dir()?;
                let data_dir = app_data_dir(app)?;
                let port = start_desktop_services(app, &resources, &data_dir)?;
                format!("http://127.0.0.1:{port}")
            };

            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse()?),
            )
            .title("Virtual Ground Crew")
            .inner_size(1280.0, 900.0)
            .min_inner_size(800.0, 600.0)
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Virtual Ground Crew");
}
