import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "./api";

export type ImageBedProvider = "none" | "picgo" | "s3" | "oss" | "cos";

export interface ImageBedConfig {
  provider: ImageBedProvider | string;
  picgoUrl?: string;
  picgoUploader?: string | null;
  picgoConfigName?: string | null;
  endpoint?: string | null;
  bucket?: string | null;
  region?: string | null;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
  customDomain?: string | null;
  pathPrefix?: string | null;
  keepLocalAfterUpload?: boolean;
}

export interface ImageBedConnectionResult {
  ok: boolean;
  provider: string;
  message: string;
  latencyMs: number;
}

export interface UploadedImageItem {
  localPath: string;
  remoteUrl: string | null;
  remoteKey: string | null;
  success: boolean;
  error: string | null;
}

export interface ImageBedUploadBatchResult {
  provider: string;
  total: number;
  succeeded: number;
  failed: number;
  items: UploadedImageItem[];
}

export interface RemoteDeleteFailure {
  remoteKey: string;
  error: string;
}

export interface DeleteRemoteImagesResult {
  provider: string;
  supported: boolean;
  deletedKeys: string[];
  failedKeys: RemoteDeleteFailure[];
  message: string;
}

export interface UnusedLocalImage {
  absolutePath: string;
  fileName: string;
  sizeBytes: number;
}

export interface ScanUnusedImagesResult {
  scannedDirs: string[];
  totalLocalImages: number;
  unusedImages: UnusedLocalImage[];
  totalUnusedBytes: number;
}

export interface DeleteLocalImagesResult {
  deletedPaths: string[];
  skippedPaths: string[];
  deletedCount: number;
  freedBytes: number;
}

export interface ScanUnusedImagesParams {
  docPath: string;
  siteRoot?: string | null;
  postAssetFolder: boolean;
  sourceDir?: string | null;
  currentContent: string;
}

export async function testImageBedConnection(
  config: ImageBedConfig
): Promise<ImageBedConnectionResult> {
  if (!isTauriRuntime()) {
    return {
      ok: false,
      provider: config.provider || "none",
      message: "Tauri desktop runtime is required to test image bed connectivity.",
      latencyMs: 0,
    };
  }
  return invoke<ImageBedConnectionResult>("test_image_bed_connection", { config });
}

export async function uploadImagesToBed(
  config: ImageBedConfig,
  filePaths: string[]
): Promise<ImageBedUploadBatchResult> {
  return invoke<ImageBedUploadBatchResult>("upload_images_to_bed", {
    config,
    filePaths,
  });
}

export async function deleteRemoteImages(
  config: ImageBedConfig,
  remoteKeys: string[]
): Promise<DeleteRemoteImagesResult> {
  if (!isTauriRuntime()) {
    return {
      provider: config.provider || "none",
      supported: false,
      deletedKeys: [],
      failedKeys: [],
      message: "Tauri desktop runtime is required to delete remote objects.",
    };
  }
  return invoke<DeleteRemoteImagesResult>("delete_remote_images", {
    config,
    remoteKeys,
  });
}

export async function scanUnusedLocalImages(
  params: ScanUnusedImagesParams
): Promise<ScanUnusedImagesResult> {
  if (!isTauriRuntime()) {
    return {
      scannedDirs: [],
      totalLocalImages: 0,
      unusedImages: [],
      totalUnusedBytes: 0,
    };
  }
  return invoke<ScanUnusedImagesResult>("scan_unused_local_images", {
    docPath: params.docPath,
    siteRoot: params.siteRoot ?? null,
    postAssetFolder: params.postAssetFolder,
    sourceDir: params.sourceDir ?? null,
    currentContent: params.currentContent,
  });
}

export async function deleteLocalImages(
  paths: string[],
  allowedDirs: string[]
): Promise<DeleteLocalImagesResult> {
  return invoke<DeleteLocalImagesResult>("delete_local_images", {
    paths,
    allowedDirs,
  });
}

export async function readLocalFileAsDataUri(filePath: string): Promise<string> {
  return invoke<string>("read_local_file_as_data_uri", { filePath });
}
