use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppResult;

pub const ACP_REGISTRY_URL: &str = "https://cdn.agentclientprotocol.com/registry/v1/latest";
const ACP_REGISTRY_TIMEOUT_SECS: u64 = 4;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcpRegistryEntry {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub description: String,
    pub executable: String,
    pub args: Vec<String>,
    pub protocol: String,
    pub homepage: Option<String>,
    pub install_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcpRegistryResult {
    pub source: String,
    pub fetched_at: Option<String>,
    pub agents: Vec<AcpRegistryEntry>,
    pub message: Option<String>,
}

pub fn builtin_acp_registry_entries() -> Vec<AcpRegistryEntry> {
    vec![
        AcpRegistryEntry {
            id: "antigravity".to_string(),
            name: "Antigravity".to_string(),
            version: None,
            description: "Google Antigravity local ACP coding & writing agent.".to_string(),
            executable: "agy".to_string(),
            args: vec!["acp".to_string()],
            protocol: "acp".to_string(),
            homepage: Some("https://antigravity.google".to_string()),
            install_hint: Some("agy acp".to_string()),
        },
        AcpRegistryEntry {
            id: "opencode".to_string(),
            name: "OpenCode".to_string(),
            version: None,
            description: "Open-source terminal coding agent with native ACP server support."
                .to_string(),
            executable: "opencode".to_string(),
            args: vec!["acp".to_string()],
            protocol: "acp".to_string(),
            homepage: Some("https://opencode.ai".to_string()),
            install_hint: Some("npm i -g opencode-ai".to_string()),
        },
        AcpRegistryEntry {
            id: "gemini".to_string(),
            name: "Gemini CLI".to_string(),
            version: None,
            description: "Google Gemini CLI with experimental ACP stdio mode.".to_string(),
            executable: "gemini".to_string(),
            args: vec!["--experimental-acp".to_string()],
            protocol: "acp".to_string(),
            homepage: Some("https://github.com/google-gemini/gemini-cli".to_string()),
            install_hint: Some("npm i -g @google/gemini-cli".to_string()),
        },
        AcpRegistryEntry {
            id: "goose".to_string(),
            name: "Goose".to_string(),
            version: None,
            description: "Block's extensible local developer agent over ACP.".to_string(),
            executable: "goose".to_string(),
            args: vec!["acp".to_string()],
            protocol: "acp".to_string(),
            homepage: Some("https://block.github.io/goose".to_string()),
            install_hint: Some("brew install block/tap/goose".to_string()),
        },
        AcpRegistryEntry {
            id: "claude-code-acp".to_string(),
            name: "Claude Code (ACP)".to_string(),
            version: None,
            description: "ACP adapter for Anthropic Claude Code via Zed Industries bridge."
                .to_string(),
            executable: "npx".to_string(),
            args: vec!["-y".to_string(), "@zed-industries/claude-code-acp".to_string()],
            protocol: "acp".to_string(),
            homepage: Some("https://github.com/zed-industries/claude-code-acp".to_string()),
            install_hint: Some("npx -y @zed-industries/claude-code-acp".to_string()),
        },
        AcpRegistryEntry {
            id: "codex-acp".to_string(),
            name: "Codex (ACP)".to_string(),
            version: None,
            description: "ACP adapter for OpenAI Codex CLI via Zed Industries bridge."
                .to_string(),
            executable: "npx".to_string(),
            args: vec!["-y".to_string(), "@zed-industries/codex-acp".to_string()],
            protocol: "acp".to_string(),
            homepage: Some("https://github.com/zed-industries/codex-acp".to_string()),
            install_hint: Some("npx -y @zed-industries/codex-acp".to_string()),
        },
    ]
}

pub fn builtin_acp_registry(message: Option<String>) -> AcpRegistryResult {
    AcpRegistryResult {
        source: "builtin".to_string(),
        fetched_at: None,
        agents: builtin_acp_registry_entries(),
        message,
    }
}

fn current_acp_platform_keys() -> &'static [&'static str] {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        &["darwin-aarch64", "macos-aarch64", "darwin-arm64"]
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        &["darwin-x86_64", "macos-x86_64", "darwin-amd64"]
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        &["linux-x86_64", "linux-amd64"]
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        &["linux-aarch64", "linux-arm64"]
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        &["windows-x86_64", "win32-x86_64", "windows-amd64"]
    }
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        all(target_os = "windows", target_arch = "x86_64"),
    )))]
    {
        &[]
    }
}

