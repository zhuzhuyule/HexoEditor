use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_yaml::Value;

use crate::error::{AppError, AppResult};
use crate::hexo::split_front_matter;

pub const MAX_PROMPT_FILE_BYTES: u64 = 64 * 1024;
pub const MAX_PROMPT_FILES: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SitePromptTemplate {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub scope: Option<String>,
    pub body: String,
    pub file_path: String,
}

fn yaml_non_empty_string(val: Option<&Value>) -> Option<String> {
    let v = val?;
    match v {
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn is_markdown_prompt_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown"))
        .unwrap_or(false)
}

fn parse_prompt_template(path: &Path, raw: &str) -> Option<SitePromptTemplate> {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("prompt")
        .to_string();

    let (fm_opt, body_raw) = split_front_matter(raw);
    let body = body_raw.trim().to_string();
    if body.is_empty() {
        return None;
    }

    let mut title = stem.clone();
    let mut description = None;
    let mut scope = None;

    if let Some(fm_str) = fm_opt {
        if let Ok(Value::Mapping(map)) = serde_yaml::from_str::<Value>(&fm_str) {
            if let Some(t) = yaml_non_empty_string(map.get(Value::String("title".into()))) {
                title = t;
            }
            description = yaml_non_empty_string(map.get(Value::String("description".into())));
            scope = yaml_non_empty_string(map.get(Value::String("scope".into())));
        }
    }

    Some(SitePromptTemplate {
        id: stem,
        title,
        description,
        scope,
        body,
        file_path: path.to_string_lossy().to_string(),
    })
}

/// Scans `<site_root>/.hexoeditor/prompts/*.md` safely and returns up to 32 templates.
/// Enforces a 64KB cap per file and canonicalized path containment to block traversal.
pub fn list_site_prompts(site_root: &str) -> AppResult<Vec<SitePromptTemplate>> {
    let trimmed_root = site_root.trim();
    if trimmed_root.is_empty() {
        return Err(AppError::InvalidInput("Site root path cannot be empty".into()));
    }

    let root = PathBuf::from(trimmed_root);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!(
            "Site directory does not exist: {}",
            site_root
        )));
    }

    let canon_root = fs::canonicalize(&root)?;
    let prompts_dir = root.join(".hexoeditor").join("prompts");
    if !prompts_dir.exists() {
        return Ok(Vec::new());
    }

    let canon_prompts_dir = fs::canonicalize(&prompts_dir)?;
    if !canon_prompts_dir.starts_with(&canon_root) || !canon_prompts_dir.is_dir() {
        return Err(AppError::InvalidPath(
            "Site prompts directory escapes site root".into(),
        ));
    }

    let mut entries: Vec<PathBuf> = fs::read_dir(&canon_prompts_dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();
    entries.sort();

    let mut templates = Vec::new();
    for entry_path in entries {
        if templates.len() >= MAX_PROMPT_FILES {
            break;
        }
        if !is_markdown_prompt_file(&entry_path) {
            continue;
        }

        let Ok(canon_file) = fs::canonicalize(&entry_path) else {
            continue;
        };
        if !canon_file.starts_with(&canon_prompts_dir) || !canon_file.is_file() {
            continue;
        }

        let Ok(meta) = fs::metadata(&canon_file) else {
            continue;
        };
        if meta.len() > MAX_PROMPT_FILE_BYTES {
            continue;
        }

        let Ok(raw) = fs::read_to_string(&canon_file) else {
            continue;
        };
        if raw.len() as u64 > MAX_PROMPT_FILE_BYTES {
            continue;
        }

        if let Some(tpl) = parse_prompt_template(&canon_file, &raw) {
            templates.push(tpl);
        }
    }

    Ok(templates)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn returns_empty_when_prompts_dir_missing() {
        let tmp = TempDir::new().expect("tempdir");
        let list = list_site_prompts(&tmp.path().to_string_lossy()).expect("list");
        assert!(list.is_empty());
    }

    #[test]
    fn parses_frontmatter_and_plain_markdown_templates() {
        let tmp = TempDir::new().expect("tempdir");
        let prompts_dir = tmp.path().join(".hexoeditor/prompts");
        fs::create_dir_all(&prompts_dir).unwrap();

        fs::write(
            prompts_dir.join("01-seo.md"),
            "---\ntitle: SEO 摘要优化\ndescription: 生成适合主题的描述\nscope: frontmatter\n---\n\n请为 {{site.title}} 的文章《{{doc.title}}》生成 SEO 摘要。",
        )
        .unwrap();

        fs::write(
            prompts_dir.join("02-plain.md"),
            "检查 {{doc.filePath}} 中的代码风格。",
        )
        .unwrap();

        // Non-markdown and empty files should be ignored
        fs::write(prompts_dir.join("ignore.txt"), "not markdown").unwrap();
        fs::write(prompts_dir.join("empty.md"), "   \n  ").unwrap();

        let list = list_site_prompts(&tmp.path().to_string_lossy()).expect("list");
        assert_eq!(list.len(), 2);

        assert_eq!(list[0].id, "01-seo");
        assert_eq!(list[0].title, "SEO 摘要优化");
        assert_eq!(list[0].description.as_deref(), Some("生成适合主题的描述"));
        assert_eq!(list[0].scope.as_deref(), Some("frontmatter"));
        assert!(list[0].body.contains("{{site.title}}"));

        assert_eq!(list[1].id, "02-plain");
        assert_eq!(list[1].title, "02-plain");
        assert!(list[1].description.is_none());
        assert_eq!(list[1].body, "检查 {{doc.filePath}} 中的代码风格。");
    }

    #[test]
    fn enforces_64kb_cap_and_32_file_limit() {
        let tmp = TempDir::new().expect("tempdir");
        let prompts_dir = tmp.path().join(".hexoeditor/prompts");
        fs::create_dir_all(&prompts_dir).unwrap();

        // Oversized > 64KB file should be skipped
        let huge = "a".repeat((MAX_PROMPT_FILE_BYTES as usize) + 128);
        fs::write(prompts_dir.join("00-huge.md"), huge).unwrap();

        for i in 0..40 {
            let name = format!("tpl-{:02}.md", i);
            fs::write(prompts_dir.join(name), format!("Template {}", i)).unwrap();
        }

        let list = list_site_prompts(&tmp.path().to_string_lossy()).expect("list");
        assert_eq!(list.len(), MAX_PROMPT_FILES);
        assert!(!list.iter().any(|t| t.id == "00-huge"));
    }

    #[cfg(unix)]
    #[test]
    fn blocks_symlink_traversal_outside_prompts_dir() {
        use std::os::unix::fs::symlink;

        let site = TempDir::new().expect("site");
        let outside = TempDir::new().expect("outside");
        let secret_file = outside.path().join("secret.md");
        fs::write(&secret_file, "SECRET CONTENT").unwrap();

        let prompts_dir = site.path().join(".hexoeditor/prompts");
        fs::create_dir_all(&prompts_dir).unwrap();
        fs::write(prompts_dir.join("safe.md"), "Safe prompt").unwrap();

        symlink(&secret_file, prompts_dir.join("escape.md")).unwrap();

        let list = list_site_prompts(&site.path().to_string_lossy()).expect("list");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "safe");
    }
}
