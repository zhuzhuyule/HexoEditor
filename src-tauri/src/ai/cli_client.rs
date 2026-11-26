use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::Value;
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::watch;

use crate::error::{AppError, AppResult};

use super::discovery::build_ai_path_env;
use super::{
    emit_ai_event, terminate_process_group_force, terminate_process_group_graceful,
    AiProviderConfig,
};

pub fn parse_cli_output_line(raw_line: &str) -> Option<(&'static str, String)> {
    let trimmed = raw_line.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.starts_with('{') {
        if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
            let msg_type = val
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();

            match msg_type {
                "content_block_delta" => {
                    if let Some(text) = val
                        .get("delta")
                        .and_then(|d| d.get("text"))
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                    {
                        return Some(("delta", text.to_string()));
                    }
                    if let Some(thinking) = val
                        .get("delta")
                        .and_then(|d| d.get("thinking"))
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                    {
                        return Some(("thought", thinking.to_string()));
                    }
                    return None;
                }
                "assistant" => {
                    if let Some(arr) = val
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .and_then(Value::as_array)
                    {
                        let text: String = arr
                            .iter()
                            .filter_map(|item| item.get("text").and_then(Value::as_str))
                            .collect();
                        if !text.is_empty() {
                            return Some(("delta", text));
                        }
                    }
                    return None;
                }
                "result" => {
                    if let Some(text) = val
                        .get("result")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                    {
                        return Some(("delta", text.to_string()));
                    }
                    return None;
                }
                "error" => {
                    if let Some(err) = val
                        .get("error")
                        .and_then(|e| e.get("message").or(Some(e)))
                        .and_then(Value::as_str)
                    {
                        return Some(("error", err.to_string()));
                    }
                    return None;
                }
                "system" => {
                    return None;
                }
                _ => {}
            }
        }
    }

    Some(("delta", format!("{}\n", raw_line.trim_end_matches(['\r', '\n']))))
}

#[allow(clippy::too_many_arguments)]
pub async fn run_cli_prompt(
    app: &AppHandle,
    request_id: &str,
    provider: &AiProviderConfig,
    system_prompt: Option<&str>,
    prompt: &str,
    cwd: Option<&Path>,
    mut cancel_rx: watch::Receiver<bool>,
    child_pid: Arc<AtomicU32>,
) -> AppResult<()> {
    let executable = provider
        .executable
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::InvalidInput("CLI executable path is required".into()))?;

    let full_prompt = match system_prompt.map(str::trim).filter(|s| !s.is_empty()) {
        Some(sys) => format!("{}\n\n---\n\n{}", sys, prompt),
        None => prompt.to_string(),
    };

    let mut cmd = Command::new(executable);
    cmd.args(&provider.args)
        .env("PATH", build_ai_path_env())
        .env("NO_COLOR", "1")
        .env("FORCE_COLOR", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    if let Some(dir) = cwd.filter(|d| d.is_dir()) {
        cmd.current_dir(dir);
    }

    #[cfg(unix)]
    {
        cmd.process_group(0);
    }

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| {
        AppError::Io(std::io::Error::new(
            e.kind(),
            format!("Failed to launch CLI agent `{}`: {}", executable, e),
        ))
    })?;

    let pid = child.id().unwrap_or(0);
    child_pid.store(pid, Ordering::Release);

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(full_prompt.as_bytes()).await;
        let _ = stdin.write_all(b"\n").await;
        let _ = stdin.flush().await;
        drop(stdin);
    }

    let stderr_tail = Arc::new(Mutex::new(Vec::<String>::new()));
    if let Some(err) = child.stderr.take() {
        let tail_clone = Arc::clone(&stderr_tail);
        tokio::spawn(async move {
            let mut reader = BufReader::new(err);
            let mut line = String::new();
            while let Ok(n) = reader.read_line(&mut line).await {
                if n == 0 {
                    break;
                }
                let trimmed = line.trim().to_string();
                if !trimmed.is_empty() {
                    if let Ok(mut guard) = tail_clone.lock() {
                        if guard.len() >= 8 {
                            guard.remove(0);
                        }
                        guard.push(trimmed);
                    }
                }
                line.clear();
            }
        });
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Watcher("Failed to open CLI stdout".into()))?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    let mut assistant_emitted = false;

    loop {
        line.clear();
        let read_res = tokio::select! {
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    if pid > 0 {
                        terminate_process_group_graceful(pid);
                        if tokio::time::timeout(Duration::from_millis(400), child.wait()).await.is_err() {
                            terminate_process_group_force(pid);
                            let _ = child.kill().await;
                        }
                    }
                    child_pid.store(0, Ordering::Release);
                    return Ok(());
                }
                continue;
            }
            res = reader.read_line(&mut line) => res,
        };

        match read_res {
            Ok(0) => break,
            Ok(_) => {
                if let Some((kind, text)) = parse_cli_output_line(&line) {
                    if kind == "error" {
                        child_pid.store(0, Ordering::Release);
                        return Err(AppError::InvalidInput(text));
                    }
                    // Avoid duplicating text if Claude stream-json emits both assistant and final result
                    if line.trim_start().starts_with('{') && line.contains("\"type\":\"result\"") && assistant_emitted {
                        continue;
                    }
                    if kind == "delta" {
                        assistant_emitted = true;
                    }
                    emit_ai_event(app, request_id, kind, text, false);
                }
            }
            Err(e) => {
                child_pid.store(0, Ordering::Release);
                return Err(AppError::Io(e));
            }
        }
    }

    let status = child.wait().await.ok();
    child_pid.store(0, Ordering::Release);

    if let Some(st) = status {
        if !st.success() && !assistant_emitted {
            let tail = stderr_tail
                .lock()
                .map(|v| v.join(" | "))
                .unwrap_or_default();
            return Err(AppError::InvalidInput(if tail.is_empty() {
                format!("CLI exited with status {}", st)
            } else {
                tail
            }));
        }
    }

    emit_ai_event(app, request_id, "done", "", true);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_claude_stream_json_and_plain_lines() {
        let stream_delta =
            r#"{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}"#;
        assert_eq!(
            parse_cli_output_line(stream_delta),
            Some(("delta", "Hi".to_string()))
        );

        let assistant =
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Full reply"}]}}"#;
        assert_eq!(
            parse_cli_output_line(assistant),
            Some(("delta", "Full reply".to_string()))
        );

        assert_eq!(
            parse_cli_output_line("plain text line\n"),
            Some(("delta", "plain text line\n".to_string()))
        );
    }
}
