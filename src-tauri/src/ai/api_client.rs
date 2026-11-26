use std::time::{Duration, Instant};

use reqwest::Url;
use serde_json::{json, Value};
use tauri::AppHandle;
use tokio::sync::watch;

use crate::error::{AppError, AppResult};

use super::{emit_ai_event, AiConnectionResult, AiProviderConfig};

const AI_CONNECT_TIMEOUT_SECS: u64 = 10;
const AI_STREAM_TIMEOUT_SECS: u64 = 120;

pub const DEFAULT_OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
pub const DEFAULT_OLLAMA_BASE_URL: &str = "http://127.0.0.1:11434/v1";
pub const DEFAULT_ANTHROPIC_BASE_URL: &str = "https://api.anthropic.com";

pub fn redact_secret(message: &str, secret: Option<&str>) -> String {
    let mut out = message.to_string();
    if let Some(raw) = secret {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            out = out.replace(raw, "[REDACTED]");
            out = out.replace(trimmed, "[REDACTED]");
        }
    }
    out
}

fn validate_http_url(raw: &str, label: &str) -> AppResult<Url> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput(format!("{} URL is empty", label)));
    }
    let parsed = Url::parse(trimmed)
        .map_err(|e| AppError::InvalidInput(format!("Invalid {} URL: {}", label, e)))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::InvalidInput(format!(
            "{} URL must use http:// or https://",
            label
        )));
    }
    if parsed.host_str().is_none() {
        return Err(AppError::InvalidInput(format!(
            "{} URL is missing host",
            label
        )));
    }
    Ok(parsed)
}

pub fn build_openai_chat_url(base_url: Option<&str>, is_ollama: bool) -> AppResult<String> {
    let raw = base_url
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(if is_ollama {
            DEFAULT_OLLAMA_BASE_URL
        } else {
            DEFAULT_OPENAI_BASE_URL
        });
    let parsed = validate_http_url(raw, "OpenAI-compatible API")?;
    let trimmed = parsed.as_str().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        Ok(trimmed.to_string())
    } else {
        Ok(format!("{}/chat/completions", trimmed))
    }
}

pub fn build_openai_models_url(base_url: Option<&str>, is_ollama: bool) -> AppResult<String> {
    let raw = base_url
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(if is_ollama {
            DEFAULT_OLLAMA_BASE_URL
        } else {
            DEFAULT_OPENAI_BASE_URL
        });
    let parsed = validate_http_url(raw, "OpenAI-compatible API")?;
    let trimmed = parsed.as_str().trim_end_matches('/');
    let base = trimmed
        .strip_suffix("/chat/completions")
        .unwrap_or(trimmed);
    Ok(format!("{}/models", base))
}

pub fn build_anthropic_messages_url(base_url: Option<&str>) -> AppResult<String> {
    let raw = base_url
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_ANTHROPIC_BASE_URL);
    let parsed = validate_http_url(raw, "Anthropic API")?;
    let trimmed = parsed.as_str().trim_end_matches('/');
    if trimmed.ends_with("/v1/messages") {
        Ok(trimmed.to_string())
    } else if trimmed.ends_with("/v1") {
        Ok(format!("{}/messages", trimmed))
    } else {
        Ok(format!("{}/v1/messages", trimmed))
    }
}

