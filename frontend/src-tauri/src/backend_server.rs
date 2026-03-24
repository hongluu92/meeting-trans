//! Manages the Python backend server as a child process.
//!
//! Starts uvicorn on app launch and kills it on app exit.
//! Finds the Python venv relative to the project root.

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

static BACKEND_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

/// Find the project root (contains backend/ directory).
fn find_project_root() -> Result<String, String> {
    // In dev: CARGO_MANIFEST_DIR is frontend/src-tauri, project root is ../../
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let project_root = std::path::Path::new(manifest_dir)
        .parent() // frontend/
        .and_then(|p| p.parent()) // project root
        .ok_or("Cannot find project root")?;

    let backend_dir = project_root.join("backend");
    if backend_dir.exists() {
        return Ok(project_root.to_string_lossy().to_string());
    }

    Err(format!("Backend directory not found at {:?}", backend_dir))
}

/// Start the Python backend server (uvicorn).
pub fn start() -> Result<(), String> {
    let mut proc = BACKEND_PROCESS.lock().map_err(|e| e.to_string())?;
    if proc.is_some() {
        return Ok(()); // already running
    }

    let project_root = find_project_root()?;
    let backend_dir = format!("{}/backend", project_root);
    let venv_python = format!("{}/.venv/bin/python3", backend_dir);

    // Check if venv exists
    if !std::path::Path::new(&venv_python).exists() {
        return Err(format!(
            "Python venv not found at {}. Run 'make install' first.",
            venv_python
        ));
    }

    eprintln!("[backend] Starting uvicorn from {}", backend_dir);

    let child = Command::new(&venv_python)
        .args([
            "-m", "uvicorn",
            "app.main:app",
            "--host", "127.0.0.1",
            "--port", "8000",
        ])
        .current_dir(&backend_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start backend: {}", e))?;

    eprintln!("[backend] uvicorn started (pid {})", child.id());
    *proc = Some(child);

    Ok(())
}

/// Stop the Python backend server.
pub fn stop() {
    let mut proc = match BACKEND_PROCESS.lock() {
        Ok(p) => p,
        Err(_) => return,
    };

    if let Some(ref mut child) = *proc {
        eprintln!("[backend] Stopping uvicorn (pid {})", child.id());
        let _ = child.kill();
        let _ = child.wait();
    }
    *proc = None;
}
