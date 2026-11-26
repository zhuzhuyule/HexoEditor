import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { readImage as readClipboardImageNative } from "@tauri-apps/plugin-clipboard-manager";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { LazyStore } from "@tauri-apps/plugin-store";

import type {
  DocumentContent,
  ExternalChangeEvent,
  HexoSiteConfig,
  PostSummary,
  RenameImageResult,
  RenamePostResult,
  ResolvedImageResult,
  SavedImageResult,
  SiteScanResult,
} from "@/types";

export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

const settingsStore = isTauriRuntime() ? new LazyStore("hexo-editor-settings.json") : null;

export async function loadSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    if (settingsStore) {
      const value = await settingsStore.get<T>(key);
      return value !== undefined && value !== null ? value : fallback;
    }
    const raw = localStorage.getItem(`hexo-editor:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  try {
    if (settingsStore) {
      await settingsStore.set(key, value);
      await settingsStore.save();
    } else {
      localStorage.setItem(`hexo-editor:${key}`, JSON.stringify(value));
    }
  } catch {
    // Ignore persistence errors in restricted environments
  }
}

export function toAssetUrl(absolutePath: string): string {
  if (isTauriRuntime()) {
    return convertFileSrc(absolutePath);
  }
  return `file://${absolutePath}`;
}

export async function pickDirectory(title: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await openDialog({
    title,
    directory: true,
    multiple: false,
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickMarkdownFile(title: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await openDialog({
    title,
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdx"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickImageFiles(title: string): Promise<string[]> {
  if (!isTauriRuntime()) return [];
  const selected = await openDialog({
    title,
    multiple: true,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"],
      },
    ],
  });
  if (Array.isArray(selected)) return selected;
  if (typeof selected === "string") return [selected];
  return [];
}

export async function pickSaveMarkdownPath(
  defaultPath?: string
): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await saveDialog({
    defaultPath,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  return selected ?? null;
}

export async function pickSaveHtmlPath(
  defaultPath?: string
): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await saveDialog({
    defaultPath,
    filters: [{ name: "HTML", extensions: ["html", "htm"] }],
  });
  return selected ?? null;
}

export async function writeTextFilePath(
  filePath: string,
  content: string
): Promise<number> {
  return writeDocument(filePath, content);
}

export async function revealInFileManager(path: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await revealItemInDir(path);
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isTauriRuntime()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await openUrl(url);
}

export async function inspectHexoSite(rootPath: string): Promise<HexoSiteConfig> {
  return invoke<HexoSiteConfig>("inspect_hexo_site", { rootPath });
}

export async function scanHexoSite(rootPath: string): Promise<SiteScanResult> {
  return invoke<SiteScanResult>("scan_hexo_site", { rootPath });
}

export async function readDocument(filePath: string): Promise<DocumentContent> {
  return invoke<DocumentContent>("read_document", { filePath });
}

export async function writeDocument(filePath: string, content: string): Promise<number> {
  return invoke<number>("write_document", { filePath, content });
}

export async function createHexoPost(params: {
  rootPath: string;
  title: string;
  isDraft: boolean;
  tags: string[];
  categories: string[];
}): Promise<PostSummary> {
  return invoke<PostSummary>("create_hexo_post", params);
}

export async function togglePostDraft(
  rootPath: string,
  filePath: string
): Promise<PostSummary> {
  return invoke<PostSummary>("toggle_post_draft", { rootPath, filePath });
}

export async function deletePost(
  filePath: string,
  deleteAssetFolder: boolean
): Promise<void> {
  return invoke<void>("delete_post", { filePath, deleteAssetFolder });
}

export async function renamePostWithAssets(params: {
  siteRoot: string | null;
  oldFilePath: string;
  newTitleOrSlug: string;
  currentContent: string;
}): Promise<RenamePostResult> {
  return invoke<RenamePostResult>("rename_post_with_assets", params);
}

export async function saveImageBytes(params: {
  docPath: string;
  siteRoot: string | null;
  postAssetFolder: boolean;
  sourceDir: string | null;
  bytes: number[];
  extension: string | null;
  preferredName: string | null;
}): Promise<SavedImageResult> {
  return invoke<SavedImageResult>("save_image_bytes", params);
}

export async function importLocalImageFile(params: {
  docPath: string;
  siteRoot: string | null;
  postAssetFolder: boolean;
  sourceDir: string | null;
  sourceImagePath: string;
}): Promise<SavedImageResult> {
  return invoke<SavedImageResult>("import_local_image_file", params);
}

export async function resolveLocalImages(params: {
  docPath: string | null;
  siteRoot: string | null;
  sourceDir: string | null;
  srcs: string[];
}): Promise<ResolvedImageResult[]> {
  if (!isTauriRuntime()) {
    return params.srcs.map((rawSrc) => ({
      rawSrc,
      absolutePath: null,
      exists: false,
    }));
  }
  return invoke<ResolvedImageResult[]>("resolve_local_images", params);
}

export async function renameLocalImage(params: {
  oldAbsPath: string;
  newNameInput: string;
  currentContent: string;
}): Promise<RenameImageResult> {
  return invoke<RenameImageResult>("rename_local_image", params);
}

export async function watchPath(path: string, recursive: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke<void>("watch_path", { path, recursive });
}

export async function unwatchPath(path: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke<void>("unwatch_path", { path });
}

export async function listenExternalFileChanges(
  handler: (event: ExternalChangeEvent) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<ExternalChangeEvent>("file-external-changed", (ev) => {
    handler(ev.payload);
  });
}

export async function listenMenuCloseTab(handler: () => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen("menu-close-tab", () => {
    handler();
  });
}

export async function setWindowTitleBarMode(
  mode: "overlay" | "system"
): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke<void>("set_window_title_bar_mode", { mode });
}

/**
 * Fallback for native OS clipboard images (e.g., macOS screenshots / Finder image copy)
 * when WebKit's DOM ClipboardEvent does not expose image blobs.
 */
export async function readClipboardImagePngBytes(): Promise<number[] | null> {
  if (!isTauriRuntime() || typeof document === "undefined") return null;
  let img: Awaited<ReturnType<typeof readClipboardImageNative>> | null = null;
  try {
    img = await readClipboardImageNative();
    const [{ width, height }, rgba] = await Promise.all([img.size(), img.rgba()]);
    if (!width || !height || rgba.length !== width * height * 4) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const clamped = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength);
    ctx.putImageData(new ImageData(clamped, width, height), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) return null;
    const buf = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buf));
  } catch {
    return null;
  } finally {
    if (img) {
      void img.close().catch(() => {});
    }
  }
}
