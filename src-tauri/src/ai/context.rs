use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde_yaml::Value;
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::hexo::split_front_matter;

use super::{ActiveDocContext, SiteContextSnapshot, SiteMarkdownConfig};

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];

fn yaml_str(val: &Value) -> Option<String> {
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
        Value::Sequence(seq) => seq.first().and_then(yaml_str),
        _ => None,
    }
}

fn yaml_string_list(val: &Value) -> Vec<String> {
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
                out.extend(yaml_string_list(item));
            }
        }
        _ => {}
    }
    out
}

fn yaml_map_get<'a>(val: &'a Value, key: &str) -> Option<&'a Value> {
    val.as_mapping()
        .and_then(|m| m.get(Value::String(key.to_string())))
}

fn yaml_bool_enabled(val: Option<&Value>) -> bool {
    let Some(v) = val else {
        return false;
    };
    if let Some(b) = v.as_bool() {
        return b;
    }
    if let Some(map) = v.as_mapping() {
        if let Some(en) = map
            .get(Value::String("enable".into()))
            .or_else(|| map.get(Value::String("enabled".into())))
            .and_then(Value::as_bool)
        {
            return en;
        }
        // In NexT, `note:` with `style: flat` (without `enable: false`) is active
        return map
            .get(Value::String("style".into()))
            .and_then(Value::as_str)
            .is_some();
    }
    false
}

fn collect_theme_features(theme_yaml: &Value, tags: &mut Vec<String>, md_cfg: &mut SiteMarkdownConfig) {
    let mut push_tag = |name: &str| {
        if !tags.iter().any(|t| t == name) {
            tags.push(name.to_string());
        }
    };

    if yaml_bool_enabled(yaml_map_get(theme_yaml, "note")) {
        push_tag("note");
    }
    if yaml_bool_enabled(yaml_map_get(theme_yaml, "tabs")) {
        push_tag("tabs");
    }
    if yaml_bool_enabled(yaml_map_get(theme_yaml, "mermaid")) {
        md_cfg.mermaid_enabled = true;
        push_tag("mermaid");
    }

    let math_block = yaml_map_get(theme_yaml, "math");
    let mathjax_on = math_block
        .and_then(|m| yaml_map_get(m, "mathjax"))
        .map(|v| yaml_bool_enabled(Some(v)))
        .unwrap_or(false)
        || yaml_bool_enabled(yaml_map_get(theme_yaml, "mathjax"));
    let katex_on = math_block
        .and_then(|m| yaml_map_get(m, "katex"))
        .map(|v| yaml_bool_enabled(Some(v)))
        .unwrap_or(false)
        || yaml_bool_enabled(yaml_map_get(theme_yaml, "katex"));

    if mathjax_on || katex_on {
        md_cfg.math_enabled = true;
        push_tag("math");
    }
}

fn is_markdown_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|e| e.to_str())
            .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown" | "mdx"))
            .unwrap_or(false)
}

fn is_image_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|e| e.to_str())
            .map(|ext| IMAGE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
            .unwrap_or(false)
}

