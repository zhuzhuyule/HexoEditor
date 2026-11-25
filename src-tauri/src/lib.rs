mod error;
mod hexo;
mod images;
mod models;
mod watcher;

use std::path::Path;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

const MENU_CLOSE_TAB_ID: &str = "close-tab";
const MENU_CLOSE_WINDOW_ID: &str = "close-window";

fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg_info = app.package_info();
    let config = app.config();
    let about_metadata = AboutMetadata {
        name: Some(pkg_info.name.clone()),
        version: Some(pkg_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|p| vec![p]),
        ..Default::default()
    };

    let close_tab = MenuItem::with_id(
        app,
        MENU_CLOSE_TAB_ID,
        "Close Tab",
        true,
        Some("CmdOrCtrl+W"),
    )?;
    let close_window = MenuItem::with_id(
        app,
        MENU_CLOSE_WINDOW_ID,
        "Close Window",
        true,
        Some("CmdOrCtrl+Shift+W"),
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &close_tab,
            &close_window,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            app,
            pkg_info.name.clone(),
            true,
            &[
                &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;
        let view_menu = Submenu::with_items(
            app,
            "View",
            true,
            &[&PredefinedMenuItem::fullscreen(app, None)?],
        )?;
        Menu::with_items(
            app,
            &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
        )
    }

    #[cfg(not(target_os = "macos"))]
    {
        let help_menu = Submenu::with_items(
            app,
            "Help",
            true,
            &[&PredefinedMenuItem::about(app, None, Some(about_metadata))?],
        )?;
        Menu::with_items(app, &[&file_menu, &edit_menu, &window_menu, &help_menu])
    }
}

use crate::error::AppResult;
use crate::models::{
    DocumentContent, HexoSiteConfig, PostSummary, RenameImageResult, RenamePostResult,
    ResolvedImageResult, SavedImageResult, SiteScanResult,
};
use crate::watcher::FileWatcherState;

#[tauri::command]
fn inspect_hexo_site(root_path: String) -> AppResult<HexoSiteConfig> {
    hexo::inspect_hexo_site(&root_path)
}

#[tauri::command]
fn scan_hexo_site(root_path: String) -> AppResult<SiteScanResult> {
    hexo::scan_hexo_site(&root_path)
}

#[tauri::command]
fn read_document(file_path: String) -> AppResult<DocumentContent> {
    hexo::read_document(&file_path)
}

#[tauri::command]
fn write_document(
    watcher: State<'_, FileWatcherState>,
    file_path: String,
    content: String,
) -> AppResult<u64> {
    watcher.mark_self_write(Path::new(&file_path));
    hexo::write_document(&file_path, &content)
}

#[tauri::command]
fn create_hexo_post(
    watcher: State<'_, FileWatcherState>,
    root_path: String,
    title: String,
    is_draft: bool,
    tags: Vec<String>,
    categories: Vec<String>,
) -> AppResult<PostSummary> {
    if let Ok(cfg) = hexo::inspect_hexo_site(&root_path) {
        let stem = hexo::sanitize_filename_stem(&title);
        if !stem.is_empty() {
            let predicted = Path::new(&cfg.root_path)
                .join(&cfg.source_dir)
                .join(if is_draft { "_drafts" } else { "_posts" })
                .join(format!("{}.md", stem));
            watcher.mark_self_write(&predicted);
        }
    }
    let summary = hexo::create_hexo_post(&root_path, &title, is_draft, tags, categories)?;
    watcher.mark_self_write(Path::new(&summary.file_path));
    Ok(summary)
}

#[tauri::command]
fn toggle_post_draft(
    watcher: State<'_, FileWatcherState>,
    root_path: String,
    file_path: String,
) -> AppResult<PostSummary> {
    watcher.mark_self_write(Path::new(&file_path));
    if let (Ok(cfg), Some(file_name)) = (
        hexo::inspect_hexo_site(&root_path),
        Path::new(&file_path).file_name(),
    ) {
        let source = Path::new(&cfg.root_path).join(&cfg.source_dir);
        watcher.mark_self_write(&source.join("_posts").join(file_name));
        watcher.mark_self_write(&source.join("_drafts").join(file_name));
    }
    let summary = hexo::toggle_post_draft(&root_path, &file_path)?;
    watcher.mark_self_write(Path::new(&summary.file_path));
    Ok(summary)
}

