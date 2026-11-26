use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::{oneshot, watch};

use crate::error::{AppError, AppResult};

use super::discovery::build_ai_path_env;
use super::{
    emit_ai_event, terminate_process_group_force, terminate_process_group_graceful, AcpAgentInfo,
    AcpAuthMethod, AcpPermissionDecision, AcpPermissionOption, AcpPermissionRequestEvent,
    AcpProbeResult, AiProviderConfig, AI_PERMISSION_REQUEST_EVENT,
};

const ACP_PROBE_TIMEOUT_SECS: u64 = 5;
const ACP_HANDSHAKE_TIMEOUT_SECS: u64 = 12;
const ACP_PERMISSION_TIMEOUT_SECS: u64 = 120;

pub type PermissionRequestCallback = Arc<
    dyn Fn(String, Option<String>, Vec<AcpPermissionOption>) -> oneshot::Receiver<AcpPermissionDecision>
        + Send
        + Sync,
>;

#[derive(Clone)]
pub enum PermissionMode {
    CancelAll,
    Interactive(PermissionRequestCallback),
}

pub struct AcpSessionHandle {
    pub pid: u32,
    pub provider_fingerprint: String,
    pub session_id: String,
    pub next_rpc_id: u64,
    pub child: Child,
    pub stdin: ChildStdin,
    pub reader: BufReader<ChildStdout>,
    pub stderr_tail: Arc<Mutex<Vec<String>>>,
}

#[derive(Default)]
pub struct AcpSessionSlot {
    pid: AtomicU32,
    inner: tokio::sync::Mutex<Option<AcpSessionHandle>>,
}

impl AcpSessionSlot {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn force_kill_blocking(&self) {
        let pid = self.pid.swap(0, Ordering::AcqRel);
        if pid > 0 {
            terminate_process_group_force(pid);
        }
    }

    pub async fn reset_async(&self) {
        let taken = {
            let mut guard = self.inner.lock().await;
            guard.take()
        };
        if let Some(mut handle) = taken {
            let pid = handle.pid;
            drop(handle.stdin);
            cleanup_child(&mut handle.child, pid).await;
        }
        self.pid.store(0, Ordering::Release);
    }
}

pub fn build_provider_fingerprint(provider: &AiProviderConfig, cwd: Option<&Path>) -> String {
    let exe = provider.executable.as_deref().unwrap_or("").trim();
    let args = provider.args.join("\u{1f}");
    let mut env_pairs: Vec<String> = provider
        .env
        .iter()
        .map(|(k, v)| format!("{}={}", k.trim(), v))
        .collect();
    env_pairs.sort_unstable();
    let cwd_str = cwd
        .map(|p| p.to_string_lossy().to_string())
        .or_else(|| provider.cwd.clone())
        .unwrap_or_default();
    format!("{}|{}|{}|{}", exe, args, env_pairs.join("\u{1f}"), cwd_str)
}

