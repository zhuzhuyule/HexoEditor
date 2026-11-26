use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use md5::{Digest, Md5};
use opendal::{services, Operator};
use regex::Regex;
use reqwest::Url;
use serde::Deserialize;
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::hexo::{is_page_bundle_doc, percent_encode_path_segment, sanitize_filename_stem};
use crate::models::{
    DeleteLocalImagesResult, DeleteRemoteImagesResult, ImageBedConfig, ImageBedConnectionResult,
    ImageBedUploadBatchResult, RemoteDeleteFailure, ScanUnusedImagesResult, UnusedLocalImage,
    UploadedImageItem,
};

pub const DEFAULT_PICGO_URL: &str = "http://127.0.0.1:36677/upload";
pub const MAX_DATA_URI_IMAGE_BYTES: u64 = 10 * 1024 * 1024;
const HTTP_TEST_TIMEOUT_SECS: u64 = 6;
const HTTP_UPLOAD_TIMEOUT_SECS: u64 = 60;

fn md5_hex(bytes: &[u8]) -> String {
    let mut hasher = Md5::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    digest.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn sanitize_error_message(message: &str, secret: Option<&str>) -> String {
    let mut sanitized = message.to_string();
    if let Some(raw_secret) = secret {
        let trimmed = raw_secret.trim();
        if !trimmed.is_empty() {
            sanitized = sanitized.replace(raw_secret, "[REDACTED]");
            sanitized = sanitized.replace(trimmed, "[REDACTED]");
            let encoded = percent_encode_path_segment(trimmed);
            if encoded != trimmed {
                sanitized = sanitized.replace(&encoded, "[REDACTED]");
            }
        }
    }
    sanitized
}

pub fn mime_type_for_extension(ext: &str) -> Option<&'static str> {
    match ext.trim().trim_start_matches('.').to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "avif" => Some("image/avif"),
        "ico" => Some("image/x-icon"),
        _ => None,
    }
}

pub fn is_supported_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .and_then(mime_type_for_extension)
        .is_some()
}

fn normalized_provider(config: &ImageBedConfig) -> String {
    let trimmed = config.provider.trim().to_ascii_lowercase();
    if trimmed.is_empty() {
        "none".to_string()
    } else {
        trimmed
    }
}

fn non_empty_opt(opt: &Option<String>) -> Option<&str> {
    opt.as_deref().map(str::trim).filter(|s| !s.is_empty())
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
            "{} URL is missing a valid host",
            label
        )));
    }
    Ok(parsed)
}

fn normalize_storage_url(raw: &str, label: &str) -> AppResult<Url> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput(format!("{} is empty", label)));
    }
    if trimmed.contains("://") {
        validate_http_url(trimmed, label)
    } else {
        validate_http_url(&format!("https://{}", trimmed), label)
    }
}

pub fn build_picgo_upload_url(config: &ImageBedConfig) -> AppResult<String> {
    let raw = if config.picgo_url.trim().is_empty() {
        DEFAULT_PICGO_URL
    } else {
        config.picgo_url.trim()
    };
    let mut url = validate_http_url(raw, "PicGo endpoint")?;

    let uploader = non_empty_opt(&config.picgo_uploader);
    let config_name = non_empty_opt(&config.picgo_config_name);
    if uploader.is_some() || config_name.is_some() {
        let mut pairs = url.query_pairs_mut();
        if let Some(u) = uploader {
            pairs.append_pair("uploader", u);
        }
        if let Some(c) = config_name {
            pairs.append_pair("configName", c);
        }
    }

    Ok(url.to_string())
}

fn build_picgo_heartbeat_url(upload_url: &Url) -> Option<String> {
    let mut heartbeat = upload_url.clone();
    heartbeat.set_query(None);
    heartbeat.set_fragment(None);
    heartbeat.set_path("/heartbeat");
    Some(heartbeat.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum PicGoResultField {
    List(Vec<String>),
    Single(String),
}

#[derive(Debug, Deserialize)]
struct PicGoUploadResponse {
    success: bool,
    #[serde(default)]
    result: Option<PicGoResultField>,
    #[serde(default)]
    message: Option<String>,
}

pub fn parse_picgo_upload_response(body: &str) -> Result<Vec<String>, String> {
    let parsed: PicGoUploadResponse = serde_json::from_str(body)
        .map_err(|e| format!("Invalid PicGo JSON response: {}", e))?;

    if !parsed.success {
        let reason = parsed
            .message
            .filter(|m| !m.trim().is_empty())
            .unwrap_or_else(|| "PicGo reported upload failure".to_string());
        return Err(reason);
    }

    let urls: Vec<String> = match parsed.result {
        Some(PicGoResultField::List(list)) => list
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        Some(PicGoResultField::Single(single)) => {
            let trimmed = single.trim().to_string();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![trimmed]
            }
        }
        None => Vec::new(),
    };

    if urls.is_empty() {
        return Err("PicGo succeeded but returned an empty result list".to_string());
    }

    Ok(urls)
}

fn sanitize_path_prefix(prefix: Option<&str>) -> String {
    let Some(raw) = prefix else {
        return String::new();
    };
    raw.replace('\\', "/")
        .split('/')
        .map(str::trim)
        .filter(|seg| !seg.is_empty() && *seg != "." && *seg != "..")
        .collect::<Vec<_>>()
        .join("/")
}

pub fn build_remote_key(path_prefix: Option<&str>, file_path: &Path, bytes: &[u8]) -> String {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.trim().trim_start_matches('.').to_ascii_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "png".to_string());

    let raw_stem = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let clean_stem = sanitize_filename_stem(raw_stem);
    let safe_stem = if clean_stem.is_empty() {
        "image".to_string()
    } else {
        clean_stem
    };

    let digest = md5_hex(bytes);
    let short_hash = &digest[..8];
    let file_name = if safe_stem.ends_with(short_hash) {
        format!("{}.{}", safe_stem, ext)
    } else {
        format!("{}-{}.{}", safe_stem, short_hash, ext)
    };

    let clean_prefix = sanitize_path_prefix(path_prefix);
    if clean_prefix.is_empty() {
        file_name
    } else {
        format!("{}/{}", clean_prefix, file_name)
    }
}

fn encode_remote_key_path(remote_key: &str) -> String {
    remote_key
        .trim_start_matches('/')
        .split('/')
        .filter(|seg| !seg.is_empty())
        .map(percent_encode_path_segment)
        .collect::<Vec<_>>()
        .join("/")
}