#[tauri::command]
fn delete_post(
    watcher: State<'_, FileWatcherState>,
    file_path: String,
    delete_asset_folder: bool,
) -> AppResult<()> {
    watcher.mark_self_write(Path::new(&file_path));
    hexo::delete_post(&file_path, delete_asset_folder)
}

#[tauri::command]
fn rename_post_with_assets(
    watcher: State<'_, FileWatcherState>,
    site_root: Option<String>,
    old_file_path: String,
    new_title_or_slug: String,
    current_content: String,
) -> AppResult<RenamePostResult> {
    let old_path = Path::new(&old_file_path);
    watcher.mark_self_write(old_path);
    if let Some(parent) = old_path.parent() {
        let new_slug = hexo::sanitize_filename_stem(&new_title_or_slug);
        if !new_slug.is_empty() {
            let ext = old_path.extension().and_then(|e| e.to_str()).unwrap_or("md");
            watcher.mark_self_write(&parent.join(format!("{}.{}", new_slug, ext)));
        }
    }
    let res = hexo::rename_post_with_assets(
        site_root.as_deref(),
        &old_file_path,
        &new_title_or_slug,
        &current_content,
    )?;
    watcher.mark_self_write(Path::new(&res.new_file_path));
    Ok(res)
}

#[tauri::command]
fn save_image_bytes(
    doc_path: String,
    site_root: Option<String>,
    post_asset_folder: bool,
    source_dir: Option<String>,
    bytes: Vec<u8>,
    extension: Option<String>,
    preferred_name: Option<String>,
) -> AppResult<SavedImageResult> {
    images::save_image_bytes(
        &doc_path,
        site_root.as_deref(),
        post_asset_folder,
        source_dir.as_deref(),
        &bytes,
        extension.as_deref(),
        preferred_name.as_deref(),
    )
}

#[tauri::command]
fn import_local_image_file(
    doc_path: String,
    site_root: Option<String>,
    post_asset_folder: bool,
    source_dir: Option<String>,
    source_image_path: String,
) -> AppResult<SavedImageResult> {
    images::import_local_image_file(
        &doc_path,
        site_root.as_deref(),
        post_asset_folder,
        source_dir.as_deref(),
        &source_image_path,
    )
}

#[tauri::command]
fn resolve_local_images(
    doc_path: Option<String>,
    site_root: Option<String>,
    source_dir: Option<String>,
    srcs: Vec<String>,
) -> Vec<ResolvedImageResult> {
    images::resolve_local_images(
        doc_path.as_deref(),
        site_root.as_deref(),
        source_dir.as_deref(),
        srcs,
    )
}

#[tauri::command]
fn rename_local_image(
    old_abs_path: String,
    new_name_input: String,
    current_content: String,
) -> AppResult<RenameImageResult> {
    images::rename_local_image(&old_abs_path, &new_name_input, &current_content)
}

#[tauri::command]
fn watch_path(
    app: AppHandle,
    watcher: State<'_, FileWatcherState>,
    path: String,
    recursive: bool,
) -> AppResult<()> {
    watcher.watch_path(app, Path::new(&path), recursive)
}

#[tauri::command]
fn unwatch_path(watcher: State<'_, FileWatcherState>, path: String) -> AppResult<()> {
    watcher.unwatch_path(Path::new(&path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(build_app_menu)
        .on_menu_event(|app, event| {
            if event.id() == MENU_CLOSE_TAB_ID {
                let _ = app.emit("menu-close-tab", ());
            } else if event.id() == MENU_CLOSE_WINDOW_ID {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.close();
                }
            }
        })
        .manage(FileWatcherState::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            inspect_hexo_site,
            scan_hexo_site,
            read_document,
            write_document,
            create_hexo_post,
            toggle_post_draft,
            delete_post,
            rename_post_with_assets,
            save_image_bytes,
            import_local_image_file,
            resolve_local_images,
            rename_local_image,
            watch_path,
            unwatch_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HexoEditor");
}
