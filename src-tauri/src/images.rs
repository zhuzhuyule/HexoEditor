use std::fs;
use std::path::{Path, PathBuf};

use md5::{Digest, Md5};
use regex::Regex;

use crate::error::{AppError, AppResult};
use crate::hexo::{percent_encode_path_segment, sanitize_filename_stem};
use crate::models::{RenameImageResult, ResolvedImageResult, SavedImageResult};

fn compute_md5_hex(bytes: &[u8]) -> String {
    let mut hasher = Md5::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    digest.iter().map(|b| format!("{:02x}", b)).collect()
}

fn normalize_extension(ext: Option<&str>) -> String {
    let raw = ext.unwrap_or("png").trim().trim_start_matches('.').to_lowercase();
    match raw.as_str() {
        "jpeg" => "jpg".to_string(),
        "png" | "jpg" | "gif" | "webp" | "svg" | "bmp" | "avif" | "ico" => raw,
        _ => "png".to_string(),
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Ok(hex_str), _) = (std::str::from_utf8(&bytes[i + 1..i + 3]), ()) {
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

fn find_existing_by_md5(dir: &Path, target_md5: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if let Ok(existing_bytes) = fs::read(&path) {
            if compute_md5_hex(&existing_bytes) == target_md5 {
                return Some(path);
            }
        }
    }
    None
}

fn compute_target_dir_and_prefix(
    doc_path: &Path,
    site_root: Option<&str>,
    post_asset_folder: bool,
    source_dir: Option<&str>,
) -> AppResult<(PathBuf, String)> {
    let doc_parent = doc_path
        .parent()
        .ok_or_else(|| AppError::InvalidPath("Document has no parent directory".into()))?;
    let doc_stem = doc_path
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("assets");

    if let Some(root_str) = site_root.filter(|s| !s.trim().is_empty()) {
        if post_asset_folder {
            let dir = doc_parent.join(doc_stem);
            Ok((dir, String::new()))
        } else {
            let src_dir = source_dir
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("source");
            let dir = PathBuf::from(root_str)
                .join(src_dir)
                .join("images")
                .join(doc_stem);
            Ok((dir, format!("/images/{}/", doc_stem)))
        }
    } else {
        let dir = doc_parent.join("assets");
        Ok((dir, "./assets/".to_string()))
    }
}

pub fn save_image_bytes(
    doc_path: &str,
    site_root: Option<&str>,
    post_asset_folder: bool,
    source_dir: Option<&str>,
    bytes: &[u8],
    extension: Option<&str>,
    preferred_name: Option<&str>,
) -> AppResult<SavedImageResult> {
    if bytes.is_empty() {
        return Err(AppError::InvalidInput("Image data is empty".into()));
    }

    let doc = PathBuf::from(doc_path);
    let (target_dir, md_prefix) =
        compute_target_dir_and_prefix(&doc, site_root, post_asset_folder, source_dir)?;
    fs::create_dir_all(&target_dir)?;

    let md5_hex = compute_md5_hex(bytes);
    if let Some(existing_path) = find_existing_by_md5(&target_dir, &md5_hex) {
        let file_name = existing_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        return Ok(SavedImageResult {
            absolute_path: existing_path.to_string_lossy().to_string(),
            markdown_path: format!("{}{}", md_prefix, file_name),
            file_name,
            md5: md5_hex,
            deduplicated: true,
        });
    }

    let ext = normalize_extension(extension);
    let short_md5 = &md5_hex[..12];
    let file_name = match preferred_name.map(sanitize_filename_stem).filter(|s| !s.is_empty()) {
        Some(stem) => {
            let candidate = format!("{}.{}", stem, ext);
            if target_dir.join(&candidate).exists() {
                format!("{}-{}.{}", stem, &md5_hex[..6], ext)
            } else {
                candidate
            }
        }
        None => format!("img-{}.{}", short_md5, ext),
    };

    let absolute_path = target_dir.join(&file_name);
    fs::write(&absolute_path, bytes)?;

    Ok(SavedImageResult {
        absolute_path: absolute_path.to_string_lossy().to_string(),
        markdown_path: format!("{}{}", md_prefix, file_name),
        file_name,
        md5: md5_hex,
        deduplicated: false,
    })
}

pub fn import_local_image_file(
    doc_path: &str,
    site_root: Option<&str>,
    post_asset_folder: bool,
    source_dir: Option<&str>,
    source_image_path: &str,
) -> AppResult<SavedImageResult> {
    let src_path = PathBuf::from(source_image_path);
    if !src_path.is_file() {
        return Err(AppError::NotFound(format!(
            "Source image not found: {}",
            source_image_path
        )));
    }
    let bytes = fs::read(&src_path)?;
    let ext = src_path.extension().and_then(|e| e.to_str());
    let preferred_stem = src_path.file_stem().and_then(|s| s.to_str());

    save_image_bytes(
        doc_path,
        site_root,
        post_asset_folder,
        source_dir,
        &bytes,
        ext,
        preferred_stem,
    )
}

pub fn resolve_local_images(
    doc_path: Option<&str>,
    site_root: Option<&str>,
    source_dir: Option<&str>,
    srcs: Vec<String>,
) -> Vec<ResolvedImageResult> {
    let doc = doc_path.map(PathBuf::from);
    let doc_parent = doc.as_ref().and_then(|p| p.parent().map(Path::to_path_buf));
    let doc_stem = doc
        .as_ref()
        .and_then(|p| p.file_stem())
        .and_then(|s| s.to_str())
        .map(String::from);
    let src_dir_name = source_dir
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("source");
    let site_source = site_root
        .filter(|s| !s.trim().is_empty())
        .map(|r| PathBuf::from(r).join(src_dir_name));

    srcs.into_iter()
        .map(|raw_src| {
            let trimmed = raw_src.trim();
            if trimmed.is_empty()
                || trimmed.starts_with("http://")
                || trimmed.starts_with("https://")
                || trimmed.starts_with("data:")
                || trimmed.starts_with("blob:")
                || trimmed.starts_with("asset:")
                || trimmed.starts_with("//")
            {
                return ResolvedImageResult {
                    raw_src,
                    absolute_path: None,
                    exists: false,
                };
            }

            let cleaned = percent_decode(strip_query_and_hash(trimmed));
            let rel_trimmed = cleaned.trim_start_matches("./");
            let mut candidates: Vec<PathBuf> = Vec::new();

            let as_path = PathBuf::from(&cleaned);
            if as_path.is_absolute() && as_path.is_file() {
                return ResolvedImageResult {
                    raw_src,
                    absolute_path: Some(as_path.to_string_lossy().to_string()),
                    exists: true,
                };
            }

            if let Some(parent) = &doc_parent {
                candidates.push(parent.join(rel_trimmed));
                if let Some(stem) = &doc_stem {
                    candidates.push(parent.join(stem).join(rel_trimmed));
                    if let Some(after_stem) = rel_trimmed.strip_prefix(&format!("{}/", stem)) {
                        candidates.push(parent.join(stem).join(after_stem));
                    }
                }
            }

            if let Some(site_src) = &site_source {
                let no_leading = cleaned.trim_start_matches('/');
                candidates.push(site_src.join(no_leading));
                if let Some(stem) = &doc_stem {
                    candidates.push(site_src.join("images").join(stem).join(rel_trimmed));
                }
                candidates.push(site_src.join("images").join(rel_trimmed));
            }

            for candidate in candidates {
                if candidate.is_file() {
                    let canonical = fs::canonicalize(&candidate).unwrap_or(candidate);
                    return ResolvedImageResult {
                        raw_src,
                        absolute_path: Some(canonical.to_string_lossy().to_string()),
                        exists: true,
                    };
                }
            }

            ResolvedImageResult {
                raw_src,
                absolute_path: None,
                exists: false,
            }
        })
        .collect()
}

pub fn rewrite_image_filename_in_markdown(
    content: &str,
    old_file_name: &str,
    new_file_name: &str,
) -> (String, usize) {
    if old_file_name == new_file_name || old_file_name.is_empty() || new_file_name.is_empty() {
        return (content.to_string(), 0);
    }

    let encoded_old = percent_encode_path_segment(old_file_name);
    let file_alt = if encoded_old != old_file_name {
        format!(
            "(?:{}|{})",
            regex::escape(old_file_name),
            regex::escape(&encoded_old)
        )
    } else {
        regex::escape(old_file_name)
    };
    let mut replacements = 0usize;

    // Replace inside Markdown image targets: ![alt](.../old_file_name) or ![alt](old_file_name)
    let md_re = Regex::new(&format!(
        r#"(!\[[^\]]*\]\(\s*<?(?:[^)\n]*?[/\\])?){}((?:\?[^)\s>]*)?(?:#[^)\s>]*)?>?\s*(?:"[^"]*"|'[^']*')?\s*\))"#,
        file_alt
    ));
    let mut result = content.to_string();
    if let Ok(re) = md_re {
        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                replacements += 1;
                format!(
                    "{}{}{}",
                    caps.get(1).map(|m| m.as_str()).unwrap_or(""),
                    new_file_name,
                    caps.get(2).map(|m| m.as_str()).unwrap_or("")
                )
            })
            .into_owned();
    }

    // Replace inside HTML <img ... src=".../old_file_name"> or <img ... src="old_file_name">
    let html_re = Regex::new(&format!(
        r#"(<img\b[^>]*\bsrc=["'](?:[^"']*?[/\\])?){}((?:\?[^"']*)?(?:#[^"']*)?["'])"#,
        file_alt
    ));
    if let Ok(re) = html_re {
        result = re
            .replace_all(&result, |caps: &regex::Captures| {
                replacements += 1;
                format!(
                    "{}{}{}",
                    caps.get(1).map(|m| m.as_str()).unwrap_or(""),
                    new_file_name,
                    caps.get(2).map(|m| m.as_str()).unwrap_or("")
                )
            })
            .into_owned();
    }

    (result, replacements)
}

