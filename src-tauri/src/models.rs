use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HexoSiteConfig {
    pub root_path: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub author: Option<String>,
    pub language: Option<String>,
    pub url: Option<String>,
    pub source_dir: String,
    pub post_asset_folder: bool,
    pub default_layout: String,
    pub has_posts_dir: bool,
    pub has_drafts_dir: bool,
    pub has_scaffold_post: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostSummary {
    pub file_path: String,
    pub file_name: String,
    pub slug: String,
    pub relative_path: String,
    pub title: String,
    pub date: Option<String>,
    pub updated: Option<String>,
    pub tags: Vec<String>,
    pub categories: Vec<String>,
    pub is_draft: bool,
    pub has_asset_folder: bool,
    pub excerpt: String,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxonomyCount {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteScanResult {
    pub config: HexoSiteConfig,
    pub posts: Vec<PostSummary>,
    pub all_tags: Vec<TaxonomyCount>,
    pub all_categories: Vec<TaxonomyCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContent {
    pub file_path: String,
    pub content: String,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePostResult {
    pub old_file_path: String,
    pub new_file_path: String,
    pub new_slug: String,
    pub renamed_asset_dirs: Vec<String>,
    pub updated_content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedImageResult {
    pub absolute_path: String,
    pub markdown_path: String,
    pub file_name: String,
    pub md5: String,
    pub deduplicated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedImageResult {
    pub raw_src: String,
    pub absolute_path: Option<String>,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameImageResult {
    pub old_absolute_path: String,
    pub new_absolute_path: String,
    pub old_file_name: String,
    pub new_file_name: String,
    pub updated_content: String,
    pub replacements: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalChangeEvent {
    pub file_path: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HexoCliOutputEvent {
    pub stream: String,
    pub line: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HexoCliStatus {
    pub running: bool,
    pub action: Option<String>,
    pub server_running: bool,
    pub server_url: Option<String>,
    pub exit_code: Option<i32>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KillPortResult {
    pub port: u16,
    pub killed_pids: Vec<u32>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeCssResult {
    pub theme_name: Option<String>,
    pub css_dir: String,
    pub files: Vec<String>,
    pub css_content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuickOpenResult {
    pub target: String,
    pub kind: String,
    pub value: String,
    pub exists: bool,
}
