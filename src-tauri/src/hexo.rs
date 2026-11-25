use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use chrono::Local;
use regex::Regex;
use serde_yaml::Value;
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::models::{
    DocumentContent, HexoSiteConfig, PostSummary, RenamePostResult, SiteScanResult, TaxonomyCount,
};
use crate::watcher::normalize_path;

pub fn sanitize_filename_stem(raw: &str) -> String {
    let trimmed = raw.trim();
    let invalid = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\n', '\r', '\t'];
    let cleaned: String = trimmed
        .chars()
        .map(|c| if invalid.contains(&c) { '-' } else { c })
        .collect();
    let collapsed = cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
        .trim_matches(|c| c == '.' || c == '-')
        .to_string();
    collapsed
}

fn file_modified_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn yaml_value_to_string(val: &Value) -> Option<String> {
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
        Value::Sequence(seq) => seq.first().and_then(yaml_value_to_string),
        _ => None,
    }
}

fn yaml_value_to_string_list(val: &Value) -> Vec<String> {
    let mut out = Vec::new();
    match val {
        Value::String(s) => {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                out.push(trimmed.to_string());
            }
        }
        Value::Number(n) => out.push(n.to_string()),
        Value::Sequence(seq) => {
            for item in seq {
                out.extend(yaml_value_to_string_list(item));
            }
        }
        _ => {}
    }
    out
}

pub fn percent_encode_path_segment(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        let is_unreserved = byte.is_ascii_alphanumeric()
            || matches!(byte, b'-' | b'_' | b'.' | b'~');
        if is_unreserved {
            out.push(*byte as char);
        } else {
            out.push_str(&format!("%{:02X}", byte));
        }
    }
    out
}

fn quote_yaml_scalar(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return "\"\"".to_string();
    }
    let lower = trimmed.to_ascii_lowercase();
    let is_reserved = matches!(lower.as_str(), "true" | "false" | "null" | "~" | "yes" | "no");
    let starts_special = trimmed.starts_with(|c: char| {
        matches!(
            c,
            '-' | '?' | ':' | ',' | '[' | ']' | '{' | '}' | '#' | '&' | '*' | '!' | '|' | '>' | '\'' | '"' | '%' | '@' | '`'
        )
    });
    let contains_special = trimmed.contains(':')
        || trimmed.contains('#')
        || trimmed.contains('"')
        || trimmed.contains('\n')
        || trimmed.contains('\r')
        || trimmed.contains('\t');
    let looks_numeric = trimmed.parse::<f64>().is_ok();

    if is_reserved || starts_special || contains_special || looks_numeric || trimmed != value {
        let escaped = value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r");
        format!("\"{}\"", escaped)
    } else {
        value.to_string()
    }
}

pub fn split_front_matter(content: &str) -> (Option<String>, String) {
    let normalized = content.strip_prefix('\u{feff}').unwrap_or(content);
    let normalized = normalized.replace("\r\n", "\n");

    let Some(rest) = normalized.strip_prefix("---\n") else {
        return (None, normalized);
    };

    // Handle empty front-matter: ---\n---\n or ---\n---
    if let Some(after_empty) = rest.strip_prefix("---\n") {
        return (Some(String::new()), after_empty.to_string());
    }
    if rest.trim_end_matches([' ', '\t']) == "---" {
        return (Some(String::new()), String::new());
    }

    let mut offset = 0usize;
    for line in rest.split_inclusive('\n') {
        let trimmed = line.trim_end_matches('\n').trim_end_matches([' ', '\t']);
        if trimmed == "---" {
            let fm = rest[..offset].trim_end_matches('\n').to_string();
            let body = rest[offset + line.len()..].to_string();
            return (Some(fm), body);
        }
        offset += line.len();
    }

    (None, normalized)
}