fn parse_string_vec(val: Option<&Value>) -> Vec<String> {
    val.and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn extract_distribution_command(item: &Value) -> Option<(String, Vec<String>, Option<String>)> {
    if let Some(exe) = item
        .get("executable")
        .or_else(|| item.get("command"))
        .or_else(|| item.get("cmd"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let args = parse_string_vec(item.get("args"));
        let hint = item
            .get("installHint")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .or_else(|| {
                Some(if args.is_empty() {
                    exe.to_string()
                } else {
                    format!("{} {}", exe, args.join(" "))
                })
            });
        return Some((exe.to_string(), args, hint));
    }

    let dist = item.get("distribution")?;

    if let Some(bin_map) = dist.get("binary").and_then(Value::as_object) {
        for key in current_acp_platform_keys() {
            if let Some(target) = bin_map.get(*key) {
                if let Some(cmd) = target
                    .get("cmd")
                    .or_else(|| target.get("command"))
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                {
                    let cleaned = cmd.trim_start_matches("./").to_string();
                    let args = parse_string_vec(target.get("args"));
                    let hint = target
                        .get("archive")
                        .and_then(Value::as_str)
                        .map(ToString::to_string);
                    return Some((cleaned, args, hint));
                }
            }
        }
    }

    if let Some(npx) = dist.get("npx") {
        if let Some(pkg) = npx
            .get("package")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            let mut args = vec!["-y".to_string(), pkg.to_string()];
            args.extend(parse_string_vec(npx.get("args")));
            let hint = Some(format!("npx {}", args.join(" ")));
            return Some(("npx".to_string(), args, hint));
        }
    }

    if let Some(uvx) = dist.get("uvx") {
        if let Some(pkg) = uvx
            .get("package")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            let mut args = vec![pkg.to_string()];
            args.extend(parse_string_vec(uvx.get("args")));
            let hint = Some(format!("uvx {}", args.join(" ")));
            return Some(("uvx".to_string(), args, hint));
        }
    }

    None
}

pub fn parse_acp_registry_json(raw: &str) -> Option<Vec<AcpRegistryEntry>> {
    let val: Value = serde_json::from_str(raw).ok()?;
    let arr = if let Some(list) = val.as_array() {
        list
    } else {
        val.get("agents").and_then(Value::as_array)?
    };

    let mut parsed = Vec::new();
    for item in arr {
        let Some(id) = item
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        let name = item
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(id);
        let Some((executable, args, install_hint)) = extract_distribution_command(item) else {
            continue;
        };
        let description = item
            .get("description")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or("")
            .to_string();
        let version = item
            .get("version")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string);
        let homepage = item
            .get("repository")
            .or_else(|| item.get("homepage"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string);
        let protocol = item
            .get("protocol")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("acp")
            .to_string();

        parsed.push(AcpRegistryEntry {
            id: id.to_string(),
            name: name.to_string(),
            version,
            description,
            executable,
            args,
            protocol,
            homepage,
            install_hint,
        });
    }

    if parsed.is_empty() {
        None
    } else {
        Some(parsed)
    }
}

