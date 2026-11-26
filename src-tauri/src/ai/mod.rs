pub mod acp_client;
pub mod api_client;
pub mod cli_client;
pub mod context;
pub mod discovery;
pub mod prompts_store;
pub mod registry;

use std::collections::HashMap;
use std::fmt;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Listener, State};
use tokio::sync::{oneshot, watch};

use crate::error::{AppError, AppResult};

pub const AI_STREAM_EVENT: &str = "ai-stream";
pub const AI_PERMISSION_REQUEST_EVENT: &str = "ai-permission-request";
const MAX_API_HISTORY_TURNS: usize = 10;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcpPermissionOption {
    pub option_id: String,
    pub name: String,
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcpPermissionRequestEvent {
    pub permission_id: String,
    pub request_id: String,
    pub tool_title: String,
    pub kind: Option<String>,
    pub options: Vec<AcpPermissionOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcpPermissionDecision {
    pub option_id: Option<String>,
    pub cancelled: bool,
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
    #[serde(default)]
    pub session_key: Option<String>,
    #[serde(default)]
    pub keep_session: Option<bool>,
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

struct PendingPermissionEntry {
    request_id: String,
    tx: oneshot::Sender<AcpPermissionDecision>,
}

#[derive(Debug, Clone)]
struct ApiHistoryTurn {
    user: String,
    assistant: String,
}

pub struct AiRuntimeState {
    next_id: AtomicU64,
    next_perm_id: Arc<AtomicU64>,
    tasks: Arc<Mutex<HashMap<String, ActiveAiTask>>>,
    pending_permissions: Arc<Mutex<HashMap<String, PendingPermissionEntry>>>,
    acp_sessions: Arc<Mutex<HashMap<String, Arc<acp_client::AcpSessionSlot>>>>,
    api_histories: Arc<Mutex<HashMap<String, Vec<ApiHistoryTurn>>>>,
}

impl Default for AiRuntimeState {
    fn default() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            next_perm_id: Arc::new(AtomicU64::new(1)),
            tasks: Arc::new(Mutex::new(HashMap::new())),
            pending_permissions: Arc::new(Mutex::new(HashMap::new())),
            acp_sessions: Arc::new(Mutex::new(HashMap::new())),
            api_histories: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl Drop for AiRuntimeState {
    fn drop(&mut self) {
        self.stop_all_blocking();
    }
}

impl AiRuntimeState {
    fn register_task(
        &self,
        requested_id: &str,
    ) -> AppResult<(String, watch::Receiver<bool>, Arc<AtomicU32>)> {
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

    pub fn respond_permission(
        &self,
        permission_id: &str,
        option_id: Option<String>,
        cancelled: bool,
    ) -> AppResult<bool> {
        let entry = {
            let mut guard = self
                .pending_permissions
                .lock()
                .map_err(|_| AppError::Watcher("failed to lock permission state".into()))?;
            guard.remove(permission_id.trim())
        };

        let Some(pending) = entry else {
            return Ok(false);
        };

        let _ = pending
            .tx
            .send(AcpPermissionDecision { option_id, cancelled });
        Ok(true)
    }

    fn cancel_permissions_for_request(
        pending_permissions: &Arc<Mutex<HashMap<String, PendingPermissionEntry>>>,
        request_id: Option<&str>,
    ) {
        let drained: Vec<PendingPermissionEntry> = {
            let Ok(mut guard) = pending_permissions.lock() else {
                return;
            };
            match request_id.map(str::trim).filter(|s| !s.is_empty()) {
                Some(target) => {
                    let keys: Vec<String> = guard
                        .iter()
                        .filter_map(|(k, v)| {
                            if v.request_id == target {
                                Some(k.clone())
                            } else {
                                None
                            }
                        })
                        .collect();
                    keys.into_iter().filter_map(|k| guard.remove(&k)).collect()
                }
                None => guard.drain().map(|(_, v)| v).collect(),
            }
        };

        for entry in drained {
            let _ = entry.tx.send(AcpPermissionDecision {
                option_id: None,
                cancelled: true,
            });
        }
    }

    fn get_or_create_acp_session_slot(
        &self,
        session_key: &str,
    ) -> AppResult<Arc<acp_client::AcpSessionSlot>> {
        let mut guard = self
            .acp_sessions
            .lock()
            .map_err(|_| AppError::Watcher("failed to lock ACP sessions".into()))?;
        let slot = guard
            .entry(session_key.to_string())
            .or_insert_with(|| Arc::new(acp_client::AcpSessionSlot::new()));
        Ok(Arc::clone(slot))
    }

    fn format_prompt_with_api_history(&self, session_key: &str, prompt: &str) -> String {
        let Ok(guard) = self.api_histories.lock() else {
            return prompt.to_string();
        };
        let Some(turns) = guard.get(session_key) else {
            return prompt.to_string();
        };
        if turns.is_empty() {
            return prompt.to_string();
        }
        let mut out = String::from("Previous conversation turns:\n");
        for turn in turns {
            out.push_str("User: ");
            out.push_str(turn.user.trim());
            out.push_str("\nAssistant: ");
            out.push_str(turn.assistant.trim());
            out.push_str("\n\n");
        }
        out.push_str("Current request:\n");
        out.push_str(prompt);
        out
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

        Self::cancel_permissions_for_request(&self.pending_permissions, request_id);

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

    pub async fn reset_session(&self, session_key: Option<&str>) -> AppResult<bool> {
        let normalized = session_key.map(str::trim).filter(|s| !s.is_empty());

        let removed_slots: Vec<Arc<acp_client::AcpSessionSlot>> = {
            let mut guard = self
                .acp_sessions
                .lock()
                .map_err(|_| AppError::Watcher("failed to lock ACP sessions".into()))?;
            match normalized {
                Some(key) => guard.remove(key).into_iter().collect(),
                None => guard.drain().map(|(_, v)| v).collect(),
            }
        };

        let removed_history = {
            let mut guard = self
                .api_histories
                .lock()
                .map_err(|_| AppError::Watcher("failed to lock API histories".into()))?;
            match normalized {
                Some(key) => guard.remove(key).is_some(),
                None => {
                    let had = !guard.is_empty();
                    guard.clear();
                    had
                }
            }
        };

        let had_slots = !removed_slots.is_empty();
        for slot in removed_slots {
            slot.reset_async().await;
        }

        Ok(had_slots || removed_history)
    }

    pub fn stop_all_blocking(&self) {
        let targets: Vec<ActiveAiTask> = {
            let Ok(mut guard) = self.tasks.lock() else {
                return;
            };
            guard.drain().map(|(_, v)| v).collect()
        };

        Self::cancel_permissions_for_request(&self.pending_permissions, None);

        for task in targets {
            let _ = task.cancel_tx.send(true);
            let pid = task.child_pid.load(Ordering::Acquire);
            if pid > 0 {
                terminate_process_group_force(pid);
            }
        }

        if let Ok(mut guard) = self.acp_sessions.lock() {
            for (_, slot) in guard.drain() {
                slot.force_kill_blocking();
            }
        }

        if let Ok(mut guard) = self.api_histories.lock() {
            guard.clear();
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
pub fn list_site_prompts(site_root: String) -> AppResult<Vec<prompts_store::SitePromptTemplate>> {
    prompts_store::list_site_prompts(&site_root)
}

#[tauri::command]
pub async fn fetch_acp_registry() -> AppResult<registry::AcpRegistryResult> {
    registry::fetch_acp_registry().await
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

    let keep_session = request.keep_session.unwrap_or(false);
    let session_key = request
        .session_key
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string);

    let session_slot = if mode == "acp" && keep_session {
        if let Some(ref key) = session_key {
            Some(state.get_or_create_acp_session_slot(key)?)
        } else {
            None
        }
    } else {
        None
    };

    let effective_api_prompt = if keep_session && !matches!(mode.as_str(), "acp" | "cli") {
        session_key
            .as_deref()
            .map(|k| state.format_prompt_with_api_history(k, &request.prompt))
            .unwrap_or_else(|| request.prompt.clone())
    } else {
        request.prompt.clone()
    };

    let (request_id, cancel_rx, child_pid) = state.register_task(&request.request_id)?;
    let tasks_map = Arc::clone(&state.tasks);
    let pending_perms = Arc::clone(&state.pending_permissions);
    let next_perm_id = Arc::clone(&state.next_perm_id);
    let api_histories = Arc::clone(&state.api_histories);
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
                let app_for_perm = app.clone();
                let req_for_perm = req_id_for_task.clone();
                let perms_for_cb = Arc::clone(&pending_perms);
                let seq_for_cb = Arc::clone(&next_perm_id);
                let broker: acp_client::PermissionRequestCallback =
                    Arc::new(move |tool_title, kind, options| {
                        let perm_seq = seq_for_cb.fetch_add(1, Ordering::Relaxed);
                        let permission_id = format!("perm-{}-{}", req_for_perm, perm_seq);
                        let (tx, rx) = oneshot::channel();
                        if let Ok(mut guard) = perms_for_cb.lock() {
                            guard.insert(
                                permission_id.clone(),
                                PendingPermissionEntry {
                                    request_id: req_for_perm.clone(),
                                    tx,
                                },
                            );
                        }
                        acp_client::emit_permission_request(
                            &app_for_perm,
                            AcpPermissionRequestEvent {
                                permission_id,
                                request_id: req_for_perm.clone(),
                                tool_title,
                                kind,
                                options,
                            },
                        );
                        rx
                    });

                acp_client::run_acp_prompt(
                    &app,
                    &req_id_for_task,
                    &request.provider,
                    request.system_prompt.as_deref(),
                    &request.prompt,
                    cwd_path.as_deref(),
                    cancel_rx.clone(),
                    Arc::clone(&child_pid),
                    session_slot,
                    broker,
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
                let acc_reply = Arc::new(Mutex::new(String::new()));
                let listener_handle = if keep_session && session_key.is_some() {
                    let acc_clone = Arc::clone(&acc_reply);
                    let target_req_id = req_id_for_task.clone();
                    Some(app.listen(AI_STREAM_EVENT, move |ev| {
                        if let Ok(parsed) = serde_json::from_str::<AiStreamEvent>(ev.payload()) {
                            if parsed.request_id == target_req_id && parsed.kind == "delta" {
                                if let Ok(mut buf) = acc_clone.lock() {
                                    buf.push_str(&parsed.text);
                                }
                            }
                        }
                    }))
                } else {
                    None
                };

                let api_res = api_client::run_api_prompt(
                    &app,
                    &req_id_for_task,
                    &request.provider,
                    request.system_prompt.as_deref(),
                    &effective_api_prompt,
                    cancel_rx.clone(),
                )
                .await;

                if let Some(lid) = listener_handle {
                    app.unlisten(lid);
                }

                if api_res.is_ok() && !*cancel_rx.borrow() && keep_session {
                    if let Some(ref key) = session_key {
                        let reply_text = acc_reply
                            .lock()
                            .map(|s| s.trim().to_string())
                            .unwrap_or_default();
                        if !reply_text.is_empty() {
                            if let Ok(mut guard) = api_histories.lock() {
                                let turns = guard.entry(key.clone()).or_default();
                                turns.push(ApiHistoryTurn {
                                    user: request.prompt.clone(),
                                    assistant: reply_text,
                                });
                                if turns.len() > MAX_API_HISTORY_TURNS {
                                    let drain_count = turns.len() - MAX_API_HISTORY_TURNS;
                                    turns.drain(..drain_count);
                                }
                            }
                        }
                    }
                }

                api_res
            }
        };

        AiRuntimeState::cancel_permissions_for_request(&pending_perms, Some(&req_id_for_task));

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

#[tauri::command]
pub fn ai_respond_permission(
    state: State<'_, AiRuntimeState>,
    permission_id: String,
    option_id: Option<String>,
    cancelled: bool,
) -> AppResult<bool> {
    state.respond_permission(&permission_id, option_id, cancelled)
}

#[tauri::command]
pub async fn ai_reset_session(
    state: State<'_, AiRuntimeState>,
    session_key: Option<String>,
) -> AppResult<bool> {
    state.reset_session(session_key.as_deref()).await
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

    #[tokio::test]
    async fn ai_runtime_state_handles_permission_responses_and_session_resets() {
        let state = AiRuntimeState::default();
        let (tx, rx) = oneshot::channel();
        state.pending_permissions.lock().unwrap().insert(
            "perm-1".to_string(),
            PendingPermissionEntry {
                request_id: "req-1".to_string(),
                tx,
            },
        );

        let ok = state
            .respond_permission("perm-1", Some("allow_once".to_string()), false)
            .expect("respond");
        assert!(ok);
        let decision = rx.await.expect("decision");
        assert_eq!(decision.option_id.as_deref(), Some("allow_once"));
        assert!(!decision.cancelled);

        // Missing permission returns false
        let missing = state
            .respond_permission("perm-1", None, true)
            .expect("respond missing");
        assert!(!missing);

        // API history reset
        state.api_histories.lock().unwrap().insert(
            "drawer-1".to_string(),
            vec![ApiHistoryTurn {
                user: "hi".to_string(),
                assistant: "hello".to_string(),
            }],
        );
        let formatted = state.format_prompt_with_api_history("drawer-1", "follow up");
        assert!(formatted.contains("User: hi"));
        assert!(formatted.contains("Assistant: hello"));
        assert!(formatted.contains("follow up"));

        assert!(state.reset_session(Some("drawer-1")).await.unwrap());
        assert!(!state.reset_session(Some("drawer-1")).await.unwrap());
    }
}