pub fn build_anthropic_models_url(base_url: Option<&str>) -> AppResult<String> {
    let raw = base_url
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_ANTHROPIC_BASE_URL);
    let parsed = validate_http_url(raw, "Anthropic API")?;
    let trimmed = parsed.as_str().trim_end_matches('/');
    let base = trimmed
        .strip_suffix("/v1/messages")
        .or_else(|| trimmed.strip_suffix("/messages"))
        .unwrap_or(trimmed);
    if base.ends_with("/v1") {
        Ok(format!("{}/models", base))
    } else {
        Ok(format!("{}/v1/models", base))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SseParsedEvent {
    Delta(String),
    Thought(String),
    Done,
    Error(String),
    Ignore,
}

pub fn parse_openai_sse_data(data: &str) -> SseParsedEvent {
    let trimmed = data.trim();
    if trimmed.is_empty() {
        return SseParsedEvent::Ignore;
    }
    if trimmed == "[DONE]" {
        return SseParsedEvent::Done;
    }
    let Ok(val) = serde_json::from_str::<Value>(trimmed) else {
        return SseParsedEvent::Ignore;
    };
    if let Some(err_msg) = val
        .get("error")
        .and_then(|e| e.get("message").or(Some(e)))
        .and_then(Value::as_str)
    {
        return SseParsedEvent::Error(err_msg.to_string());
    }

    let Some(choice) = val
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
    else {
        return SseParsedEvent::Ignore;
    };

    let delta_obj = choice.get("delta").or_else(|| choice.get("message"));
    if let Some(d) = delta_obj {
        if let Some(reasoning) = d
            .get("reasoning_content")
            .or_else(|| d.get("reasoning"))
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            return SseParsedEvent::Thought(reasoning.to_string());
        }
        if let Some(content) = d
            .get("content")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            return SseParsedEvent::Delta(content.to_string());
        }
    }

    SseParsedEvent::Ignore
}

pub fn parse_anthropic_sse_data(data: &str) -> SseParsedEvent {
    let trimmed = data.trim();
    if trimmed.is_empty() {
        return SseParsedEvent::Ignore;
    }
    let Ok(val) = serde_json::from_str::<Value>(trimmed) else {
        return SseParsedEvent::Ignore;
    };

    let event_type = val
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();

    match event_type {
        "content_block_delta" => {
            let Some(delta) = val.get("delta") else {
                return SseParsedEvent::Ignore;
            };
            let delta_type = delta
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            match delta_type {
                "text_delta" => {
                    if let Some(text) = delta
                        .get("text")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                    {
                        return SseParsedEvent::Delta(text.to_string());
                    }
                }
                "thinking_delta" => {
                    if let Some(thinking) = delta
                        .get("thinking")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                    {
                        return SseParsedEvent::Thought(thinking.to_string());
                    }
                }
                _ => {}
            }
            SseParsedEvent::Ignore
        }
        "message_stop" => SseParsedEvent::Done,
        "error" => {
            let msg = val
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(Value::as_str)
                .unwrap_or("Anthropic stream error");
            SseParsedEvent::Error(msg.to_string())
        }
        _ => SseParsedEvent::Ignore,
    }
}

pub async fn test_ai_connection(config: &AiProviderConfig) -> AppResult<AiConnectionResult> {
    let mode = config.mode.trim().to_ascii_lowercase();
    let started = Instant::now();
    let secret = config.api_key.as_deref();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(AI_CONNECT_TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::InvalidInput(format!("HTTP client error: {}", e)))?;

    match mode.as_str() {
        "openai_compatible" | "ollama" => {
            let is_ollama = mode == "ollama";
            if !is_ollama
                && config
                    .api_key
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .is_none()
            {
                return Ok(AiConnectionResult {
                    ok: false,
                    provider: mode,
                    message: "API Key is required for OpenAI-compatible provider".into(),
                    latency_ms: 0,
                });
            }

            let url = build_openai_models_url(config.base_url.as_deref(), is_ollama)?;
            let mut req = client.get(&url);
            if let Some(key) = config.api_key.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                req = req.bearer_auth(key);
            }

            match req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    let latency_ms = started.elapsed().as_millis() as u64;
                    if status.is_success() {
                        Ok(AiConnectionResult {
                            ok: true,
                            provider: mode,
                            message: format!("Connected ({} · {}ms)", url, latency_ms),
                            latency_ms,
                        })
                    } else {
                        let body = resp.text().await.unwrap_or_default();
                        let preview: String = body.chars().take(180).collect();
                        Ok(AiConnectionResult {
                            ok: false,
                            provider: mode,
                            message: redact_secret(
                                &format!("HTTP {}: {}", status.as_u16(), preview),
                                secret,
                            ),
                            latency_ms,
                        })
                    }
                }
                Err(err) => Ok(AiConnectionResult {
                    ok: false,
                    provider: mode,
                    message: redact_secret(&format!("Connection failed: {}", err), secret),
                    latency_ms: started.elapsed().as_millis() as u64,
                }),
            }
        }
        "anthropic" => {
            let Some(api_key) = config
                .api_key
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            else {
                return Ok(AiConnectionResult {
                    ok: false,
                    provider: mode,
                    message: "API Key is required for Anthropic provider".into(),
                    latency_ms: 0,
                });
            };

            let models_url = build_anthropic_models_url(config.base_url.as_deref())?;
            let resp_res = client
                .get(&models_url)
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await;

            match resp_res {
                Ok(resp) => {
                    let status = resp.status();
                    let latency_ms = started.elapsed().as_millis() as u64;
                    if status.is_success() {
                        Ok(AiConnectionResult {
                            ok: true,
                            provider: mode,
                            message: format!("Anthropic API connected ({}ms)", latency_ms),
                            latency_ms,
                        })
                    } else {
                        let body = resp.text().await.unwrap_or_default();
                        let preview: String = body.chars().take(180).collect();
                        Ok(AiConnectionResult {
                            ok: false,
                            provider: mode,
                            message: redact_secret(
                                &format!("HTTP {}: {}", status.as_u16(), preview),
                                secret,
                            ),
                            latency_ms,
                        })
                    }
                }
                Err(err) => Ok(AiConnectionResult {
                    ok: false,
                    provider: mode,
                    message: redact_secret(&format!("Connection failed: {}", err), secret),
                    latency_ms: started.elapsed().as_millis() as u64,
                }),
            }
        }
        other => Err(AppError::InvalidInput(format!(
            "Unsupported API provider mode for connection test: {}",
            other
        ))),
    }
}