pub fn build_public_url(config: &ImageBedConfig, remote_key: &str) -> AppResult<String> {
    let encoded_key = encode_remote_key_path(remote_key);
    if encoded_key.is_empty() {
        return Err(AppError::InvalidInput("Remote key cannot be empty".into()));
    }

    if let Some(custom) = non_empty_opt(&config.custom_domain) {
        let base = normalize_storage_url(custom, "Custom domain")?;
        let base_str = base.as_str().trim_end_matches('/');
        return Ok(format!("{}/{}", base_str, encoded_key));
    }

    let provider = normalized_provider(config);
    match provider.as_str() {
        "memory" => Ok(format!("https://memory.local/{}", encoded_key)),
        "oss" => {
            let bucket = non_empty_opt(&config.bucket)
                .ok_or_else(|| AppError::InvalidInput("OSS bucket is required".into()))?;
            let endpoint_raw = non_empty_opt(&config.endpoint)
                .ok_or_else(|| AppError::InvalidInput("OSS endpoint is required".into()))?;
            let ep = normalize_storage_url(endpoint_raw, "OSS endpoint")?;
            let host = ep.host_str().unwrap_or_default();
            let port_suffix = ep.port().map(|p| format!(":{}", p)).unwrap_or_default();
            let scheme = ep.scheme();
            if host.starts_with(&format!("{}.", bucket)) {
                Ok(format!("{}://{}{}/{}", scheme, host, port_suffix, encoded_key))
            } else {
                Ok(format!(
                    "{}://{}.{}{}/{}",
                    scheme, bucket, host, port_suffix, encoded_key
                ))
            }
        }
        "cos" => {
            let bucket = non_empty_opt(&config.bucket)
                .ok_or_else(|| AppError::InvalidInput("COS bucket is required".into()))?;
            if let Some(endpoint_raw) = non_empty_opt(&config.endpoint) {
                let ep = normalize_storage_url(endpoint_raw, "COS endpoint")?;
                let host = ep.host_str().unwrap_or_default();
                let port_suffix = ep.port().map(|p| format!(":{}", p)).unwrap_or_default();
                let scheme = ep.scheme();
                if host.starts_with(&format!("{}.", bucket)) {
                    Ok(format!("{}://{}{}/{}", scheme, host, port_suffix, encoded_key))
                } else if host.starts_with("cos.") {
                    Ok(format!(
                        "{}://{}.{}{}/{}",
                        scheme, bucket, host, port_suffix, encoded_key
                    ))
                } else {
                    let base = ep.as_str().trim_end_matches('/');
                    Ok(format!("{}/{}/{}", base, bucket, encoded_key))
                }
            } else if let Some(region) = non_empty_opt(&config.region) {
                Ok(format!(
                    "https://{}.cos.{}.myqcloud.com/{}",
                    bucket, region, encoded_key
                ))
            } else {
                Err(AppError::InvalidInput(
                    "COS requires either endpoint or region".into(),
                ))
            }
        }
        "s3" => {
            let bucket = non_empty_opt(&config.bucket)
                .ok_or_else(|| AppError::InvalidInput("S3 bucket is required".into()))?;
            if let Some(endpoint_raw) = non_empty_opt(&config.endpoint) {
                let ep = normalize_storage_url(endpoint_raw, "S3 endpoint")?;
                let host = ep.host_str().unwrap_or_default();
                let port_suffix = ep.port().map(|p| format!(":{}", p)).unwrap_or_default();
                let scheme = ep.scheme();
                if host.starts_with(&format!("{}.", bucket)) {
                    let base = ep.as_str().trim_end_matches('/');
                    Ok(format!("{}/{}", base, encoded_key))
                } else if host.ends_with(".amazonaws.com") {
                    Ok(format!(
                        "{}://{}.{}{}/{}",
                        scheme, bucket, host, port_suffix, encoded_key
                    ))
                } else {
                    let base = ep.as_str().trim_end_matches('/');
                    Ok(format!("{}/{}/{}", base, bucket, encoded_key))
                }
            } else {
                let region = non_empty_opt(&config.region).unwrap_or("us-east-1");
                Ok(format!(
                    "https://{}.s3.{}.amazonaws.com/{}",
                    bucket, region, encoded_key
                ))
            }
        }
        other => Err(AppError::InvalidInput(format!(
            "Unsupported image bed provider: {}",
            other
        ))),
    }
}

fn build_opendal_operator(config: &ImageBedConfig) -> AppResult<Operator> {
    let provider = normalized_provider(config);
    let secret_opt = config.secret_access_key.as_deref();

    match provider.as_str() {
        "s3" => {
            let bucket = non_empty_opt(&config.bucket)
                .ok_or_else(|| AppError::InvalidInput("S3 bucket is required".into()))?;
            let access_key = non_empty_opt(&config.access_key_id)
                .ok_or_else(|| AppError::InvalidInput("S3 accessKeyId is required".into()))?;
            let secret_key = non_empty_opt(&config.secret_access_key)
                .ok_or_else(|| AppError::InvalidInput("S3 secretAccessKey is required".into()))?;

            let mut builder = services::S3::default()
                .bucket(bucket)
                .access_key_id(access_key)
                .secret_access_key(secret_key)
                .disable_config_load()
                .disable_ec2_metadata();

            if let Some(endpoint_raw) = non_empty_opt(&config.endpoint) {
                let ep = normalize_storage_url(endpoint_raw, "S3 endpoint")?;
                builder = builder.endpoint(ep.as_str().trim_end_matches('/'));
                let region = non_empty_opt(&config.region).unwrap_or("auto");
                builder = builder.region(region);
            } else {
                let region = non_empty_opt(&config.region).unwrap_or("us-east-1");
                builder = builder.region(region);
            }

            Operator::new(builder)
                .map(|op| op.finish())
                .map_err(|e| {
                    AppError::InvalidInput(sanitize_error_message(
                        &format!("Failed to initialize S3 operator: {}", e),
                        secret_opt,
                    ))
                })
        }
        "oss" => {
            let bucket = non_empty_opt(&config.bucket)
                .ok_or_else(|| AppError::InvalidInput("OSS bucket is required".into()))?;
            let endpoint_raw = non_empty_opt(&config.endpoint)
                .ok_or_else(|| AppError::InvalidInput("OSS endpoint is required".into()))?;
            let access_key = non_empty_opt(&config.access_key_id)
                .ok_or_else(|| AppError::InvalidInput("OSS accessKeyId is required".into()))?;
            let secret_key = non_empty_opt(&config.secret_access_key)
                .ok_or_else(|| AppError::InvalidInput("OSS secretAccessKey is required".into()))?;

            let ep = normalize_storage_url(endpoint_raw, "OSS endpoint")?;
            let builder = services::Oss::default()
                .bucket(bucket)
                .endpoint(ep.as_str().trim_end_matches('/'))
                .access_key_id(access_key)
                .access_key_secret(secret_key);

            Operator::new(builder)
                .map(|op| op.finish())
                .map_err(|e| {
                    AppError::InvalidInput(sanitize_error_message(
                        &format!("Failed to initialize OSS operator: {}", e),
                        secret_opt,
                    ))
                })
        }
        "cos" => {
            let bucket = non_empty_opt(&config.bucket)
                .ok_or_else(|| AppError::InvalidInput("COS bucket is required".into()))?;
            let access_key = non_empty_opt(&config.access_key_id)
                .ok_or_else(|| AppError::InvalidInput("COS accessKeyId (SecretId) is required".into()))?;
            let secret_key = non_empty_opt(&config.secret_access_key)
                .ok_or_else(|| AppError::InvalidInput("COS secretAccessKey (SecretKey) is required".into()))?;

            let endpoint_str = if let Some(endpoint_raw) = non_empty_opt(&config.endpoint) {
                normalize_storage_url(endpoint_raw, "COS endpoint")?
                    .as_str()
                    .trim_end_matches('/')
                    .to_string()
            } else if let Some(region) = non_empty_opt(&config.region) {
                format!("https://cos.{}.myqcloud.com", region)
            } else {
                return Err(AppError::InvalidInput(
                    "COS requires either endpoint or region".into(),
                ));
            };

            let builder = services::Cos::default()
                .bucket(bucket)
                .endpoint(&endpoint_str)
                .secret_id(access_key)
                .secret_key(secret_key)
                .disable_config_load();

            Operator::new(builder)
                .map(|op| op.finish())
                .map_err(|e| {
                    AppError::InvalidInput(sanitize_error_message(
                        &format!("Failed to initialize COS operator: {}", e),
                        secret_opt,
                    ))
                })
        }
        other => Err(AppError::InvalidInput(format!(
            "Unsupported OpenDAL image bed provider: {}",
            other
        ))),
    }
}

