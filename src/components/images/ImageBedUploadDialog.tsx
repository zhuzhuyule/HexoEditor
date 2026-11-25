import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, getFileName } from "@/lib/utils";

export type ImageManagerTab = "upload" | "cleanup";

export type ImageBedSummaryProvider = "none" | "picgo" | "s3" | "oss" | "cos";

export type ImageUploadItemState = "pending" | "uploading" | "success" | "error";

export interface LocalDocumentImageItem {
  rawSrc: string;
  absolutePath: string;
  fileName?: string;
  sizeBytes?: number;
  previewUrl?: string;
}

export interface ImageUploadStatusItem {
  absolutePath: string;
  status: ImageUploadItemState;
  remoteUrl?: string | null;
  remoteKey?: string | null;
  error?: string | null;
}

export interface ImageBedConfigSummary {
  provider: ImageBedSummaryProvider;
  targetLabel?: string;
  configured: boolean;
  supportsRemoteDelete?: boolean;
  keepLocalAfterUpload?: boolean;
}

export interface LastUploadBatchInfo {
  uploadedCount: number;
  timestamp?: number;
  canDeleteRemote?: boolean;
  remoteKeyCount?: number;
}

export interface UnusedImageItem {
  absolutePath: string;
  fileName: string;
  sizeBytes: number;
  previewUrl?: string;
}

export interface ImageBedUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: ImageManagerTab;
  locale?: "zh-CN" | "en-US";

  // Tab 1: Batch Upload
  localImages: LocalDocumentImageItem[];
  imageBedConfig: ImageBedConfigSummary;
  uploadStatuses?: Record<string, ImageUploadStatusItem>;
  uploading?: boolean;
  onBatchUpload: (items: LocalDocumentImageItem[]) => void | Promise<void>;
  onOpenSettings?: () => void;

  // Undo recent upload
  lastUploadBatch?: LastUploadBatchInfo | null;
  undoing?: boolean;
  onUndoLastUpload?: (options: { deleteRemote: boolean }) => void | Promise<void>;

  // Tab 2: Unused Image Cleanup
  unusedImages: UnusedImageItem[];
  scanningUnused?: boolean;
  cleaningUnused?: boolean;
  onScanUnused?: () => void | Promise<void>;
  onDeleteUnused?: (paths: string[]) => void | Promise<void>;
}