fn extract_excerpt(body: &str) -> String {
    let mut text = String::new();
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with('#')
            || trimmed.starts_with("```")
            || trimmed.starts_with("![")
            || trimmed.starts_with("---")
            || trimmed.starts_with("<!--")
        {
            continue;
        }
        if !text.is_empty() {
            text.push(' ');
        }
        text.push_str(trimmed);
        if text.chars().count() >= 140 {
            break;
        }
    }
    let truncated: String = text.chars().take(140).collect();
    if text.chars().count() > 140 {
        format!("{}...", truncated.trim_end())
    } else {
        truncated
    }
}

pub fn inspect_hexo_site(root_path: &str) -> AppResult<HexoSiteConfig> {
    let root = PathBuf::from(root_path);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!(
            "Site directory does not exist: {}",
            root_path
        )));
    }

    let config_path = root.join("_config.yml");
    let mut title = root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Hexo Site")
        .to_string();
    let mut subtitle = None;
    let mut author = None;
    let mut language = None;
    let mut url = None;
    let mut source_dir = "source".to_string();
    let mut post_asset_folder = false;
    let mut default_layout = "post".to_string();

    if config_path.is_file() {
        let raw = fs::read_to_string(&config_path)?;
        let parsed: Value = serde_yaml::from_str(&raw)?;
        if let Some(map) = parsed.as_mapping() {
            if let Some(v) = map.get(Value::String("title".into())).and_then(yaml_value_to_string) {
                title = v;
            }
            subtitle = map
                .get(Value::String("subtitle".into()))
                .and_then(yaml_value_to_string);
            author = map
                .get(Value::String("author".into()))
                .and_then(yaml_value_to_string);
            language = map
                .get(Value::String("language".into()))
                .and_then(yaml_value_to_string);
            url = map
                .get(Value::String("url".into()))
                .and_then(yaml_value_to_string);
            if let Some(v) = map
                .get(Value::String("source_dir".into()))
                .and_then(yaml_value_to_string)
            {
                source_dir = v;
            }
            if let Some(v) = map
                .get(Value::String("post_asset_folder".into()))
                .and_then(|v| v.as_bool())
            {
                post_asset_folder = v;
            }
            if let Some(v) = map
                .get(Value::String("default_layout".into()))
                .and_then(yaml_value_to_string)
            {
                default_layout = v;
            }
        }
    } else if !root.join("source").join("_posts").is_dir() {
        return Err(AppError::InvalidPath(format!(
            "Not a valid Hexo site (missing _config.yml and source/_posts): {}",
            root_path
        )));
    }

    let source_path = root.join(&source_dir);
    let has_posts_dir = source_path.join("_posts").is_dir();
    let has_drafts_dir = source_path.join("_drafts").is_dir();
    let has_scaffold_post = root.join("scaffolds").join("post.md").is_file();

    Ok(HexoSiteConfig {
        root_path: root.to_string_lossy().to_string(),
        title,
        subtitle,
        author,
        language,
        url,
        source_dir,
        post_asset_folder,
        default_layout,
        has_posts_dir,
        has_drafts_dir,
        has_scaffold_post,
    })
}

fn parse_post_file(
    site_root: &Path,
    file_path: &Path,
    is_draft: bool,
) -> AppResult<PostSummary> {
    let raw = fs::read_to_string(file_path)?;
    let (fm_raw, body) = split_front_matter(&raw);

    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();
    let slug = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string();
    let relative_path = file_path
        .strip_prefix(site_root)
        .unwrap_or(file_path)
        .to_string_lossy()
        .replace('\\', "/");

    let mut title = slug.clone();
    let mut date = None;
    let mut updated = None;
    let mut tags = Vec::new();
    let mut categories = Vec::new();

    if let Some(fm) = fm_raw {
        if let Ok(Value::Mapping(map)) = serde_yaml::from_str::<Value>(&fm) {
            if let Some(v) = map
                .get(Value::String("title".into()))
                .and_then(yaml_value_to_string)
            {
                title = v;
            }
            date = map
                .get(Value::String("date".into()))
                .and_then(yaml_value_to_string);
            updated = map
                .get(Value::String("updated".into()))
                .and_then(yaml_value_to_string);
            if let Some(v) = map.get(Value::String("tags".into())) {
                tags = yaml_value_to_string_list(v);
            }
            if let Some(v) = map.get(Value::String("categories".into())) {
                categories = yaml_value_to_string_list(v);
            }
        }
    }

    let has_asset_folder = file_path
        .parent()
        .map(|p| p.join(&slug).is_dir())
        .unwrap_or(false);

    Ok(PostSummary {
        file_path: file_path.to_string_lossy().to_string(),
        file_name,
        slug,
        relative_path,
        title,
        date,
        updated,
        tags,
        categories,
        is_draft,
        has_asset_folder,
        excerpt: extract_excerpt(&body),
        modified_ms: file_modified_ms(file_path),
    })
}