pub async fn test_image_bed_connection(
    config: &ImageBedConfig,
) -> AppResult<ImageBedConnectionResult> {
    let provider = normalized_provider(config);
    let started = Instant::now();

    match provider.as_str() {
        "none" => Ok(ImageBedConnectionResult {
            ok: false,
            provider,
            message: "No image bed provider is selected".to_string(),
            latency_ms: 0,
        }),
        "picgo" => {
            let upload_url_str = build_picgo_upload_url(config)?;
            let upload_url = Url::parse(&upload_url_str)
                .map_err(|e| AppError::InvalidInput(format!("Invalid PicGo URL: {}", e)))?;
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(HTTP_TEST_TIMEOUT_SECS))
                .build()
                .map_err(|e| AppError::InvalidInput(format!("HTTP client error: {}", e)))?;

            if let Some(heartbeat_url) = build_picgo_heartbeat_url(&upload_url) {
                match client.post(&heartbeat_url).send().await {
                    Ok(resp) => {
                        let status = resp.status();
                        let latency_ms = started.elapsed().as_millis() as u64;
                        if status.is_success() {
                            return Ok(ImageBedConnectionResult {
                                ok: true,
                                provider,
                                message: format!("Connected to PicGo / PicList ({})", upload_url_str),
                                latency_ms,
                            });
                        }
                        if matches!(status.as_u16(), 400 | 404 | 405) {
                            return Ok(ImageBedConnectionResult {
                                ok: true,
                                provider,
                                message: format!(
                                    "PicGo HTTP server is reachable at {} (HTTP {})",
                                    upload_url_str,
                                    status.as_u16()
                                ),
                                latency_ms,
                            });
                        }
                        return Ok(ImageBedConnectionResult {
                            ok: false,
                            provider,
                            message: format!(
                                "PicGo server returned HTTP {}",
                                status.as_u16()
                            ),
                            latency_ms,
                        });
                    }
                    Err(err) => {
                        return Ok(ImageBedConnectionResult {
                            ok: false,
                            provider,
                            message: format!(
                                "Unable to reach PicGo server at {}: {}",
                                upload_url_str, err
                            ),
                            latency_ms: started.elapsed().as_millis() as u64,
                        });
                    }
                }
            }

            Ok(ImageBedConnectionResult {
                ok: false,
                provider,
                message: "Unable to construct PicGo heartbeat URL".to_string(),
                latency_ms: started.elapsed().as_millis() as u64,
            })
        }
        "s3" | "oss" | "cos" => {
            let op = build_opendal_operator(config)?;
            test_operator_connection(&op, &provider, config.secret_access_key.as_deref()).await
        }
        other => Err(AppError::InvalidInput(format!(
            "Unsupported image bed provider: {}",
            other
        ))),
    }
}

async fn test_operator_connection(
    op: &Operator,
    provider: &str,
    secret_key: Option<&str>,
) -> AppResult<ImageBedConnectionResult> {
    let started = Instant::now();
    match op.check().await {
        Ok(()) => Ok(ImageBedConnectionResult {
            ok: true,
            provider: provider.to_string(),
            message: format!(
                "Successfully connected to {} object storage",
                provider.to_ascii_uppercase()
            ),
            latency_ms: started.elapsed().as_millis() as u64,
        }),
        Err(err) => Ok(ImageBedConnectionResult {
            ok: false,
            provider: provider.to_string(),
            message: sanitize_error_message(&format!("Connection failed: {}", err), secret_key),
            latency_ms: started.elapsed().as_millis() as u64,
        }),
    }
}

async fn upload_via_picgo(
    config: &ImageBedConfig,
    file_paths: &[String],
) -> AppResult<ImageBedUploadBatchResult> {
    let upload_url = build_picgo_upload_url(config)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(HTTP_UPLOAD_TIMEOUT_SECS))
        .build()
        .map_err(|e| AppError::InvalidInput(format!("HTTP client error: {}", e)))?;

    let mut items = Vec::with_capacity(file_paths.len());
    for raw_path in file_paths {
        let path = Path::new(raw_path);
        if !path.is_file() {
            items.push(UploadedImageItem {
                local_path: raw_path.clone(),
                remote_url: None,
                remote_key: None,
                success: false,
                error: Some(format!("Local file not found: {}", raw_path)),
            });
            continue;
        }

        let canonical_str = fs::canonicalize(path)
            .unwrap_or_else(|_| path.to_path_buf())
            .to_string_lossy()
            .to_string();

        let payload = serde_json::json!({ "list": [canonical_str] });
        match client.post(&upload_url).json(&payload).send().await {
            Ok(resp) => {
                let status = resp.status();
                match resp.text().await {
                    Ok(body) => {
                        if !status.is_success() {
                            items.push(UploadedImageItem {
                                local_path: raw_path.clone(),
                                remote_url: None,
                                remote_key: None,
                                success: false,
                                error: Some(format!(
                                    "PicGo HTTP {}: {}",
                                    status.as_u16(),
                                    body.chars().take(240).collect::<String>()
                                )),
                            });
                            continue;
                        }
                        match parse_picgo_upload_response(&body) {
                            Ok(mut urls) => {
                                let raw_url = urls.remove(0);
                                match validate_http_url(&raw_url, "PicGo returned URL") {
                                    Ok(valid_url) => {
                                        items.push(UploadedImageItem {
                                            local_path: raw_path.clone(),
                                            remote_url: Some(valid_url.to_string()),
                                            remote_key: None,
                                            success: true,
                                            error: None,
                                        });
                                    }
                                    Err(err) => {
                                        items.push(UploadedImageItem {
                                            local_path: raw_path.clone(),
                                            remote_url: None,
                                            remote_key: None,
                                            success: false,
                                            error: Some(err.to_string()),
                                        });
                                    }
                                }
                            }
                            Err(msg) => {
                                items.push(UploadedImageItem {
                                    local_path: raw_path.clone(),
                                    remote_url: None,
                                    remote_key: None,
                                    success: false,
                                    error: Some(msg),
                                });
                            }
                        }
                    }
                    Err(e) => {
                        items.push(UploadedImageItem {
                            local_path: raw_path.clone(),
                            remote_url: None,
                            remote_key: None,
                            success: false,
                            error: Some(format!("Failed reading PicGo response: {}", e)),
                        });
                    }
                }
            }
            Err(e) => {
                items.push(UploadedImageItem {
                    local_path: raw_path.clone(),
                    remote_url: None,
                    remote_key: None,
                    success: false,
                    error: Some(format!("PicGo upload request failed: {}", e)),
                });
            }
        }
    }

    let succeeded = items.iter().filter(|i| i.success).count();
    let total = items.len();
    Ok(ImageBedUploadBatchResult {
        provider: "picgo".to_string(),
        total,
        succeeded,
        failed: total - succeeded,
        items,
    })
}

