use std::collections::HashSet;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use regex::Regex;
use serde_yaml::Value;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;
use tokio::sync::{oneshot, watch};

use crate::error::{AppError, AppResult};
use crate::models::{HexoCliOutputEvent, HexoCliStatus, KillPortResult};

pub const HEXO_CLI_OUTPUT_EVENT: &str = "hexo-cli-output";
pub const HEXO_CLI_STATUS_EVENT: &str = "hexo-cli-status";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HexoAction {
    Server,
    Generate,
    Deploy,
    GenerateDeploy,
    Clean,
}

impl HexoAction {
    pub fn parse(raw: &str) -> AppResult<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "server" | "s" => Ok(Self::Server),
            "generate" | "g" => Ok(Self::Generate),
            "deploy" | "d" => Ok(Self::Deploy),
            "generate_deploy" | "generatedeploy" | "gd" | "g -d" | "generate -d" => {
                Ok(Self::GenerateDeploy)
            }
            "clean" => Ok(Self::Clean),
            other => Err(AppError::InvalidInput(format!(
                "Unsupported Hexo action: {}",
                other
            ))),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Server => "server",
            Self::Generate => "generate",
            Self::Deploy => "deploy",
            Self::GenerateDeploy => "generate_deploy",
            Self::Clean => "clean",
        }
    }

    pub fn hexo_args(self) -> Vec<String> {
        match self {
            Self::Server => vec!["server".to_string()],
            Self::Generate => vec!["generate".to_string()],
            Self::Deploy => vec!["deploy".to_string()],
            Self::GenerateDeploy => vec!["generate".to_string(), "--deploy".to_string()],
            Self::Clean => vec!["clean".to_string()],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HexoServerConfig {
    pub port: u16,
    pub ip: String,
}

impl Default for HexoServerConfig {
    fn default() -> Self {
        Self {
            port: 4000,
            ip: "localhost".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HexoInvocation {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub path_env: OsString,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn read_hexo_server_config(site_root: &Path) -> HexoServerConfig {
    let mut cfg = HexoServerConfig::default();
    let config_path = site_root.join("_config.yml");
    let Ok(raw) = fs::read_to_string(&config_path) else {
        return cfg;
    };
    let Ok(parsed) = serde_yaml::from_str::<Value>(&raw) else {
        return cfg;
    };
    let Some(server_map) = parsed
        .as_mapping()
        .and_then(|m| m.get(Value::String("server".into())))
        .and_then(Value::as_mapping)
    else {
        return cfg;
    };

    if let Some(port_val) = server_map.get(Value::String("port".into())) {
        let parsed_port = match port_val {
            Value::Number(n) => n.as_u64().and_then(|v| u16::try_from(v).ok()),
            Value::String(s) => s.trim().parse::<u16>().ok(),
            _ => None,
        };
        if let Some(port) = parsed_port.filter(|&p| p > 0) {
            cfg.port = port;
        }
    }

    if let Some(ip_val) = server_map.get(Value::String("ip".into())) {
        if let Some(ip) = ip_val.as_str().map(str::trim).filter(|s| !s.is_empty()) {
            cfg.ip = ip.to_string();
        }
    }

    cfg
}

pub fn is_port_in_use(ip: &str, port: u16) -> bool {
    let check_addr = |addr: (&str, u16)| -> bool {
        match TcpListener::bind(addr) {
            Ok(_listener) => false,
            Err(e) => e.kind() == std::io::ErrorKind::AddrInUse,
        }
    };

    let trimmed = ip.trim();
    if trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("localhost")
        || trimmed == "0.0.0.0"
        || trimmed == "::"
    {
        check_addr(("127.0.0.1", port)) || check_addr(("::1", port))
    } else {
        check_addr((trimmed, port))
    }
}

fn parse_semver_tuple(name: &str) -> (u32, u32, u32) {
    let trimmed = name.trim_start_matches(['v', 'V']);
    let mut parts = trimmed.split('.');
    let major = parts
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);
    let minor = parts
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);
    let patch = parts
        .next()
        .and_then(|s| {
            s.split(|c: char| !c.is_ascii_digit())
                .next()
                .and_then(|d| d.parse::<u32>().ok())
        })
        .unwrap_or(0);
    (major, minor, patch)
}

/// Scans `~/.nvm/versions/node/*/bin` sorted by descending semantic version.
pub fn collect_nvm_node_bins(nvm_versions_dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(nvm_versions_dir) else {
        return Vec::new();
    };
    let mut versions: Vec<((u32, u32, u32), PathBuf)> = Vec::new();
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let bin = path.join("bin");
        if bin.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            versions.push((parse_semver_tuple(&name), bin));
        }
    }
    versions.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    versions.into_iter().map(|(_, p)| p).collect()
}

fn collect_fnm_node_bins(home_dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let direct_candidates = [
        home_dir.join(".fnm/current/bin"),
        home_dir.join(".fnm/aliases/default/bin"),
        home_dir.join(".local/share/fnm/aliases/default/bin"),
        home_dir.join("Library/Application Support/fnm/aliases/default/bin"),
    ];
    for c in direct_candidates {
        if c.is_dir() {
            out.push(c);
        }
    }

    let version_roots = [
        home_dir.join(".fnm/node-versions"),
        home_dir.join(".local/share/fnm/node-versions"),
        home_dir.join("Library/Application Support/fnm/node-versions"),
    ];
    for root in version_roots {
        let Ok(entries) = fs::read_dir(&root) else {
            continue;
        };
        let mut versions: Vec<((u32, u32, u32), PathBuf)> = Vec::new();
        for entry in entries.filter_map(Result::ok) {
            let bin = entry.path().join("installation").join("bin");
            if bin.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                versions.push((parse_semver_tuple(&name), bin));
            }
        }
        versions.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        out.extend(versions.into_iter().map(|(_, p)| p));
    }
    out
}

fn user_home_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

/// Builds a deduplicated list of candidate directories for resolving `node`, `hexo`, and `npx`.
pub fn build_candidate_path_dirs(
    site_root: Option<&Path>,
    home_dir: Option<&Path>,
    existing_path: Option<&OsStr>,
) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();

    let mut push_unique = |p: PathBuf| {
        if !p.as_os_str().is_empty() && seen.insert(p.clone()) {
            dirs.push(p);
        }
    };

    // 1. Site-local node_modules/.bin has top priority
    if let Some(root) = site_root {
        let local_bin = root.join("node_modules").join(".bin");
        if local_bin.is_dir() {
            push_unique(local_bin);
        }
    }

    // 2. Existing PATH entries (respects shell-activated toolchains)
    if let Some(existing) = existing_path {
        for entry in std::env::split_paths(existing) {
            push_unique(entry);
        }
    }

    // 3. Common cross-platform Node/Hexo manager and package locations
    if let Some(home) = home_dir {
        #[cfg(not(target_os = "windows"))]
        {
            let volta_bin = home.join(".volta/bin");
            if volta_bin.is_dir() {
                push_unique(volta_bin);
            }

            for fnm_bin in collect_fnm_node_bins(home) {
                push_unique(fnm_bin);
            }

            for nvm_bin in collect_nvm_node_bins(&home.join(".nvm/versions/node")) {
                push_unique(nvm_bin);
            }

            for extra in [
                home.join(".asdf/shims"),
                home.join(".local/share/mise/shims"),
                home.join(".nodenv/shims"),
                home.join(".n/bin"),
                home.join(".npm-global/bin"),
                home.join(".local/bin"),
            ] {
                if extra.is_dir() {
                    push_unique(extra);
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            for extra in [
                home.join(".volta").join("bin"),
                home.join("AppData").join("Roaming").join("npm"),
                home.join("AppData").join("Local").join("Volta").join("bin"),
            ] {
                if extra.is_dir() {
                    push_unique(extra);
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        for sys in [
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/opt/homebrew/sbin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/local/sbin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/bin"),
        ] {
            if sys.is_dir() {
                push_unique(sys);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let npm_bin = PathBuf::from(appdata).join("npm");
            if npm_bin.is_dir() {
                push_unique(npm_bin);
            }
        }
        if let Some(nvm_sym) = std::env::var_os("NVM_SYMLINK") {
            let p = PathBuf::from(nvm_sym);
            if p.is_dir() {
                push_unique(p);
            }
        }
        let default_node = PathBuf::from(r"C:\Program Files\nodejs");
        if default_node.is_dir() {
            push_unique(default_node);
        }
    }

    dirs
}

pub fn find_executable_in_dirs(dirs: &[PathBuf], names: &[&str]) -> Option<PathBuf> {
    for dir in dirs {
        for name in names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn hexo_executable_names() -> &'static [&'static str] {
    #[cfg(target_os = "windows")]
    {
        &["hexo.cmd", "hexo.exe", "hexo.bat", "hexo"]
    }
    #[cfg(not(target_os = "windows"))]
    {
        &["hexo"]
    }
}

fn npx_executable_names() -> &'static [&'static str] {
    #[cfg(target_os = "windows")]
    {
        &["npx.cmd", "npx.exe", "npx.bat", "npx"]
    }
    #[cfg(not(target_os = "windows"))]
    {
        &["npx"]
    }
}

pub fn resolve_hexo_invocation_in_dirs(
    site_root: &Path,
    candidate_dirs: &[PathBuf],
    action: HexoAction,
) -> AppResult<HexoInvocation> {
    let path_env = std::env::join_paths(candidate_dirs).unwrap_or_else(|_| OsString::new());
    let hexo_args = action.hexo_args();

    // 1. Prefer site-local node_modules/.bin/hexo
    let local_bin = site_root.join("node_modules").join(".bin");
    if let Some(local_hexo) = find_executable_in_dirs(&[local_bin], hexo_executable_names()) {
        return Ok(HexoInvocation {
            program: local_hexo,
            args: hexo_args,
            path_env,
        });
    }

    // 2. Global hexo in discovered PATH
    if let Some(global_hexo) = find_executable_in_dirs(candidate_dirs, hexo_executable_names()) {
        return Ok(HexoInvocation {
            program: global_hexo,
            args: hexo_args,
            path_env,
        });
    }

    // 3. Fallback to npx --no-install hexo <args>
    if let Some(npx) = find_executable_in_dirs(candidate_dirs, npx_executable_names()) {
        let mut args = vec!["--no-install".to_string(), "hexo".to_string()];
        args.extend(hexo_args);
        return Ok(HexoInvocation {
            program: npx,
            args,
            path_env,
        });
    }

    Err(AppError::NotFound(
        "Hexo CLI not found. Please install Node.js and Hexo (or run `npm install` in your site directory).".into(),
    ))
}

pub fn resolve_hexo_invocation(site_root: &Path, action: HexoAction) -> AppResult<HexoInvocation> {
    let home = user_home_dir();
    let existing = std::env::var_os("PATH");
    let dirs = build_candidate_path_dirs(Some(site_root), home.as_deref(), existing.as_deref());
    resolve_hexo_invocation_in_dirs(site_root, &dirs, action)
}

/// Strips ANSI CSI escape sequences so regex matching works even with colored terminal output.
pub fn strip_ansi_codes(input: &str) -> String {
    let re = Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]").expect("valid ansi regex");
    re.replace_all(input, "").into_owned()
}

/// Extracts the server URL from Hexo's stdout line, e.g. `Hexo is running at http://localhost:4000/`.
pub fn extract_hexo_server_url(line: &str) -> Option<String> {
    let clean = strip_ansi_codes(line);
    let re =
        Regex::new(r"(?i)Hexo is running at\s+(https?://[^\s,;'`\x22)>\]]+)").expect("valid regex");
    let caps = re.captures(&clean)?;
    let raw = caps.get(1)?.as_str();
    let trimmed = raw.trim_end_matches('.');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(not(target_os = "windows"))]
fn send_unix_signal(pid: u32, signal: &str) {
    let pgid_arg = format!("-{}", pid);
    let pgid_ok = std::process::Command::new("kill")
        .args([signal, &pgid_arg])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !pgid_ok {
        let _ = std::process::Command::new("kill")
            .args([signal, &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(target_os = "windows")]
fn terminate_windows_pid(pid: u32) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn terminate_process_tree_graceful(pid: u32) {
    #[cfg(not(target_os = "windows"))]
    {
        send_unix_signal(pid, "-TERM");
    }
    #[cfg(target_os = "windows")]
    {
        terminate_windows_pid(pid);
    }
}

fn terminate_process_tree_force(pid: u32) {
    #[cfg(not(target_os = "windows"))]
    {
        send_unix_signal(pid, "-KILL");
    }
    #[cfg(target_os = "windows")]
    {
        terminate_windows_pid(pid);
    }
}

#[cfg_attr(target_os = "windows", allow(dead_code))]
pub fn parse_lsof_pids(stdout: &str, self_pid: u32) -> Vec<u32> {
    let mut pids = Vec::new();
    let mut seen = HashSet::new();
    for token in stdout.split_whitespace() {
        if let Ok(pid) = token.parse::<u32>() {
            if pid > 0 && pid != self_pid && seen.insert(pid) {
                pids.push(pid);
            }
        }
    }
    pids
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn parse_windows_netstat_pids(stdout: &str, port: u16, self_pid: u32) -> Vec<u32> {
    let mut pids = Vec::new();
    let mut seen = HashSet::new();
    let suffix = format!(":{}", port);

    for line in stdout.lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 5 {
            continue;
        }
        let proto = cols[0];
        let local_addr = cols[1];
        let state = cols[3];
        let pid_str = cols[4];

        if !proto.eq_ignore_ascii_case("TCP") || !state.eq_ignore_ascii_case("LISTENING") {
            continue;
        }
        if !local_addr.ends_with(&suffix) {
            continue;
        }
        if let Ok(pid) = pid_str.parse::<u32>() {
            if pid > 0 && pid != self_pid && seen.insert(pid) {
                pids.push(pid);
            }
        }
    }
    pids
}

#[cfg(not(target_os = "windows"))]
fn find_listening_pids_on_port(port: u16) -> Vec<u32> {
    let self_pid = std::process::id();
    let port_spec = format!("tcp:{}", port);
    if let Ok(output) = std::process::Command::new("lsof")
        .args(["-ti", &port_spec, "-sTCP:LISTEN"])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            return parse_lsof_pids(&stdout, self_pid);
        }
    }
    Vec::new()
}

#[cfg(target_os = "windows")]
fn find_listening_pids_on_port(port: u16) -> Vec<u32> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let self_pid = std::process::id();
    if let Ok(output) = std::process::Command::new("netstat")
        .args(["-ano", "-p", "tcp"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            return parse_windows_netstat_pids(&stdout, port, self_pid);
        }
    }
    Vec::new()
}

struct ActiveRun {
    run_id: u64,
    pid: u32,
    server_port: Option<u16>,
    stop_tx: Option<oneshot::Sender<()>>,
    done_rx: watch::Receiver<bool>,
}

struct CliRuntime {
    next_run_id: u64,
    starting: bool,
    status: HexoCliStatus,
    active: Option<ActiveRun>,
}

impl Default for CliRuntime {
    fn default() -> Self {
        Self {
            next_run_id: 1,
            starting: false,
            status: HexoCliStatus::default(),
            active: None,
        }
    }
}

struct StartingGuard {
    runtime: Arc<Mutex<CliRuntime>>,
    armed: bool,
}

impl StartingGuard {
    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for StartingGuard {
    fn drop(&mut self) {
        if self.armed {
            if let Ok(mut rt) = self.runtime.lock() {
                rt.starting = false;
            }
        }
    }
}

/// Reads lines from an async byte stream without failing on invalid UTF-8 sequences,
/// stripping trailing `\r`/`\n` and splitting embedded `\r` progress updates cleanly.
async fn read_lossy_lines<R, F>(reader: R, mut on_line: F)
where
    R: AsyncRead + Unpin,
    F: FnMut(String),
{
    let mut buf_reader = BufReader::new(reader);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match buf_reader.read_until(b'\n', &mut buf).await {
            Ok(0) => break,
            Ok(_) => {
                while matches!(buf.last(), Some(b'\n' | b'\r')) {
                    buf.pop();
                }
                let decoded = String::from_utf8_lossy(&buf);
                if decoded.contains('\r') {
                    for segment in decoded.split('\r') {
                        if !segment.is_empty() {
                            on_line(segment.to_string());
                        }
                    }
                } else {
                    on_line(decoded.into_owned());
                }
            }
            Err(_) => break,
        }
    }
}

pub struct HexoCliState {
    runtime: Arc<Mutex<CliRuntime>>,
}

impl Default for HexoCliState {
    fn default() -> Self {
        Self {
            runtime: Arc::new(Mutex::new(CliRuntime::default())),
        }
    }
}

impl Drop for HexoCliState {
    fn drop(&mut self) {
        self.stop_all_blocking();
    }
}

fn emit_output(app: &AppHandle, stream: &str, line: impl Into<String>) {
    let payload = HexoCliOutputEvent {
        stream: stream.to_string(),
        line: line.into(),
        timestamp: now_ms(),
    };
    let _ = app.emit(HEXO_CLI_OUTPUT_EVENT, payload);
}

fn emit_status(app: &AppHandle, status: &HexoCliStatus) {
    let _ = app.emit(HEXO_CLI_STATUS_EVENT, status.clone());
}

impl HexoCliState {
    pub fn get_status(&self) -> HexoCliStatus {
        self.runtime
            .lock()
            .map(|rt| rt.status.clone())
            .unwrap_or_default()
    }

    fn try_acquire_start_slot(&self) -> AppResult<StartingGuard> {
        let mut rt = self
            .runtime
            .lock()
            .map_err(|_| AppError::Watcher("failed to lock Hexo CLI state".into()))?;
        if rt.status.running || rt.starting {
            let running_action = rt.status.action.as_deref().unwrap_or("hexo");
            return Err(AppError::AlreadyExists(format!(
                "Hexo command `{}` is already running. Stop it first.",
                running_action
            )));
        }
        rt.starting = true;
        Ok(StartingGuard {
            runtime: Arc::clone(&self.runtime),
            armed: true,
        })
    }

    pub async fn run_command(
        &self,
        app: AppHandle,
        site_root: &str,
        action_raw: &str,
    ) -> AppResult<HexoCliStatus> {
        let action = HexoAction::parse(action_raw)?;
        let root_path = PathBuf::from(site_root);
        if !root_path.is_dir() {
            return Err(AppError::NotFound(format!(
                "Site directory does not exist: {}",
                site_root
            )));
        }

        // Atomically reserve the start slot to prevent concurrent TOCTOU spawns
        let mut start_guard = self.try_acquire_start_slot()?;

        let server_cfg = if action == HexoAction::Server {
            let cfg = read_hexo_server_config(&root_path);
            if is_port_in_use(&cfg.ip, cfg.port) {
                let msg = format!(
                    "Port {} is already in use on {}. Stop the process or kill port {}.",
                    cfg.port, cfg.ip, cfg.port
                );
                emit_output(&app, "system", &msg);
                return Err(AppError::AlreadyExists(msg));
            }
            Some(cfg)
        } else {
            None
        };

        let invocation = resolve_hexo_invocation(&root_path, action)?;

        let mut cmd = Command::new(&invocation.program);
        cmd.args(&invocation.args)
            .current_dir(&root_path)
            .env("PATH", &invocation.path_env)
            .env("NO_COLOR", "1")
            .env("FORCE_COLOR", "0")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        #[cfg(not(target_os = "windows"))]
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
                format!(
                    "Failed to launch `{}`: {}",
                    invocation.program.display(),
                    e
                ),
            ))
        })?;

        let pid = child.id().unwrap_or(0);
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
        let (done_tx, done_rx) = watch::channel(false);

        let (run_id, initial_status) = {
            let mut rt = self
                .runtime
                .lock()
                .map_err(|_| AppError::Watcher("failed to lock Hexo CLI state".into()))?;
            let id = rt.next_run_id;
            rt.next_run_id = rt.next_run_id.saturating_add(1);
            let status = HexoCliStatus {
                running: true,
                action: Some(action.as_str().to_string()),
                server_running: false,
                server_url: None,
                exit_code: None,
                message: Some(format!("Running `hexo {}`...", action.hexo_args().join(" "))),
            };
            rt.starting = false;
            start_guard.disarm();
            rt.status = status.clone();
            rt.active = Some(ActiveRun {
                run_id: id,
                pid,
                server_port: server_cfg.as_ref().map(|c| c.port),
                stop_tx: Some(stop_tx),
                done_rx,
            });
            (id, status)
        };

        emit_output(
            &app,
            "system",
            format!(
                "$ {} {}",
                invocation.program.display(),
                invocation.args.join(" ")
            ),
        );
        emit_status(&app, &initial_status);

        // Stream stdout (lossy UTF-8 so non-UTF-8 output never aborts reading)
        let runtime_stdout = Arc::clone(&self.runtime);
        let app_stdout = app.clone();
        let stdout_task = tauri::async_runtime::spawn(async move {
            let Some(out) = stdout else { return };
            read_lossy_lines(out, |line| {
                emit_output(&app_stdout, "stdout", &line);
                if action == HexoAction::Server {
                    if let Some(url) = extract_hexo_server_url(&line) {
                        let updated = {
                            if let Ok(mut rt) = runtime_stdout.lock() {
                                if rt.active.as_ref().map(|a| a.run_id) == Some(run_id) {
                                    rt.status.server_running = true;
                                    rt.status.server_url = Some(url.clone());
                                    rt.status.message = Some(format!("Hexo is running at {}", url));
                                    Some(rt.status.clone())
                                } else {
                                    None
                                }
                            } else {
                                None
                            }
                        };
                        if let Some(status) = updated {
                            emit_status(&app_stdout, &status);
                        }
                    }
                }
            })
            .await;
        });

        // Stream stderr (lossy UTF-8)
        let app_stderr = app.clone();
        let stderr_task = tauri::async_runtime::spawn(async move {
            let Some(err) = stderr else { return };
            read_lossy_lines(err, |line| {
                emit_output(&app_stderr, "stderr", &line);
            })
            .await;
        });

        // Supervise child lifecycle & graceful stop
        let runtime_wait = Arc::clone(&self.runtime);
        let app_wait = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut stopped_by_user = false;
            let exit_status = tokio::select! {
                res = child.wait() => res.ok(),
                _ = &mut stop_rx => {
                    stopped_by_user = true;
                    if pid > 0 {
                        terminate_process_tree_graceful(pid);
                    }
                    match tokio::time::timeout(Duration::from_secs(3), child.wait()).await {
                        Ok(res) => res.ok(),
                        Err(_) => {
                            if pid > 0 {
                                terminate_process_tree_force(pid);
                            }
                            let _ = child.kill().await;
                            child.wait().await.ok()
                        }
                    }
                }
            };

            // Give stream readers a brief moment to flush remaining buffered lines
            let _ = tokio::time::timeout(Duration::from_millis(500), stdout_task).await;
            let _ = tokio::time::timeout(Duration::from_millis(500), stderr_task).await;

            let exit_code = exit_status.and_then(|s| s.code());
            let final_msg = if stopped_by_user {
                format!("Stopped `hexo {}`.", action.as_str())
            } else if exit_code == Some(0) {
                format!("Completed `hexo {}`.", action.as_str())
            } else {
                format!(
                    "`hexo {}` exited with code {}.",
                    action.as_str(),
                    exit_code
                        .map(|c| c.to_string())
                        .unwrap_or_else(|| "unknown".to_string())
                )
            };

            emit_output(&app_wait, "system", &final_msg);

            let final_status = {
                if let Ok(mut rt) = runtime_wait.lock() {
                    if rt.active.as_ref().map(|a| a.run_id) == Some(run_id) {
                        rt.active = None;
                        rt.status = HexoCliStatus {
                            running: false,
                            action: Some(action.as_str().to_string()),
                            server_running: false,
                            server_url: None,
                            exit_code,
                            message: Some(final_msg),
                        };
                        Some(rt.status.clone())
                    } else {
                        None
                    }
                } else {
                    None
                }
            };

            if let Some(status) = final_status {
                emit_status(&app_wait, &status);
            }
            let _ = done_tx.send(true);
        });

        Ok(initial_status)
    }

    pub async fn stop_command(&self, app: AppHandle) -> AppResult<HexoCliStatus> {
        let stop_handle = {
            let mut rt = self
                .runtime
                .lock()
                .map_err(|_| AppError::Watcher("failed to lock Hexo CLI state".into()))?;
            if let Some(active) = rt.active.as_mut() {
                let tx = active.stop_tx.take();
                let done_rx = active.done_rx.clone();
                let pid = active.pid;
                Some((tx, done_rx, pid))
            } else {
                None
            }
        };

        if let Some((tx, mut done_rx, pid)) = stop_handle {
            emit_output(&app, "system", "Stopping Hexo process...");
            if let Some(sender) = tx {
                let _ = sender.send(());
            } else if pid > 0 {
                terminate_process_tree_graceful(pid);
            }
            // Level-triggered watch signal guarantees we never miss an immediate exit
            let _ = tokio::time::timeout(
                Duration::from_secs(5),
                done_rx.wait_for(|&done| done),
            )
            .await;
        }

        Ok(self.get_status())
    }

    pub async fn kill_port(&self, app: AppHandle, port: u16) -> AppResult<KillPortResult> {
        if port == 0 {
            return Err(AppError::InvalidInput(
                "Port must be between 1 and 65535".into(),
            ));
        }

        // If our own managed Hexo server is using this port, stop it cleanly first.
        let owns_port = self
            .runtime
            .lock()
            .ok()
            .and_then(|rt| rt.active.as_ref().and_then(|a| a.server_port))
            == Some(port);
        if owns_port {
            let _ = self.stop_command(app.clone()).await;
        }

        let pids = find_listening_pids_on_port(port);
        if pids.is_empty() {
            let message = format!("No listening process found on port {}.", port);
            emit_output(&app, "system", &message);
            return Ok(KillPortResult {
                port,
                killed_pids: Vec::new(),
                message,
            });
        }

        for &pid in &pids {
            terminate_process_tree_graceful(pid);
        }

        #[cfg(not(target_os = "windows"))]
        {
            tokio::time::sleep(Duration::from_millis(300)).await;
            let remaining = find_listening_pids_on_port(port);
            for pid in remaining {
                terminate_process_tree_force(pid);
            }
        }

        let pid_list = pids
            .iter()
            .map(|p| p.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        let message = format!("Released port {} (terminated PID: {}).", port, pid_list);
        emit_output(&app, "system", &message);

        Ok(KillPortResult {
            port,
            killed_pids: pids,
            message,
        })
    }

    /// Synchronous cleanup invoked on window destroy / app exit so no child processes leak.
    pub fn stop_all_blocking(&self) {
        let pid_opt = {
            if let Ok(mut rt) = self.runtime.lock() {
                if let Some(mut active) = rt.active.take() {
                    if let Some(tx) = active.stop_tx.take() {
                        let _ = tx.send(());
                    }
                    rt.status.running = false;
                    rt.status.server_running = false;
                    rt.status.server_url = None;
                    Some(active.pid)
                } else {
                    None
                }
            } else {
                None
            }
        };

        if let Some(pid) = pid_opt.filter(|&p| p > 0) {
            terminate_process_tree_graceful(pid);
            std::thread::sleep(Duration::from_millis(150));
            terminate_process_tree_force(pid);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn touch_file(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, "#!/bin/sh\n").unwrap();
    }

    #[test]
    fn test_hexo_action_parsing_and_args() {
        assert_eq!(HexoAction::parse("server").unwrap(), HexoAction::Server);
        assert_eq!(HexoAction::parse("s").unwrap(), HexoAction::Server);
        assert_eq!(HexoAction::Server.hexo_args(), vec!["server"]);

        assert_eq!(HexoAction::parse("generate").unwrap(), HexoAction::Generate);
        assert_eq!(HexoAction::Generate.hexo_args(), vec!["generate"]);

        assert_eq!(HexoAction::parse("deploy").unwrap(), HexoAction::Deploy);
        assert_eq!(HexoAction::Deploy.hexo_args(), vec!["deploy"]);

        assert_eq!(
            HexoAction::parse("generate_deploy").unwrap(),
            HexoAction::GenerateDeploy
        );
        assert_eq!(
            HexoAction::parse("generateDeploy").unwrap(),
            HexoAction::GenerateDeploy
        );
        assert_eq!(
            HexoAction::GenerateDeploy.hexo_args(),
            vec!["generate", "--deploy"]
        );

        assert_eq!(HexoAction::parse("clean").unwrap(), HexoAction::Clean);
        assert_eq!(HexoAction::Clean.hexo_args(), vec!["clean"]);

        assert!(HexoAction::parse("unknown").is_err());
    }

    #[test]
    fn test_extract_hexo_server_url_plain_and_ansi() {
        assert_eq!(
            extract_hexo_server_url(
                "INFO  Hexo is running at http://localhost:4000/ . Press Ctrl+C to stop."
            ),
            Some("http://localhost:4000/".to_string())
        );
        assert_eq!(
            extract_hexo_server_url(
                "\x1b[32mINFO\x1b[39m  Hexo is running at \x1b[4mhttps://127.0.0.1:4567/blog/\x1b[24m."
            ),
            Some("https://127.0.0.1:4567/blog/".to_string())
        );
        assert_eq!(extract_hexo_server_url("INFO  Start processing"), None);
    }

    #[test]
    fn test_read_hexo_server_config_defaults_and_custom() {
        let dir = TempDir::new().unwrap();
        let default_cfg = read_hexo_server_config(dir.path());
        assert_eq!(default_cfg.port, 4000);
        assert_eq!(default_cfg.ip, "localhost");

        fs::write(
            dir.path().join("_config.yml"),
            "title: Test\nserver:\n  port: 4040\n  ip: 127.0.0.1\n",
        )
        .unwrap();
        let custom_cfg = read_hexo_server_config(dir.path());
        assert_eq!(custom_cfg.port, 4040);
        assert_eq!(custom_cfg.ip, "127.0.0.1");
    }

    #[test]
    fn test_nvm_node_bins_sorted_by_semver_descending() {
        let dir = TempDir::new().unwrap();
        let versions = dir.path().join(".nvm/versions/node");
        fs::create_dir_all(versions.join("v8.17.0/bin")).unwrap();
        fs::create_dir_all(versions.join("v20.11.0/bin")).unwrap();
        fs::create_dir_all(versions.join("v22.2.0/bin")).unwrap();
        fs::create_dir_all(versions.join("v20.18.1/bin")).unwrap();

        let bins = collect_nvm_node_bins(&versions);
        assert_eq!(bins.len(), 4);
        assert!(bins[0].ends_with("v22.2.0/bin"));
        assert!(bins[1].ends_with("v20.18.1/bin"));
        assert!(bins[2].ends_with("v20.11.0/bin"));
        assert!(bins[3].ends_with("v8.17.0/bin"));
    }

    #[test]
    fn test_candidate_path_discovery_and_invocation_priority() {
        let dir = TempDir::new().unwrap();
        let site = dir.path().join("site");
        let home = dir.path().join("home");

        let local_bin = site.join("node_modules/.bin");
        let volta_bin = home.join(".volta/bin");
        let nvm_bin = home.join(".nvm/versions/node/v22.1.0/bin");
        fs::create_dir_all(&local_bin).unwrap();
        fs::create_dir_all(&volta_bin).unwrap();
        fs::create_dir_all(&nvm_bin).unwrap();

        let dirs = build_candidate_path_dirs(Some(&site), Some(&home), None);
        assert_eq!(dirs[0], local_bin);

        #[cfg(not(target_os = "windows"))]
        {
            assert!(dirs.contains(&volta_bin));
            assert!(dirs.contains(&nvm_bin));
        }

        // Case 1: only npx present -> falls back to npx --no-install hexo
        let npx_name = npx_executable_names()[0];
        let hexo_name = hexo_executable_names()[0];
        touch_file(&volta_bin.join(npx_name));
        let inv_npx = resolve_hexo_invocation_in_dirs(
            &site,
            std::slice::from_ref(&volta_bin),
            HexoAction::GenerateDeploy,
        )
        .unwrap();
        assert_eq!(inv_npx.program, volta_bin.join(npx_name));
        assert_eq!(inv_npx.args, vec!["--no-install", "hexo", "generate", "--deploy"]);

        // Case 2: global hexo present -> prefers global hexo over npx
        touch_file(&volta_bin.join(hexo_name));
        let inv_global = resolve_hexo_invocation_in_dirs(
            &site,
            std::slice::from_ref(&volta_bin),
            HexoAction::Clean,
        )
        .unwrap();
        assert_eq!(inv_global.program, volta_bin.join(hexo_name));
        assert_eq!(inv_global.args, vec!["clean"]);

        // Case 3: site-local node_modules/.bin/hexo present -> highest priority
        touch_file(&local_bin.join(hexo_name));
        let inv_local =
            resolve_hexo_invocation_in_dirs(&site, &[volta_bin], HexoAction::Server).unwrap();
        assert_eq!(inv_local.program, local_bin.join(hexo_name));
        assert_eq!(inv_local.args, vec!["server"]);
    }

    #[test]
    fn test_candidate_path_deduplication_and_missing_cli_error() {
        let dir = TempDir::new().unwrap();
        let site = dir.path().join("site");
        let local_bin = site.join("node_modules/.bin");
        let empty_dir = dir.path().join("empty_bin");
        fs::create_dir_all(&local_bin).unwrap();
        fs::create_dir_all(&empty_dir).unwrap();

        let existing = std::env::join_paths([&empty_dir, &local_bin, &empty_dir]).unwrap();
        let dirs = build_candidate_path_dirs(Some(&site), None, Some(&existing));
        assert_eq!(dirs[0], local_bin);
        assert_eq!(dirs.iter().filter(|p| *p == &local_bin).count(), 1);
        assert_eq!(dirs.iter().filter(|p| *p == &empty_dir).count(), 1);

        let err = resolve_hexo_invocation_in_dirs(&site, &[empty_dir], HexoAction::Generate)
            .unwrap_err();
        assert!(err.to_string().contains("Hexo CLI not found"));

        let state = HexoCliState::default();
        assert!(!state.get_status().running);
        assert!(!state.get_status().server_running);
        state.stop_all_blocking();
        assert!(!state.get_status().running);
    }

    #[test]
    fn test_is_port_in_use_detects_bound_socket() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(is_port_in_use("127.0.0.1", port));
        drop(listener);
        assert!(!is_port_in_use("127.0.0.1", port));
    }

    #[test]
    fn test_port_pid_parsers() {
        assert_eq!(parse_lsof_pids("1234\n5678\n1234\n9999\n", 9999), vec![1234, 5678]);

        let netstat_sample = "\
  TCP    0.0.0.0:4000           0.0.0.0:0              LISTENING       4321
  TCP    127.0.0.1:4000         0.0.0.0:0              ESTABLISHED     8888
  TCP    [::]:4000              [::]:0                 LISTENING       4321
  TCP    127.0.0.1:4000         0.0.0.0:0              LISTENING       7777
  TCP    0.0.0.0:40000          0.0.0.0:0              LISTENING       5555
";
        assert_eq!(
            parse_windows_netstat_pids(netstat_sample, 4000, 7777),
            vec![4321]
        );
    }

    #[test]
    fn test_start_slot_guard_prevents_concurrent_reentry_and_resets_on_drop() {
        let state = HexoCliState::default();
        let guard = state.try_acquire_start_slot().unwrap();

        // While starting guard is held, a concurrent call must be rejected
        let err = state.try_acquire_start_slot().err().unwrap();
        assert!(matches!(err, AppError::AlreadyExists(_)));

        // Dropping the guard (simulating early error/spawn failure) releases the slot
        drop(guard);
        let second_guard = state.try_acquire_start_slot().unwrap();
        drop(second_guard);
    }

    #[test]
    fn test_read_lossy_lines_handles_non_utf8_crlf_and_embedded_cr() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            let raw: &[u8] = b"INFO ok\r\nbad \xff\xfe bytes\nstep 1\rstep 2\r\nlast line";
            let mut lines = Vec::new();
            read_lossy_lines(raw, |line| lines.push(line)).await;
            assert_eq!(
                lines,
                vec![
                    "INFO ok",
                    "bad \u{fffd}\u{fffd} bytes",
                    "step 1",
                    "step 2",
                    "last line",
                ]
            );
        });
    }

    #[test]
    fn test_watch_done_signal_does_not_miss_immediate_exit() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            let (done_tx, mut done_rx) = watch::channel(false);
            // Process finishes BEFORE stop_command starts awaiting
            let _ = done_tx.send(true);
            let res = tokio::time::timeout(
                Duration::from_millis(50),
                done_rx.wait_for(|&done| done),
            )
            .await;
            assert!(res.is_ok());
        });
    }
}