pub fn scan_hexo_site(root_path: &str) -> AppResult<SiteScanResult> {
    let config = inspect_hexo_site(root_path)?;
    let root = PathBuf::from(&config.root_path);
    let source_path = root.join(&config.source_dir);

    let mut posts = Vec::new();
    let mut tag_counts: HashMap<String, usize> = HashMap::new();
    let mut category_counts: HashMap<String, usize> = HashMap::new();

    let dirs = [
        (source_path.join("_posts"), false),
        (source_path.join("_drafts"), true),
    ];

    for (dir, is_draft) in dirs {
        if !dir.is_dir() {
            continue;
        }
        for entry in WalkDir::new(&dir).into_iter().filter_map(Result::ok) {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let is_md = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
                .unwrap_or(false);
            if !is_md {
                continue;
            }
            if let Ok(summary) = parse_post_file(&root, path, is_draft) {
                for t in &summary.tags {
                    *tag_counts.entry(t.clone()).or_insert(0) += 1;
                }
                for c in &summary.categories {
                    *category_counts.entry(c.clone()).or_insert(0) += 1;
                }
                posts.push(summary);
            }
        }
    }

    posts.sort_by(|a, b| {
        let cmp = b.date.cmp(&a.date);
        if cmp == std::cmp::Ordering::Equal {
            b.modified_ms.cmp(&a.modified_ms)
        } else {
            cmp
        }
    });

    let mut all_tags: Vec<TaxonomyCount> = tag_counts
        .into_iter()
        .map(|(name, count)| TaxonomyCount { name, count })
        .collect();
    all_tags.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));

    let mut all_categories: Vec<TaxonomyCount> = category_counts
        .into_iter()
        .map(|(name, count)| TaxonomyCount { name, count })
        .collect();
    all_categories.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));

    Ok(SiteScanResult {
        config,
        posts,
        all_tags,
        all_categories,
    })
}

pub fn read_document(file_path: &str) -> AppResult<DocumentContent> {
    let path = PathBuf::from(file_path);
    if !path.is_file() {
        return Err(AppError::NotFound(format!("File not found: {}", file_path)));
    }
    let content = fs::read_to_string(&path)?;
    Ok(DocumentContent {
        file_path: path.to_string_lossy().to_string(),
        content,
        modified_ms: file_modified_ms(&path),
    })
}

