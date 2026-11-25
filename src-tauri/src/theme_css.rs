use std::fs;
use std::path::{Component, Path, PathBuf};

use regex::Regex;
use serde_yaml::Value;
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::models::{QuickOpenResult, ThemeCssResult};
use crate::watcher::normalize_path;

pub const MAX_TOTAL_CSS_BYTES: usize = 2 * 1024 * 1024; // 2 MB

#[derive(Debug, Default)]
struct SiteConfigSubset {
    public_dir: Option<String>,
    source_dir: Option<String>,
    theme: Option<String>,
    url: Option<String>,
    root: Option<String>,
    server_port: Option<u16>,
    server_ip: Option<String>,
}

fn yaml_scalar_to_string(val: &Value) -> Option<String> {
    match val {
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn yaml_scalar_to_u16(val: &Value) -> Option<u16> {
    match val {
        Value::Number(n) => n.as_u64().and_then(|v| u16::try_from(v).ok()),
        Value::String(s) => s.trim().parse::<u16>().ok(),
        _ => None,
    }
}

fn read_site_config_subset(site_root: &Path) -> SiteConfigSubset {
    let config_path = site_root.join("_config.yml");
    let Ok(raw) = fs::read_to_string(&config_path) else {
        return SiteConfigSubset::default();
    };
    let Ok(parsed) = serde_yaml::from_str::<Value>(&raw) else {
        return SiteConfigSubset::default();
    };
    let Some(map) = parsed.as_mapping() else {
        return SiteConfigSubset::default();
    };

    let get_str = |key: &str| {
        map.get(Value::String(key.into()))
            .and_then(yaml_scalar_to_string)
    };

    let mut server_port = None;
    let mut server_ip = None;
    if let Some(server_map) = map
        .get(Value::String("server".into()))
        .and_then(Value::as_mapping)
    {
        server_port = server_map
            .get(Value::String("port".into()))
            .and_then(yaml_scalar_to_u16)
            .filter(|&p| p > 0);
        server_ip = server_map
            .get(Value::String("ip".into()))
            .and_then(yaml_scalar_to_string);
    }

    SiteConfigSubset {
        public_dir: get_str("public_dir"),
        source_dir: get_str("source_dir"),
        theme: get_str("theme"),
        url: get_str("url"),
        root: get_str("root"),
        server_port,
        server_ip,
    }
}

/// Validates that a relative directory name from `_config.yml` does not escape `site_root`.
fn resolve_contained_subpath(site_root: &Path, relative_dir: &str) -> AppResult<PathBuf> {
    let trimmed = relative_dir.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidPath("Subdirectory path is empty".into()));
    }
    let rel = Path::new(trimmed);
    if rel.is_absolute()
        || rel
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_)))
    {
        return Err(AppError::InvalidPath(format!(
            "Path escapes site root: {}",
            relative_dir
        )));
    }
    let canon_root = normalize_path(site_root);
    let candidate = normalize_path(&canon_root.join(rel));
    if !candidate.starts_with(&canon_root) {
        return Err(AppError::InvalidPath(format!(
            "Resolved path escapes site root: {}",
            relative_dir
        )));
    }
    Ok(candidate)
}

/// Sanitizes CSS text so it cannot break out of a `<style>` element or execute legacy CSS scripts.
pub fn sanitize_css_content(raw: &str) -> String {
    let cleaned = raw
        .strip_prefix('\u{feff}')
        .unwrap_or(raw)
        .replace('\0', "");

    // Prevent breaking out of <style>...</style> tags when injected into DOM
    let re_close_style = Regex::new(r"(?i)</\s*style").expect("valid regex");
    let cleaned = re_close_style.replace_all(&cleaned, "/* blocked-style-close */");

    // Strip dangerous protocol URLs (javascript:, vbscript:, data:text/html)
    let re_danger_url =
        Regex::new(r"(?i)url\s*\(\s*['\x22]?\s*(?:javascript|vbscript|data\s*:\s*text/html)\s*:[^)]*\)")
            .expect("valid regex");
    let cleaned = re_danger_url.replace_all(&cleaned, "none");

    // Strip legacy IE expression() and behavior / -moz-binding properties
    let re_expression = Regex::new(r"(?i)expression\s*\([^)]*\)").expect("valid regex");
    let cleaned = re_expression.replace_all(&cleaned, "none");

    let re_legacy_binding =
        Regex::new(r"(?i)(?:^|[;\s])(?:behavior|-moz-binding)\s*:[^;{}]+;?").expect("valid regex");
    let cleaned = re_legacy_binding.replace_all(&cleaned, " ");

    cleaned.into_owned()
}