async fn upload_files_with_operator(
    op: &Operator,
    config: &ImageBedConfig,
    file_paths: &[String],
) -> ImageBedUploadBatchResult {
    let provider = normalized_provider(config);
    let secret_opt = config.secret_access_key.as_deref();
    let mut items = Vec::with_capacity(file_paths.len());

    for raw_path in file_paths {
        let path = Path::new(raw_path);
        if !path.is_file() {
            items.push(UploadedImageItem {
                local_path: raw_path.clone(),
                remote_url: None,
                remote_key: None,
                success: false,
                error: Some(format!("Local file not found: {}", raw_path)),
            });
            continue;
        }

        let bytes = match fs::read(path) {
            Ok(b) if !b.is_empty() => b,
            Ok(_) => {
                items.push(UploadedImageItem {
                    local_path: raw_path.clone(),
                    remote_url: None,
                    remote_key: None,
                    success: false,
                    error: Some("Image file is empty".to_string()),
                });
                continue;
            }
            Err(e) => {
                items.push(UploadedImageItem {
                    local_path: raw_path.clone(),
                    remote_url: None,
                    remote_key: None,
                    success: false,
                    error: Some(format!("Failed to read local file: {}", e)),
                });
                continue;
            }
        };

        let remote_key = build_remote_key(config.path_prefix.as_deref(), path, &bytes);
        let remote_url = match build_public_url(config, &remote_key) {
            Ok(url) => url,
            Err(e) => {
                items.push(UploadedImageItem {
                    local_path: raw_path.clone(),
                    remote_url: None,
                    remote_key: None,
                    success: false,
                    error: Some(sanitize_error_message(&e.to_string(), secret_opt)),
                });
                continue;
            }
        };

        let content_type = path
            .extension()
            .and_then(|e| e.to_str())
            .and_then(mime_type_for_extension);

        let write_result = match content_type {
            Some(mime) => op.write_with(&remote_key, bytes).content_type(mime).await,
            None => op.write(&remote_key, bytes).await,
        };

        match write_result {
            Ok(_) => {
                items.push(UploadedImageItem {
                    local_path: raw_path.clone(),
                    remote_url: Some(remote_url),
                    remote_key: Some(remote_key),
                    success: true,
                    error: None,
                });
            }
            Err(e) => {
                items.push(UploadedImageItem {
                    local_path: raw_path.clone(),
                    remote_url: None,
                    remote_key: Some(remote_key),
                    success: false,
                    error: Some(sanitize_error_message(
                        &format!("Object storage upload failed: {}", e),
                        secret_opt,
                    )),
                });
            }
        }
    }

    let succeeded = items.iter().filter(|i| i.success).count();
    let total = items.len();
    ImageBedUploadBatchResult {
        provider,
        total,
        succeeded,
        failed: total - succeeded,
        items,
    }
}

pub async fn upload_images_to_bed(
    config: &ImageBedConfig,
    file_paths: &[String],
) -> AppResult<ImageBedUploadBatchResult> {
    let provider = normalized_provider(config);
    match provider.as_str() {
        "none" => Err(AppError::InvalidInput(
            "No image bed provider is configured".into(),
        )),
        "picgo" => upload_via_picgo(config, file_paths).await,
        "s3" | "oss" | "cos" => {
            let op = build_opendal_operator(config)?;
            Ok(upload_files_with_operator(&op, config, file_paths).await)
        }
        other => Err(AppError::InvalidInput(format!(
            "Unsupported image bed provider: {}",
            other
        ))),
    }
}

async fn delete_keys_with_operator(
    op: &Operator,
    provider: &str,
    remote_keys: &[String],
    secret_key: Option<&str>,
) -> DeleteRemoteImagesResult {
    let mut deleted_keys = Vec::new();
    let mut failed_keys = Vec::new();

    for raw_key in remote_keys {
        let key = raw_key.trim().trim_start_matches('/');
        if key.is_empty() {
            continue;
        }
        match op.delete(key).await {
            Ok(()) => deleted_keys.push(key.to_string()),
            Err(e) => failed_keys.push(RemoteDeleteFailure {
                remote_key: key.to_string(),
                error: sanitize_error_message(&e.to_string(), secret_key),
            }),
        }
    }

    let message = if failed_keys.is_empty() {
        format!("Deleted {} remote object(s)", deleted_keys.len())
    } else {
        format!(
            "Deleted {} remote object(s), {} failed",
            deleted_keys.len(),
            failed_keys.len()
        )
    };

    DeleteRemoteImagesResult {
        provider: provider.to_string(),
        supported: true,
        deleted_keys,
        failed_keys,
        message,
    }
}

pub async fn delete_remote_images(
    config: &ImageBedConfig,
    remote_keys: &[String],
) -> AppResult<DeleteRemoteImagesResult> {
    let provider = normalized_provider(config);
    match provider.as_str() {
        "picgo" => Ok(DeleteRemoteImagesResult {
            provider,
            supported: false,
            deleted_keys: Vec::new(),
            failed_keys: Vec::new(),
            message: "PicGo / PicList HTTP bridge does not support remote deletion; local Markdown links can still be reverted.".to_string(),
        }),
        "none" => Ok(DeleteRemoteImagesResult {
            provider,
            supported: false,
            deleted_keys: Vec::new(),
            failed_keys: Vec::new(),
            message: "No image bed provider is configured".to_string(),
        }),
        "s3" | "oss" | "cos" => {
            let op = build_opendal_operator(config)?;
            Ok(delete_keys_with_operator(
                &op,
                &provider,
                remote_keys,
                config.secret_access_key.as_deref(),
            )
            .await)
        }
        other => Err(AppError::InvalidInput(format!(
            "Unsupported image bed provider: {}",
            other
        ))),
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex_str) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex_str, 16) {
                    out.push(val);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| input.to_string())
}

fn strip_query_and_hash(src: &str) -> &str {
    let no_hash = src.split('#').next().unwrap_or(src);
    no_hash.split('?').next().unwrap_or(no_hash)
}

fn tokenize_hexo_tag_args(raw: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;

    for ch in raw.chars() {
        match quote {
            Some(q) => {
                if ch == q {
                    quote = None;
                    if !current.is_empty() {
                        tokens.push(std::mem::take(&mut current));
                    }
                } else {
                    current.push(ch);
                }
            }
            None => {
                if ch == '"' || ch == '\'' {
                    if !current.is_empty() {
                        tokens.push(std::mem::take(&mut current));
                    }
                    quote = Some(ch);
                } else if ch.is_whitespace() {
                    if !current.is_empty() {
                        tokens.push(std::mem::take(&mut current));
                    }
                } else {
                    current.push(ch);
                }
            }
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn extract_image_references(content: &str) -> Vec<String> {
    static MD_ANGLE_RE: OnceLock<Regex> = OnceLock::new();
    static MD_STD_RE: OnceLock<Regex> = OnceLock::new();
    static MD_REF_DEF_RE: OnceLock<Regex> = OnceLock::new();
    static HTML_IMG_DQ_RE: OnceLock<Regex> = OnceLock::new();
    static HTML_IMG_SQ_RE: OnceLock<Regex> = OnceLock::new();
    static HTML_IMG_UQ_RE: OnceLock<Regex> = OnceLock::new();
    static HEXO_ASSET_IMG_RE: OnceLock<Regex> = OnceLock::new();
    static HEXO_IMG_RE: OnceLock<Regex> = OnceLock::new();

    let md_angle = MD_ANGLE_RE
        .get_or_init(|| Regex::new(r"!\[[^\]]*\]\(\s*<([^>\r\n]+)>").expect("valid regex"));
    let md_std = MD_STD_RE
        .get_or_init(|| Regex::new(r"!\[[^\]]*\]\(\s*([^\s<)\r\n][^\s)\r\n]*)").expect("valid regex"));
    let md_ref = MD_REF_DEF_RE.get_or_init(|| {
        Regex::new(r"(?m)^\s*\[[^\]]+\]:\s*<?([^\s>\r\n]+)>?").expect("valid regex")
    });
    let html_dq = HTML_IMG_DQ_RE.get_or_init(|| {
        Regex::new(r#"(?i)<img\b[^>]*?\bsrc\s*=\s*"([^"]+)""#).expect("valid regex")
    });
    let html_sq = HTML_IMG_SQ_RE.get_or_init(|| {
        Regex::new(r#"(?i)<img\b[^>]*?\bsrc\s*=\s*'([^']+)'"#).expect("valid regex")
    });
    let html_uq = HTML_IMG_UQ_RE.get_or_init(|| {
        Regex::new(r#"(?i)<img\b[^>]*?\bsrc\s*=\s*([^\s"'=<>`]+)"#).expect("valid regex")
    });
    let hexo_asset_img = HEXO_ASSET_IMG_RE
        .get_or_init(|| Regex::new(r"\{%\s*asset_img\s+([^%]+?)\s*%\}").expect("valid regex"));
    let hexo_img = HEXO_IMG_RE
        .get_or_init(|| Regex::new(r"\{%\s*img\s+([^%]+?)\s*%\}").expect("valid regex"));

    let mut refs = Vec::new();

    for caps in md_angle.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            refs.push(m.as_str().to_string());
        }
    }
    for caps in md_std.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            refs.push(m.as_str().to_string());
        }
    }
    for caps in md_ref.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            refs.push(m.as_str().to_string());
        }
    }
    for caps in html_dq.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            refs.push(m.as_str().to_string());
        }
    }
    for caps in html_sq.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            refs.push(m.as_str().to_string());
        }
    }
    for caps in html_uq.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            refs.push(m.as_str().to_string());
        }
    }
    for caps in hexo_asset_img.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            for token in tokenize_hexo_tag_args(m.as_str()) {
                let cleaned = percent_decode(strip_query_and_hash(token.trim()));
                if is_supported_image_path(Path::new(&cleaned)) || cleaned.contains('/') {
                    refs.push(token);
                }
            }
        }
    }
    for caps in hexo_img.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            for token in tokenize_hexo_tag_args(m.as_str()) {
                let cleaned = percent_decode(strip_query_and_hash(token.trim()));
                if is_supported_image_path(Path::new(&cleaned)) || cleaned.contains('/') {
                    refs.push(token);
                }
            }
        }
    }

    refs
}

