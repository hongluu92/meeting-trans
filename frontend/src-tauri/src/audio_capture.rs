//! System audio capture via a Swift ScreenCaptureKit helper process.
//!
//! Spawns `capture-audio` binary which outputs raw float32 PCM at 16kHz to stdout.
//! Reads the PCM stream and emits Tauri events to the webview.
//! Detects permission errors and reports them to the frontend.

use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

static CAPTURE_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

/// Start the system audio capture helper and stream PCM to the webview.
/// Returns an error string if the helper fails to start or permission is denied.
pub fn start(app: AppHandle) -> Result<(), String> {
    let mut proc = CAPTURE_PROCESS.lock().map_err(|e| e.to_string())?;
    if proc.is_some() {
        return Err("System audio capture already running".into());
    }

    let helper_path = find_helper_path(&app)?;

    let mut child = Command::new(&helper_path)
        .stdout(Stdio::piped())
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start capture-audio: {}", e))?;

    let stderr = child.stderr.take().ok_or("No stderr from capture-audio")?;
    let stdout = child.stdout.take().ok_or("No stdout from capture-audio")?;

    // Read stderr in a thread to detect errors (especially permission denied)
    let app_for_stderr = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                if line.starts_with("ERROR:") {
                    // Emit permission error to frontend
                    let msg = if line.contains("declined") || line.contains("TCC") {
                        "PERMISSION_DENIED".to_string()
                    } else {
                        line.trim_start_matches("ERROR:").trim().to_string()
                    };
                    let _ = app_for_stderr.emit("system-audio-error", msg);
                }
                // "READY" means capture started successfully — ignore
            }
        }
    });

    // Wait briefly to see if the process exits immediately (permission denied)
    thread::sleep(Duration::from_millis(500));
    if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
        if !status.success() {
            return Err("PERMISSION_DENIED".into());
        }
    }

    *proc = Some(child);

    // Spawn a thread to read PCM from stdout and emit Tauri events
    thread::spawn(move || {
        read_pcm_stream(stdout, app);
    });

    Ok(())
}

/// Stop the system audio capture helper.
pub fn stop() -> Result<(), String> {
    let mut proc = CAPTURE_PROCESS.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = *proc {
        if let Some(ref mut stdin) = child.stdin {
            use std::io::Write;
            let _ = stdin.write_all(b"stop\n");
        }
        let _ = child.wait();
    }
    *proc = None;
    Ok(())
}

/// Read float32 PCM chunks from the helper's stdout and emit as Tauri events.
fn read_pcm_stream(mut stdout: impl Read + Send + 'static, app: AppHandle) {
    // 16kHz * 4 bytes/sample * 0.256s = 16384 bytes per chunk (~256ms)
    let chunk_size = 16384;
    let mut buf = vec![0u8; chunk_size];

    loop {
        match stdout.read_exact(&mut buf) {
            Ok(()) => {
                use base64::Engine;
                let encoded = base64::engine::general_purpose::STANDARD.encode(&buf);
                let _ = app.emit("system-audio-chunk", encoded);
            }
            Err(_) => {
                let _ = app.emit("system-audio-stopped", ());
                break;
            }
        }
    }

    if let Ok(mut proc) = CAPTURE_PROCESS.lock() {
        *proc = None;
    }
}

/// Find the capture-audio helper binary.
fn find_helper_path(app: &AppHandle) -> Result<String, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("capture-audio");
        if bundled.exists() {
            return Ok(bundled.to_string_lossy().to_string());
        }
    }

    let dev_path = concat!(env!("CARGO_MANIFEST_DIR"), "/swift-helper/capture-audio");
    if std::path::Path::new(dev_path).exists() {
        return Ok(dev_path.to_string());
    }

    Err("capture-audio helper not found. Compile it with: xcrun swiftc ...".into())
}