pub fn load_site_theme_css(root_path: &str) -> AppResult<ThemeCssResult> {
    let root = PathBuf::from(root_path);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!(
            "Site directory does not exist: {}",
            root_path
        )));
    }

    let cfg = read_site_config_subset(&root);
    let public_dir_name = cfg.public_dir.as_deref().unwrap_or("public");
    let public_dir = resolve_contained_subpath(&root, public_dir_name)?;
    let css_dir = public_dir.join("css");

    if !css_dir.is_dir() {
        return Err(AppError::NotFound(format!(
            "Theme CSS directory not found: {} (run `hexo generate` first)",
            css_dir.display()
        )));
    }

    let canon_root = fs::canonicalize(&root)?;
    let canon_css_dir = fs::canonicalize(&css_dir)?;
    if !canon_css_dir.starts_with(&canon_root) {
        return Err(AppError::InvalidPath(format!(
            "CSS directory escapes site root: {}",
            css_dir.display()
        )));
    }

    let mut css_entries: Vec<(usize, PathBuf)> = Vec::new();
    for entry in WalkDir::new(&canon_css_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_css = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("css"))
            .unwrap_or(false);
        if !is_css {
            continue;
        }
        if let Ok(canon_file) = fs::canonicalize(path) {
            if canon_file.starts_with(&canon_css_dir) {
                css_entries.push((entry.depth(), canon_file));
            }
        }
    }

    // Deterministic order: shallower files first, then lexical path
    css_entries.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    let mut files = Vec::new();
    let mut combined = String::new();
    let mut total_bytes: usize = 0;

    for (_, file_path) in css_entries {
        let Ok(meta) = fs::metadata(&file_path) else {
            continue;
        };
        let file_len = usize::try_from(meta.len()).unwrap_or(usize::MAX);
        if total_bytes.saturating_add(file_len) > MAX_TOTAL_CSS_BYTES {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&file_path) else {
            continue;
        };
        let sanitized = sanitize_css_content(&raw);
        total_bytes = total_bytes.saturating_add(raw.len());

        let rel_label = file_path
            .strip_prefix(&canon_css_dir)
            .unwrap_or(&file_path)
            .to_string_lossy()
            .replace('\\', "/");
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(&format!("/* source: {} */\n", rel_label));
        combined.push_str(&sanitized);
        if !combined.ends_with('\n') {
            combined.push('\n');
        }
        files.push(file_path.to_string_lossy().to_string());
    }

    Ok(ThemeCssResult {
        theme_name: cfg.theme,
        css_dir: canon_css_dir.to_string_lossy().to_string(),
        files,
        css_content: combined,
    })
}

pub fn read_custom_css_file(file_path: &str) -> AppResult<ThemeCssResult> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("CSS file path is empty".into()));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_file() {
        return Err(AppError::NotFound(format!(
            "CSS file does not exist: {}",
            trimmed
        )));
    }
    let is_css = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("css"))
        .unwrap_or(false);
    if !is_css {
        return Err(AppError::InvalidInput(format!(
            "Only .css files are supported: {}",
            trimmed
        )));
    }

    let meta = fs::metadata(&path)?;
    if usize::try_from(meta.len()).unwrap_or(usize::MAX) > MAX_TOTAL_CSS_BYTES {
        return Err(AppError::InvalidInput(format!(
            "CSS file exceeds the {} MB limit",
            MAX_TOTAL_CSS_BYTES / (1024 * 1024)
        )));
    }

    let raw = fs::read_to_string(&path)?;
    let sanitized = sanitize_css_content(&raw);
    let canon = fs::canonicalize(&path).unwrap_or(path);
    let css_dir = canon
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(ThemeCssResult {
        theme_name: None,
        css_dir,
        files: vec![canon.to_string_lossy().to_string()],
        css_content: sanitized,
    })
}