fn spawn_acp_child(
    executable: &str,
    args: &[String],
    env: Option<&HashMap<String, String>>,
    cwd: Option<&Path>,
) -> AppResult<Child> {
    let exe = executable.trim();
    if exe.is_empty() {
        return Err(AppError::InvalidInput(
            "ACP executable path cannot be empty".into(),
        ));
    }

    let mut cmd = Command::new(exe);
    cmd.args(args)
        .env("PATH", build_ai_path_env())
        .env("NO_COLOR", "1")
        .env("FORCE_COLOR", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    if let Some(custom_env) = env {
        for (raw_key, val) in custom_env {
            let key = raw_key.trim();
            if !key.is_empty() {
                cmd.env(key, val);
            }
        }
    }

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

    cmd.spawn().map_err(|e| {
        AppError::Io(std::io::Error::new(
            e.kind(),
            format!("Failed to launch ACP agent `{}`: {}", exe, e),
        ))
    })
}

async fn write_json_line(stdin: &mut ChildStdin, payload: &Value) -> AppResult<()> {
    let mut line = serde_json::to_string(payload)
        .map_err(|e| AppError::InvalidInput(format!("JSON encode error: {}", e)))?;
    line.push('\n');
    stdin.write_all(line.as_bytes()).await?;
    stdin.flush().await?;
    Ok(())
}

async fn cleanup_child(child: &mut Child, pid: u32) {
    if pid > 0 {
        terminate_process_group_graceful(pid);
    }
    if tokio::time::timeout(Duration::from_millis(600), child.wait())
        .await
        .is_err()
    {
        if pid > 0 {
            terminate_process_group_force(pid);
        }
        let _ = child.kill().await;
        let _ = tokio::time::timeout(Duration::from_millis(400), child.wait()).await;
    }
}

pub fn parse_jsonrpc_line(raw_line: &str) -> Option<Value> {
    let trimmed = raw_line.trim();
    if trimmed.is_empty() || !trimmed.starts_with('{') {
        return None;
    }
    serde_json::from_str::<Value>(trimmed).ok()
}

pub fn parse_initialize_result(result: &Value, latency_ms: u64) -> AcpProbeResult {
    let protocol_version = result.get("protocolVersion").and_then(Value::as_u64);

    let agent_info = result.get("agentInfo").and_then(|info| {
        let name = info
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())?
            .to_string();
        let version = info
            .get("version")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string);
        let title = info
            .get("title")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string);
        Some(AcpAgentInfo {
            name,
            version,
            title,
        })
    });

    let agent_capabilities = result
        .get("agentCapabilities")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let auth_methods = result
        .get("authMethods")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let id = item
                        .get("id")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|s| !s.is_empty())?
                        .to_string();
                    let name = item
                        .get("name")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .unwrap_or(&id)
                        .to_string();
                    let description = item
                        .get("description")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(ToString::to_string);
                    Some(AcpAuthMethod {
                        id,
                        name,
                        description,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let agent_label = agent_info
        .as_ref()
        .map(|a| match &a.version {
            Some(v) => format!("{} {}", a.title.as_deref().unwrap_or(&a.name), v),
            None => a.title.as_deref().unwrap_or(&a.name).to_string(),
        })
        .unwrap_or_else(|| "ACP Agent".to_string());

    AcpProbeResult {
        ok: true,
        protocol_version,
        agent_info,
        agent_capabilities,
        auth_methods,
        message: format!(
            "ACP v{} ready ({})",
            protocol_version.unwrap_or(1),
            agent_label
        ),
        latency_ms,
    }
}

fn extract_content_text(update: &Value) -> Option<String> {
    if let Some(text) = update
        .get("content")
        .and_then(|c| c.get("text"))
        .and_then(Value::as_str)
    {
        return Some(text.to_string());
    }
    if let Some(arr) = update.get("content").and_then(Value::as_array) {
        let joined: String = arr
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect();
        if !joined.is_empty() {
            return Some(joined);
        }
    }
    if let Some(text) = update.get("text").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    None
}

/// Converts an ACP `session/update` payload into `(kind, text)` for UI streaming.
pub fn extract_session_update_event(params: &Value) -> Option<(&'static str, String)> {
    let update = params.get("update").unwrap_or(params);
    let kind = update
        .get("sessionUpdate")
        .or_else(|| update.get("type"))
        .and_then(Value::as_str)?;

    match kind {
        "agent_message_chunk" | "agent_message" => {
            let text = extract_content_text(update)?;
            if text.is_empty() {
                None
            } else {
                Some(("delta", text))
            }
        }
        "agent_thought_chunk" | "agent_thought" => {
            let text = extract_content_text(update)?;
            if text.is_empty() {
                None
            } else {
                Some(("thought", text))
            }
        }
        "tool_call" | "tool_call_update" => {
            let title = update
                .get("title")
                .or_else(|| update.get("toolName"))
                .and_then(Value::as_str)
                .unwrap_or("tool");
            let status = update
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("running");
            Some(("status", format!("{}: {}", title, status)))
        }
        "plan" => {
            let count = update
                .get("entries")
                .and_then(Value::as_array)
                .map(|a| a.len())
                .unwrap_or(0);
            Some(("status", format!("Plan ({} steps)", count)))
        }
        _ => None,
    }
}

pub fn parse_permission_request_params(
    params: Option<&Value>,
) -> (String, Option<String>, Vec<AcpPermissionOption>) {
    let Some(p) = params else {
        return ("Tool permission".to_string(), None, Vec::new());
    };
    let tool_title = p
        .pointer("/toolCall/title")
        .or_else(|| p.pointer("/toolCall/toolName"))
        .or_else(|| p.get("title"))
        .or_else(|| p.get("toolName"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Tool permission")
        .to_string();

    let kind = p
        .pointer("/toolCall/kind")
        .or_else(|| p.get("kind"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string);

    let options = p
        .get("options")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|opt| {
                    let option_id = opt
                        .get("optionId")
                        .or_else(|| opt.get("id"))
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|s| !s.is_empty())?
                        .to_string();
                    let name = opt
                        .get("name")
                        .or_else(|| opt.get("label"))
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .unwrap_or(&option_id)
                        .to_string();
                    let opt_kind = opt
                        .get("kind")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(ToString::to_string);
                    Some(AcpPermissionOption {
                        option_id,
                        name,
                        kind: opt_kind,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    (tool_title, kind, options)
}

fn format_jsonrpc_error(err_val: &Value) -> String {
    let code = err_val
        .get("code")
        .and_then(Value::as_i64)
        .map(|c| format!("[{}] ", c))
        .unwrap_or_default();
    let msg = err_val
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("ACP JSON-RPC error");
    format!("{}{}", code, msg)
}

async fn read_response_for_id(
    reader: &mut BufReader<ChildStdout>,
    expected_id: u64,
    timeout: Duration,
    stderr_tail: &Arc<Mutex<Vec<String>>>,
) -> AppResult<Value> {
    let deadline = tokio::time::Instant::now() + timeout;
    let mut line = String::new();
    loop {
        line.clear();
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err(AppError::Watcher(format!(
                "ACP handshake timed out waiting for id={}",
                expected_id
            )));
        }

        let read_res = tokio::time::timeout(remaining, reader.read_line(&mut line)).await;
        match read_res {
            Ok(Ok(0)) => {
                let tail = stderr_tail
                    .lock()
                    .map(|v| v.join(" | "))
                    .unwrap_or_default();
                let detail = if tail.is_empty() {
                    "ACP process closed stdout unexpectedly".to_string()
                } else {
                    format!("ACP process exited before response: {}", tail)
                };
                return Err(AppError::Watcher(detail));
            }
            Ok(Ok(_)) => {
                let Some(msg) = parse_jsonrpc_line(&line) else {
                    continue;
                };
                if msg.get("id").and_then(Value::as_u64) == Some(expected_id) {
                    if let Some(err) = msg.get("error") {
                        return Err(AppError::InvalidInput(format_jsonrpc_error(err)));
                    }
                    return Ok(msg.get("result").cloned().unwrap_or(Value::Null));
                }
            }
            Ok(Err(e)) => return Err(AppError::Io(e)),
            Err(_) => {
                return Err(AppError::Watcher(format!(
                    "ACP handshake timed out waiting for id={}",
                    expected_id
                )))
            }
        }
    }
}

fn spawn_stderr_collector(stderr: Option<tokio::process::ChildStderr>) -> Arc<Mutex<Vec<String>>> {
    let tail = Arc::new(Mutex::new(Vec::<String>::new()));
    if let Some(err) = stderr {
        let tail_clone = Arc::clone(&tail);
        tokio::spawn(async move {
            let mut reader = BufReader::new(err);
            let mut buf = String::new();
            while let Ok(n) = reader.read_line(&mut buf).await {
                if n == 0 {
                    break;
                }
                let trimmed = buf.trim().to_string();
                if !trimmed.is_empty() {
                    if let Ok(mut guard) = tail_clone.lock() {
                        if guard.len() >= 8 {
                            guard.remove(0);
                        }
                        guard.push(trimmed);
                    }
                }
                buf.clear();
            }
        });
    }
    tail
}

pub async fn probe_acp_agent(
    executable: &str,
    args: &[String],
    env: Option<&HashMap<String, String>>,
    cwd: Option<&Path>,
) -> AppResult<AcpProbeResult> {
    let started = Instant::now();
    let mut child = spawn_acp_child(executable, args, env, cwd)?;
    let pid = child.id().unwrap_or(0);

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Watcher("Failed to open ACP stdin".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Watcher("Failed to open ACP stdout".into()))?;
    let stderr_tail = spawn_stderr_collector(child.stderr.take());
    let mut reader = BufReader::new(stdout);

    let init_req = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": 1,
            "clientCapabilities": {},
            "clientInfo": {
                "name": "HexoEditor",
                "version": "2.0.0"
            }
        }
    });

    let probe_res = match write_json_line(&mut stdin, &init_req).await {
        Ok(()) => {
            match read_response_for_id(
                &mut reader,
                1,
                Duration::from_secs(ACP_PROBE_TIMEOUT_SECS),
                &stderr_tail,
            )
            .await
            {
                Ok(result) => {
                    Ok(parse_initialize_result(&result, started.elapsed().as_millis() as u64))
                }
                Err(err) => Ok(AcpProbeResult {
                    ok: false,
                    protocol_version: None,
                    agent_info: None,
                    agent_capabilities: json!({}),
                    auth_methods: Vec::new(),
                    message: err.to_string(),
                    latency_ms: started.elapsed().as_millis() as u64,
                }),
            }
        }
        Err(err) => Ok(AcpProbeResult {
            ok: false,
            protocol_version: None,
            agent_info: None,
            agent_capabilities: json!({}),
            auth_methods: Vec::new(),
            message: err.to_string(),
            latency_ms: started.elapsed().as_millis() as u64,
        }),
    };

    drop(stdin);
    cleanup_child(&mut child, pid).await;
    probe_res
}

async fn start_acp_session_handle<F>(
    provider: &AiProviderConfig,
    cwd: Option<&Path>,
    fingerprint: String,
    cancel_rx: &mut watch::Receiver<bool>,
    child_pid: &Arc<AtomicU32>,
    emit: &mut F,
) -> AppResult<Option<AcpSessionHandle>>
where
    F: FnMut(&str, &str, bool),
{
    let executable = provider
        .executable
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::InvalidInput("ACP executable is required".into()))?;

    let mut child = spawn_acp_child(executable, &provider.args, Some(&provider.env), cwd)?;
    let pid = child.id().unwrap_or(0);
    child_pid.store(pid, Ordering::Release);

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Watcher("Failed to open ACP stdin".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Watcher("Failed to open ACP stdout".into()))?;
    let stderr_tail = spawn_stderr_collector(child.stderr.take());
    let mut reader = BufReader::new(stdout);

    let handshake_res = async {
        emit("status", "ACP initialize...", false);
        let init_req = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": 1,
                "clientCapabilities": {},
                "clientInfo": {
                    "name": "HexoEditor",
                    "version": "2.0.0"
                }
            }
        });
        write_json_line(&mut stdin, &init_req).await?;
        let _init_result = read_response_for_id(
            &mut reader,
            1,
            Duration::from_secs(ACP_HANDSHAKE_TIMEOUT_SECS),
            &stderr_tail,
        )
        .await?;

        if *cancel_rx.borrow() {
            return Ok(None);
        }

        let cwd_str = cwd
            .map(|p| p.to_string_lossy().to_string())
            .or_else(|| {
                std::env::current_dir()
                    .ok()
                    .map(|p| p.to_string_lossy().to_string())
            })
            .unwrap_or_else(|| ".".to_string());

        let new_session_req = json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "session/new",
            "params": {
                "cwd": cwd_str,
                "mcpServers": []
            }
        });
        write_json_line(&mut stdin, &new_session_req).await?;
        let session_result = read_response_for_id(
            &mut reader,
            2,
            Duration::from_secs(ACP_HANDSHAKE_TIMEOUT_SECS),
            &stderr_tail,
        )
        .await?;

        let session_id = session_result
            .get("sessionId")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| AppError::InvalidInput("ACP session/new missing sessionId".into()))?
            .to_string();

        if *cancel_rx.borrow() {
            return Ok(None);
        }

        Ok(Some(session_id))
    }
    .await;

    match handshake_res {
        Ok(Some(session_id)) => Ok(Some(AcpSessionHandle {
            pid,
            provider_fingerprint: fingerprint,
            session_id,
            next_rpc_id: 3,
            child,
            stdin,
            reader,
            stderr_tail,
        })),
        Ok(None) => {
            drop(stdin);
            cleanup_child(&mut child, pid).await;
            child_pid.store(0, Ordering::Release);
            Ok(None)
        }
        Err(err) => {
            drop(stdin);
            cleanup_child(&mut child, pid).await;
            child_pid.store(0, Ordering::Release);
            Err(err)
        }
    }
}

