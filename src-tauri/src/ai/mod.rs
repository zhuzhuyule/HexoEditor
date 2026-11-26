pub mod acp_client;
pub mod api_client;
pub mod cli_client;
pub mod context;
pub mod discovery;

use std::collections::HashMap;
use std::fmt;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::watch;

use crate::error::{AppError, AppResult};

pub const AI_STREAM_EVENT: &str = "ai-stream";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredAgent {
    pub id: String,
    pub label: String,
    pub executable: String,
    pub args: Vec<String>,
    pub protocol: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcpAgentInfo {
    pub name: String,
    pub version: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcpAuthMethod {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpProbeResult {
    pub ok: bool,
    pub protocol_version: Option<u64>,
    pub agent_info: Option<AcpAgentInfo>,
    pub agent_capabilities: serde_json::Value,
    pub auth_methods: Vec<AcpAuthMethod>,
    pub message: String,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SiteMarkdownConfig {
    pub breaks: Option<bool>,
    pub math_enabled: bool,
    pub mermaid_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveDocContext {
    pub relative_path: String,
    pub local_images: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SiteContextSnapshot {
    pub engine: String,
    pub site_title: String,
    pub language: String,
    pub permalink: String,
    pub post_asset_folder: bool,
    pub theme: Option<String>,
    pub markdown_config: SiteMarkdownConfig,
    pub enabled_theme_tags: Vec<String>,
    pub existing_categories: Vec<String>,
    pub existing_tags: Vec<String>,
    pub active_doc: Option<ActiveDocContext>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub mode: String,
    pub executable: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub cwd: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
}

impl fmt::Debug for AiProviderConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let redacted_key = self
            .api_key
            .as_deref()
            .filter(|k| !k.trim().is_empty())
            .map(|_| "[REDACTED]");
        let mut env_keys: Vec<&str> = self.env.keys().map(String::as_str).collect();
        env_keys.sort_unstable();
        f.debug_struct("AiProviderConfig")
            .field("mode", &self.mode)
            .field("executable", &self.executable)
            .field("args", &self.args)
            .field("env_keys", &env_keys)
            .field("cwd", &self.cwd)
            .field("base_url", &self.base_url)
            .field("api_key", &redacted_key)
            .field("model", &self.model)
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRunRequest {
    #[serde(default)]
    pub request_id: String,
    pub provider: AiProviderConfig,
    pub system_prompt: Option<String>,
    pub prompt: String,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamEvent {
    pub request_id: String,
    pub kind: String,
    pub text: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConnectionResult {
    pub ok: bool,
    pub provider: String,
    pub message: String,
    pub latency_ms: u64,
}

struct ActiveAiTask {
    cancel_tx: watch::Sender<bool>,
    child_pid: Arc<AtomicU32>,
}

pub struct AiRuntimeState {
    next_id: AtomicU64,
    tasks: Arc<Mutex<HashMap<String, ActiveAiTask>>>,
}

impl Default for AiRuntimeState {
    fn default() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            tasks: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl Drop for AiRuntimeState {
    fn drop(&mut self) {
        self.stop_all_blocking();
    }
}

impl AiRuntimeState {
    fn register_task(&self, requested_id: &str) -> AppResult<(String, watch::Receiver<bool>, Arc<AtomicU32>)> {
        let id = if requested_id.trim().is_empty() {
            let seq = self.next_id.fetch_add(1, Ordering::Relaxed);
            format!("ai-req-{}", seq)
        } else {
            requested_id.trim().to_string()
        };

        let (cancel_tx, cancel_rx) = watch::channel(false);
        let child_pid = Arc::new(AtomicU32::new(0));

        let previous = {
            let mut guard = self
                .tasks
                .lock()
                .map_err(|_| AppError::Watcher("failed to lock AI runtime state".into()))?;
            guard.insert(
                id.clone(),
                ActiveAiTask {
                    cancel_tx,
                    child_pid: Arc::clone(&child_pid),
                },
            )
        };

        if let Some(prev) = previous {
            let _ = prev.cancel_tx.send(true);
            let pid = prev.child_pid.load(Ordering::Acquire);
            if pid > 0 {
                terminate_process_group_force(pid);
            }
        }

        Ok((id, cancel_rx, child_pid))
    }

    pub fn cancel_request(&self, request_id: Option<&str>) -> AppResult<bool> {
        let targets: Vec<ActiveAiTask> = {
            let mut guard = self
                .tasks
                .lock()
                .map_err(|_| AppError::Watcher("failed to lock AI runtime state".into()))?;
            match request_id.map(str::trim).filter(|s| !s.is_empty()) {
                Some(id) => guard.remove(id).into_iter().collect(),
                None => guard.drain().map(|(_, v)| v).collect(),
            }
        };

        if targets.is_empty() {
            return Ok(false);
        }

        for task in targets {
            let _ = task.cancel_tx.send(true);
            let pid = task.child_pid.load(Ordering::Acquire);
            if pid > 0 {
                terminate_process_group_graceful(pid);
            }
        }

        Ok(true)
    }

    pub fn stop_all_blocking(&self) {
        let targets: Vec<ActiveAiTask> = {
            let Ok(mut guard) = self.tasks.lock() else {
                return;
            };
            guard.drain().map(|(_, v)| v).collect()
        };

        for task in targets {
            let _ = task.cancel_tx.send(true);
            let pid = task.child_pid.load(Ordering::Acquire);
            if pid > 0 {
                terminate_process_group_force(pid);
            }
        }
    }
}

pub(crate) fn terminate_process_group_graceful(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let pgid_arg = format!("-{}", pid);
        let ok = std::process::Command::new("kill")
            .args(["-TERM", &pgid_arg])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            let _ = std::process::Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
        }
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
}

pub(crate) fn terminate_process_group_force(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let pgid_arg = format!("-{}", pid);
        let ok = std::process::Command::new("kill")
            .args(["-KILL", &pgid_arg])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            let _ = std::process::Command::new("kill")
                .args(["-KILL", &pid.to_string()])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
        }
    }
    #[cfg(target_os = "windows")]
    {
        terminate_process_group_graceful(pid);
    }
}

pub(crate) fn emit_ai_event(
    app: &AppHandle,
    request_id: &str,
    kind: &str,
    text: impl Into<String>,
    done: bool,
) {
    let payload = AiStreamEvent {
        request_id: request_id.to_string(),
        kind: kind.to_string(),
        text: text.into(),
        done,
    };
    let _ = app.emit(AI_STREAM_EVENT, payload);
}

#[tauri::command]
pub async fn discover_local_agents() -> AppResult<Vec<DiscoveredAgent>> {
    discovery::discover_local_agents().await
}

#[tauri::command]
pub async fn probe_acp_agent(
    executable: String,
    args: Vec<String>,
    env: Option<HashMap<String, String>>,
    cwd: Option<String>,
) -> AppResult<AcpProbeResult> {
    let cwd_path = cwd
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    acp_client::probe_acp_agent(&executable, &args, env.as_ref(), cwd_path.as_deref()).await
}

#[tauri::command]
pub fn build_site_ai_context(
    site_root: String,
    doc_path: Option<String>,
) -> AppResult<SiteContextSnapshot> {
    context::build_site_ai_context(&site_root, doc_path.as_deref())
}

#[tauri::command]
pub async fn test_ai_connection(config: AiProviderConfig) -> AppResult<AiConnectionResult> {
    api_client::test_ai_connection(&config).await
}

#[tauri::command]
pub async fn ai_run_prompt(
    app: AppHandle,
    state: State<'_, AiRuntimeState>,
    request: AiRunRequest,
) -> AppResult<String> {
    if request.prompt.trim().is_empty() {
        return Err(AppError::InvalidInput("AI prompt cannot be empty".into()));
    }

    let mode = request.provider.mode.trim().to_ascii_lowercase();
    match mode.as_str() {
        "acp" | "cli" => {
            if request
                .provider
                .executable
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .is_none()
            {
                return Err(AppError::InvalidInput(
                    "Executable path is required for ACP/CLI provider".into(),
                ));
            }
        }
        "openai_compatible" | "anthropic" | "ollama" => {}
        other => {
            return Err(AppError::InvalidInput(format!(
                "Unsupported AI provider mode: {}",
                other
            )));
        }
    }

    let (request_id, cancel_rx, child_pid) = state.register_task(&request.request_id)?;
    let tasks_map = Arc::clone(&state.tasks);
    let req_id_for_task = request_id.clone();

    tauri::async_runtime::spawn(async move {
        let cwd_path = request
            .provider
            .cwd
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .or_else(|| {
                request
                    .cwd
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
            })
            .map(PathBuf::from)
            .filter(|p| p.is_dir());

        let result = match mode.as_str() {
            "acp" => {
                acp_client::run_acp_prompt(
                    &app,
                    &req_id_for_task,
                    &request.provider,
                    request.system_prompt.as_deref(),
                    &request.prompt,
                    cwd_path.as_deref(),
                    cancel_rx.clone(),
                    Arc::clone(&child_pid),
                )
                .await
            }
            "cli" => {
                cli_client::run_cli_prompt(
                    &app,
                    &req_id_for_task,
                    &request.provider,
                    request.system_prompt.as_deref(),
                    &request.prompt,
                    cwd_path.as_deref(),
                    cancel_rx.clone(),
                    Arc::clone(&child_pid),
                )
                .await
            }
            _ => {
                api_client::run_api_prompt(
                    &app,
                    &req_id_for_task,
                    &request.provider,
                    request.system_prompt.as_deref(),
                    &request.prompt,
                    cancel_rx.clone(),
                )
                .await
            }
        };

        if let Ok(mut guard) = tasks_map.lock() {
            guard.remove(&req_id_for_task);
        }

        if *cancel_rx.borrow() {
            emit_ai_event(&app, &req_id_for_task, "done", "", true);
            return;
        }

        if let Err(err) = result {
            let safe_msg = api_client::redact_secret(
                &err.to_string(),
                request.provider.api_key.as_deref(),
            );
            emit_ai_event(&app, &req_id_for_task, "error", safe_msg, true);
        }
    });

    Ok(request_id)
}

#[tauri::command]
pub fn ai_cancel_prompt(
    state: State<'_, AiRuntimeState>,
    request_id: Option<String>,
) -> AppResult<bool> {
    state.cancel_request(request_id.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ai_provider_config_debug_redacts_api_key() {
        let mut env = HashMap::new();
        env.insert(
            "XDG_CONFIG_HOME".to_string(),
            "/tmp/secret-account-dir".to_string(),
        );
        env.insert(
            "OPENAI_API_KEY".to_string(),
            "sk-env-secret-99999".to_string(),
        );
        let cfg = AiProviderConfig {
            mode: "openai_compatible".to_string(),
            executable: None,
            args: vec![],
            env,
            cwd: Some("/tmp/blog".to_string()),
            base_url: Some("https://api.example.com/v1".to_string()),
            api_key: Some("sk-super-secret-value-12345".to_string()),
            model: Some("gpt-4o-mini".to_string()),
        };
        let debug_str = format!("{:?}", cfg);
        assert!(!debug_str.contains("sk-super-secret-value-12345"));
        assert!(!debug_str.contains("sk-env-secret-99999"));
        assert!(!debug_str.contains("/tmp/secret-account-dir"));
        assert!(debug_str.contains("OPENAI_API_KEY"));
        assert!(debug_str.contains("XDG_CONFIG_HOME"));
        assert!(debug_str.contains("[REDACTED]"));
        assert!(debug_str.contains("openai_compatible"));
    }

    #[test]
    fn ai_runtime_state_registers_and_cancels_tasks() {
        let state = AiRuntimeState::default();
        let (id, rx, _pid) = state.register_task("req-1").expect("register task");
        assert_eq!(id, "req-1");
        assert!(!*rx.borrow());

        let cancelled = state.cancel_request(Some("req-1")).expect("cancel task");
        assert!(cancelled);
        assert!(*rx.borrow());

        let cancelled_again = state.cancel_request(Some("req-1")).expect("cancel missing");
        assert!(!cancelled_again);
    }
}
