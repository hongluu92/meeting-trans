// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio_capture;
mod backend_server;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

/// Open the native caption overlay — borderless, bottom of screen, always on top.
#[tauri::command]
fn open_caption_overlay(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("caption") {
        window.set_focus().map_err(|e: tauri::Error| e.to_string())?;
        return Ok(());
    }

    let main_window = app.get_webview_window("main").ok_or("no main window")?;
    let monitor = main_window
        .current_monitor()
        .map_err(|e: tauri::Error| e.to_string())?
        .ok_or("no monitor")?;
    let screen_size = monitor.size();
    let scale = monitor.scale_factor();
    let screen_w = screen_size.width as f64 / scale;
    let screen_h = screen_size.height as f64 / scale;

    let caption_w = 700.0;
    let caption_h = 200.0;
    let x = (screen_w - caption_w) / 2.0;
    let y = screen_h - caption_h - 60.0;

    let window = WebviewWindowBuilder::new(&app, "caption", WebviewUrl::App("/caption".into()))
        .title("")
        .inner_size(caption_w, caption_h)
        .position(x, y)
        .decorations(false)
        .resizable(true)
        .skip_taskbar(true)
        .build()
        .map_err(|e: tauri::Error| e.to_string())?;

    window
        .set_always_on_top(true)
        .map_err(|e: tauri::Error| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn start_system_audio(app: tauri::AppHandle) -> Result<(), String> {
    audio_capture::start(app)
}

#[tauri::command]
fn stop_system_audio() -> Result<(), String> {
    audio_capture::stop()
}

#[tauri::command]
fn open_screen_recording_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Build the system tray with menu items.
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let toggle_recording = MenuItemBuilder::with_id("toggle_recording", "Toggle Recording (⌘⇧T)")
        .build(app)?;
    let show_window = MenuItemBuilder::with_id("show_window", "Show Window")
        .build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Meeting Trans")
        .build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&toggle_recording)
        .separator()
        .item(&show_window)
        .separator()
        .item(&quit)
        .build()?;

    let icon = app.default_window_icon().cloned()
        .ok_or("No app icon found")?;

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("Meeting Trans")
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "toggle_recording" => {
                    let _ = app.emit("global-toggle-recording", ());
                }
                "show_window" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    backend_server::stop();
                    std::process::exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

/// Register global keyboard shortcut (Cmd+Shift+T).
fn setup_global_shortcut(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut: Shortcut = "CommandOrControl+Shift+T".parse()?;

    app.global_shortcut().on_shortcut(shortcut, {
        let handle = app.handle().clone();
        move |_app, _shortcut, _event| {
            let _ = handle.emit("global-toggle-recording", ());
        }
    })?;

    eprintln!("[shortcut] Registered Cmd+Shift+T for toggle recording");
    Ok(())
}

fn main() {
    // Start Python backend before Tauri app
    if let Err(e) = backend_server::start() {
        eprintln!("[backend] Warning: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // System tray
            if let Err(e) = setup_tray(app) {
                eprintln!("[tray] Warning: {}", e);
            }

            // Global shortcut: Cmd+Shift+T
            if let Err(e) = setup_global_shortcut(app) {
                eprintln!("[shortcut] Warning: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_caption_overlay,
            start_system_audio,
            stop_system_audio,
            open_screen_recording_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    backend_server::stop();
}
