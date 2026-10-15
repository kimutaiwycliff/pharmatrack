fn main() {
    // ADR-015: declare the app's own IPC commands so Tauri generates
    // `allow-pt-*` permissions for them; capabilities/default.json grants only
    // these to the PharmaTrack page (hosted or the Offline Edition's local one).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["pt_list_printers", "pt_print", "pt_printer_status"]),
    ))
    .expect("failed to run tauri-build");
}