fn collect_taxonomies_from_dirs(dirs: &[PathBuf]) -> (Vec<String>, Vec<String>) {
    let mut tag_counts: HashMap<String, usize> = HashMap::new();
    let mut cat_counts: HashMap<String, usize> = HashMap::new();
    let mut scanned_files = 0usize;

    for dir in dirs {
        if !dir.is_dir() {
            continue;
        }
        for entry in WalkDir::new(dir)
            .max_depth(4)
            .into_iter()
            .filter_map(Result::ok)
        {
            if scanned_files >= 400 {
                break;
            }
            if !is_markdown_file(entry.path()) {
                continue;
            }
            scanned_files += 1;
            let Ok(raw) = fs::read_to_string(entry.path()) else {
                continue;
            };
            let (Some(fm_raw), _) = split_front_matter(&raw) else {
                continue;
            };
            let Ok(fm_val) = serde_yaml::from_str::<Value>(&fm_raw) else {
                continue;
            };
            if let Some(tags_val) = yaml_map_get(&fm_val, "tags") {
                for t in yaml_string_list(tags_val) {
                    *tag_counts.entry(t).or_insert(0) += 1;
                }
            }
            if let Some(cats_val) = yaml_map_get(&fm_val, "categories") {
                for c in yaml_string_list(cats_val) {
                    *cat_counts.entry(c).or_insert(0) += 1;
                }
            }
        }
    }

    let mut tags: Vec<(String, usize)> = tag_counts.into_iter().collect();
    tags.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let top_tags = tags.into_iter().take(40).map(|(k, _)| k).collect();

    let mut cats: Vec<(String, usize)> = cat_counts.into_iter().collect();
    cats.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let top_cats = cats.into_iter().take(25).map(|(k, _)| k).collect();

    (top_cats, top_tags)
}

fn collect_active_doc_context(
    site_root: &Path,
    source_dir: &str,
    doc_path: Option<&str>,
) -> Option<ActiveDocContext> {
    let raw_doc = doc_path?.trim();
    if raw_doc.is_empty() {
        return None;
    }
    let doc = PathBuf::from(raw_doc);

    let relative_path = doc
        .strip_prefix(site_root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| {
            doc.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(raw_doc)
                .to_string()
        });

    let mut images = Vec::new();
    let mut seen = HashSet::new();

    // 1. Sibling post asset folder: <parent>/<stem>/*
    if let (Some(parent), Some(stem)) = (doc.parent(), doc.file_stem().and_then(|s| s.to_str())) {
        let asset_dir = parent.join(stem);
        if asset_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&asset_dir) {
                for entry in entries.filter_map(Result::ok) {
                    if is_image_file(&entry.path()) {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if seen.insert(name.clone()) {
                            images.push(name);
                        }
                    }
                }
            }
        }
    }

    // 2. Site shared images dir: <site_root>/<source_dir>/images/*
    let shared_images_dir = site_root.join(source_dir).join("images");
    if shared_images_dir.is_dir() && images.len() < 40 {
        for entry in WalkDir::new(&shared_images_dir)
            .max_depth(2)
            .into_iter()
            .filter_map(Result::ok)
        {
            if images.len() >= 40 {
                break;
            }
            if is_image_file(entry.path()) {
                if let Ok(rel) = entry.path().strip_prefix(site_root.join(source_dir)) {
                    let formatted = format!("/{}", rel.to_string_lossy().replace('\\', "/"));
                    if seen.insert(formatted.clone()) {
                        images.push(formatted);
                    }
                }
            }
        }
    }

    images.sort();
    images.truncate(40);

    Some(ActiveDocContext {
        relative_path,
        local_images: images,
    })
}

fn detect_hugo_title_lang(root: &Path) -> Option<(String, String)> {
    for candidate in [
        root.join("hugo.toml"),
        root.join("config.toml"),
        root.join("config/_default/hugo.toml"),
        root.join("config/_default/config.toml"),
    ] {
        if candidate.is_file() {
            let raw = fs::read_to_string(&candidate).unwrap_or_default();
            let mut title = root
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Hugo Site")
                .to_string();
            let mut lang = "en".to_string();
            for line in raw.lines() {
                let t = line.trim();
                if let Some(rest) = t.strip_prefix("title") {
                    if let Some((_, val)) = rest.split_once('=') {
                        let cleaned = val.trim().trim_matches(['"', '\'']).trim();
                        if !cleaned.is_empty() {
                            title = cleaned.to_string();
                        }
                    }
                } else if let Some(rest) = t.strip_prefix("languageCode").or_else(|| t.strip_prefix("defaultContentLanguage")) {
                    if let Some((_, val)) = rest.split_once('=') {
                        let cleaned = val.trim().trim_matches(['"', '\'']).trim();
                        if !cleaned.is_empty() {
                            lang = cleaned.to_string();
                        }
                    }
                }
            }
            return Some((title, lang));
        }
    }
    None
}