pub async fn fetch_acp_registry_from_url(url: &str) -> AppResult<AcpRegistryResult> {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(ACP_REGISTRY_TIMEOUT_SECS))
        .build()
    {
        Ok(c) => c,
        Err(err) => {
            return Ok(builtin_acp_registry(Some(format!(
                "Fallback to built-in ACP registry (client error: {})",
                err
            ))));
        }
    };

    let resp = match client.get(url).send().await {
        Ok(r) => r,
        Err(err) => {
            return Ok(builtin_acp_registry(Some(format!(
                "Fallback to built-in ACP registry ({})",
                err
            ))));
        }
    };

    if !resp.status().is_success() {
        return Ok(builtin_acp_registry(Some(format!(
            "Fallback to built-in ACP registry (HTTP {})",
            resp.status().as_u16()
        ))));
    }

    let body = match resp.text().await {
        Ok(text) => text,
        Err(err) => {
            return Ok(builtin_acp_registry(Some(format!(
                "Fallback to built-in ACP registry (read error: {})",
                err
            ))));
        }
    };

    if let Some(agents) = parse_acp_registry_json(&body) {
        Ok(AcpRegistryResult {
            source: "remote".to_string(),
            fetched_at: Some(chrono::Utc::now().to_rfc3339()),
            agents,
            message: None,
        })
    } else {
        Ok(builtin_acp_registry(Some(
            "Fallback to built-in ACP registry (unrecognized registry payload)".to_string(),
        )))
    }
}

pub async fn fetch_acp_registry() -> AppResult<AcpRegistryResult> {
    fetch_acp_registry_from_url(ACP_REGISTRY_URL).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_snapshot_contains_core_acp_agents() {
        let reg = builtin_acp_registry(None);
        assert_eq!(reg.source, "builtin");
        let ids: Vec<&str> = reg.agents.iter().map(|a| a.id.as_str()).collect();
        assert!(ids.contains(&"antigravity"));
        assert!(ids.contains(&"opencode"));
        assert!(ids.contains(&"gemini"));
        assert!(ids.contains(&"goose"));
        assert!(ids.contains(&"claude-code-acp"));
        assert!(ids.contains(&"codex-acp"));
    }

    #[test]
    fn parses_official_and_normalized_registry_payloads() {
        let official_json = r#"{
            "version": "1.0.0",
            "agents": [
                {
                    "id": "claude-acp",
                    "name": "Claude Code",
                    "version": "0.14.1",
                    "description": "Anthropic Claude Code ACP adapter",
                    "repository": "https://github.com/zed-industries/claude-code-acp",
                    "distribution": {
                        "npx": {
                            "package": "@zed-industries/claude-code-acp@0.14.1",
                            "args": ["--stdio"]
                        }
                    }
                },
                {
                    "id": "opencode",
                    "name": "OpenCode",
                    "description": "OpenCode ACP",
                    "executable": "opencode",
                    "args": ["acp"]
                }
            ]
        }"#;

        let parsed = parse_acp_registry_json(official_json).expect("valid payload");
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].id, "claude-acp");
        assert_eq!(parsed[0].executable, "npx");
        assert_eq!(
            parsed[0].args,
            vec!["-y", "@zed-industries/claude-code-acp@0.14.1", "--stdio"]
        );
        assert_eq!(parsed[0].version.as_deref(), Some("0.14.1"));
        assert_eq!(parsed[1].executable, "opencode");
        assert_eq!(parsed[1].args, vec!["acp"]);

        assert!(parse_acp_registry_json("not valid json").is_none());
        assert!(parse_acp_registry_json(r#"{"agents":[]}"#).is_none());
    }

    #[tokio::test]
    async fn falls_back_to_builtin_when_remote_unreachable() {
        // Bind and immediately drop a local listener so the port refuses connections immediately
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let url = format!("http://127.0.0.1:{}/registry.json", port);
        let res = fetch_acp_registry_from_url(&url)
            .await
            .expect("fallback succeeds");
        assert_eq!(res.source, "builtin");
        assert!(res.agents.len() >= 6);
        assert!(res
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("Fallback to built-in ACP registry"));
    }
}
