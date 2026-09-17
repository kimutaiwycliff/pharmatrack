use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

#[cfg(not(feature = "offline-edition"))]
use tauri::WindowEvent;
#[cfg(not(feature = "offline-edition"))]
use tauri_plugin_updater::UpdaterExt;

// ADR-014 — Offline Edition build only (bundled local Postgres + Next.js
// server instead of the hosted SaaS URL). Compiled in only with
// `--features offline-edition`; absent from the ordinary SaaS build.
#[cfg(feature = "offline-edition")]
mod offline;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // Must be registered before any other plugin so a second launch is
        // caught immediately and just focuses the existing till window —
        // doubly important for the offline-edition build, where a second
        // instance would otherwise also try to start a second local
        // Postgres against the same data directory.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    #[cfg(feature = "offline-edition")]
    {
        builder = builder
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_dialog::init())
            .manage(offline::OfflineProcesses::default());
    }

    builder
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_window_state::Builder::default().build())?;

                // Offline Edition never phones home for updates — a new
                // version is a manually-delivered installer, not a silent
                // background check against the hosted SaaS domain.
                #[cfg(not(feature = "offline-edition"))]
                {
                    app.handle()
                        .plugin(tauri_plugin_updater::Builder::new().build())?;
                    let handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        check_for_update(handle).await;
                    });
                }

                let open_item =
                    MenuItem::with_id(app, "open", "Open PharmaTrack", true, None::<&str>)?;
                let quit_item =
                    MenuItem::with_id(app, "quit", "Quit PharmaTrack", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .show_menu_on_left_click(true)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "quit" => {
                            #[cfg(feature = "offline-edition")]
                            offline::kill_all(app);
                            app.exit(0)
                        }
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .build(app)?;

                // Closing the till window minimizes it to the tray instead of
                // quitting - pharmacies keep this running for the whole shift.
                // Only wired here for the window declared statically in
                // tauri.conf.json (the SaaS build) — the offline-edition
                // build creates its own "main" window once local Postgres +
                // the app server are healthy, and wires the same close
                // behaviour there (see offline::bootstrap_and_launch).
                #[cfg(not(feature = "offline-edition"))]
                if let Some(window) = app.get_webview_window("main") {
                    let window_clone = window.clone();
                    window.on_window_event(move |event| {
                        if let WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = window_clone.hide();
                        }
                    });
                }

                #[cfg(feature = "offline-edition")]
                {
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        if let Err(err) = offline::bootstrap_and_launch(&handle) {
                            eprintln!("[offline] fatal bootstrap error: {err}");
                            handle.exit(1);
                        }
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(all(desktop, not(feature = "offline-edition")))]
async fn check_for_update(app: tauri::AppHandle) {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => {
            eprintln!("updater unavailable: {err}");
            return;
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            if let Err(err) = update.download_and_install(|_, _| {}, || {}).await {
                eprintln!("update install failed: {err}");
                return;
            }
            app.restart();
        }
        Ok(None) => {}
        Err(err) => eprintln!("update check failed: {err}"),
    }
}