async fn resolve_permission_outcome<F>(
    params: Option<&Value>,
    permission_mode: &PermissionMode,
    cancel_rx: &mut watch::Receiver<bool>,
    emit: &mut F,
) -> Result<Value, ()>
where
    F: FnMut(&str, &str, bool),
{
    match permission_mode {
        PermissionMode::CancelAll => {
            emit(
                "status",
                "Rejected host write/command permission (advisory mode)",
                false,
            );
            Ok(json!({ "outcome": "cancelled" }))
        }
        PermissionMode::Interactive(callback) => {
            let (tool_title, kind, options) = parse_permission_request_params(params);
            emit(
                "status",
                &format!("Waiting for permission: {}", tool_title),
                false,
            );
            let rx = callback(tool_title.clone(), kind, options);

            let decision = tokio::select! {
                _ = cancel_rx.changed() => {
                    if *cancel_rx.borrow() {
                        return Err(());
                    }
                    AcpPermissionDecision { option_id: None, cancelled: true }
                }
                res = tokio::time::timeout(Duration::from_secs(ACP_PERMISSION_TIMEOUT_SECS), rx) => {
                    match res {
                        Ok(Ok(dec)) => dec,
                        _ => AcpPermissionDecision { option_id: None, cancelled: true },
                    }
                }
            };

            if decision.cancelled {
                emit(
                    "status",
                    &format!("Denied permission: {}", tool_title),
                    false,
                );
                Ok(json!({ "outcome": "cancelled" }))
            } else {
                let selected_id = decision
                    .option_id
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or("allow_once")
                    .to_string();
                emit(
                    "status",
                    &format!("Approved permission: {}", tool_title),
                    false,
                );
                Ok(json!({
                    "outcome": "selected",
                    "optionId": selected_id
                }))
            }
        }
    }
}