fn is_external_ref(src: &str) -> bool {
    let lower = src.trim().to_ascii_lowercase();
    lower.is_empty()
        || lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("data:")
        || lower.starts_with("blob:")
        || lower.starts_with("asset:")
        || lower.starts_with("//")
}

fn resolve_contained_source_dir(site_root: &Path, src_dir_name: &str) -> AppResult<PathBuf> {
    let rel = Path::new(src_dir_name);
    if rel.is_absolute()
        || rel.components().any(|c| {
            matches!(
                c,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err(AppError::InvalidPath(format!(
            "source_dir escapes site root: {}",
            src_dir_name
        )));
    }
    let candidate = site_root.join(rel);
    if let (Ok(canon_root), Ok(canon_candidate)) =
        (fs::canonicalize(site_root), fs::canonicalize(&candidate))
    {
        if !canon_candidate.starts_with(&canon_root) {
            return Err(AppError::InvalidPath(format!(
                "Resolved source_dir escapes site root: {}",
                src_dir_name
            )));
        }
    }
    Ok(candidate)
}

pub fn scan_unused_local_images(
    doc_path: &str,
    site_root: Option<&str>,
    post_asset_folder: bool,
    source_dir: Option<&str>,
    current_content: &str,
) -> AppResult<ScanUnusedImagesResult> {
    let doc = PathBuf::from(doc_path);
    let doc_parent = doc
        .parent()
        .ok_or_else(|| AppError::InvalidPath("Document has no parent directory".into()))?;
    let doc_stem = doc
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::InvalidPath("Document has no valid file stem".into()))?;

    let src_dir_name = source_dir
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("source");
    let site_source = match site_root.map(str::trim).filter(|s| !s.is_empty()) {
        Some(r) => Some(resolve_contained_source_dir(Path::new(r), src_dir_name)?),
        None => None,
    };

    let mut candidate_dirs: Vec<PathBuf> = Vec::new();
    if site_source.is_some() && is_page_bundle_doc(&doc) {
        candidate_dirs.push(doc_parent.to_path_buf());
    } else {
        let post_asset_dir = doc_parent.join(doc_stem);
        if post_asset_folder || post_asset_dir.is_dir() {
            candidate_dirs.push(post_asset_dir);
        }
        if let Some(site_src) = &site_source {
            candidate_dirs.push(site_src.join("images").join(doc_stem));
        } else {
            candidate_dirs.push(doc_parent.join("assets"));
        }
    }

    let mut scanned_canonical_dirs: Vec<PathBuf> = Vec::new();
    let mut seen_dirs: HashSet<PathBuf> = HashSet::new();
    for dir in candidate_dirs {
        if dir.is_dir() {
            let canon = fs::canonicalize(&dir).unwrap_or(dir);
            if seen_dirs.insert(canon.clone()) {
                scanned_canonical_dirs.push(canon);
            }
        }
    }

    let mut referenced_canonical: HashSet<PathBuf> = HashSet::new();
    for raw_ref in extract_image_references(current_content) {
        let trimmed = raw_ref.trim().trim_matches(|c| c == '<' || c == '>');
        if is_external_ref(trimmed) {
            continue;
        }
        let cleaned = percent_decode(strip_query_and_hash(trimmed));
        let rel_trimmed = cleaned.trim_start_matches("./");

        let mut candidates: Vec<PathBuf> = Vec::new();
        let as_path = PathBuf::from(&cleaned);
        if as_path.is_absolute() {
            candidates.push(as_path);
        }

        candidates.push(doc_parent.join(rel_trimmed));
        candidates.push(doc_parent.join(doc_stem).join(rel_trimmed));
        if let Some(after_stem) = rel_trimmed.strip_prefix(&format!("{}/", doc_stem)) {
            candidates.push(doc_parent.join(doc_stem).join(after_stem));
        }

        if let Some(site_src) = &site_source {
            let no_leading = cleaned.trim_start_matches('/');
            candidates.push(site_src.join(no_leading));
            candidates.push(site_src.join("images").join(doc_stem).join(rel_trimmed));
            candidates.push(site_src.join("images").join(rel_trimmed));
        } else {
            candidates.push(doc_parent.join("assets").join(rel_trimmed));
        }

        for dir in &scanned_canonical_dirs {
            candidates.push(dir.join(rel_trimmed));
        }

        for candidate in candidates {
            if candidate.is_file() {
                let canon = fs::canonicalize(&candidate).unwrap_or(candidate);
                referenced_canonical.insert(canon);
            }
        }
    }

    let mut seen_images: HashSet<PathBuf> = HashSet::new();
    let mut total_local_images = 0usize;
    let mut unused_images = Vec::new();
    let mut total_unused_bytes = 0u64;

    for dir in &scanned_canonical_dirs {
        for entry in WalkDir::new(dir).into_iter().filter_map(Result::ok) {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            if !is_supported_image_path(path) {
                continue;
            }
            let canon = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
            if !seen_images.insert(canon.clone()) {
                continue;
            }
            total_local_images += 1;

            if !referenced_canonical.contains(&canon) {
                let size_bytes = fs::metadata(&canon).map(|m| m.len()).unwrap_or(0);
                let file_name = canon
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default()
                    .to_string();
                total_unused_bytes = total_unused_bytes.saturating_add(size_bytes);
                unused_images.push(UnusedLocalImage {
                    absolute_path: canon.to_string_lossy().to_string(),
                    file_name,
                    size_bytes,
                });
            }
        }
    }

    unused_images.sort_by(|a, b| {
        a.file_name
            .cmp(&b.file_name)
            .then_with(|| a.absolute_path.cmp(&b.absolute_path))
    });

    Ok(ScanUnusedImagesResult {
        scanned_dirs: scanned_canonical_dirs
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
        total_local_images,
        unused_images,
        total_unused_bytes,
    })
}

fn is_path_within_allowed_dirs(target: &Path, allowed: &[PathBuf]) -> bool {
    allowed
        .iter()
        .any(|dir| target != dir && target.starts_with(dir))
}

pub fn delete_local_images(
    paths: &[String],
    allowed_dirs: &[String],
) -> AppResult<DeleteLocalImagesResult> {
    let mut canonical_allowed: Vec<PathBuf> = Vec::new();
    for raw_dir in allowed_dirs {
        let trimmed = raw_dir.trim();
        if trimmed.is_empty() {
            continue;
        }
        let dir_path = Path::new(trimmed);
        if dir_path.is_dir() {
            if let Ok(canon) = fs::canonicalize(dir_path) {
                canonical_allowed.push(canon);
            }
        }
    }

    if canonical_allowed.is_empty() {
        return Err(AppError::InvalidInput(
            "No valid allowed image directories provided".into(),
        ));
    }

    // Phase 1: strictly validate every requested path before deleting anything
    let mut validated_targets: Vec<(PathBuf, u64)> = Vec::new();
    let mut skipped_paths: Vec<String> = Vec::new();
    let mut seen_targets: HashSet<PathBuf> = HashSet::new();

    for raw_path in paths {
        let trimmed = raw_path.trim();
        if trimmed.is_empty() {
            continue;
        }
        let path = Path::new(trimmed);

        match fs::canonicalize(path) {
            Ok(canon) => {
                if !is_path_within_allowed_dirs(&canon, &canonical_allowed) {
                    return Err(AppError::InvalidPath(format!(
                        "Refusing to delete file outside allowed image directories: {}",
                        trimmed
                    )));
                }
                if !canon.is_file() {
                    return Err(AppError::InvalidPath(format!(
                        "Refusing to delete non-file path: {}",
                        trimmed
                    )));
                }
                if !is_supported_image_path(&canon) {
                    return Err(AppError::InvalidInput(format!(
                        "Refusing to delete non-image file: {}",
                        trimmed
                    )));
                }
                if seen_targets.insert(canon.clone()) {
                    let size = fs::metadata(&canon).map(|m| m.len()).unwrap_or(0);
                    validated_targets.push((canon, size));
                }
            }
            Err(_) => {
                // Even if missing, verify parent isn't a traversal attempt outside allowed dirs
                let parent_allowed = path
                    .parent()
                    .and_then(|p| fs::canonicalize(p).ok())
                    .map(|canon_parent| {
                        canonical_allowed
                            .iter()
                            .any(|dir| canon_parent.starts_with(dir))
                    })
                    .unwrap_or(false);

                let has_parent_dir_component = path
                    .components()
                    .any(|c| matches!(c, std::path::Component::ParentDir));

                if !parent_allowed || has_parent_dir_component {
                    return Err(AppError::InvalidPath(format!(
                        "Refusing to access path outside allowed image directories: {}",
                        trimmed
                    )));
                }
                if !is_supported_image_path(path) {
                    return Err(AppError::InvalidInput(format!(
                        "Refusing to delete non-image file: {}",
                        trimmed
                    )));
                }
                skipped_paths.push(trimmed.to_string());
            }
        }
    }

    // Phase 2: perform deletion
    let mut deleted_paths = Vec::with_capacity(validated_targets.len());
    let mut freed_bytes = 0u64;
    for (canon, size) in validated_targets {
        fs::remove_file(&canon)?;
        freed_bytes = freed_bytes.saturating_add(size);
        deleted_paths.push(canon.to_string_lossy().to_string());
    }

    let deleted_count = deleted_paths.len();
    Ok(DeleteLocalImagesResult {
        deleted_paths,
        skipped_paths,
        deleted_count,
        freed_bytes,
    })
}

pub fn read_local_file_as_data_uri(file_path: &str) -> AppResult<String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("Image file path is empty".into()));
    }
    let path = Path::new(trimmed);
    if !path.is_file() {
        return Err(AppError::NotFound(format!(
            "Local image file not found: {}",
            trimmed
        )));
    }
    let canon = fs::canonicalize(path)?;
    let ext = canon
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default();
    let mime = mime_type_for_extension(ext).ok_or_else(|| {
        AppError::InvalidInput(format!(
            "Unsupported image format for Data URI export: {}",
            ext
        ))
    })?;

    let meta = fs::metadata(&canon)?;
    if meta.len() > MAX_DATA_URI_IMAGE_BYTES {
        return Err(AppError::InvalidInput(format!(
            "Image file exceeds the 10MB limit ({} bytes)",
            meta.len()
        )));
    }

    let bytes = fs::read(&canon)?;
    if bytes.len() as u64 > MAX_DATA_URI_IMAGE_BYTES {
        return Err(AppError::InvalidInput(
            "Image file exceeds the 10MB limit".into(),
        ));
    }

    let encoded = BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::future::Future;
    use tempfile::TempDir;

    fn block_on<F: Future>(future: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime")
            .block_on(future)
    }

    #[test]
    fn test_picgo_url_building_and_scheme_validation() {
        let default_cfg = ImageBedConfig {
            provider: "picgo".into(),
            ..Default::default()
        };
        assert_eq!(
            build_picgo_upload_url(&default_cfg).unwrap(),
            "http://127.0.0.1:36677/upload"
        );

        let with_params = ImageBedConfig {
            provider: "picgo".into(),
            picgo_url: "http://127.0.0.1:36677/upload".into(),
            picgo_uploader: Some("github".into()),
            picgo_config_name: Some("blog prod".into()),
            ..Default::default()
        };
        assert_eq!(
            build_picgo_upload_url(&with_params).unwrap(),
            "http://127.0.0.1:36677/upload?uploader=github&configName=blog+prod"
        );

        let bad_scheme = ImageBedConfig {
            provider: "picgo".into(),
            picgo_url: "file:///etc/passwd".into(),
            ..Default::default()
        };
        assert!(matches!(
            build_picgo_upload_url(&bad_scheme),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[test]
    fn test_picgo_response_parsing() {
        let ok_list = r#"{"success":true,"result":["https://cdn.example.com/a.png","https://cdn.example.com/b.jpg"]}"#;
        assert_eq!(
            parse_picgo_upload_response(ok_list).unwrap(),
            vec![
                "https://cdn.example.com/a.png".to_string(),
                "https://cdn.example.com/b.jpg".to_string()
            ]
        );

        let ok_single = r#"{"success":true,"result":"https://cdn.example.com/only.webp"}"#;
        assert_eq!(
            parse_picgo_upload_response(ok_single).unwrap(),
            vec!["https://cdn.example.com/only.webp".to_string()]
        );

        let fail = r#"{"success":false,"message":"Token expired"}"#;
        assert_eq!(
            parse_picgo_upload_response(fail).unwrap_err(),
            "Token expired"
        );

        let empty_ok = r#"{"success":true,"result":[]}"#;
        assert!(parse_picgo_upload_response(empty_ok).is_err());

        let invalid = "not json";
        assert!(parse_picgo_upload_response(invalid).is_err());
    }

    #[test]
    fn test_opendal_memory_upload_verify_and_undo_delete_lifecycle() {
        block_on(async {
            let dir = TempDir::new().unwrap();
            let img1 = dir.path().join("diagram.png");
            let img2 = dir.path().join("中文截图.jpg");
            let missing = dir.path().join("does-not-exist.png");
            fs::write(&img1, b"\x89PNG\r\n\x1a\nfake-png-payload").unwrap();
            fs::write(&img2, b"\xff\xd8\xff\xe0fake-jpeg-payload").unwrap();

            let op = Operator::new(services::Memory::default())
                .unwrap()
                .finish();

            let conn = test_operator_connection(&op, "memory", Some("super-secret")).await.unwrap();
            assert!(conn.ok);

            let cfg = ImageBedConfig {
                provider: "memory".into(),
                path_prefix: Some("/blog/2026/".into()),
                custom_domain: Some("cdn.example.com".into()),
                secret_access_key: Some("my-top-secret-key".into()),
                ..Default::default()
            };

            let batch = upload_files_with_operator(
                &op,
                &cfg,
                &[
                    img1.to_string_lossy().to_string(),
                    missing.to_string_lossy().to_string(),
                    img2.to_string_lossy().to_string(),
                ],
            )
            .await;

            assert_eq!(batch.total, 3);
            assert_eq!(batch.succeeded, 2);
            assert_eq!(batch.failed, 1);

            assert!(batch.items[0].success);
            assert!(!batch.items[1].success);
            assert!(batch.items[2].success);

            let key1 = batch.items[0].remote_key.clone().unwrap();
            let url1 = batch.items[0].remote_url.clone().unwrap();
            let key2 = batch.items[2].remote_key.clone().unwrap();
            let url2 = batch.items[2].remote_url.clone().unwrap();

            assert!(key1.starts_with("blog/2026/diagram-"));
            assert!(url1.starts_with("https://cdn.example.com/blog/2026/diagram-"));
            assert!(url2.contains("%E4%B8%AD%E6%96%87%E6%88%AA%E5%9B%BE"));

            // Verify actual bytes written into OpenDAL Memory storage
            let read_back = op.read(&key1).await.unwrap().to_bytes();
            assert_eq!(read_back.as_ref(), b"\x89PNG\r\n\x1a\nfake-png-payload");

            // Undo upload via remote delete
            let del = delete_keys_with_operator(
                &op,
                "memory",
                &[key1.clone(), key2.clone()],
                cfg.secret_access_key.as_deref(),
            )
            .await;
            assert!(del.supported);
            assert_eq!(del.deleted_keys.len(), 2);
            assert!(del.failed_keys.is_empty());

            // Confirm objects no longer exist in Memory operator
            assert!(!op.exists(&key1).await.unwrap());
            assert!(!op.exists(&key2).await.unwrap());
        });
    }

    #[test]
    fn test_picgo_delete_remote_graceful_unsupported() {
        block_on(async {
            let cfg = ImageBedConfig {
                provider: "picgo".into(),
                ..Default::default()
            };
            let res = delete_remote_images(&cfg, &["blog/a.png".into()])
                .await
                .unwrap();
            assert!(!res.supported);
            assert!(res.deleted_keys.is_empty());
            assert!(res.failed_keys.is_empty());
            assert!(res.message.contains("PicGo"));
        });
    }

    #[test]
    fn test_public_url_assembly_custom_and_provider_defaults() {
        // Custom domain takes precedence
        let custom_cfg = ImageBedConfig {
            provider: "s3".into(),
            bucket: Some("my-bucket".into()),
            region: Some("us-west-2".into()),
            custom_domain: Some("img.myblog.dev/".into()),
            ..Default::default()
        };
        assert_eq!(
            build_public_url(&custom_cfg, "posts/hello 图.png").unwrap(),
            "https://img.myblog.dev/posts/hello%20%E5%9B%BE.png"
        );

        // AWS S3 default
        let aws_s3 = ImageBedConfig {
            provider: "s3".into(),
            bucket: Some("hexo-assets".into()),
            region: Some("ap-northeast-1".into()),
            ..Default::default()
        };
        assert_eq!(
            build_public_url(&aws_s3, "2026/hero.png").unwrap(),
            "https://hexo-assets.s3.ap-northeast-1.amazonaws.com/2026/hero.png"
        );

        // AWS S3 custom endpoint that already carries `{bucket}.` prefix must not duplicate bucket
        let aws_s3_prefixed = ImageBedConfig {
            provider: "s3".into(),
            bucket: Some("my-bucket".into()),
            endpoint: Some("https://my-bucket.s3.us-east-1.amazonaws.com".into()),
            ..Default::default()
        };
        assert_eq!(
            build_public_url(&aws_s3_prefixed, "2026/hero.png").unwrap(),
            "https://my-bucket.s3.us-east-1.amazonaws.com/2026/hero.png"
        );

        // MinIO / S3-compatible custom endpoint (path style)
        let minio = ImageBedConfig {
            provider: "s3".into(),
            bucket: Some("blog".into()),
            endpoint: Some("http://127.0.0.1:9000".into()),
            ..Default::default()
        };
        assert_eq!(
            build_public_url(&minio, "a/b.webp").unwrap(),
            "http://127.0.0.1:9000/blog/a/b.webp"
        );

        // Aliyun OSS
        let oss = ImageBedConfig {
            provider: "oss".into(),
            bucket: Some("my-oss".into()),
            endpoint: Some("oss-cn-hangzhou.aliyuncs.com".into()),
            ..Default::default()
        };
        assert_eq!(
            build_public_url(&oss, "img/cover.jpg").unwrap(),
            "https://my-oss.oss-cn-hangzhou.aliyuncs.com/img/cover.jpg"
        );

        // Tencent COS with region
        let cos = ImageBedConfig {
            provider: "cos".into(),
            bucket: Some("blog-1250000000".into()),
            region: Some("ap-shanghai".into()),
            ..Default::default()
        };
        assert_eq!(
            build_public_url(&cos, "img/pic.png").unwrap(),
            "https://blog-1250000000.cos.ap-shanghai.myqcloud.com/img/pic.png"
        );
    }

    #[test]
    fn test_secret_redaction_in_debug_and_errors() {
        let cfg = ImageBedConfig {
            provider: "s3".into(),
            secret_access_key: Some("SUPER_SECRET_KEY_999".into()),
            ..Default::default()
        };
        let debug_str = format!("{:?}", cfg);
        assert!(!debug_str.contains("SUPER_SECRET_KEY_999"));
        assert!(debug_str.contains("[REDACTED]"));

        let leaked = "Auth failed for key SUPER_SECRET_KEY_999 in header";
        let clean = sanitize_error_message(leaked, cfg.secret_access_key.as_deref());
        assert!(!clean.contains("SUPER_SECRET_KEY_999"));
        assert!(clean.contains("[REDACTED]"));
    }

    #[test]
    fn test_scan_unused_local_images_with_cjk_angle_brackets_and_hexo_tags() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        let post_path = root.join("source/_posts/my-post.md");
        let asset_dir = root.join("source/_posts/my-post");
        let images_dir = root.join("source/images/my-post");
        fs::create_dir_all(&asset_dir).unwrap();
        fs::create_dir_all(&images_dir).unwrap();
        fs::write(&post_path, "# My Post").unwrap();

        // Used images across all 4 reference syntaxes
        fs::write(asset_dir.join("used-md.png"), b"1111").unwrap();
        fs::write(asset_dir.join("中文 空格.jpg"), b"22222").unwrap();
        fs::write(asset_dir.join("via-asset-tag.webp"), b"333333").unwrap();
        fs::write(images_dir.join("via-html.gif"), b"4444444").unwrap();
        fs::write(images_dir.join("via-img-tag.png"), b"55555555").unwrap();

        // Unused images + non-image file that should be ignored
        fs::write(asset_dir.join("orphan-1.png"), b"aaaaaaa").unwrap(); // 7 bytes
        fs::write(images_dir.join("orphan-2.jpg"), b"bbbbbbbbbb").unwrap(); // 10 bytes
        fs::write(asset_dir.join("notes.txt"), b"ignore me").unwrap();

        let content = r#"
![standard](my-post/used-md.png "caption")
![cjk angle](<my-post/%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC.jpg?v=2>)
{% asset_img center via-asset-tag.webp 600 "Tag Title" %}
<img alt="demo" src="/images/my-post/via-html.gif#section" />
{% img /images/my-post/via-img-tag.png 800 400 "Banner" %}
![remote](https://example.com/orphan-1.png)
"#;

        let scan = scan_unused_local_images(
            post_path.to_str().unwrap(),
            Some(root.to_str().unwrap()),
            true,
            Some("source"),
            content,
        )
        .unwrap();

        assert_eq!(scan.scanned_dirs.len(), 2);
        assert_eq!(scan.total_local_images, 7);
        assert_eq!(scan.unused_images.len(), 2);
        assert_eq!(scan.total_unused_bytes, 17);
        let names: Vec<&str> = scan
            .unused_images
            .iter()
            .map(|i| i.file_name.as_str())
            .collect();
        assert_eq!(names, vec!["orphan-1.png", "orphan-2.jpg"]);
    }

    #[test]
    fn test_delete_local_images_blocks_traversal_and_non_images() {
        let dir = TempDir::new().unwrap();
        let allowed = dir.path().join("post-assets");
        let outside = dir.path().join("post-assets-other");
        fs::create_dir_all(&allowed).unwrap();
        fs::create_dir_all(&outside).unwrap();

        let good_img = allowed.join("unused.png");
        let non_img = allowed.join("important.md");
        let outside_img = outside.join("secret.png");
        fs::write(&good_img, b"1234567890").unwrap();
        fs::write(&non_img, b"# keep me").unwrap();
        fs::write(&outside_img, b"do not delete").unwrap();

        let allowed_list = vec![allowed.to_string_lossy().to_string()];

        // 1. Sibling prefix path outside allowed_dirs must be blocked
        let err_sibling = delete_local_images(
            &[
                good_img.to_string_lossy().to_string(),
                outside_img.to_string_lossy().to_string(),
            ],
            &allowed_list,
        );
        assert!(matches!(err_sibling, Err(AppError::InvalidPath(_))));
        // Two-phase validation ensures good_img was NOT deleted when batch had traversal
        assert!(good_img.is_file());
        assert!(outside_img.is_file());

        // 2. Relative traversal ../ must be blocked
        let traversal = allowed.join("../post-assets-other/secret.png");
        let err_rel = delete_local_images(&[traversal.to_string_lossy().to_string()], &allowed_list);
        assert!(matches!(err_rel, Err(AppError::InvalidPath(_))));
        assert!(outside_img.is_file());

        // 3. Non-image file inside allowed dir must be blocked
        let err_non_img =
            delete_local_images(&[non_img.to_string_lossy().to_string()], &allowed_list);
        assert!(matches!(err_non_img, Err(AppError::InvalidInput(_))));
        assert!(non_img.is_file());

        // 4. Legitimate image deletion succeeds and reports freed bytes
        let ok = delete_local_images(&[good_img.to_string_lossy().to_string()], &allowed_list)
            .unwrap();
        assert_eq!(ok.deleted_count, 1);
        assert_eq!(ok.freed_bytes, 10);
        assert!(!good_img.exists());
    }

    #[test]
    fn test_read_local_file_as_data_uri_encoding_and_guards() {
        let dir = TempDir::new().unwrap();
        let png = dir.path().join("pixel.png");
        let svg = dir.path().join("icon.svg");
        let txt = dir.path().join("secret.txt");
        let huge = dir.path().join("huge.png");

        fs::write(&png, b"\x89PNG\r\n\x1a\n").unwrap();
        fs::write(&svg, b"<svg></svg>").unwrap();
        fs::write(&txt, b"plain text").unwrap();
        fs::write(&huge, vec![0u8; (MAX_DATA_URI_IMAGE_BYTES + 1) as usize]).unwrap();

        let png_uri = read_local_file_as_data_uri(png.to_str().unwrap()).unwrap();
        assert!(png_uri.starts_with("data:image/png;base64,"));
        let decoded = BASE64_STANDARD
            .decode(png_uri.trim_start_matches("data:image/png;base64,"))
            .unwrap();
        assert_eq!(decoded, b"\x89PNG\r\n\x1a\n");

        let svg_uri = read_local_file_as_data_uri(svg.to_str().unwrap()).unwrap();
        assert_eq!(svg_uri, "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");

        // Rejects non-image extension
        assert!(matches!(
            read_local_file_as_data_uri(txt.to_str().unwrap()),
            Err(AppError::InvalidInput(_))
        ));

        // Rejects oversized image (> 10MB)
        assert!(matches!(
            read_local_file_as_data_uri(huge.to_str().unwrap()),
            Err(AppError::InvalidInput(_))
        ));

        // Rejects missing file
        assert!(matches!(
            read_local_file_as_data_uri(dir.path().join("nope.png").to_str().unwrap()),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn test_scan_unused_local_images_blocks_source_dir_traversal() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        let post_path = root.join("source/_posts/demo.md");
        fs::create_dir_all(post_path.parent().unwrap()).unwrap();
        fs::write(&post_path, "# Demo").unwrap();

        let err_parent = scan_unused_local_images(
            post_path.to_str().unwrap(),
            Some(root.to_str().unwrap()),
            true,
            Some("../../etc"),
            "# Demo",
        );
        assert!(matches!(err_parent, Err(AppError::InvalidPath(_))));

        let err_abs = scan_unused_local_images(
            post_path.to_str().unwrap(),
            Some(root.to_str().unwrap()),
            true,
            Some("/etc"),
            "# Demo",
        );
        assert!(matches!(err_abs, Err(AppError::InvalidPath(_))));

        // Validate PicGo returned URL protocol check rejects non-http schemes
        assert!(validate_http_url("https://cdn.example.com/a.png", "PicGo returned URL").is_ok());
        assert!(matches!(
            validate_http_url("javascript:alert(1)", "PicGo returned URL"),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[test]
    fn test_scan_unused_local_images_hugo_page_bundle() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::write(root.join("hugo.toml"), "title = \"Hugo\"\n").unwrap();
        let bundle_dir = root.join("content/posts/my-bundle");
        fs::create_dir_all(&bundle_dir).unwrap();
        let doc_path = bundle_dir.join("index.md");
        let md = "---\ntitle: Bundle\n---\n\n![cover](cover.png)\n";
        fs::write(&doc_path, md).unwrap();
        fs::write(bundle_dir.join("cover.png"), b"used").unwrap();
        fs::write(bundle_dir.join("unused.png"), b"unused-bytes").unwrap();

        let scan = scan_unused_local_images(
            doc_path.to_str().unwrap(),
            Some(root.to_str().unwrap()),
            true,
            Some("content"),
            md,
        )
        .unwrap();
        assert_eq!(scan.total_local_images, 2);
        assert_eq!(scan.unused_images.len(), 1);
        assert_eq!(scan.unused_images[0].file_name, "unused.png");
    }
}