/// Combines Hexo's `url` and `root` settings without duplicating the root suffix.
pub fn build_site_homepage_url(raw_url: &str, raw_root: Option<&str>) -> AppResult<String> {
    let trimmed_url = raw_url.trim();
    if trimmed_url.is_empty() {
        return Err(AppError::InvalidInput("Site URL is empty".into()));
    }

    let lower = trimmed_url.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err(AppError::InvalidInput(format!(
            "Site URL must start with http:// or https://: {}",
            trimmed_url
        )));
    }

    let root_raw = raw_root.map(str::trim).unwrap_or("/");
    let normalized_root = if root_raw.is_empty() || root_raw == "/" {
        "/".to_string()
    } else {
        let stripped = root_raw.trim_matches('/');
        format!("/{}/", stripped)
    };

    let scheme_end = trimmed_url.find("://").unwrap() + 3;
    let after_scheme = &trimmed_url[scheme_end..];
    let path_part = match after_scheme.find('/') {
        Some(idx) => &after_scheme[idx..],
        None => "",
    };

    if normalized_root == "/" {
        if path_part.is_empty() {
            return Ok(format!("{}/", trimmed_url));
        }
        return Ok(trimmed_url.to_string());
    }

    let root_no_trailing = normalized_root.trim_end_matches('/');
    let url_no_trailing = trimmed_url.trim_end_matches('/');

    // Hexo commonly sets both `url: https://example.com/blog` and `root: /blog/`
    if path_part.trim_end_matches('/').ends_with(root_no_trailing) {
        Ok(format!("{}/", url_no_trailing))
    } else {
        Ok(format!("{}{}", url_no_trailing, normalized_root))
    }
}

