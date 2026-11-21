fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "list_plugins",
                "open_plugin_folder",
                "write_app_log",
                "backup_app_config",
                "open_external_url",
                "check_latest_release",
                "download_installer",
                "run_installer",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
