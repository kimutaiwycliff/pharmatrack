use tauri::menu::{CheckMenuItem, Menu, MenuItem};
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

// ADR-015 — receipt printers (USB/COM, Bluetooth COM, network, installed
// printers) for the web app's Settings → Printer & scanner.
mod printing;

// Deadline notifications for the till (pt_notify).
mod desktop;

#[cfg(desktop)]
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

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

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None));
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
                // Start the till when the computer starts, so it's ready (and
                // syncing) before the first customer.
                let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
                let autostart_item = CheckMenuItem::with_id(
                    app,
                    "autostart",
                    "Start with computer",
                    true,
                    autostart_on,
                    None::<&str>,
                )?;
                let menu = Menu::with_items(app, &[&open_item, &autostart_item, &quit_item])?;
                let autostart_toggle = autostart_item.clone();

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .show_menu_on_left_click(true)
                    .on_menu_event(move |app, event| match event.id().as_ref() {
                        "autostart" => {
                            let launcher = app.autolaunch();
                            let on = launcher.is_enabled().unwrap_or(false);
                            let result = if on { launcher.disable() } else { launcher.enable() };
                            if let Err(err) = result {
                                eprintln!("autostart toggle failed: {err}");
                            }
                            let _ = autostart_toggle.set_checked(launcher.is_enabled().unwrap_or(false));
                        }
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
                // The SaaS window is declared in tauri.conf.json with
                // "create": false and built here, so it can take a download
                // handler (desktop::handle_download) — config windows can't.
                #[cfg(not(feature = "offline-edition"))]
                // Only if the config didn't already create it (never fail to open).
                if app.get_webview_window("main").is_none() {
                    if let Some(config) = app.config().app.windows.iter().find(|w| w.label == "main").cloned() {
                        tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
                            .on_download(desktop::handle_download)
                            .build()?;
                    }
                }                #[cfg(not(feature = "offline-edition"))]
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
        .invoke_handler(tauri::generate_handler![
            printing::pt_list_printers,
            printing::pt_print,
            printing::pt_printer_status,
            desktop::pt_notify
        ])
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