pub fn resolve_quick_open_target(
    target: &str,
    site_root: Option<&str>,
    doc_path: Option<&str>,
    post_asset_folder: bool,
    source_dir: Option<&str>,
) -> AppResult<QuickOpenResult> {
    let clean_site_root = site_root
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    let clean_doc_path = doc_path
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);

    let effective_source_dir = |root: &Path| -> String {
        if let Some(sd) = source_dir.map(str::trim).filter(|s| !s.is_empty()) {
            return sd.to_string();
        }
        read_site_config_subset(root)
            .source_dir
            .unwrap_or_else(|| "source".to_string())
    };

    match target.trim() {
        "post_dir" | "postDir" => {
            let doc = clean_doc_path.ok_or_else(|| {
                AppError::InvalidInput("Current document path is required for post_dir".into())
            })?;
            let parent = doc.parent().ok_or_else(|| {
                AppError::InvalidPath("Document has no parent directory".into())
            })?;
            let resolved = normalize_path(parent);
            let exists = resolved.exists();
            Ok(QuickOpenResult {
                target: "post_dir".to_string(),
                kind: "path".to_string(),
                value: resolved.to_string_lossy().to_string(),
                exists,
            })
        }
        "post_asset_dir" | "postAssetDir" => {
            let doc = clean_doc_path.ok_or_else(|| {
                AppError::InvalidInput(
                    "Current document path is required for post_asset_dir".into(),
                )
            })?;
            let doc_parent = doc.parent().ok_or_else(|| {
                AppError::InvalidPath("Document has no parent directory".into())
            })?;
            let doc_stem = doc
                .file_stem()
                .and_then(|s| s.to_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("assets");

            let dir = if let Some(root) = clean_site_root.as_deref() {
                if post_asset_folder {
                    normalize_path(&doc_parent.join(doc_stem))
                } else {
                    let src_name = effective_source_dir(root);
                    let src_path = resolve_contained_subpath(root, &src_name)?;
                    normalize_path(&src_path.join("images").join(doc_stem))
                }
            } else {
                normalize_path(&doc_parent.join("assets"))
            };
            let exists = dir.exists();
            Ok(QuickOpenResult {
                target: "post_asset_dir".to_string(),
                kind: "path".to_string(),
                value: dir.to_string_lossy().to_string(),
                exists,
            })
        }
        "images_dir" | "imagesDir" => {
            let root = clean_site_root.ok_or_else(|| {
                AppError::InvalidInput("Site root path is required for images_dir".into())
            })?;
            let src_name = effective_source_dir(&root);
            let src_path = resolve_contained_subpath(&root, &src_name)?;
            let dir = normalize_path(&src_path.join("images"));
            let exists = dir.exists();
            Ok(QuickOpenResult {
                target: "images_dir".to_string(),
                kind: "path".to_string(),
                value: dir.to_string_lossy().to_string(),
                exists,
            })
        }
        "site_root" | "siteRoot" => {
            let root = clean_site_root.ok_or_else(|| {
                AppError::InvalidInput("Site root path is required for site_root".into())
            })?;
            let resolved = normalize_path(&root);
            let exists = resolved.is_dir();
            Ok(QuickOpenResult {
                target: "site_root".to_string(),
                kind: "path".to_string(),
                value: resolved.to_string_lossy().to_string(),
                exists,
            })
        }
        "site_url" | "siteUrl" | "blog_url" | "blogUrl" | "blog_home" | "blogHome" | "homepage" => {
            let root = clean_site_root.ok_or_else(|| {
                AppError::InvalidInput("Site root path is required for site_url".into())
            })?;
            let cfg = read_site_config_subset(&root);
            let raw_url = cfg.url.ok_or_else(|| {
                AppError::NotFound("Site `url` is not configured in _config.yml".into())
            })?;
            let full_url = build_site_homepage_url(&raw_url, cfg.root.as_deref())?;
            Ok(QuickOpenResult {
                target: "site_url".to_string(),
                kind: "url".to_string(),
                value: full_url,
                exists: true,
            })
        }
        "local_url" | "localUrl" | "preview_url" | "previewUrl" | "local_preview"
        | "localPreview" => {
            let root = clean_site_root.ok_or_else(|| {
                AppError::InvalidInput("Site root path is required for local_url".into())
            })?;
            let cfg = read_site_config_subset(&root);
            let ip = cfg.server_ip.as_deref().unwrap_or("localhost");
            let host = if ip == "0.0.0.0" || ip == "::" {
                "localhost"
            } else {
                ip
            };
            let port = cfg.server_port.unwrap_or(4000);
            let base = format!("http://{}:{}", host, port);
            let full_url = build_site_homepage_url(&base, cfg.root.as_deref())?;
            Ok(QuickOpenResult {
                target: "local_url".to_string(),
                kind: "url".to_string(),
                value: full_url,
                exists: true,
            })
        }
        other => Err(AppError::InvalidInput(format!(
            "Unsupported quick open target: {}",
            other
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_file(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    #[test]
    fn test_load_site_theme_css_reads_and_sanitizes() {
        let dir = TempDir::new().unwrap();
        write_file(
            &dir.path().join("_config.yml"),
            "title: Demo\ntheme: next\npublic_dir: public\n",
        );
        write_file(
            &dir.path().join("public/css/main.css"),
            "body { color: #222; }\n/* </style><script>alert(1)</script> */\n",
        );
        write_file(
            &dir.path().join("public/css/sub/code.css"),
            "pre { background: url(javascript:alert(1)); width: expression(1+1); }\n",
        );
        // Non-CSS file must be ignored
        write_file(&dir.path().join("public/css/main.css.map"), "{\"version\":3}");

        let res = load_site_theme_css(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(res.theme_name.as_deref(), Some("next"));
        assert_eq!(res.files.len(), 2);
        assert!(res.files[0].ends_with("main.css"));
        assert!(res.files[1].ends_with("code.css"));
        assert!(res.css_content.contains("body { color: #222; }"));
        assert!(!res.css_content.to_ascii_lowercase().contains("</style"));
        assert!(!res.css_content.to_ascii_lowercase().contains("javascript:"));
        assert!(!res.css_content.to_ascii_lowercase().contains("expression("));
    }

    #[test]
    fn test_load_site_theme_css_blocks_path_traversal() {
        let dir = TempDir::new().unwrap();
        write_file(
            &dir.path().join("_config.yml"),
            "title: Evil\npublic_dir: ../../etc\n",
        );
        let err = load_site_theme_css(dir.path().to_str().unwrap()).unwrap_err();
        assert!(err.to_string().contains("escapes site root"));
    }

    #[test]
    fn test_load_site_theme_css_enforces_size_cap() {
        let dir = TempDir::new().unwrap();
        write_file(&dir.path().join("_config.yml"), "theme: fluid\n");
        write_file(&dir.path().join("public/css/a-small.css"), "h1 { color: red; }\n");
        let huge = "a".repeat(MAX_TOTAL_CSS_BYTES + 1024);
        write_file(&dir.path().join("public/css/b-huge.css"), &huge);

        let res = load_site_theme_css(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(res.files.len(), 1);
        assert!(res.files[0].ends_with("a-small.css"));
        assert!(res.css_content.contains("h1 { color: red; }"));
    }

    #[test]
    fn test_read_custom_css_file_validation_and_reading() {
        let dir = TempDir::new().unwrap();
        let css_path = dir.path().join("custom.css");
        write_file(&css_path, "p { line-height: 1.8; }");

        let res = read_custom_css_file(css_path.to_str().unwrap()).unwrap();
        assert_eq!(res.files.len(), 1);
        assert_eq!(res.css_content, "p { line-height: 1.8; }");

        let txt_path = dir.path().join("not-css.txt");
        write_file(&txt_path, "hello");
        assert!(read_custom_css_file(txt_path.to_str().unwrap()).is_err());

        let huge_path = dir.path().join("huge.css");
        write_file(&huge_path, &"x".repeat(MAX_TOTAL_CSS_BYTES + 10));
        assert!(read_custom_css_file(huge_path.to_str().unwrap()).is_err());
    }

    #[test]
    fn test_build_site_homepage_url_combinations() {
        assert_eq!(
            build_site_homepage_url("https://example.com", Some("/")).unwrap(),
            "https://example.com/"
        );
        assert_eq!(
            build_site_homepage_url("https://example.com/", Some("/")).unwrap(),
            "https://example.com/"
        );
        assert_eq!(
            build_site_homepage_url("https://example.com", Some("/blog/")).unwrap(),
            "https://example.com/blog/"
        );
        assert_eq!(
            build_site_homepage_url("https://example.com/blog", Some("/blog/")).unwrap(),
            "https://example.com/blog/"
        );
        assert_eq!(
            build_site_homepage_url("https://example.com/blog/", Some("/blog/")).unwrap(),
            "https://example.com/blog/"
        );
        assert!(build_site_homepage_url("javascript:alert(1)", Some("/")).is_err());
    }

    #[test]
    fn test_resolve_quick_open_targets() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        write_file(
            &root.join("_config.yml"),
            "title: My Blog\nurl: https://blog.example.com\nroot: /notes/\nsource_dir: src_content\nserver:\n  port: 4321\n  ip: 127.0.0.1\n",
        );
        let post = root.join("src_content/_posts/hello-world.md");
        write_file(&post, "---\ntitle: Hello\n---\nBody");
        fs::create_dir_all(root.join("src_content/_posts/hello-world")).unwrap();
        fs::create_dir_all(root.join("src_content/images")).unwrap();

        let root_str = root.to_str().unwrap();
        let post_str = post.to_str().unwrap();
        let canon_root = fs::canonicalize(root).unwrap();

        let r_post_dir =
            resolve_quick_open_target("post_dir", Some(root_str), Some(post_str), true, None)
                .unwrap();
        assert_eq!(r_post_dir.kind, "path");
        assert!(r_post_dir.exists);
        assert_eq!(
            PathBuf::from(&r_post_dir.value),
            canon_root.join("src_content/_posts")
        );

        let r_asset_folder = resolve_quick_open_target(
            "post_asset_dir",
            Some(root_str),
            Some(post_str),
            true,
            None,
        )
        .unwrap();
        assert!(r_asset_folder.exists);
        assert_eq!(
            PathBuf::from(&r_asset_folder.value),
            canon_root.join("src_content/_posts/hello-world")
        );

        let r_asset_images = resolve_quick_open_target(
            "post_asset_dir",
            Some(root_str),
            Some(post_str),
            false,
            None,
        )
        .unwrap();
        assert!(!r_asset_images.exists);
        assert_eq!(
            PathBuf::from(&r_asset_images.value),
            canon_root.join("src_content/images/hello-world")
        );

        let r_images =
            resolve_quick_open_target("images_dir", Some(root_str), Some(post_str), false, None)
                .unwrap();
        assert!(r_images.exists);
        assert_eq!(
            PathBuf::from(&r_images.value),
            canon_root.join("src_content/images")
        );

        let r_site_root =
            resolve_quick_open_target("site_root", Some(root_str), None, false, None).unwrap();
        assert!(r_site_root.exists);
        assert_eq!(PathBuf::from(&r_site_root.value), canon_root);

        let r_url =
            resolve_quick_open_target("site_url", Some(root_str), None, false, None).unwrap();
        assert_eq!(r_url.kind, "url");
        assert_eq!(r_url.value, "https://blog.example.com/notes/");

        let r_local =
            resolve_quick_open_target("local_url", Some(root_str), None, false, None).unwrap();
        assert_eq!(r_local.kind, "url");
        assert_eq!(r_local.value, "http://127.0.0.1:4321/notes/");

        // Standalone file (no site_root) -> <doc_parent>/assets
        let standalone = root.join("standalone-note.md");
        write_file(&standalone, "# Note");
        let r_standalone = resolve_quick_open_target(
            "post_asset_dir",
            None,
            Some(standalone.to_str().unwrap()),
            false,
            None,
        )
        .unwrap();
        assert_eq!(PathBuf::from(&r_standalone.value), canon_root.join("assets"));

        // Source dir path traversal guard
        let err = resolve_quick_open_target(
            "images_dir",
            Some(root_str),
            None,
            false,
            Some("../../etc"),
        )
        .unwrap_err();
        assert!(err.to_string().contains("escapes site root"));
    }

    #[test]
    fn test_load_site_theme_css_missing_public_css_returns_not_found() {
        let dir = TempDir::new().unwrap();
        write_file(&dir.path().join("_config.yml"), "title: Empty\n");
        let err = load_site_theme_css(dir.path().to_str().unwrap()).unwrap_err();
        assert!(err.to_string().contains("Theme CSS directory not found"));
    }
}
