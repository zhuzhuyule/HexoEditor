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
    pub root: String,
    pub permalink: String,
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

#[derive(Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageBedConfig {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub picgo_url: String,
    #[serde(default)]
    pub picgo_uploader: Option<String>,
    #[serde(default)]
    pub picgo_config_name: Option<String>,
    #[serde(default)]
    pub endpoint: Option<String>,
    #[serde(default)]
    pub bucket: Option<String>,
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    pub access_key_id: Option<String>,
    #[serde(default)]
    pub secret_access_key: Option<String>,
    #[serde(default)]
    pub custom_domain: Option<String>,
    #[serde(default)]
    pub path_prefix: Option<String>,
    #[serde(default)]
    pub keep_local_after_upload: Option<bool>,
}

impl std::fmt::Debug for ImageBedConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ImageBedConfig")
            .field("provider", &self.provider)
            .field("picgo_url", &self.picgo_url)
            .field("picgo_uploader", &self.picgo_uploader)
            .field("picgo_config_name", &self.picgo_config_name)
            .field("endpoint", &self.endpoint)
            .field("bucket", &self.bucket)
            .field("region", &self.region)
            .field("access_key_id", &self.access_key_id)
            .field(
                "secret_access_key",
                &self
                    .secret_access_key
                    .as_deref()
                    .filter(|s| !s.is_empty())
                    .map(|_| "[REDACTED]"),
            )
            .field("custom_domain", &self.custom_domain)
            .field("path_prefix", &self.path_prefix)
            .field("keep_local_after_upload", &self.keep_local_after_upload)
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageBedConnectionResult {
    pub ok: bool,
    pub provider: String,
    pub message: String,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UploadedImageItem {
    pub local_path: String,
    pub remote_url: Option<String>,
    pub remote_key: Option<String>,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageBedUploadBatchResult {
    pub provider: String,
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub items: Vec<UploadedImageItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDeleteFailure {
    pub remote_key: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteRemoteImagesResult {
    pub provider: String,
    pub supported: bool,
    pub deleted_keys: Vec<String>,
    pub failed_keys: Vec<RemoteDeleteFailure>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnusedLocalImage {
    pub absolute_path: String,
    pub file_name: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScanUnusedImagesResult {
    pub scanned_dirs: Vec<String>,
    pub total_local_images: usize,
    pub unused_images: Vec<UnusedLocalImage>,
    pub total_unused_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLocalImagesResult {
    pub deleted_paths: Vec<String>,
    pub skipped_paths: Vec<String>,
    pub deleted_count: usize,
    pub freed_bytes: u64,
}