pub fn rename_local_image(
    old_abs_path: &str,
    new_name_input: &str,
    current_content: &str,
) -> AppResult<RenameImageResult> {
    let old_path = PathBuf::from(old_abs_path);
    if !old_path.is_file() {
        return Err(AppError::NotFound(format!(
            "Image file not found: {}",
            old_abs_path
        )));
    }
    let parent = old_path
        .parent()
        .ok_or_else(|| AppError::InvalidPath("Image has no parent directory".into()))?;
    let old_file_name = old_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::InvalidPath("Invalid image filename".into()))?
        .to_string();
    let old_ext = old_path.extension().and_then(|e| e.to_str());

    let trimmed = new_name_input.trim();
    if trimmed.is_empty() || trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..")
    {
        return Err(AppError::InvalidInput("Invalid new image filename".into()));
    }

    let input_path = Path::new(trimmed);
    let new_file_name = match input_path.extension().and_then(|e| e.to_str()) {
        Some(ext) if !ext.is_empty() => {
            let stem = sanitize_filename_stem(
                input_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default(),
            );
            if stem.is_empty() {
                return Err(AppError::InvalidInput("Invalid new image filename".into()));
            }
            format!("{}.{}", stem, ext)
        }
        _ => {
            let stem = sanitize_filename_stem(trimmed);
            if stem.is_empty() {
                return Err(AppError::InvalidInput("Invalid new image filename".into()));
            }
            match old_ext {
                Some(ext) => format!("{}.{}", stem, ext),
                None => stem,
            }
        }
    };

    let new_path = parent.join(&new_file_name);
    if old_file_name == new_file_name {
        return Ok(RenameImageResult {
            old_absolute_path: old_path.to_string_lossy().to_string(),
            new_absolute_path: old_path.to_string_lossy().to_string(),
            old_file_name,
            new_file_name,
            updated_content: current_content.to_string(),
            replacements: 0,
        });
    }

    let same_case_insensitive = old_file_name.eq_ignore_ascii_case(&new_file_name);
    if !same_case_insensitive && new_path.exists() {
        return Err(AppError::AlreadyExists(format!(
            "Target image already exists: {}",
            new_path.display()
        )));
    }

    fs::rename(&old_path, &new_path)?;
    let (updated_content, replacements) =
        rewrite_image_filename_in_markdown(current_content, &old_file_name, &new_file_name);

    Ok(RenameImageResult {
        old_absolute_path: old_path.to_string_lossy().to_string(),
        new_absolute_path: new_path.to_string_lossy().to_string(),
        old_file_name,
        new_file_name,
        updated_content,
        replacements,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_save_image_bytes_with_md5_dedup() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        let post_path = root.join("source/_posts/my-article.md");
        fs::create_dir_all(post_path.parent().unwrap()).unwrap();
        fs::write(&post_path, "# Hello").unwrap();

        let bytes = b"fake-png-binary-payload-12345";
        let first = save_image_bytes(
            post_path.to_str().unwrap(),
            Some(root.to_str().unwrap()),
            true,
            Some("source"),
            bytes,
            Some("png"),
            None,
        )
        .unwrap();
        assert!(!first.deduplicated);
        assert!(Path::new(&first.absolute_path).is_file());
        assert!(first.markdown_path.starts_with("img-"));

        let second = save_image_bytes(
            post_path.to_str().unwrap(),
            Some(root.to_str().unwrap()),
            true,
            Some("source"),
            bytes,
            Some("png"),
            Some("different-name"),
        )
        .unwrap();
        assert!(second.deduplicated);
        assert_eq!(second.absolute_path, first.absolute_path);
        assert_eq!(second.file_name, first.file_name);
    }

    #[test]
    fn test_resolve_local_images_asset_folder_and_source_images() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        let post_path = root.join("source/_posts/demo.md");
        fs::create_dir_all(root.join("source/_posts/demo")).unwrap();
        fs::create_dir_all(root.join("source/images/demo")).unwrap();
        fs::write(&post_path, "# Demo").unwrap();
        fs::write(root.join("source/_posts/demo/a.png"), b"1").unwrap();
        fs::write(root.join("source/images/demo/b.jpg"), b"2").unwrap();

        let resolved = resolve_local_images(
            Some(post_path.to_str().unwrap()),
            Some(root.to_str().unwrap()),
            Some("source"),
            vec![
                "a.png".into(),
                "demo/a.png".into(),
                "/images/demo/b.jpg".into(),
                "https://example.com/c.png".into(),
                "missing.png".into(),
            ],
        );

        assert!(resolved[0].exists);
        assert!(resolved[1].exists);
        assert!(resolved[2].exists);
        assert!(!resolved[3].exists);
        assert!(!resolved[4].exists);
    }

    #[test]
    fn test_rename_local_image_and_rewrite_refs() {
        let dir = TempDir::new().unwrap();
        let img_path = dir.path().join("img-abc123.png");
        fs::write(&img_path, b"imgdata").unwrap();

        let md = "Text ![cover](my-post/img-abc123.png) and <img src=\"./my-post/img-abc123.png\" />";
        let renamed = rename_local_image(img_path.to_str().unwrap(), "architecture-diagram", md).unwrap();

        assert_eq!(renamed.new_file_name, "architecture-diagram.png");
        assert_eq!(renamed.replacements, 2);
        assert!(Path::new(&renamed.new_absolute_path).is_file());
        assert!(!img_path.exists());
        assert!(renamed.updated_content.contains("![cover](my-post/architecture-diagram.png)"));
        assert!(renamed.updated_content.contains("<img src=\"./my-post/architecture-diagram.png\" />"));
    }

    #[test]
    fn test_rejects_path_traversal_and_resolves_percent_encoded_cjk_images() {
        let dir = TempDir::new().unwrap();
        let post_path = dir.path().join("note.md");
        let assets_dir = dir.path().join("assets");
        fs::create_dir_all(&assets_dir).unwrap();
        fs::write(&post_path, "# Note").unwrap();
        let img = assets_dir.join("测试图.png");
        fs::write(&img, b"bytes").unwrap();

        let bad = rename_local_image(img.to_str().unwrap(), "../escape.png", "");
        assert!(matches!(bad, Err(AppError::InvalidInput(_))));

        let resolved = resolve_local_images(
            Some(post_path.to_str().unwrap()),
            None,
            None,
            vec!["./assets/%E6%B5%8B%E8%AF%95%E5%9B%BE.png?v=1".into()],
        );
        assert!(resolved[0].exists);
        assert!(resolved[0].absolute_path.as_deref().unwrap().ends_with("测试图.png"));

        // Standalone save goes into ./assets/
        let saved = save_image_bytes(
            post_path.to_str().unwrap(),
            None,
            false,
            None,
            b"standalone-png",
            Some("png"),
            None,
        )
        .unwrap();
        assert!(saved.markdown_path.starts_with("./assets/img-"));
        assert!(Path::new(&saved.absolute_path).is_file());
    }

    #[test]
    fn test_rename_bare_and_percent_encoded_image_refs() {
        let dir = TempDir::new().unwrap();
        let bare_img = dir.path().join("img-abc123.png");
        fs::write(&bare_img, b"imgdata").unwrap();

        let md = "![bare](img-abc123.png) <img src=\"img-abc123.png\" /> ![keep](other-img-abc123.png)";
        let renamed = rename_local_image(bare_img.to_str().unwrap(), "hero", md).unwrap();
        assert_eq!(renamed.replacements, 2);
        assert!(renamed.updated_content.contains("![bare](hero.png)"));
        assert!(renamed.updated_content.contains("<img src=\"hero.png\" />"));
        assert!(renamed.updated_content.contains("![keep](other-img-abc123.png)"));

        let cjk_img = dir.path().join("测试图.png");
        fs::write(&cjk_img, b"imgdata2").unwrap();
        let cjk_md = "![a](./assets/%E6%B5%8B%E8%AF%95%E5%9B%BE.png) <img src=\"%E6%B5%8B%E8%AF%95%E5%9B%BE.png?v=1\" />";
        let renamed_cjk = rename_local_image(cjk_img.to_str().unwrap(), "diagram", cjk_md).unwrap();
        assert_eq!(renamed_cjk.replacements, 2);
        assert!(renamed_cjk.updated_content.contains("![a](./assets/diagram.png)"));
        assert!(renamed_cjk.updated_content.contains("<img src=\"diagram.png?v=1\" />"));
    }
}
