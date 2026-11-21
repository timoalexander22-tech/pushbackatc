#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    error::Error,
    fs::{self, File},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

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

fn main() {
    tauri::Builder::default()
        .manage(ChildProcesses::default())
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