pub fn write_document(file_path: &str, content: &str) -> AppResult<u64> {
    let path = PathBuf::from(file_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::write(&path, content)?;
    Ok(file_modified_ms(&path))
}

fn inject_yaml_list_field(fm: &str, key: &str, values: &[String]) -> String {
    if values.is_empty() {
        return fm.to_string();
    }
    let list_block = values
        .iter()
        .map(|v| format!("  - {}", quote_yaml_scalar(v)))
        .collect::<Vec<_>>()
        .join("\n");

    let mut lines: Vec<String> = Vec::new();
    let mut replaced = false;
    let key_prefix = format!("{}:", key);

    for line in fm.lines() {
        let trimmed = line.trim();
        if !replaced
            && (trimmed == key_prefix
                || trimmed == format!("{} []", key_prefix)
                || trimmed == format!("{} null", key_prefix))
        {
            lines.push(key_prefix.clone());
            lines.push(list_block.clone());
            replaced = true;
        } else {
            lines.push(line.to_string());
        }
    }

    if !replaced {
        lines.push(key_prefix);
        lines.push(list_block);
    }

    lines.join("\n")
}

fn render_scaffold(
    root: &Path,
    title: &str,
    is_draft: bool,
    tags: &[String],
    categories: &[String],
) -> String {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let layout = if is_draft { "draft" } else { "post" };

    let scaffold_candidate = if is_draft {
        let draft_scaffold = root.join("scaffolds").join("draft.md");
        if draft_scaffold.is_file() {
            Some(draft_scaffold)
        } else {
            let post_scaffold = root.join("scaffolds").join("post.md");
            if post_scaffold.is_file() {
                Some(post_scaffold)
            } else {
                None
            }
        }
    } else {
        let post_scaffold = root.join("scaffolds").join("post.md");
        if post_scaffold.is_file() {
            Some(post_scaffold)
        } else {
            None
        }
    };

    let escaped_title = quote_yaml_scalar(title);

    let rendered = if let Some(scaffold_path) = scaffold_candidate {
        let raw = fs::read_to_string(scaffold_path)
            .unwrap_or_default()
            .replace("\r\n", "\n");
        let replaced = raw
            .replace("{{ title }}", &escaped_title)
            .replace("{{title}}", &escaped_title)
            .replace("{{ date }}", &now)
            .replace("{{date}}", &now)
            .replace("{{ layout }}", layout)
            .replace("{{layout}}", layout);

        let trimmed = replaced.trim_start();
        if trimmed.starts_with("---") {
            trimmed.to_string()
        } else {
            format!("---\n{}\n", trimmed)
        }
    } else {
        format!(
            "---\ntitle: {}\ndate: {}\ntags:\ncategories:\n---\n\n",
            escaped_title, now
        )
    };

    let mut final_doc = if let (Some(fm), body) = split_front_matter(&rendered) {
        let fm = inject_yaml_list_field(&fm, "tags", tags);
        let fm = inject_yaml_list_field(&fm, "categories", categories);
        format!("---\n{}\n---\n{}", fm, body)
    } else {
        rendered
    };

    if !final_doc.ends_with('\n') {
        final_doc.push('\n');
    }
    final_doc
}

pub fn create_hexo_post(
    root_path: &str,
    title: &str,
    is_draft: bool,
    tags: Vec<String>,
    categories: Vec<String>,
) -> AppResult<PostSummary> {
    let config = inspect_hexo_site(root_path)?;
    let root = PathBuf::from(&config.root_path);
    let target_dir = root
        .join(&config.source_dir)
        .join(if is_draft { "_drafts" } else { "_posts" });
    fs::create_dir_all(&target_dir)?;

    let base_stem = {
        let s = sanitize_filename_stem(title);
        if s.is_empty() {
            format!("untitled-{}", Local::now().format("%Y%m%d-%H%M%S"))
        } else {
            s
        }
    };

    let mut stem = base_stem.clone();
    let mut counter = 2usize;
    while target_dir.join(format!("{}.md", stem)).exists() {
        stem = format!("{}-{}", base_stem, counter);
        counter += 1;
    }

    let file_path = target_dir.join(format!("{}.md", stem));
    let content = render_scaffold(&root, title.trim(), is_draft, &tags, &categories);
    fs::write(&file_path, content)?;

    if config.post_asset_folder {
        let asset_dir = target_dir.join(&stem);
        let _ = fs::create_dir_all(asset_dir);
    }

    parse_post_file(&root, &file_path, is_draft)
}

pub fn toggle_post_draft(root_path: &str, file_path: &str) -> AppResult<PostSummary> {
    let config = inspect_hexo_site(root_path)?;
    let root = PathBuf::from(&config.root_path);
    let src = PathBuf::from(file_path);
    if !src.is_file() {
        return Err(AppError::NotFound(format!("Post not found: {}", file_path)));
    }

    let source_dir = root.join(&config.source_dir);
    let posts_dir = source_dir.join("_posts");
    let drafts_dir = source_dir.join("_drafts");

    let norm_src = normalize_path(&src);
    let norm_posts = normalize_path(&posts_dir);
    let norm_drafts = normalize_path(&drafts_dir);

    let is_currently_draft = if norm_src.starts_with(&norm_drafts) {
        true
    } else if norm_src.starts_with(&norm_posts) {
        false
    } else {
        return Err(AppError::InvalidPath(format!(
            "File is not inside _posts or _drafts: {}",
            file_path
        )));
    };

    let target_dir = if is_currently_draft {
        &posts_dir
    } else {
        &drafts_dir
    };
    fs::create_dir_all(target_dir)?;

    let file_name = src
        .file_name()
        .ok_or_else(|| AppError::InvalidPath("Invalid post filename".into()))?;
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::InvalidPath("Invalid post stem".into()))?
        .to_string();

    let dst = target_dir.join(file_name);
    if dst.exists() {
        return Err(AppError::AlreadyExists(format!(
            "Target post already exists: {}",
            dst.display()
        )));
    }

    fs::rename(&src, &dst)?;

    // Move sibling asset folder if present
    if let Some(src_parent) = src.parent() {
        let src_assets = src_parent.join(&stem);
        if src_assets.is_dir() {
            let dst_assets = target_dir.join(&stem);
            if !dst_assets.exists() {
                let _ = fs::rename(src_assets, dst_assets);
            }
        }
    }

    parse_post_file(&root, &dst, !is_currently_draft)
}