const COPY = {
  "zh-CN": {
    title: "图片管理与图床上传",
    description: "将当前文章的本地图片批量上传至图床，或清理未被引用的冗余图片。",
    tabUpload: "批量上传图床",
    tabCleanup: "清理未引用图片",
    providerLabel: "当前图床",
    providers: {
      none: "仅本地存储",
      picgo: "PicGo / PicList",
      s3: "S3 兼容对象存储",
      oss: "阿里云 OSS",
      cos: "腾讯云 COS",
    },
    configured: "已就绪",
    unconfigured: "未配置",
    openSettings: "前往设置",
    unconfiguredHint: "尚未配置可用图床，请先在设置中心完成图床参数填写。",
    keepLocalYes: "上传后保留本地文件",
    keepLocalNo: "上传后移除本地引用原图",
    noLocalImages: "当前文章未检测到本地图片",
    noLocalImagesHint: "粘贴、拖拽或插入本地图片后，可在此一键批量上传至图床。",
    statusPending: "待上传",
    statusUploading: "上传中",
    statusSuccess: "已上传",
    statusError: "上传失败",
    batchUpload: "一键批量上传",
    uploadingBtn: "正在上传...",
    undoUpload: "撤销最近一次上传",
    undoingBtn: "正在撤销...",
    alsoDeleteRemote: "同时删除远端文件",
    uploadSummary: (total: number, success: number, failed: number) =>
      `共 ${total} 张本地图片${success > 0 ? ` · 成功 ${success}` : ""}${
        failed > 0 ? ` · 失败 ${failed}` : ""
      }`,
    scanSummary: (count: number, totalSize: string) =>
      `发现 ${count} 张未引用图片 · 共占用 ${totalSize}`,
    selectedSummary: (count: number, size: string) =>
      `已选 ${count} 张（预计释放 ${size}）`,
    selectAll: "全选",
    invertSelection: "反选",
    rescan: "重新扫描",
    scanning: "扫描中...",
    noUnusedImages: "没有发现未引用的冗余图片",
    noUnusedImagesHint: "当前文章图片目录中的图片均已被正文引用。",
    cleanSelected: (count: number) =>
      count > 0 ? `安全清理 (${count})` : "安全清理",
    cleaningBtn: "清理中...",
    confirmDeleteTitle: (count: number, size: string) =>
      `确认永久删除选中的 ${count} 张未引用图片（释放 ${size}）？`,
    confirmDeleteHint: "仅删除当前文章图片目录内的未引用文件，删除后无法恢复。",
    cancel: "取消",
    confirmDelete: "确认删除",
  },
  "en-US": {
    title: "Image Manager & Bed Upload",
    description:
      "Batch upload local images in this post to your image bed, or clean up unused local assets.",
    tabUpload: "Batch Upload",
    tabCleanup: "Unused Images",
    providerLabel: "Provider",
    providers: {
      none: "Local Only",
      picgo: "PicGo / PicList",
      s3: "S3 Compatible",
      oss: "Aliyun OSS",
      cos: "Tencent COS",
    },
    configured: "Ready",
    unconfigured: "Not Configured",
    openSettings: "Settings",
    unconfiguredHint:
      "Configure an image bed in Settings before uploading local images.",
    keepLocalYes: "Keep local files after upload",
    keepLocalNo: "Remove local originals after upload",
    noLocalImages: "No local images detected in this document",
    noLocalImagesHint:
      "Paste, drop, or insert local images to batch upload them here.",
    statusPending: "Pending",
    statusUploading: "Uploading",
    statusSuccess: "Uploaded",
    statusError: "Failed",
    batchUpload: "Upload All",
    uploadingBtn: "Uploading...",
    undoUpload: "Undo Last Upload",
    undoingBtn: "Undoing...",
    alsoDeleteRemote: "Also delete remote files",
    uploadSummary: (total: number, success: number, failed: number) =>
      `${total} local image${total === 1 ? "" : "s"}${
        success > 0 ? ` · ${success} uploaded` : ""
      }${failed > 0 ? ` · ${failed} failed` : ""}`,
    scanSummary: (count: number, totalSize: string) =>
      `${count} unused image${count === 1 ? "" : "s"} · ${totalSize} total`,
    selectedSummary: (count: number, size: string) =>
      `${count} selected (${size} reclaimable)`,
    selectAll: "Select all",
    invertSelection: "Invert",
    rescan: "Rescan",
    scanning: "Scanning...",
    noUnusedImages: "No unused images found",
    noUnusedImagesHint:
      "All local images in this post's asset folder are currently referenced.",
    cleanSelected: (count: number) =>
      count > 0 ? `Clean Selected (${count})` : "Clean Selected",
    cleaningBtn: "Cleaning...",
    confirmDeleteTitle: (count: number, size: string) =>
      `Permanently delete ${count} unused image${
        count === 1 ? "" : "s"
      } (${size})?`,
    confirmDeleteHint:
      "Only unreferenced images in the post asset directory will be deleted. This cannot be undone.",
    cancel: "Cancel",
    confirmDelete: "Confirm Delete",
  },
} as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return idx === 0 ? `${Math.round(value)} B` : `${value.toFixed(value >= 100 ? 0 : 1)} ${units[idx]}`;
}

