use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::event::ModifyKind;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};
use crate::models::ExternalChangeEvent;

const SELF_WRITE_GRACE_MS: u64 = 1500;

struct WatcherInner {
    watcher: Option<RecommendedWatcher>,
    watched_paths: HashSet<PathBuf>,
    recent_self_writes: Arc<Mutex<HashMap<PathBuf, Instant>>>,
}

#[derive(Clone)]
pub struct FileWatcherState {
    inner: Arc<Mutex<WatcherInner>>,
}

impl Default for FileWatcherState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(WatcherInner {
                watcher: None,
                watched_paths: HashSet::new(),
                recent_self_writes: Arc::new(Mutex::new(HashMap::new())),
            })),
        }
    }
}

/// Canonicalizes `path` even if the leaf file does not exist yet (e.g., before Save As / create)
/// or was just deleted, by canonicalizing the nearest existing ancestor directory.
pub(crate) fn normalize_path(path: &Path) -> PathBuf {
    if let Ok(canon) = std::fs::canonicalize(path) {
        return canon;
    }
    let mut missing_components = Vec::new();
    let mut current = path.to_path_buf();
    while let Some(name) = current.file_name() {
        missing_components.push(name.to_os_string());
        if !current.pop() {
            break;
        }
        if let Ok(canon_ancestor) = std::fs::canonicalize(&current) {
            let mut result = canon_ancestor;
            for comp in missing_components.into_iter().rev() {
                result.push(comp);
            }
            return result;
        }
    }
    path.to_path_buf()
}

impl FileWatcherState {
    pub fn mark_self_write(&self, path: &Path) {
        let normalized = normalize_path(path);
        if let Ok(inner) = self.inner.lock() {
            if let Ok(mut writes) = inner.recent_self_writes.lock() {
                let now = Instant::now();
                writes.insert(normalized, now);
                writes.insert(path.to_path_buf(), now);
            }
        }
    }

    pub fn ensure_initialized(&self, app: AppHandle) -> AppResult<()> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| AppError::Watcher("failed to lock watcher state".into()))?;
        if inner.watcher.is_some() {
            return Ok(());
        }

        let recent_self_writes = Arc::clone(&inner.recent_self_writes);
        let watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                let Ok(event) = res else {
                    return;
                };

                let kind_str = match event.kind {
                    // Ignore metadata-only touches (macOS Spotlight/Finder xattr/atime updates)
                    EventKind::Modify(ModifyKind::Metadata(_)) => return,
                    EventKind::Modify(_) => "modify",
                    EventKind::Create(_) => "create",
                    EventKind::Remove(_) => "remove",
                    _ => return,
                };

                let now = Instant::now();
                let mut suppressed = Vec::new();
                if let Ok(mut writes) = recent_self_writes.lock() {
                    writes.retain(|_, ts| {
                        now.duration_since(*ts) < Duration::from_millis(SELF_WRITE_GRACE_MS)
                    });
                    for p in &event.paths {
                        let norm = normalize_path(p);
                        if writes.contains_key(&norm) || writes.contains_key(p) {
                            suppressed.push(p.clone());
                        }
                    }
                }

                for path in event.paths {
                    if suppressed.contains(&path) {
                        continue;
                    }
                    let is_md = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
                        .unwrap_or(false);
                    if !is_md {
                        continue;
                    }
                    let payload = ExternalChangeEvent {
                        file_path: path.to_string_lossy().to_string(),
                        kind: kind_str.to_string(),
                    };
                    let _ = app.emit("file-external-changed", payload);
                }
            },
            Config::default(),
        )
        .map_err(|e| AppError::Watcher(e.to_string()))?;

        inner.watcher = Some(watcher);
        Ok(())
    }

    pub fn watch_path(&self, app: AppHandle, path: &Path, recursive: bool) -> AppResult<()> {
        self.ensure_initialized(app)?;
        if !path.exists() {
            return Ok(());
        }
        let target = normalize_path(path);
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| AppError::Watcher("failed to lock watcher state".into()))?;
        if inner.watched_paths.contains(&target) {
            return Ok(());
        }
        if let Some(watcher) = inner.watcher.as_mut() {
            let mode = if recursive {
                RecursiveMode::Recursive
            } else {
                RecursiveMode::NonRecursive
            };
            watcher
                .watch(&target, mode)
                .map_err(|e| AppError::Watcher(e.to_string()))?;
            inner.watched_paths.insert(target);
        }
        Ok(())
    }

    pub fn unwatch_path(&self, path: &Path) -> AppResult<()> {
        let target = normalize_path(path);
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| AppError::Watcher("failed to lock watcher state".into()))?;
        if !inner.watched_paths.remove(&target) {
            return Ok(());
        }
        if let Some(watcher) = inner.watcher.as_mut() {
            let _ = watcher.unwatch(&target);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_normalize_path_resolves_parent_for_nonexistent_leaf() {
        let dir = TempDir::new().unwrap();
        let nonexistent = dir.path().join("future-post.md");
        let normalized = normalize_path(&nonexistent);
        let canon_dir = std::fs::canonicalize(dir.path()).unwrap();
        assert_eq!(normalized, canon_dir.join("future-post.md"));
    }
}