async fn execute_prompt_turn<F>(
    handle: &mut AcpSessionHandle,
    prompt_text: &str,
    permission_mode: &PermissionMode,
    cancel_rx: &mut watch::Receiver<bool>,
    emit: &mut F,
) -> AppResult<bool>
where
    F: FnMut(&str, &str, bool),
{
    let rpc_id = handle.next_rpc_id;
    handle.next_rpc_id += 1;

    let prompt_req = json!({
        "jsonrpc": "2.0",
        "id": rpc_id,
        "method": "session/prompt",
        "params": {
            "sessionId": handle.session_id,
            "prompt": [
                {
                    "type": "text",
                    "text": prompt_text
                }
            ]
        }
    });
    write_json_line(&mut handle.stdin, &prompt_req).await?;

    let mut emitted_delta = false;
    let mut line = String::new();
    loop {
        line.clear();
        let read_step = tokio::select! {
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    return Ok(false);
                }
                continue;
            }
            res = handle.reader.read_line(&mut line) => res,
        };

        match read_step {
            Ok(0) => {
                if emitted_delta {
                    emit("done", "", true);
                    return Ok(false);
                }
                let tail = handle
                    .stderr_tail
                    .lock()
                    .map(|v| v.join(" | "))
                    .unwrap_or_default();
                return Err(AppError::Watcher(if tail.is_empty() {
                    "ACP session closed before completion".into()
                } else {
                    format!("ACP session closed: {}", tail)
                }));
            }
            Ok(_) => {
                let Some(msg) = parse_jsonrpc_line(&line) else {
                    continue;
                };

                if let Some(method) = msg.get("method").and_then(Value::as_str) {
                    if method == "session/update" {
                        if let Some(params) = msg.get("params") {
                            if let Some((kind, text)) = extract_session_update_event(params) {
                                if kind == "delta" {
                                    emitted_delta = true;
                                }
                                emit(kind, &text, false);
                            }
                        }
                        continue;
                    }

                    if method == "session/request_permission" {
                        if let Some(req_id) = msg.get("id") {
                            let outcome = match resolve_permission_outcome(
                                msg.get("params"),
                                permission_mode,
                                cancel_rx,
                                emit,
                            )
                            .await
                            {
                                Ok(val) => val,
                                Err(()) => {
                                    let cancel_reply = json!({
                                        "jsonrpc": "2.0",
                                        "id": req_id,
                                        "result": { "outcome": { "outcome": "cancelled" } }
                                    });
                                    let _ = write_json_line(&mut handle.stdin, &cancel_reply).await;
                                    return Ok(false);
                                }
                            };

                            let reply = json!({
                                "jsonrpc": "2.0",
                                "id": req_id,
                                "result": {
                                    "outcome": outcome
                                }
                            });
                            write_json_line(&mut handle.stdin, &reply).await?;
                        }
                        continue;
                    }
                }

                if msg.get("id").and_then(Value::as_u64) == Some(rpc_id) {
                    if let Some(err) = msg.get("error") {
                        return Err(AppError::InvalidInput(format_jsonrpc_error(err)));
                    }
                    if !emitted_delta {
                        if let Some(fallback_text) = msg
                            .get("result")
                            .and_then(|r| r.get("text"))
                            .and_then(Value::as_str)
                            .filter(|s| !s.is_empty())
                        {
                            emit("delta", fallback_text, false);
                        }
                    }
                    emit("done", "", true);
                    return Ok(true);
                }
            }
            Err(e) => return Err(AppError::Io(e)),
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn run_acp_prompt_with_options<F>(
    provider: &AiProviderConfig,
    system_prompt: Option<&str>,
    prompt: &str,
    cwd: Option<&Path>,
    mut cancel_rx: watch::Receiver<bool>,
    child_pid: Arc<AtomicU32>,
    session_slot: Option<Arc<AcpSessionSlot>>,
    permission_mode: PermissionMode,
    mut emit: F,
) -> AppResult<()>
where
    F: FnMut(&str, &str, bool),
{
    let fingerprint = build_provider_fingerprint(provider, cwd);

    if let Some(slot) = session_slot {
        let mut guard = slot.inner.lock().await;

        let mut reusable = None;
        if let Some(mut existing) = guard.take() {
            let alive = existing.child.try_wait().ok().flatten().is_none();
            if alive && existing.provider_fingerprint == fingerprint {
                reusable = Some(existing);
            } else {
                drop(existing.stdin);
                cleanup_child(&mut existing.child, existing.pid).await;
                slot.pid.store(0, Ordering::Release);
            }
        }

        let is_new_session = reusable.is_none();
        let mut handle = match reusable {
            Some(h) => {
                child_pid.store(h.pid, Ordering::Release);
                h
            }
            None => {
                let Some(h) = start_acp_session_handle(
                    provider,
                    cwd,
                    fingerprint,
                    &mut cancel_rx,
                    &child_pid,
                    &mut emit,
                )
                .await?
                else {
                    return Ok(());
                };
                slot.pid.store(h.pid, Ordering::Release);
                h
            }
        };

        let full_prompt = if is_new_session {
            match system_prompt.map(str::trim).filter(|s| !s.is_empty()) {
                Some(sys) => format!("{}\n\n---\n\n{}", sys, prompt),
                None => prompt.to_string(),
            }
        } else {
            prompt.to_string()
        };

        let turn_res = execute_prompt_turn(
            &mut handle,
            &full_prompt,
            &permission_mode,
            &mut cancel_rx,
            &mut emit,
        )
        .await;

        child_pid.store(0, Ordering::Release);

        match turn_res {
            Ok(true) => {
                // Keep live ACP process/session for subsequent turns
                *guard = Some(handle);
                Ok(())
            }
            Ok(false) => {
                drop(handle.stdin);
                cleanup_child(&mut handle.child, handle.pid).await;
                slot.pid.store(0, Ordering::Release);
                Ok(())
            }
            Err(err) => {
                drop(handle.stdin);
                cleanup_child(&mut handle.child, handle.pid).await;
                slot.pid.store(0, Ordering::Release);
                Err(err)
            }
        }
    } else {
        let Some(mut handle) = start_acp_session_handle(
            provider,
            cwd,
            fingerprint,
            &mut cancel_rx,
            &child_pid,
            &mut emit,
        )
        .await?
        else {
            return Ok(());
        };

        let full_prompt = match system_prompt.map(str::trim).filter(|s| !s.is_empty()) {
            Some(sys) => format!("{}\n\n---\n\n{}", sys, prompt),
            None => prompt.to_string(),
        };

        let turn_res = execute_prompt_turn(
            &mut handle,
            &full_prompt,
            &permission_mode,
            &mut cancel_rx,
            &mut emit,
        )
        .await;

        let pid = handle.pid;
        drop(handle.stdin);
        cleanup_child(&mut handle.child, pid).await;
        child_pid.store(0, Ordering::Release);

        turn_res.map(|_| ())
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn run_acp_prompt_with_emit<F>(
    provider: &AiProviderConfig,
    system_prompt: Option<&str>,
    prompt: &str,
    cwd: Option<&Path>,
    cancel_rx: watch::Receiver<bool>,
    child_pid: Arc<AtomicU32>,
    emit: F,
) -> AppResult<()>
where
    F: FnMut(&str, &str, bool),
{
    run_acp_prompt_with_options(
        provider,
        system_prompt,
        prompt,
        cwd,
        cancel_rx,
        child_pid,
        None,
        PermissionMode::CancelAll,
        emit,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn run_acp_prompt(
    app: &AppHandle,
    request_id: &str,
    provider: &AiProviderConfig,
    system_prompt: Option<&str>,
    prompt: &str,
    cwd: Option<&Path>,
    cancel_rx: watch::Receiver<bool>,
    child_pid: Arc<AtomicU32>,
    session_slot: Option<Arc<AcpSessionSlot>>,
    permission_broker: PermissionRequestCallback,
) -> AppResult<()> {
    run_acp_prompt_with_options(
        provider,
        system_prompt,
        prompt,
        cwd,
        cancel_rx,
        child_pid,
        session_slot,
        PermissionMode::Interactive(permission_broker),
        |kind, text, done| {
            emit_ai_event(app, request_id, kind, text, done);
        },
    )
    .await
}

pub fn emit_permission_request(
    app: &AppHandle,
    payload: AcpPermissionRequestEvent,
) {
    let _ = app.emit(AI_PERMISSION_REQUEST_EVENT, payload);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn parses_acp_initialize_and_session_updates() {
        let init_json = json!({
            "protocolVersion": 1,
            "agentInfo": {
                "name": "opencode",
                "version": "2.2.5",
                "title": "OpenCode"
            },
            "agentCapabilities": {
                "loadSession": true,
                "promptCapabilities": { "image": false }
            },
            "authMethods": [
                { "id": "free", "name": "Free Tier" }
            ]
        });
        let probe = parse_initialize_result(&init_json, 42);
        assert!(probe.ok);
        assert_eq!(probe.protocol_version, Some(1));
        assert_eq!(probe.agent_info.as_ref().unwrap().name, "opencode");
        assert_eq!(
            probe.agent_info.as_ref().unwrap().version.as_deref(),
            Some("2.2.5")
        );
        assert_eq!(probe.auth_methods.len(), 1);
        assert!(probe.message.contains("OpenCode 2.2.5"));

        let delta_params = json!({
            "sessionId": "s-1",
            "update": {
                "sessionUpdate": "agent_message_chunk",
                "content": { "type": "text", "text": "Hello " }
            }
        });
        assert_eq!(
            extract_session_update_event(&delta_params),
            Some(("delta", "Hello ".to_string()))
        );

        let thought_params = json!({
            "sessionId": "s-1",
            "update": {
                "sessionUpdate": "agent_thought_chunk",
                "content": { "type": "text", "text": "Thinking..." }
            }
        });
        assert_eq!(
            extract_session_update_event(&thought_params),
            Some(("thought", "Thinking...".to_string()))
        );

        let tool_params = json!({
            "sessionId": "s-1",
            "update": {
                "sessionUpdate": "tool_call",
                "title": "read_file",
                "status": "completed"
            }
        });
        assert_eq!(
            extract_session_update_event(&tool_params),
            Some(("status", "read_file: completed".to_string()))
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn acp_probe_and_prompt_stream_with_permission_cancellation() {
        use std::os::unix::fs::PermissionsExt;

        let tmp = TempDir::new().expect("tempdir");
        let script_path = tmp.path().join("mock-acp.sh");
        let log_path = tmp.path().join("perm-reply.log");

        // Pure POSIX sh mock ACP server speaking JSON-RPC 2.0 over stdio
        let script = format!(
            r#"#!/bin/sh
while IFS= read -r line; do
  case "$line" in
    *'"method":"initialize"'*)
      printf '%s\n' '{{"jsonrpc":"2.0","id":1,"result":{{"protocolVersion":1,"agentInfo":{{"name":"mock-acp","version":"0.9.0"}},"agentCapabilities":{{"loadSession":true}}}}}}'
      ;;
    *'"method":"session/new"'*)
      printf '%s\n' '{{"jsonrpc":"2.0","id":2,"result":{{"sessionId":"sess-42"}}}}'
      ;;
    *'"method":"session/prompt"'*)
      printf '%s\n' '{{"jsonrpc":"2.0","method":"session/update","params":{{"sessionId":"sess-42","update":{{"sessionUpdate":"agent_thought_chunk","content":{{"type":"text","text":"Checking context"}}}}}}}}'
      printf '%s\n' '{{"jsonrpc":"2.0","id":99,"method":"session/request_permission","params":{{"sessionId":"sess-42","toolCall":{{"title":"write_file"}}}}}}'
      IFS= read -r perm_reply
      printf '%s\n' "$perm_reply" > "{}"
      printf '%s\n' "${{HEXO_ACP_ACCOUNT:-default}}" > "{}"
      printf '%s\n' '{{"jsonrpc":"2.0","method":"session/update","params":{{"sessionId":"sess-42","update":{{"sessionUpdate":"agent_message_chunk","content":{{"type":"text","text":"Polished text"}}}}}}}}'
      printf '%s\n' '{{"jsonrpc":"2.0","id":3,"result":{{"stopReason":"end_turn"}}}}'
      ;;
  esac
done
"#,
            log_path.display(),
            tmp.path().join("env-account.log").display()
        );
        fs::write(&script_path, script).unwrap();
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755)).unwrap();

        let probe = probe_acp_agent(&script_path.to_string_lossy(), &[], None, None)
            .await
            .expect("probe succeeds");
        assert!(probe.ok);
        assert_eq!(probe.protocol_version, Some(1));
        assert_eq!(probe.agent_info.as_ref().unwrap().name, "mock-acp");
        assert_eq!(
            probe
                .agent_capabilities
                .get("loadSession")
                .and_then(Value::as_bool),
            Some(true)
        );

        let mut env = HashMap::new();
        env.insert("HEXO_ACP_ACCOUNT".to_string(), "work-account-2".to_string());

        let provider = AiProviderConfig {
            mode: "acp".to_string(),
            executable: Some(script_path.to_string_lossy().to_string()),
            args: vec![],
            env,
            cwd: None,
            base_url: None,
            api_key: None,
            model: None,
        };
        let (_tx, rx) = watch::channel(false);
        let pid_holder = Arc::new(AtomicU32::new(0));
        let mut events: Vec<(String, String, bool)> = Vec::new();

        run_acp_prompt_with_emit(
            &provider,
            Some("System context"),
            "Polish this paragraph",
            Some(tmp.path()),
            rx,
            pid_holder,
            |kind, text, done| {
                events.push((kind.to_string(), text.to_string(), done));
            },
        )
        .await
        .expect("prompt completes");

        assert!(events
            .iter()
            .any(|(k, t, _)| k == "thought" && t == "Checking context"));
        assert!(events
            .iter()
            .any(|(k, t, _)| k == "delta" && t == "Polished text"));
        assert_eq!(events.last(), Some(&("done".into(), "".into(), true)));

        let env_raw = fs::read_to_string(tmp.path().join("env-account.log"))
            .expect("env account logged");
        assert_eq!(env_raw.trim(), "work-account-2");

        let reply_raw = fs::read_to_string(&log_path).expect("permission reply logged");
        let reply_val: Value = serde_json::from_str(reply_raw.trim()).unwrap();
        assert_eq!(reply_val.get("id").and_then(Value::as_u64), Some(99));
        assert_eq!(
            reply_val["result"]["outcome"]["outcome"].as_str(),
            Some("cancelled")
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn acp_interactive_permission_and_multiturn_session_reuse() {
        use std::os::unix::fs::PermissionsExt;

        let tmp = TempDir::new().expect("tempdir");
        let script_path = tmp.path().join("mock-acp-multiturn.sh");
        let init_count_path = tmp.path().join("init-count.log");
        let prompt_log_path = tmp.path().join("prompts.log");
        let perm_reply_path = tmp.path().join("perm-interactive.log");

        let script = format!(
            r#"#!/bin/sh
while IFS= read -r line; do
  case "$line" in
    *'"method":"initialize"'*)
      printf 'init\n' >> "{}"
      printf '%s\n' '{{"jsonrpc":"2.0","id":1,"result":{{"protocolVersion":1,"agentInfo":{{"name":"mock-multi","version":"1.0.0"}}}}}}'
      ;;
    *'"method":"session/new"'*)
      printf '%s\n' '{{"jsonrpc":"2.0","id":2,"result":{{"sessionId":"sess-multi-1"}}}}'
      ;;
    *'"method":"session/prompt"'*)
      printf '%s\n' "$line" >> "{}"
      case "$line" in
        *'"id":3'*)
          printf '%s\n' '{{"jsonrpc":"2.0","id":77,"method":"session/request_permission","params":{{"sessionId":"sess-multi-1","toolCall":{{"title":"edit_post","kind":"edit"}},"options":[{{"optionId":"allow-once","name":"Allow once","kind":"allow_once"}},{{"optionId":"reject-once","name":"Deny","kind":"reject_once"}}]}}}}'
          IFS= read -r perm_reply
          printf '%s\n' "$perm_reply" > "{}"
          printf '%s\n' '{{"jsonrpc":"2.0","method":"session/update","params":{{"sessionId":"sess-multi-1","update":{{"sessionUpdate":"agent_message_chunk","content":{{"type":"text","text":"Turn 1 ok"}}}}}}}}'
          printf '%s\n' '{{"jsonrpc":"2.0","id":3,"result":{{"stopReason":"end_turn"}}}}'
          ;;
        *'"id":4'*)
          printf '%s\n' '{{"jsonrpc":"2.0","method":"session/update","params":{{"sessionId":"sess-multi-1","update":{{"sessionUpdate":"agent_message_chunk","content":{{"type":"text","text":"Turn 2 ok"}}}}}}}}'
          printf '%s\n' '{{"jsonrpc":"2.0","id":4,"result":{{"stopReason":"end_turn"}}}}'
          ;;
      esac
      ;;
  esac
done
"#,
            init_count_path.display(),
            prompt_log_path.display(),
            perm_reply_path.display()
        );
        fs::write(&script_path, script).unwrap();
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755)).unwrap();

        let provider = AiProviderConfig {
            mode: "acp".to_string(),
            executable: Some(script_path.to_string_lossy().to_string()),
            args: vec![],
            env: HashMap::new(),
            cwd: None,
            base_url: None,
            api_key: None,
            model: None,
        };

        let slot = Arc::new(AcpSessionSlot::new());
        let seen_perm = Arc::new(Mutex::new(None::<(String, Option<String>, Vec<AcpPermissionOption>)>));
        let seen_perm_clone = Arc::clone(&seen_perm);

        let broker: PermissionRequestCallback = Arc::new(move |title, kind, opts| {
            *seen_perm_clone.lock().unwrap() = Some((title, kind, opts.clone()));
            let (tx, rx) = oneshot::channel();
            let allow_id = opts.first().map(|o| o.option_id.clone());
            let _ = tx.send(AcpPermissionDecision {
                option_id: allow_id,
                cancelled: false,
            });
            rx
        });

        let (_tx1, rx1) = watch::channel(false);
        let pid1 = Arc::new(AtomicU32::new(0));
        let mut events1 = Vec::new();
        run_acp_prompt_with_options(
            &provider,
            Some("System"),
            "First turn",
            Some(tmp.path()),
            rx1,
            pid1,
            Some(Arc::clone(&slot)),
            PermissionMode::Interactive(broker.clone()),
            |k, t, d| events1.push((k.to_string(), t.to_string(), d)),
        )
        .await
        .expect("turn 1 succeeds");

        assert!(events1.iter().any(|(k, t, _)| k == "delta" && t == "Turn 1 ok"));
        let captured = seen_perm.lock().unwrap().clone().expect("permission seen");
        assert_eq!(captured.0, "edit_post");
        assert_eq!(captured.1.as_deref(), Some("edit"));
        assert_eq!(captured.2.len(), 2);

        let perm_raw = fs::read_to_string(&perm_reply_path).expect("perm reply logged");
        let perm_val: Value = serde_json::from_str(perm_raw.trim()).unwrap();
        assert_eq!(perm_val["result"]["outcome"]["outcome"], "selected");
        assert_eq!(perm_val["result"]["outcome"]["optionId"], "allow-once");

        // Second turn reuses the live ACP child process and session without re-initializing
        let (_tx2, rx2) = watch::channel(false);
        let pid2 = Arc::new(AtomicU32::new(0));
        let mut events2 = Vec::new();
        run_acp_prompt_with_options(
            &provider,
            Some("System"),
            "Second turn",
            Some(tmp.path()),
            rx2,
            pid2,
            Some(Arc::clone(&slot)),
            PermissionMode::Interactive(broker),
            |k, t, d| events2.push((k.to_string(), t.to_string(), d)),
        )
        .await
        .expect("turn 2 succeeds");

        assert!(events2.iter().any(|(k, t, _)| k == "delta" && t == "Turn 2 ok"));

        let init_lines = fs::read_to_string(&init_count_path).expect("init log");
        assert_eq!(init_lines.lines().count(), 1);

        let prompt_lines = fs::read_to_string(&prompt_log_path).expect("prompt log");
        assert_eq!(prompt_lines.lines().count(), 2);

        slot.reset_async().await;
    }
}