pub fn delete_post(file_path: &str, delete_asset_folder: bool) -> AppResult<()> {
    let path = PathBuf::from(file_path);
    if !path.is_file() {
        return Err(AppError::NotFound(format!("File not found: {}", file_path)));
    }
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(String::from);
    let parent = path.parent().map(Path::to_path_buf);

    fs::remove_file(&path)?;

    if delete_asset_folder {
        if let (Some(p), Some(s)) = (parent, stem) {
            let assets = p.join(s);
            if assets.is_dir() {
                let _ = fs::remove_dir_all(assets);
            }
        }
    }
    Ok(())
}

pub fn rewrite_asset_folder_refs(content: &str, old_stem: &str, new_stem: &str) -> String {
    if old_stem == new_stem || old_stem.is_empty() || new_stem.is_empty() {
        return content.to_string();
    }

    let encoded_old = percent_encode_path_segment(old_stem);
    let stem_alternation = if encoded_old != old_stem {
        format!(
            "(?:{}|{})",
            regex::escape(old_stem),
            regex::escape(&encoded_old)
        )
    } else {
        regex::escape(old_stem)
    };

    // Match markdown image links ![alt](prefix + old_stem/file) and HTML <img ... src="prefix + old_stem/file">
    let md_pattern = format!(
        r#"(!\[[^\]]*\]\(\s*(?:<)?)(\./|/|(?:\.\./)*images/|/images/)?{}(/[^)\n>]+)"#,
        stem_alternation
    );
    let html_pattern = format!(
        r#"(<img\b[^>]*\bsrc=["'])(\./|/|(?:\.\./)*images/|/images/)?{}(/[^"']+)"#,
        stem_alternation
    );

    let mut result = content.to_string();
    if let Ok(re) = Regex::new(&md_pattern) {
        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let prefix_open = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let path_prefix = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                let rest = caps.get(3).map(|m| m.as_str()).unwrap_or("");
                format!("{}{}{}{}", prefix_open, path_prefix, new_stem, rest)
            })
            .into_owned();
    }
    if let Ok(re) = Regex::new(&html_pattern) {
        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                let prefix_open = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let path_prefix = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                let rest = caps.get(3).map(|m| m.as_str()).unwrap_or("");
                format!("{}{}{}{}", prefix_open, path_prefix, new_stem, rest)
            })
            .into_owned();
    }

    result
}

