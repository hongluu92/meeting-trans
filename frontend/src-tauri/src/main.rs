// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Open the always-on-top caption overlay window.
/// Called from the frontend via `invoke("open_caption_overlay")`.
#[tauri::command]
fn open_caption_overlay(app: tauri::AppHandle) -> Result<(), String> {
    // If caption window already exists, focus it
    if let Some(window) = app.get_webview_window("caption") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(&app, "caption", WebviewUrl::App("/caption".into()))
        .title("Live Captions")
        .inner_size(520.0, 280.0)
        .min_inner_size(300.0, 150.0)
        .decorations(true)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    window.set_always_on_top(true).map_err(|e| e.to_string())?;

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_caption_overlay])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