pub fn build_site_ai_context(
    site_root: &str,
    doc_path: Option<&str>,
) -> AppResult<SiteContextSnapshot> {
    let root = PathBuf::from(site_root);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!(
            "Site directory does not exist: {}",
            site_root
        )));
    }

    let hexo_config = root.join("_config.yml");
    let is_hexo = hexo_config.is_file() || root.join("source").join("_posts").is_dir();

    if is_hexo {
        let mut site_title = root
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Hexo Site")
            .to_string();
        let mut language = "zh-CN".to_string();
        let mut permalink = ":year/:month/:day/:title/".to_string();
        let mut post_asset_folder = false;
        let mut source_dir = "source".to_string();
        let mut theme: Option<String> = None;
        let mut markdown_config = SiteMarkdownConfig::default();

        if hexo_config.is_file() {
            if let Ok(raw) = fs::read_to_string(&hexo_config) {
                if let Ok(parsed) = serde_yaml::from_str::<Value>(&raw) {
                    if let Some(v) = yaml_map_get(&parsed, "title").and_then(yaml_str) {
                        site_title = v;
                    }
                    if let Some(v) = yaml_map_get(&parsed, "language").and_then(yaml_str) {
                        language = v;
                    }
                    if let Some(v) = yaml_map_get(&parsed, "permalink").and_then(yaml_str) {
                        permalink = v;
                    }
                    if let Some(v) = yaml_map_get(&parsed, "source_dir").and_then(yaml_str) {
                        source_dir = v;
                    }
                    if let Some(b) = yaml_map_get(&parsed, "post_asset_folder").and_then(Value::as_bool) {
                        post_asset_folder = b;
                    }
                    theme = yaml_map_get(&parsed, "theme").and_then(yaml_str);
                    if let Some(marked) = yaml_map_get(&parsed, "marked") {
                        markdown_config.breaks =
                            yaml_map_get(marked, "breaks").and_then(Value::as_bool);
                    }
                }
            }
        }

        let mut enabled_theme_tags = vec!["blockquote".to_string(), "codeblock".to_string()];
        if post_asset_folder {
            enabled_theme_tags.push("asset_img".to_string());
        }

        if let Some(ref theme_name) = theme {
            let safe_theme = theme_name.replace(['/', '\\'], "");
            let theme_cfg_candidates = [
                root.join(format!("_config.{}.yml", safe_theme)),
                root.join("themes").join(&safe_theme).join("_config.yml"),
            ];
            for candidate in theme_cfg_candidates {
                if candidate.is_file() {
                    if let Ok(raw) = fs::read_to_string(&candidate) {
                        if let Ok(theme_yaml) = serde_yaml::from_str::<Value>(&raw) {
                            collect_theme_features(
                                &theme_yaml,
                                &mut enabled_theme_tags,
                                &mut markdown_config,
                            );
                        }
                    }
                }
            }
        }

        let source_path = root.join(&source_dir);
        let (existing_categories, existing_tags) = collect_taxonomies_from_dirs(&[
            source_path.join("_posts"),
            source_path.join("_drafts"),
        ]);
        let active_doc = collect_active_doc_context(&root, &source_dir, doc_path);

        return Ok(SiteContextSnapshot {
            engine: "hexo".to_string(),
            site_title,
            language,
            permalink,
            post_asset_folder,
            theme,
            markdown_config,
            enabled_theme_tags,
            existing_categories,
            existing_tags,
            active_doc,
        });
    }

    if let Some((title, lang)) = detect_hugo_title_lang(&root) {
        let (existing_categories, existing_tags) =
            collect_taxonomies_from_dirs(&[root.join("content")]);
        let active_doc = collect_active_doc_context(&root, "static", doc_path);
        return Ok(SiteContextSnapshot {
            engine: "hugo".to_string(),
            site_title: title,
            language: lang,
            permalink: "/posts/:slug/".to_string(),
            post_asset_folder: true,
            theme: None,
            markdown_config: SiteMarkdownConfig::default(),
            enabled_theme_tags: Vec::new(),
            existing_categories,
            existing_tags,
            active_doc,
        });
    }

    Ok(SiteContextSnapshot {
        engine: "unknown".to_string(),
        site_title: root
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Workspace")
            .to_string(),
        language: "zh-CN".to_string(),
        permalink: "".to_string(),
        post_asset_folder: false,
        theme: None,
        markdown_config: SiteMarkdownConfig::default(),
        enabled_theme_tags: Vec::new(),
        existing_categories: Vec::new(),
        existing_tags: Vec::new(),
        active_doc: collect_active_doc_context(&root, "source", doc_path),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn builds_hexo_next_site_context_with_tags_theme_features_and_local_images() {
        let tmp = TempDir::new().expect("tempdir");
        let root = tmp.path();

        fs::write(
            root.join("_config.yml"),
            r#"
title: Zac Engineering Blog
language: zh-CN
permalink: :year/:month/:day/:title/
post_asset_folder: true
theme: next
marked:
  breaks: false
"#,
        )
        .unwrap();

        fs::write(
            root.join("_config.next.yml"),
            r#"
note:
  style: flat
tabs:
  enable: true
mermaid:
  enable: true
math:
  katex:
    enable: true
"#,
        )
        .unwrap();

        let posts_dir = root.join("source/_posts");
        let asset_dir = posts_dir.join("hello-ai");
        fs::create_dir_all(&asset_dir).unwrap();
        fs::write(asset_dir.join("diagram.png"), b"png").unwrap();
        fs::write(asset_dir.join("notes.txt"), b"ignore").unwrap();

        let doc_path = posts_dir.join("hello-ai.md");
        fs::write(
            &doc_path,
            "---\ntitle: Hello AI\ntags:\n  - Rust\n  - Tauri\ncategories:\n  - Engineering\n---\nBody\n",
        )
        .unwrap();
        fs::write(
            posts_dir.join("second.md"),
            "---\ntitle: Second\ntags:\n  - Rust\n  - Hexo\ncategories:\n  - Engineering\n---\nBody\n",
        )
        .unwrap();

        let ctx = build_site_ai_context(
            &root.to_string_lossy(),
            Some(&doc_path.to_string_lossy()),
        )
        .expect("build context");

        assert_eq!(ctx.engine, "hexo");
        assert_eq!(ctx.site_title, "Zac Engineering Blog");
        assert_eq!(ctx.language, "zh-CN");
        assert!(ctx.post_asset_folder);
        assert_eq!(ctx.theme.as_deref(), Some("next"));
        assert_eq!(ctx.markdown_config.breaks, Some(false));
        assert!(ctx.markdown_config.math_enabled);
        assert!(ctx.markdown_config.mermaid_enabled);

        assert!(ctx.enabled_theme_tags.contains(&"note".to_string()));
        assert!(ctx.enabled_theme_tags.contains(&"tabs".to_string()));
        assert!(ctx.enabled_theme_tags.contains(&"mermaid".to_string()));
        assert!(ctx.enabled_theme_tags.contains(&"math".to_string()));
        assert!(ctx.enabled_theme_tags.contains(&"asset_img".to_string()));

        assert_eq!(ctx.existing_categories, vec!["Engineering"]);
        assert_eq!(ctx.existing_tags[0], "Rust"); // highest frequency (2)
        assert!(ctx.existing_tags.contains(&"Hexo".to_string()));
        assert!(ctx.existing_tags.contains(&"Tauri".to_string()));

        let active = ctx.active_doc.expect("active doc");
        assert_eq!(active.relative_path, "source/_posts/hello-ai.md");
        assert_eq!(active.local_images, vec!["diagram.png"]);
    }
}