export function ImageBedUploadDialog({
  open,
  onOpenChange,
  initialTab = "upload",
  locale = "zh-CN",
  localImages,
  imageBedConfig,
  uploadStatuses = {},
  uploading = false,
  onBatchUpload,
  onOpenSettings,
  lastUploadBatch = null,
  undoing = false,
  onUndoLastUpload,
  unusedImages,
  scanningUnused = false,
  cleaningUnused = false,
  onScanUnused,
  onDeleteUnused,
}: ImageBedUploadDialogProps) {
  const t = COPY[locale];

  const [activeTab, setActiveTab] = useState<ImageManagerTab>(initialTab);
  const [deleteRemoteOnUndo, setDeleteRemoteOnUndo] = useState(false);
  const [selectedUnusedPaths, setSelectedUnusedPaths] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Sync tab and transient confirmation state whenever the dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setConfirmingDelete(false);
      setDeleteRemoteOnUndo(false);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!lastUploadBatch || lastUploadBatch.uploadedCount <= 0) {
      setDeleteRemoteOnUndo(false);
    }
  }, [lastUploadBatch]);

  // Prune selected paths if unusedImages changes (e.g. after rescan or delete)
  useEffect(() => {
    const validSet = new Set(unusedImages.map((img) => img.absolutePath));
    setSelectedUnusedPaths((prev) => {
      const next = prev.filter((p) => validSet.has(p));
      return next.length === prev.length ? prev : next;
    });
  }, [unusedImages]);

  const uploadStats = useMemo(() => {
    let success = 0;
    let failed = 0;
    for (const img of localImages) {
      const st = uploadStatuses[img.absolutePath]?.status;
      if (st === "success") success += 1;
      else if (st === "error") failed += 1;
    }
    return { total: localImages.length, success, failed };
  }, [localImages, uploadStatuses]);

  const totalUnusedBytes = useMemo(
    () => unusedImages.reduce((sum, img) => sum + Math.max(0, img.sizeBytes), 0),
    [unusedImages]
  );

  const selectedUnusedSet = useMemo(
    () => new Set(selectedUnusedPaths),
    [selectedUnusedPaths]
  );

  const selectedUnusedBytes = useMemo(
    () =>
      unusedImages.reduce(
        (sum, img) =>
          selectedUnusedSet.has(img.absolutePath)
            ? sum + Math.max(0, img.sizeBytes)
            : sum,
        0
      ),
    [unusedImages, selectedUnusedSet]
  );

  const allUnusedSelected =
    unusedImages.length > 0 && selectedUnusedPaths.length === unusedImages.length;

  const canUpload =
    !uploading &&
    localImages.length > 0 &&
    imageBedConfig.provider !== "none" &&
    imageBedConfig.configured;

  const canShowUndo = Boolean(
    lastUploadBatch && lastUploadBatch.uploadedCount > 0 && onUndoLastUpload
  );

  const canDeleteRemoteOnUndo = Boolean(
    lastUploadBatch?.canDeleteRemote ?? imageBedConfig.supportsRemoteDelete
  );

  const handleToggleUnusedPath = (absPath: string) => {
    setConfirmingDelete(false);
    setSelectedUnusedPaths((prev) =>
      prev.includes(absPath)
        ? prev.filter((p) => p !== absPath)
        : [...prev, absPath]
    );
  };

  const handleToggleSelectAll = () => {
    setConfirmingDelete(false);
    if (allUnusedSelected) {
      setSelectedUnusedPaths([]);
    } else {
      setSelectedUnusedPaths(unusedImages.map((img) => img.absolutePath));
    }
  };

  const handleInvertSelection = () => {
    setConfirmingDelete(false);
    setSelectedUnusedPaths((prev) => {
      const current = new Set(prev);
      return unusedImages
        .map((img) => img.absolutePath)
        .filter((p) => !current.has(p));
    });
  };

  const handleConfirmDeleteUnused = async () => {
    if (!onDeleteUnused || selectedUnusedPaths.length === 0 || cleaningUnused) {
      return;
    }
    await onDeleteUnused(selectedUnusedPaths);
    setConfirmingDelete(false);
    setSelectedUnusedPaths([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[82vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        {/* Header & Tab Switcher */}
        <div className="shrink-0 border-b border-zinc-200/80 px-5 pt-5 pb-3">
          <DialogHeader className="mb-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <ImageIcon className="h-4 w-4 text-zinc-500" />
              {t.title}
            </DialogTitle>
            <DialogDescription>{t.description}</DialogDescription>
          </DialogHeader>

          <div
            role="tablist"
            aria-label={t.title}
            className="inline-flex items-center rounded-md border border-zinc-200/80 bg-zinc-100/80 p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "upload"}
              onClick={() => {
                setActiveTab("upload");
                setConfirmingDelete(false);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                activeTab === "upload"
                  ? "bg-white text-zinc-900 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              <CloudUpload className="h-3.5 w-3.5" />
              <span>{t.tabUpload}</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
                {localImages.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "cleanup"}
              onClick={() => {
                setActiveTab("cleanup");
                setConfirmingDelete(false);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                activeTab === "cleanup"
                  ? "bg-white text-zinc-900 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t.tabCleanup}</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
                {unusedImages.length}
              </span>
            </button>
          </div>
        </div>

        {/* Single Scrollable Body */}
        {activeTab === "upload" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Image Bed Config Summary Bar */}
            <div className="shrink-0 border-b border-zinc-100 bg-zinc-50/70 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium text-zinc-500">
                    {t.providerLabel}
                  </span>
                  <Badge variant="default">
                    {t.providers[imageBedConfig.provider]}
                  </Badge>
                  <Badge
                    variant={
                      imageBedConfig.configured &&
                      imageBedConfig.provider !== "none"
                        ? "emerald"
                        : "amber"
                    }
                  >
                    {imageBedConfig.configured &&
                    imageBedConfig.provider !== "none"
                      ? t.configured
                      : t.unconfigured}
                  </Badge>
                  {imageBedConfig.targetLabel && (
                    <span
                      className="max-w-[260px] truncate font-mono text-[11px] text-zinc-500"
                      title={imageBedConfig.targetLabel}
                    >
                      {imageBedConfig.targetLabel}
                    </span>
                  )}
                </div>

                {onOpenSettings && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={onOpenSettings}
                  >
                    <Settings2 className="h-3 w-3" />
                    {t.openSettings}
                  </Button>
                )}
              </div>

              {(!imageBedConfig.configured ||
                imageBedConfig.provider === "none") ? (
                <p className="mt-2 text-[11px] text-amber-700">
                  {t.unconfiguredHint}
                </p>
              ) : (
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>
                    {t.uploadSummary(
                      uploadStats.total,
                      uploadStats.success,
                      uploadStats.failed
                    )}
                  </span>
                  <span>
                    {imageBedConfig.keepLocalAfterUpload === false
                      ? t.keepLocalNo
                      : t.keepLocalYes}
                  </span>
                </div>
              )}
            </div>

            {/* Local Image List (Single Scroll Container) */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {localImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 py-10 text-center">
                  <ImageIcon className="mb-2 h-6 w-6 text-zinc-300" />
                  <div className="text-xs font-medium text-zinc-700">
                    {t.noLocalImages}
                  </div>
                  <p className="mt-1 max-w-xs text-[11px] text-zinc-400">
                    {t.noLocalImagesHint}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200/80 bg-white">
                  {localImages.map((img) => {
                    const entry = uploadStatuses[img.absolutePath];
                    const state: ImageUploadItemState = entry?.status ?? "pending";
                    const displayName =
                      img.fileName || getFileName(img.absolutePath || img.rawSrc);

                    return (
                      <li
                        key={img.absolutePath}
                        data-upload-status={state}
                        className="flex items-start justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-medium text-zinc-800">
                              {displayName}
                            </span>
                            {typeof img.sizeBytes === "number" && (
                              <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                                {formatBytes(img.sizeBytes)}
                              </span>
                            )}
                          </div>
                          <div
                            className="mt-0.5 truncate font-mono text-[11px] text-zinc-400"
                            title={img.rawSrc}
                          >
                            {img.rawSrc}
                          </div>
                          {state === "success" && entry?.remoteUrl && (
                            <div
                              className="mt-1 truncate font-mono text-[11px] text-emerald-700"
                              title={entry.remoteUrl}
                            >
                              {entry.remoteUrl}
                            </div>
                          )}
                          {state === "error" && entry?.error && (
                            <div className="mt-1 text-[11px] text-red-600">
                              {entry.error}
                            </div>
                          )}
                        </div>

                        <div className="shrink-0 pt-0.5">
                          {state === "pending" && (
                            <Badge variant="subtle">{t.statusPending}</Badge>
                          )}
                          {state === "uploading" && (
                            <Badge variant="outline">
                              <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
                              {t.statusUploading}
                            </Badge>
                          )}
                          {state === "success" && (
                            <Badge variant="emerald">
                              <CheckCircle2 className="h-3 w-3" />
                              {t.statusSuccess}
                            </Badge>
                          )}
                          {state === "error" && (
                            <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-medium leading-none text-red-700">
                              <AlertCircle className="h-3 w-3" />
                              {t.statusError}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Tab 1 Footer */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-200/80 bg-zinc-50/50 px-5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                {canShowUndo && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={undoing || uploading}
                      onClick={() =>
                        void onUndoLastUpload?.({
                          deleteRemote:
                            canDeleteRemoteOnUndo && deleteRemoteOnUndo,
                        })
                      }
                    >
                      {undoing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      {undoing
                        ? t.undoingBtn
                        : `${t.undoUpload} (${lastUploadBatch!.uploadedCount})`}
                    </Button>

                    {canDeleteRemoteOnUndo && (
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-600 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deleteRemoteOnUndo}
                          disabled={undoing || uploading}
                          onChange={(e) =>
                            setDeleteRemoteOnUndo(e.target.checked)
                          }
                          className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900 cursor-pointer"
                        />
                        <span>{t.alsoDeleteRemote}</span>
                      </label>
                    )}
                  </>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                disabled={!canUpload}
                onClick={() => void onBatchUpload(localImages)}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CloudUpload className="h-3.5 w-3.5" />
                )}
                {uploading ? t.uploadingBtn : t.batchUpload}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Unused Images Summary & Selection Controls */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/70 px-5 py-2.5">
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600">
                <label className="inline-flex items-center gap-1.5 font-medium text-zinc-700 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    aria-label={t.selectAll}
                    checked={allUnusedSelected}
                    disabled={unusedImages.length === 0 || cleaningUnused}
                    onChange={handleToggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-900 cursor-pointer"
                  />
                  <span>{t.selectAll}</span>
                </label>

                <button
                  type="button"
                  disabled={unusedImages.length === 0 || cleaningUnused}
                  onClick={handleInvertSelection}
                  className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-40 cursor-pointer"
                >
                  {t.invertSelection}
                </button>

                <span className="text-zinc-400">
                  {t.scanSummary(
                    unusedImages.length,
                    formatBytes(totalUnusedBytes)
                  )}
                </span>
              </div>

              {onScanUnused && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={scanningUnused || cleaningUnused}
                  onClick={() => {
                    setConfirmingDelete(false);
                    void onScanUnused();
                  }}
                >
                  <RefreshCw
                    className={cn(
                      "h-3 w-3",
                      scanningUnused && "animate-spin"
                    )}
                  />
                  {scanningUnused ? t.scanning : t.rescan}
                </Button>
              )}
            </div>

            {/* Unused Images List (Single Scroll Container) */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {unusedImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 py-10 text-center">
                  <CheckCircle2 className="mb-2 h-6 w-6 text-emerald-500/70" />
                  <div className="text-xs font-medium text-zinc-700">
                    {t.noUnusedImages}
                  </div>
                  <p className="mt-1 max-w-xs text-[11px] text-zinc-400">
                    {t.noUnusedImagesHint}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200/80 bg-white">
                  {unusedImages.map((img) => {
                    const checked = selectedUnusedSet.has(img.absolutePath);
                    return (
                      <li key={img.absolutePath}>
                        <label
                          className={cn(
                            "flex items-center justify-between gap-3 px-3 py-2.5 transition-colors cursor-pointer",
                            checked ? "bg-zinc-50" : "hover:bg-zinc-50/60"
                          )}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={cleaningUnused}
                              onChange={() =>
                                handleToggleUnusedPath(img.absolutePath)
                              }
                              className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 accent-zinc-900 cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium text-zinc-800">
                                {img.fileName}
                              </div>
                              <div
                                className="truncate font-mono text-[11px] text-zinc-400"
                                title={img.absolutePath}
                              >
                                {img.absolutePath}
                              </div>
                            </div>
                          </div>

                          <span className="shrink-0 font-mono text-[11px] text-zinc-500">
                            {formatBytes(img.sizeBytes)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Tab 2 Footer with Safe Secondary Confirmation */}
            <div className="shrink-0 border-t border-zinc-200/80 bg-zinc-50/50 px-5 py-3">
              {confirmingDelete ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50/70 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-red-800">
                      {t.confirmDeleteTitle(
                        selectedUnusedPaths.length,
                        formatBytes(selectedUnusedBytes)
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-red-700/80">
                      {t.confirmDeleteHint}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={cleaningUnused}
                      onClick={() => setConfirmingDelete(false)}
                    >
                      {t.cancel}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      disabled={cleaningUnused}
                      onClick={() => void handleConfirmDeleteUnused()}
                    >
                      {cleaningUnused && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {cleaningUnused ? t.cleaningBtn : t.confirmDelete}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-zinc-500">
                    {t.selectedSummary(
                      selectedUnusedPaths.length,
                      formatBytes(selectedUnusedBytes)
                    )}
                  </span>

                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={
                      selectedUnusedPaths.length === 0 ||
                      cleaningUnused ||
                      !onDeleteUnused
                    }
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.cleanSelected(selectedUnusedPaths.length)}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