pub async fn run_api_prompt(
    app: &AppHandle,
    request_id: &str,
    provider: &AiProviderConfig,
    system_prompt: Option<&str>,
    prompt: &str,
    mut cancel_rx: watch::Receiver<bool>,
) -> AppResult<()> {
    let mode = provider.mode.trim().to_ascii_lowercase();
    let secret = provider.api_key.as_deref();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(AI_STREAM_TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::InvalidInput(format!("HTTP client error: {}", e)))?;

    let is_anthropic = mode == "anthropic";
    let is_ollama = mode == "ollama";

    let mut resp = if is_anthropic {
        let api_key = provider
            .api_key
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| AppError::InvalidInput("Anthropic API Key is required".into()))?;
        let url = build_anthropic_messages_url(provider.base_url.as_deref())?;
        let model = provider
            .model
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("claude-3-5-sonnet-latest");

        let mut body = json!({
            "model": model,
            "max_tokens": 4096,
            "stream": true,
            "messages": [{ "role": "user", "content": prompt }],
        });
        if let Some(sys) = system_prompt.map(str::trim).filter(|s| !s.is_empty()) {
            body["system"] = json!(sys);
        }

        client
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::InvalidInput(redact_secret(&e.to_string(), secret)))?
    } else {
        let url = build_openai_chat_url(provider.base_url.as_deref(), is_ollama)?;
        if !is_ollama
            && provider
                .api_key
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .is_none()
        {
            return Err(AppError::InvalidInput(
                "API Key is required for OpenAI-compatible provider".into(),
            ));
        }

        let model = provider
            .model
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(if is_ollama { "llama3.1" } else { "gpt-4o-mini" });

        let mut messages = Vec::new();
        if let Some(sys) = system_prompt.map(str::trim).filter(|s| !s.is_empty()) {
            messages.push(json!({ "role": "system", "content": sys }));
        }
        messages.push(json!({ "role": "user", "content": prompt }));

        let body = json!({
            "model": model,
            "stream": true,
            "messages": messages,
        });

        let mut req = client.post(&url).header("content-type", "application/json");
        if let Some(key) = provider
            .api_key
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            req = req.bearer_auth(key);
        }

        req.json(&body)
            .send()
            .await
            .map_err(|e| AppError::InvalidInput(redact_secret(&e.to_string(), secret)))?
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let preview: String = text.chars().take(280).collect();
        return Err(AppError::InvalidInput(redact_secret(
            &format!("HTTP {}: {}", status.as_u16(), preview),
            secret,
        )));
    }

    let mut buffer: Vec<u8> = Vec::new();
    let mut finished = false;

    loop {
        let chunk_res = tokio::select! {
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    return Ok(());
                }
                continue;
            }
            c = resp.chunk() => c,
        };

        let chunk = chunk_res
            .map_err(|e| AppError::InvalidInput(redact_secret(&e.to_string(), secret)))?;
        let Some(bytes) = chunk else {
            break;
        };
        buffer.extend_from_slice(&bytes);

        while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buffer.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            let trimmed = line.trim();
            if let Some(data) = trimmed.strip_prefix("data:") {
                let parsed = if is_anthropic {
                    parse_anthropic_sse_data(data)
                } else {
                    parse_openai_sse_data(data)
                };
                match parsed {
                    SseParsedEvent::Delta(text) => emit_ai_event(app, request_id, "delta", text, false),
                    SseParsedEvent::Thought(text) => {
                        emit_ai_event(app, request_id, "thought", text, false)
                    }
                    SseParsedEvent::Done => {
                        emit_ai_event(app, request_id, "done", "", true);
                        finished = true;
                        break;
                    }
                    SseParsedEvent::Error(msg) => {
                        return Err(AppError::InvalidInput(redact_secret(&msg, secret)));
                    }
                    SseParsedEvent::Ignore => {}
                }
            }
        }

        if finished {
            break;
        }
    }

    if !finished {
        // Flush any remaining trailing SSE data line without a final newline
        if !buffer.is_empty() {
            let line = String::from_utf8_lossy(&buffer);
            if let Some(data) = line.trim().strip_prefix("data:") {
                let parsed = if is_anthropic {
                    parse_anthropic_sse_data(data)
                } else {
                    parse_openai_sse_data(data)
                };
                match parsed {
                    SseParsedEvent::Delta(text) => emit_ai_event(app, request_id, "delta", text, false),
                    SseParsedEvent::Thought(text) => {
                        emit_ai_event(app, request_id, "thought", text, false)
                    }
                    SseParsedEvent::Error(msg) => {
                        return Err(AppError::InvalidInput(redact_secret(&msg, secret)));
                    }
                    SseParsedEvent::Done | SseParsedEvent::Ignore => {}
                }
            }
        }
        emit_ai_event(app, request_id, "done", "", true);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_openai_and_anthropic_urls_cleanly() {
        assert_eq!(
            build_openai_chat_url(Some("https://api.deepseek.com/v1/"), false).unwrap(),
            "https://api.deepseek.com/v1/chat/completions"
        );
        assert_eq!(
            build_openai_chat_url(None, true).unwrap(),
            "http://127.0.0.1:11434/v1/chat/completions"
        );
        assert_eq!(
            build_openai_models_url(Some("http://localhost:11434/v1/chat/completions"), true)
                .unwrap(),
            "http://localhost:11434/v1/models"
        );
        assert_eq!(
            build_anthropic_messages_url(Some("https://api.anthropic.com/")).unwrap(),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            build_anthropic_messages_url(Some("https://proxy.example.com/v1")).unwrap(),
            "https://proxy.example.com/v1/messages"
        );
    }

    #[test]
    fn parses_openai_sse_delta_thought_and_done() {
        let thought_line = r#"{"choices":[{"delta":{"reasoning_content":"step 1"}}]}"#;
        assert_eq!(
            parse_openai_sse_data(thought_line),
            SseParsedEvent::Thought("step 1".to_string())
        );

        let delta_line = r#"{"choices":[{"delta":{"content":"Hello"}}]}"#;
        assert_eq!(
            parse_openai_sse_data(delta_line),
            SseParsedEvent::Delta("Hello".to_string())
        );

        assert_eq!(parse_openai_sse_data("[DONE]"), SseParsedEvent::Done);
    }

    #[test]
    fn parses_anthropic_sse_delta_thinking_and_stop() {
        let thinking = r#"{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"analyze"}}"#;
        assert_eq!(
            parse_anthropic_sse_data(thinking),
            SseParsedEvent::Thought("analyze".to_string())
        );

        let text = r#"{"type":"content_block_delta","delta":{"type":"text_delta","text":"World"}}"#;
        assert_eq!(
            parse_anthropic_sse_data(text),
            SseParsedEvent::Delta("World".to_string())
        );

        let stop = r#"{"type":"message_stop"}"#;
        assert_eq!(parse_anthropic_sse_data(stop), SseParsedEvent::Done);
    }
}
