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