pub fn rename_post_with_assets(
    site_root: Option<&str>,
    old_file_path: &str,
    new_title_or_slug: &str,
    current_content: &str,
) -> AppResult<RenamePostResult> {
    let old_path = PathBuf::from(old_file_path);
    if !old_path.is_file() {
        return Err(AppError::NotFound(format!(
            "Source file not found: {}",
            old_file_path
        )));
    }

    let parent = old_path
        .parent()
        .ok_or_else(|| AppError::InvalidPath("File has no parent directory".into()))?;
    let old_stem = old_path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::InvalidPath("Invalid file stem".into()))?
        .to_string();
    let ext = old_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("md");

    let new_slug = sanitize_filename_stem(new_title_or_slug);
    if new_slug.is_empty() {
        return Err(AppError::InvalidInput(
            "New filename cannot be empty".into(),
        ));
    }

    let new_path = parent.join(format!("{}.{}", new_slug, ext));
    if old_stem == new_slug {
        fs::write(&old_path, current_content)?;
        return Ok(RenamePostResult {
            old_file_path: old_path.to_string_lossy().to_string(),
            new_file_path: old_path.to_string_lossy().to_string(),
            new_slug,
            renamed_asset_dirs: Vec::new(),
            updated_content: current_content.to_string(),
        });
    }

    let same_case_insensitive = old_stem.eq_ignore_ascii_case(&new_slug);
    if !same_case_insensitive && new_path.exists() {
        return Err(AppError::AlreadyExists(format!(
            "Target file already exists: {}",
            new_path.display()
        )));
    }

    let mut renamed_pairs: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut renamed_asset_dirs = Vec::new();

    // 1. Rename sibling post_asset_folder directory if present
    let old_sibling_assets = parent.join(&old_stem);
    let new_sibling_assets = parent.join(&new_slug);
    if old_sibling_assets.is_dir() && (same_case_insensitive || !new_sibling_assets.exists()) {
        fs::rename(&old_sibling_assets, &new_sibling_assets)?;
        renamed_pairs.push((old_sibling_assets, new_sibling_assets.clone()));
        renamed_asset_dirs.push(new_sibling_assets.to_string_lossy().to_string());
    }

    // 2. Rename <source_dir>/images/<old_stem> directory if present
    if let Some(root_str) = site_root {
        let source_dir = inspect_hexo_site(root_str)
            .map(|c| c.source_dir)
            .unwrap_or_else(|_| "source".to_string());
        let images_base = PathBuf::from(root_str).join(source_dir).join("images");
        let old_images_dir = images_base.join(&old_stem);
        let new_images_dir = images_base.join(&new_slug);
        if old_images_dir.is_dir() && (same_case_insensitive || !new_images_dir.exists()) {
            if let Err(err) = fs::rename(&old_images_dir, &new_images_dir) {
                for (old_d, new_d) in renamed_pairs.iter().rev() {
                    let _ = fs::rename(new_d, old_d);
                }
                return Err(err.into());
            }
            renamed_pairs.push((old_images_dir, new_images_dir.clone()));
            renamed_asset_dirs.push(new_images_dir.to_string_lossy().to_string());
        }
    }

    // 3. Rewrite markdown image references and rename file (roll back dirs on failure)
    let updated_content = rewrite_asset_folder_refs(current_content, &old_stem, &new_slug);
    if let Err(err) = fs::rename(&old_path, &new_path) {
        for (old_d, new_d) in renamed_pairs.iter().rev() {
            let _ = fs::rename(new_d, old_d);
        }
        return Err(err.into());
    }
    if let Err(err) = fs::write(&new_path, &updated_content) {
        let _ = fs::rename(&new_path, &old_path);
        for (old_d, new_d) in renamed_pairs.iter().rev() {
            let _ = fs::rename(new_d, old_d);
        }
        return Err(err.into());
    }

    Ok(RenamePostResult {
        old_file_path: old_path.to_string_lossy().to_string(),
        new_file_path: new_path.to_string_lossy().to_string(),
        new_slug,
        renamed_asset_dirs,
        updated_content,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_mock_site() -> TempDir {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::write(
            root.join("_config.yml"),
            "title: My Hexo Blog\nsubtitle: Notes\nauthor: Zac\nsource_dir: source\npost_asset_folder: true\n",
        )
        .unwrap();
        fs::create_dir_all(root.join("source/_posts")).unwrap();
        fs::create_dir_all(root.join("source/_drafts")).unwrap();
        fs::create_dir_all(root.join("scaffolds")).unwrap();
        fs::write(
            root.join("scaffolds/post.md"),
            "---\ntitle: {{ title }}\ndate: {{ date }}\ntags:\ncategories:\n---\n",
        )
        .unwrap();
        dir
    }

    #[test]
    fn test_inspect_and_scan_hexo_site() {
        let site = create_mock_site();
        let root = site.path();
        fs::write(
            root.join("source/_posts/hello-world.md"),
            "---\ntitle: Hello Hexo\ndate: 2026-01-02 10:00:00\ntags:\n  - Rust\n  - Tauri\ncategories:\n  - Tech\n---\n\nBody paragraph here.\n",
        )
        .unwrap();
        fs::write(
            root.join("source/_drafts/wip-idea.md"),
            "---\ntitle: Draft Idea\ntags: [Rust]\ncategories: Notes\n---\n\nDraft text.\n",
        )
        .unwrap();

        let scan = scan_hexo_site(root.to_str().unwrap()).unwrap();
        assert_eq!(scan.config.title, "My Hexo Blog");
        assert!(scan.config.post_asset_folder);
        assert_eq!(scan.posts.len(), 2);
        assert_eq!(scan.all_tags[0].name, "Rust");
        assert_eq!(scan.all_tags[0].count, 2);
        assert_eq!(scan.all_categories.len(), 2);
    }

    #[test]
    fn test_create_post_and_toggle_draft() {
        let site = create_mock_site();
        let root_str = site.path().to_str().unwrap();

        let created = create_hexo_post(
            root_str,
            "My New Guide",
            true,
            vec!["Hexo".into()],
            vec!["Guide".into()],
        )
        .unwrap();
        assert!(created.is_draft);
        assert!(Path::new(&created.file_path).exists());
        assert!(created.has_asset_folder);

        let published = toggle_post_draft(root_str, &created.file_path).unwrap();
        assert!(!published.is_draft);
        assert!(Path::new(&published.file_path).exists());
        assert!(!Path::new(&created.file_path).exists());
        assert!(published.has_asset_folder);
    }

    #[test]
    fn test_rename_post_with_assets_updates_dirs_and_refs() {
        let site = create_mock_site();
        let root = site.path();
        let post_path = root.join("source/_posts/old-post.md");
        let asset_dir = root.join("source/_posts/old-post");
        let images_dir = root.join("source/images/old-post");
        fs::create_dir_all(&asset_dir).unwrap();
        fs::create_dir_all(&images_dir).unwrap();
        fs::write(asset_dir.join("pic.png"), b"png").unwrap();
        fs::write(images_dir.join("banner.jpg"), b"jpg").unwrap();

        let content = "---\ntitle: New Post Name\n---\n\n![a](old-post/pic.png)\n![b](./old-post/pic.png)\n![c](/images/old-post/banner.jpg)\n<img src=\"old-post/pic.png\" />\n";
        fs::write(&post_path, content).unwrap();

        let renamed = rename_post_with_assets(
            Some(root.to_str().unwrap()),
            post_path.to_str().unwrap(),
            "New Post Name",
            content,
        )
        .unwrap();

        assert_eq!(renamed.new_slug, "New-Post-Name");
        assert!(Path::new(&renamed.new_file_path).is_file());
        assert!(!post_path.exists());
        assert!(root.join("source/_posts/New-Post-Name/pic.png").is_file());
        assert!(root.join("source/images/New-Post-Name/banner.jpg").is_file());
        assert!(renamed.updated_content.contains("![a](New-Post-Name/pic.png)"));
        assert!(renamed.updated_content.contains("![b](./New-Post-Name/pic.png)"));
        assert!(renamed.updated_content.contains("![c](/images/New-Post-Name/banner.jpg)"));
        assert!(renamed.updated_content.contains("<img src=\"New-Post-Name/pic.png\" />"));
    }

    #[test]
    fn test_sanitize_filename_stem() {
        assert_eq!(sanitize_filename_stem("  Hello: World / Test?  "), "Hello--World---Test");
        assert_eq!(sanitize_filename_stem("我的 Hexo 笔记"), "我的-Hexo-笔记");
    }

    #[test]
    fn test_inspect_invalid_site_returns_error() {
        let dir = TempDir::new().unwrap();
        let err = inspect_hexo_site(dir.path().to_str().unwrap());
        assert!(err.is_err());
    }

    #[test]
    fn test_create_duplicate_post_auto_suffixes_and_rename_collision_errors() {
        let site = create_mock_site();
        let root_str = site.path().to_str().unwrap();

        let p1 = create_hexo_post(root_str, "Same Title", false, vec![], vec![]).unwrap();
        let p2 = create_hexo_post(root_str, "Same Title", false, vec![], vec![]).unwrap();
        assert_eq!(p1.slug, "Same-Title");
        assert_eq!(p2.slug, "Same-Title-2");

        // Renaming p2 onto existing p1 should return AlreadyExists error
        let collision = rename_post_with_assets(
            Some(root_str),
            &p2.file_path,
            "Same Title",
            "---\ntitle: Same Title\n---\n",
        );
        assert!(matches!(collision, Err(AppError::AlreadyExists(_))));
    }

    #[test]
    fn test_scaffold_with_body_hr_and_special_yaml_chars() {
        let site = create_mock_site();
        let root = site.path();
        fs::write(
            root.join("scaffolds/post.md"),
            "---\r\ntitle: {{ title }}\r\ndate: {{ date }}\r\ntags: []\r\n---\r\n\r\nIntro\r\n\r\n---\r\n\r\nSection 2\r\n",
        )
        .unwrap();

        let created = create_hexo_post(
            root.to_str().unwrap(),
            "Rust: 2026 #Guide",
            false,
            vec!["C++: 20".into(), "true".into()],
            vec!["Tech: Systems".into()],
        )
        .unwrap();

        assert_eq!(created.title, "Rust: 2026 #Guide");
        assert_eq!(created.tags, vec!["C++: 20", "true"]);
        assert_eq!(created.categories, vec!["Tech: Systems"]);

        let raw = fs::read_to_string(&created.file_path).unwrap();
        let (fm, body) = split_front_matter(&raw);
        assert!(fm.is_some());
        assert!(body.contains("Intro"));
        assert!(body.contains("\n---\n"));
        assert!(body.contains("Section 2"));
        assert!(!body.contains("tags:"));
        assert!(!body.contains("categories:"));
    }

    #[test]
    fn test_rewrite_asset_folder_refs_percent_encoded_cjk() {
        let encoded_stem = percent_encode_path_segment("我的文章");
        let md = format!(
            "![raw](我的文章/a.png)\n![enc]({}/b.png)\n<img src=\"/images/{}/c.jpg\" />\n",
            encoded_stem, encoded_stem
        );
        let rewritten = rewrite_asset_folder_refs(&md, "我的文章", "新标题");
        assert!(rewritten.contains("![raw](新标题/a.png)"));
        assert!(rewritten.contains("![enc](新标题/b.png)"));
        assert!(rewritten.contains("<img src=\"/images/新标题/c.jpg\" />"));
    }

    #[test]
    fn test_split_front_matter_empty_block_and_toggle_draft_guard() {
        let (fm, body) = split_front_matter("---\n---\nHello body\n");
        assert_eq!(fm.as_deref(), Some(""));
        assert_eq!(body, "Hello body\n");

        let site = create_mock_site();
        let outside = site.path().join("source/about.md");
        fs::write(&outside, "# About").unwrap();
        let err = toggle_post_draft(site.path().to_str().unwrap(), outside.to_str().unwrap());
        assert!(matches!(err, Err(AppError::InvalidPath(_))));
    }
}
