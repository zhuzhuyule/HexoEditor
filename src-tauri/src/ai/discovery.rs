use std::collections::HashSet;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

use crate::error::AppResult;
use crate::hexo_cli::build_candidate_path_dirs;

use super::DiscoveredAgent;

struct AgentSpec {
    id: &'static str,
    bin: &'static str,
    args: &'static [&'static str],
    protocol: &'static str,
    label: &'static str,
}

const KNOWN_AGENT_SPECS: &[AgentSpec] = &[
    AgentSpec {
        id: "antigravity",
        bin: "agy",
        args: &["acp"],
        protocol: "acp",
        label: "Antigravity (ACP)",
    },
    AgentSpec {
        id: "opencode",
        bin: "opencode",
        args: &["acp"],
        protocol: "acp",
        label: "OpenCode (ACP / 免费额度)",
    },
    AgentSpec {
        id: "gemini",
        bin: "gemini",
        args: &["--experimental-acp"],
        protocol: "acp",
        label: "Gemini CLI (ACP)",
    },
    AgentSpec {
        id: "goose",
        bin: "goose",
        args: &["acp"],
        protocol: "acp",
        label: "Goose (ACP)",
    },
    AgentSpec {
        id: "claude",
        bin: "claude",
        args: &["-p", "--output-format", "stream-json", "--verbose"],
        protocol: "cli",
        label: "Claude Code CLI",
    },
    AgentSpec {
        id: "codex",
        bin: "codex",
        args: &["exec"],
        protocol: "cli",
        label: "Codex CLI",
    },
    AgentSpec {
        id: "cursor",
        bin: "cursor-agent",
        args: &[],
        protocol: "cli",
        label: "Cursor Agent CLI",
    },
];

pub fn user_home_dir() -> Option<PathBuf> {
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

/// Builds deduplicated candidate directories for discovering local ACP/CLI agents,
/// reusing `hexo_cli::build_candidate_path_dirs` and appending common agent bin directories.
pub fn build_ai_candidate_path_dirs(
    home_dir: Option<&Path>,
    existing_path: Option<&OsStr>,
) -> Vec<PathBuf> {
    let mut dirs = build_candidate_path_dirs(None, home_dir, existing_path);
    let mut seen: HashSet<PathBuf> = dirs.iter().cloned().collect();

    let mut push_if_dir = |p: PathBuf| {
        if !p.as_os_str().is_empty() && p.is_dir() && seen.insert(p.clone()) {
            dirs.push(p);
        }
    };

    if let Some(home) = home_dir {
        for extra in [
            home.join(".opencode/bin"),
            home.join(".local/bin"),
            home.join(".cargo/bin"),
            home.join(".npm-global/bin"),
        ] {
            push_if_dir(extra);
        }
    }

    dirs
}

pub fn build_ai_path_env() -> OsString {
    let home = user_home_dir();
    let existing = std::env::var_os("PATH");
    let dirs = build_ai_candidate_path_dirs(home.as_deref(), existing.as_deref());
    std::env::join_paths(dirs).unwrap_or_else(|_| OsString::new())
}

fn candidate_binary_names(base: &str) -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        vec![
            format!("{}.exe", base),
            format!("{}.cmd", base),
            format!("{}.bat", base),
            base.to_string(),
        ]
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![base.to_string()]
    }
}

fn is_executable_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path)
            .map(|m| (m.permissions().mode() & 0o111) != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        true
    }
}

pub fn find_agent_executable(dirs: &[PathBuf], bin_name: &str) -> Option<PathBuf> {
    let names = candidate_binary_names(bin_name);
    for dir in dirs {
        for name in &names {
            let candidate = dir.join(name);
            if is_executable_file(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

/// Scans candidate directories synchronously for known agents (without running `--version`).
pub fn scan_agents_in_dirs(dirs: &[PathBuf]) -> Vec<DiscoveredAgent> {
    let mut found = Vec::new();
    for spec in KNOWN_AGENT_SPECS {
        if let Some(path) = find_agent_executable(dirs, spec.bin) {
            found.push(DiscoveredAgent {
                id: spec.id.to_string(),
                label: spec.label.to_string(),
                executable: path.to_string_lossy().to_string(),
                args: spec.args.iter().map(|s| (*s).to_string()).collect(),
                protocol: spec.protocol.to_string(),
                version: None,
            });
        }
    }
    found
}

async fn query_agent_version(executable: &str, path_env: &OsStr) -> Option<String> {
    let mut cmd = Command::new(executable);
    cmd.arg("--version")
        .env("PATH", path_env)
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = tokio::time::timeout(Duration::from_millis(5000), cmd.output())
        .await
        .ok()?
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let first_line = stdout
        .lines()
        .chain(stderr.lines())
        .map(str::trim)
        .find(|l| !l.is_empty())?;

    let cleaned = first_line.chars().take(80).collect::<String>();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

pub async fn discover_local_agents_in_dirs(dirs: &[PathBuf]) -> Vec<DiscoveredAgent> {
    let mut agents = scan_agents_in_dirs(dirs);
    if agents.is_empty() {
        return agents;
    }

    let path_env = std::env::join_paths(dirs).unwrap_or_else(|_| OsString::new());
    let mut handles = Vec::with_capacity(agents.len());
    for (idx, agent) in agents.iter().enumerate() {
        let exe = agent.executable.clone();
        let env_copy = path_env.clone();
        handles.push(tokio::spawn(async move {
            let ver = query_agent_version(&exe, &env_copy).await;
            (idx, ver)
        }));
    }

    for handle in handles {
        if let Ok((idx, ver)) = handle.await {
            if let Some(agent) = agents.get_mut(idx) {
                agent.version = ver;
            }
        }
    }

    agents
}

pub async fn discover_local_agents() -> AppResult<Vec<DiscoveredAgent>> {
    let home = user_home_dir();
    let existing = std::env::var_os("PATH");
    let dirs = build_ai_candidate_path_dirs(home.as_deref(), existing.as_deref());
    Ok(discover_local_agents_in_dirs(&dirs).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn candidate_path_dirs_appends_agent_bins_without_duplicates() {
        let tmp = TempDir::new().expect("tempdir");
        let home = tmp.path();
        let opencode_bin = home.join(".opencode/bin");
        let local_bin = home.join(".local/bin");
        let cargo_bin = home.join(".cargo/bin");
        let npm_global = home.join(".npm-global/bin");
        fs::create_dir_all(&opencode_bin).unwrap();
        fs::create_dir_all(&local_bin).unwrap();
        fs::create_dir_all(&cargo_bin).unwrap();
        fs::create_dir_all(&npm_global).unwrap();

        let existing = std::env::join_paths([&local_bin]).unwrap();
        let dirs = build_ai_candidate_path_dirs(Some(home), Some(&existing));

        assert!(dirs.contains(&opencode_bin));
        assert!(dirs.contains(&local_bin));
        assert!(dirs.contains(&cargo_bin));
        assert!(dirs.contains(&npm_global));
        let local_count = dirs.iter().filter(|d| *d == &local_bin).count();
        assert_eq!(local_count, 1);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn discovers_mock_acp_and_cli_agents_with_version() {
        use std::os::unix::fs::PermissionsExt;

        let tmp = TempDir::new().expect("tempdir");
        let bin_dir = tmp.path().join("bin");
        fs::create_dir_all(&bin_dir).unwrap();

        let agy_path = bin_dir.join("agy");
        fs::write(&agy_path, "#!/bin/sh\necho '1.5.17'\n").unwrap();
        fs::set_permissions(&agy_path, fs::Permissions::from_mode(0o755)).unwrap();

        let opencode_path = bin_dir.join("opencode");
        fs::write(&opencode_path, "#!/bin/sh\necho 'opencode 2.2.5'\n").unwrap();
        fs::set_permissions(&opencode_path, fs::Permissions::from_mode(0o755)).unwrap();

        let claude_path = bin_dir.join("claude");
        fs::write(&claude_path, "#!/bin/sh\necho 'claude 1.0.0'\n").unwrap();
        fs::set_permissions(&claude_path, fs::Permissions::from_mode(0o755)).unwrap();

        // Non-executable file should be ignored
        let codex_path = bin_dir.join("codex");
        fs::write(&codex_path, "#!/bin/sh\necho 'should not match'\n").unwrap();
        fs::set_permissions(&codex_path, fs::Permissions::from_mode(0o644)).unwrap();

        let agents = discover_local_agents_in_dirs(&[bin_dir]).await;
        assert_eq!(agents.len(), 3);
        assert_eq!(agents[0].id, "antigravity");
        assert_eq!(agents[0].protocol, "acp");
        assert_eq!(agents[0].args, vec!["acp"]);
        assert_eq!(agents[0].version.as_deref(), Some("1.5.17"));

        assert_eq!(agents[1].id, "opencode");
        assert_eq!(agents[1].protocol, "acp");
        assert_eq!(agents[1].version.as_deref(), Some("opencode 2.2.5"));

        assert_eq!(agents[2].id, "claude");
        assert_eq!(agents[2].protocol, "cli");
        assert_eq!(agents[2].version.as_deref(), Some("claude 1.0.0"));
    }
}
