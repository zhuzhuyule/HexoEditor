import { getVersion as getTauriAppVersion } from "@tauri-apps/api/app";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  BookOpen,
  CloudUpload,
  Columns2,
  Download,
  Eraser,
  ExternalLink,
  FileCode2,
  FileEdit,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Globe,
  Hammer,
  Hash,
  Image,
  Images,
  Link2,
  ListTree,
  Maximize2,
  Minimize2,
  Palette,
  PanelLeft,
  PenLine,
  Play,
  PlugZap,
  Printer,
  RefreshCw,
  Rocket,
  Save,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import {
  AiAssistantDrawer,
  type AiPendingAction,
} from "@/components/ai/AiAssistantDrawer";
import { InlineAiPopover } from "@/components/ai/InlineAiPopover";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "@/components/command/CommandPalette";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { FrontMatterBar } from "@/components/editor/FrontMatterBar";
import {
  MarkdownEditor,
  type EditorSelectionChange,
  type MarkdownEditorHandle,
} from "@/components/editor/MarkdownEditor";
import {
  formatBytes,
  ImageBedUploadDialog,
  type ImageBedConfigSummary,
  type ImageManagerTab,
  type ImageUploadStatusItem,
  type LastUploadBatchInfo,
  type LocalDocumentImageItem,
  type UnusedImageItem,
} from "@/components/images/ImageBedUploadDialog";
import { ExternalChangeBanner } from "@/components/layout/ExternalChangeBanner";
import { ToastHost } from "@/components/layout/ToastHost";
import {
  WelcomePane,
  type WelcomeRecentEntry,
} from "@/components/layout/WelcomePane";
import {
  ImageRenameDialog,
  type SelectedLocalImage,
} from "@/components/preview/ImageRenameDialog";
import { LiveSitePreview } from "@/components/preview/LiveSitePreview";
import {
  MarkdownPreview,
  scopePreviewThemeCss,
  type MarkdownPreviewHandle,
} from "@/components/preview/MarkdownPreview";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { NewPostDialog } from "@/components/sidebar/NewPostDialog";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { TabBar } from "@/components/tabs/TabBar";
import {
  HexoTerminalDrawer,
  type HexoCliAction,
} from "@/components/terminal/HexoTerminalDrawer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildStandaloneHtmlDocument } from "@/lib/export/htmlExport";
import { triggerDocumentPrint } from "@/lib/export/printPdf";
import { parseMarkdownDocument, updateFrontMatterInMarkdown } from "@/lib/frontmatter";
import { formatMessage, getMessages } from "@/lib/i18n";
import { buildHexoPostUrl } from "@/lib/markdown/permalink";
import {
  extractLocalImageSrcs,
  renderMarkdownToHtml,
  type LocalImageEntry,
} from "@/lib/markdown/renderer";
import * as api from "@/lib/tauri/api";
import * as hexoApi from "@/lib/tauri/hexoApi";
import * as imageBedApi from "@/lib/tauri/imageBedApi";
import {
  cn,
  formatMarkdownImageSnippet,
  getFileName,
  isMacPlatform,
} from "@/lib/utils";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  useAppStore,
} from "@/stores/useAppStore";
import {
  DEFAULT_AI_SETTINGS,
  type AiPromptAction,
  type SuggestedFrontMatter,
} from "@/types/ai";
import type { ImageBedSettings, SettingsSectionId } from "@/types/settings";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const MD_EXT_RE = /\.(md|markdown|mdx)$/i;

function summarizeImageBed(settings: ImageBedSettings): ImageBedConfigSummary {
  const provider = settings.provider;
  if (provider === "none") {
    return {
      provider: "none",
      configured: false,
      supportsRemoteDelete: false,
      keepLocalAfterUpload: settings.keepLocalAfterUpload,
    };
  }
  if (provider === "picgo") {
    const url = settings.picgoUrl.trim();
    return {
      provider: "picgo",
      targetLabel: url || undefined,
      configured: Boolean(url),
      supportsRemoteDelete: false,
      keepLocalAfterUpload: settings.keepLocalAfterUpload,
    };
  }
  const hasCreds = Boolean(
    settings.bucket.trim() &&
      settings.accessKeyId.trim() &&
      settings.secretAccessKey.trim() &&
      (settings.endpoint.trim() || settings.region.trim())
  );
  return {
    provider,
    targetLabel:
      settings.customDomain.trim() ||
      settings.bucket.trim() ||
      settings.endpoint.trim() ||
      undefined,
    configured: hasCreds,
    supportsRemoteDelete: true,
    keepLocalAfterUpload: settings.keepLocalAfterUpload,
  };
}

export function App() {
  const {
    hydrated,
    locale,
    setLocale,
    sidebarOpen,
    toggleSidebar,
    setSidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    setSidebarTab,
    sites,
    activeSiteRoot,
    siteConfig,
    posts,
    tabs,
    activeTabId,
    setActiveTab,
    viewMode,
    setViewMode,
    exitFocusMode,
    syncScroll,
    setSyncScroll,
    autoSave,
    setAutoSave,
    showToolbar,
    setShowToolbar,
    toggleToolbar,
    showLineNumbers,
    setShowLineNumbers,
    toggleLineNumbers,
    recentEntries,
    clearRecentEntries,
    enableHexoTags,
    setEnableHexoTags,
    themeCss,
    themeCssLabel,
    loadSiteThemeCssAction,
    importCustomThemeCssAction,
    clearThemeCssAction,
    previewSource,
    setPreviewSource,
    hexoCliStatus,
    hexoLogs,
    terminalOpen,
    setTerminalOpen,
    setHexoCliStatus,
    appendHexoLog,
    clearHexoLogs,
    runHexoAction,
    stopHexoAction,
    killHexoPort,
    openQuickOpenTarget,
    editorPrefs,
    setEditorPrefs,
    resetEditorPrefs,
    imageBed,
    setImageBed,
    aiSettings,
    setAiSettings,
    discoveredAgents,
    discoverAgents,
    lastUploadBatches,
    uploadTabImagesToBed,
    undoLastTabUpload,
    hydrate,
    addSite,
    switchSite,
    refreshActiveSite,
    openPost,
    updateTabContent,
    updateTabCursor,
    saveTab,
    saveTabAs,
    saveAllTabs,
    closeTab,
    openStandaloneFile,
    createScratchTab,
    handleExternalChange,
    pushToast,
  } = useAppStore();

  const msg = getMessages(locale);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const isMacTauri =
    api.isTauriRuntime() &&
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent);
  const useOverlayTitleBar =
    isMacTauri && (editorPrefs.titleBarMode ?? "overlay") === "overlay";

  const prevTitleBarModeRef = useRef<"overlay" | "system">("overlay");
  useEffect(() => {
    if (!api.isTauriRuntime() || !hydrated) return;
    const mode = editorPrefs.titleBarMode ?? "overlay";
    if (mode === prevTitleBarModeRef.current) return;
    prevTitleBarModeRef.current = mode;
    void api.setWindowTitleBarMode(mode);
  }, [hydrated, editorPrefs.titleBarMode]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.uiFontSize =
      editorPrefs.uiFontSize ?? "md";
  }, [editorPrefs.uiFontSize]);

  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const previewRef = useRef<MarkdownPreviewHandle | null>(null);
  const pendingAutoOpenServerRef = useRef(false);
  const prevServerRunningRef = useRef(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const lastCloseShortcutRef = useRef<{
    source: "menu" | "keydown";
    at: number;
  }>({ source: "keydown", at: -Infinity });

  const [newPostOpen, setNewPostOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>("general");
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiPendingAction, setAiPendingAction] =
    useState<AiPendingAction | null>(null);
  const [inlineAiOpen, setInlineAiOpen] = useState(false);
  const [editorSelection, setEditorSelection] =
    useState<EditorSelectionChange | null>(null);
  const [appVersion, setAppVersion] = useState("2.0.0-beta.1");
  const [imageManagerOpen, setImageManagerOpen] = useState(false);
  const [imageManagerTab, setImageManagerTab] =
    useState<ImageManagerTab>("upload");
  const [closeConfirmTabId, setCloseConfirmTabId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedLocalImage | null>(
    null
  );
  const [imageVersion, setImageVersion] = useState(0);
  const [draggingSidebarWidth, setDraggingSidebarWidth] = useState<
    number | null
  >(null);
  const sidebarResizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      sidebarResizeCleanupRef.current?.();
      sidebarResizeCleanupRef.current = null;
    };
  }, []);

  const handleSidebarResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      sidebarResizeCleanupRef.current?.();

      const startX = e.clientX;
      const startWidth = useAppStore.getState().sidebarWidth;
      let latestWidth = startWidth;
      setDraggingSidebarWidth(startWidth);

      const prevUserSelect = document.body.style.userSelect;
      const prevCursor = document.body.style.cursor;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        latestWidth = clampSidebarWidth(
          startWidth + (moveEvent.clientX - startX)
        );
        setDraggingSidebarWidth(latestWidth);
      };

      const cleanup = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = prevUserSelect;
        document.body.style.cursor = prevCursor;
        if (sidebarResizeCleanupRef.current === cleanup) {
          sidebarResizeCleanupRef.current = null;
        }
      };

      const handleMouseUp = () => {
        cleanup();
        setDraggingSidebarWidth(null);
        setSidebarWidth(latestWidth);
      };

      sidebarResizeCleanupRef.current = cleanup;
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [setSidebarWidth]
  );

  // Image manager modal runtime states
  const [localDocImages, setLocalDocImages] = useState<LocalDocumentImageItem[]>(
    []
  );
  const [uploadStatuses, setUploadStatuses] = useState<
    Record<string, ImageUploadStatusItem>
  >({});
  const [uploadingImages, setUploadingImages] = useState(false);
  const [undoingUpload, setUndoingUpload] = useState(false);
  const [unusedImages, setUnusedImages] = useState<UnusedImageItem[]>([]);
  const [unusedAllowedDirs, setUnusedAllowedDirs] = useState<string[]>([]);
  const [scanningUnused, setScanningUnused] = useState(false);
  const [cleaningUnused, setCleaningUnused] = useState(false);

  const openSettingsModal = useCallback(
    (section: SettingsSectionId = "general") => {
      setSettingsSection(section);
      setSettingsOpen(true);
    },
    []
  );

  const triggerAiAction = useCallback((action?: AiPromptAction) => {
    setAiDrawerOpen(true);
    if (action) {
      setAiPendingAction({ action, nonce: Date.now() + Math.random() });
    }
  }, []);

  const aiEditorSelection = useMemo(() => {
    if (!aiDrawerOpen || !activeTab) {
      return { text: "", hasSelection: false };
    }
    const view = editorRef.current?.getView();
    if (!view) return { text: "", hasSelection: false };
    const range = view.state.selection.main;
    if (range.empty) return { text: "", hasSelection: false };
    return {
      text: view.state.sliceDoc(range.from, range.to),
      hasSelection: true,
    };
  }, [
    aiDrawerOpen,
    activeTab?.id,
    activeTab?.content,
    activeTab?.cursorLine,
    activeTab?.cursorCol,
  ]);

  const aiTerminalLogLines = useMemo(
    () =>
      hexoLogs
        .slice(-60)
        .map((entry) => `[${entry.stream}] ${entry.line}`),
    [hexoLogs]
  );

  const handleApplyAiTextToEditor = useCallback(
    (text: string, mode: "replace-selection" | "insert-cursor") => {
      if (!activeTab) return;
      const view = editorRef.current?.getView();
      if (view) {
        const range = view.state.selection.main;
        const from = mode === "replace-selection" ? range.from : range.to;
        const to = mode === "replace-selection" ? range.to : range.to;
        view.focus();
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from, head: from + text.length },
        });
      } else {
        const next = activeTab.content
          ? `${activeTab.content.trimEnd()}\n\n${text}`
          : text;
        updateTabContent(activeTab.id, next);
      }
      pushToast(msg.toast.aiTextApplied, "success");
    },
    [activeTab, msg.toast.aiTextApplied, pushToast, updateTabContent]
  );

  const handleApplyAiFrontMatter = useCallback(
    (suggested: SuggestedFrontMatter) => {
      if (!activeTab) return;
      const next = updateFrontMatterInMarkdown(activeTab.content, (cur) => ({
        ...cur,
        title: suggested.title ?? cur.title,
        categories:
          suggested.categories && suggested.categories.length > 0
            ? suggested.categories
            : cur.categories,
        tags:
          suggested.tags && suggested.tags.length > 0
            ? suggested.tags
            : cur.tags,
        extra: suggested.description
          ? { ...cur.extra, description: suggested.description }
          : cur.extra,
      }));
      updateTabContent(activeTab.id, next);
      pushToast(msg.toast.aiFrontMatterApplied, "success");
    },
    [activeTab, msg.toast.aiFrontMatterApplied, pushToast, updateTabContent]
  );

  // Hydrate persisted state & active Hexo site on boot
  useEffect(() => {
    void hydrate();
    if (api.isTauriRuntime()) {
      void getTauriAppVersion()
        .then((v) => {
          if (v && v.trim()) setAppVersion(v.trim());
        })
        .catch(() => {});
    }
  }, [hydrate]);

  // Reset inline AI popover & cached selection on tab switch or entering read mode
  useEffect(() => {
    setInlineAiOpen(false);
    setEditorSelection(null);
  }, [activeTabId]);

  useEffect(() => {
    if (viewMode === "read") {
      setInlineAiOpen(false);
      setEditorSelection(null);
    }
  }, [viewMode]);

  // Listen for Rust file-watcher external change events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void api
      .listenExternalFileChanges((event) => {
        handleExternalChange(event);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [handleExternalChange]);

  // Subscribe to Rust Hexo CLI output & status events and sync initial status
  useEffect(() => {
    let cancelled = false;
    let unlistenOutput: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    void hexoApi
      .getHexoCliStatus()
      .then((status) => {
        if (!cancelled) setHexoCliStatus(status);
      })
      .catch(() => {});

    void hexoApi
      .listenHexoCliOutput((event) => {
        appendHexoLog(event);
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlistenOutput = fn;
      });

    void hexoApi
      .listenHexoCliStatus((status) => {
        setHexoCliStatus(status);
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlistenStatus = fn;
      });

    return () => {
      cancelled = true;
      unlistenOutput?.();
      unlistenStatus?.();
    };
  }, [appendHexoLog, setHexoCliStatus]);

  // Insert a saved image markdown snippet at current editor cursor
  const insertSavedImage = useCallback(
    (markdownPath: string, deduplicated: boolean, appendNewline = false) => {
      const snippet = formatMarkdownImageSnippet(markdownPath);
      editorRef.current?.insertText(appendNewline ? `${snippet}\n` : snippet);
      setImageVersion((v) => v + 1);
      pushToast(
        deduplicated ? msg.toast.imageDeduplicated : msg.toast.imagePasted,
        "success"
      );
    },
    [msg.toast.imageDeduplicated, msg.toast.imagePasted, pushToast]
  );

  // Handle clipboard / DOM-dropped image bytes
  const handlePasteImageBytes = useCallback(
    async (
      bytes: number[],
      extension: string | null,
      preferredName: string | null,
      appendNewline = false
    ): Promise<boolean> => {
      const tab = useAppStore
        .getState()
        .tabs.find((t) => t.id === useAppStore.getState().activeTabId);
      if (!tab) return false;
      if (!tab.filePath) {
        pushToast(msg.toast.needSaveForImage, "info");
        return false;
      }
      const targetTabId = tab.id;
      try {
        const res = await api.saveImageBytes({
          docPath: tab.filePath,
          siteRoot: tab.siteRoot,
          postAssetFolder: tab.postAssetFolder,
          sourceDir: tab.sourceDir,
          bytes,
          extension,
          preferredName,
        });
        if (useAppStore.getState().activeTabId !== targetTabId) {
          return false;
        }
        insertSavedImage(res.markdownPath, res.deduplicated, appendNewline);
        return true;
      } catch (err) {
        pushToast(String(err), "error");
        return true;
      }
    },
    [insertSavedImage, msg.toast.needSaveForImage, pushToast]
  );

  // Handle toolbar / shortcut "Insert Local Image" picker
  const handleInsertLocalImagePicker = useCallback(async () => {
    const tab = useAppStore
      .getState()
      .tabs.find((t) => t.id === useAppStore.getState().activeTabId);
    if (!tab) return;
    if (!tab.filePath) {
      pushToast(msg.toast.needSaveForImage, "info");
      return;
    }
    const targetTabId = tab.id;
    const files = await api.pickImageFiles(msg.toolbar.image);
    if (files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      if (useAppStore.getState().activeTabId !== targetTabId) break;
      const srcPath = files[i];
      try {
        const res = await api.importLocalImageFile({
          docPath: tab.filePath,
          siteRoot: tab.siteRoot,
          postAssetFolder: tab.postAssetFolder,
          sourceDir: tab.sourceDir,
          sourceImagePath: srcPath,
        });
        if (useAppStore.getState().activeTabId !== targetTabId) break;
        insertSavedImage(res.markdownPath, res.deduplicated, i < files.length - 1);
      } catch (err) {
        pushToast(String(err), "error");
      }
    }
  }, [insertSavedImage, msg.toast.needSaveForImage, msg.toolbar.image, pushToast]);

  // Listen for Tauri native OS file drag-and-drop
  useEffect(() => {
    if (!api.isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent(async (event) => {
        if (event.payload.type !== "drop") return;
        const paths = event.payload.paths;
        const droppedImages = paths.filter((p) => IMAGE_EXT_RE.test(p));
        let imageIdx = 0;
        let warnedUnsaved = false;
        for (const p of paths) {
          if (MD_EXT_RE.test(p)) {
            await openStandaloneFile(p);
          } else if (IMAGE_EXT_RE.test(p)) {
            const currentIdx = imageIdx++;
            const state = useAppStore.getState();
            const tab = state.tabs.find((t) => t.id === state.activeTabId);
            if (!tab) continue;
            if (!tab.filePath) {
              if (!warnedUnsaved) {
                warnedUnsaved = true;
                pushToast(msg.toast.needSaveForImage, "info");
              }
              continue;
            }
            const targetTabId = tab.id;
            try {
              const res = await api.importLocalImageFile({
                docPath: tab.filePath,
                siteRoot: tab.siteRoot,
                postAssetFolder: tab.postAssetFolder,
                sourceDir: tab.sourceDir,
                sourceImagePath: p,
              });
              if (useAppStore.getState().activeTabId !== targetTabId) continue;
              insertSavedImage(
                res.markdownPath,
                res.deduplicated,
                currentIdx < droppedImages.length - 1
              );
            } catch (err) {
              pushToast(String(err), "error");
            }
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [insertSavedImage, msg.toast.needSaveForImage, openStandaloneFile, pushToast]);

  const handleRequestCloseTab = useCallback(
    (tabId: string) => {
      const tab = useAppStore.getState().tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (tab.isDirty) {
        setCloseConfirmTabId(tabId);
      } else {
        closeTab(tabId);
      }
    },
    [closeTab]
  );

  const triggerShortcutCloseActiveTab = useCallback(
    (source: "menu" | "keydown") => {
      const now = performance.now();
      if (
        lastCloseShortcutRef.current.source !== source &&
        now - lastCloseShortcutRef.current.at < 100
      ) {
        return;
      }
      lastCloseShortcutRef.current = { source, at: now };
      const currentActiveTabId = useAppStore.getState().activeTabId;
      if (currentActiveTabId) {
        handleRequestCloseTab(currentActiveTabId);
      }
    },
    [handleRequestCloseTab]
  );

  // Listen for native menu "Close Tab" (Cmd/Ctrl+W) events from Tauri backend
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void api
      .listenMenuCloseTab(() => {
        triggerShortcutCloseActiveTab("menu");
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [triggerShortcutCloseActiveTab]);

  // Debounced auto-save when enabled
  useEffect(() => {
    if (!autoSave || !activeTab || !activeTab.isDirty || !activeTab.filePath) {
      return;
    }
    const timer = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void saveTab(activeTab.id, true);
    }, 1500);
    autoSaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autoSaveTimerRef.current === timer) {
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    autoSave,
    activeTab?.id,
    activeTab?.content,
    activeTab?.isDirty,
    activeTab?.filePath,
    saveTab,
  ]);

  // Immediately flush pending auto-save on window blur
  useEffect(() => {
    const handleWindowBlur = () => {
      const state = useAppStore.getState();
      if (!state.autoSave || !state.activeTabId) return;
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab || !tab.isDirty || !tab.filePath) return;
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      void state.saveTab(tab.id, true);
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, []);

  // Re-measure CodeMirror layout on viewMode changes & prevent hidden edits in read mode
  useEffect(() => {
    const view = editorRef.current?.getView();
    if (!view) return;
    if (viewMode === "read") {
      if (view.hasFocus) {
        view.contentDOM.blur();
      }
    } else {
      view.requestMeasure();
    }
  }, [viewMode]);

  // Global keyboard shortcuts (capture phase ensures Cmd/Ctrl+K and Cmd/Ctrl+, work inside CodeMirror)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Cmd/Ctrl + K -> Command Palette
      if (mod && !e.shiftKey && !e.altKey && (key === "k" || e.code === "KeyK")) {
        e.preventDefault();
        e.stopPropagation();
        setCommandPaletteOpen((open) => !open);
        return;
      }

      // Cmd/Ctrl + , -> Settings Center
      if (mod && !e.shiftKey && !e.altKey && (e.key === "," || e.code === "Comma")) {
        e.preventDefault();
        e.stopPropagation();
        setSettingsOpen((open) => !open);
        return;
      }

      if (
        e.key === "Escape" &&
        viewMode === "focus" &&
        !commandPaletteOpen &&
        !settingsOpen &&
        !imageManagerOpen &&
        !closeConfirmTabId &&
        !newPostOpen &&
        !selectedImage &&
        !inlineAiOpen
      ) {
        e.preventDefault();
        exitFocusMode();
        return;
      }

      if (!mod) return;

      // Cmd/Ctrl + I -> Inline AI Rewrite & Diff Popover
      if (!e.shiftKey && !e.altKey && (key === "i" || e.code === "KeyI")) {
        const currentTab = useAppStore
          .getState()
          .tabs.find((t) => t.id === useAppStore.getState().activeTabId);
        if (currentTab && !currentTab.isLoading && viewMode !== "read") {
          e.preventDefault();
          e.stopPropagation();
          setInlineAiOpen((open) => !open);
        }
        return;
      }

      // Support both Cmd/Ctrl+Shift+1..4 and Cmd/Ctrl+Option/Alt+1..4
      const isViewModeModifier =
        (e.shiftKey && !e.altKey) || (e.altKey && !e.shiftKey);
      if (isViewModeModifier) {
        if (e.code === "Digit1" || e.key === "1" || e.key === "!") {
          e.preventDefault();
          setViewMode("write");
          return;
        }
        if (e.code === "Digit2" || e.key === "2" || e.key === "@") {
          e.preventDefault();
          setViewMode("split");
          return;
        }
        if (e.code === "Digit3" || e.key === "3" || e.key === "#") {
          e.preventDefault();
          setViewMode("read");
          return;
        }
        if (e.code === "Digit4" || e.key === "4" || e.key === "$") {
          e.preventDefault();
          setViewMode("focus");
          return;
        }
      }

      // Cmd/Ctrl + Alt/Option + S -> Save All Modified Tabs
      if (e.altKey && !e.shiftKey && (key === "s" || e.code === "KeyS")) {
        e.preventDefault();
        void saveAllTabs();
        return;
      }

      if (key === "s" && e.shiftKey) {
        e.preventDefault();
        if (activeTabId) void saveTabAs(activeTabId);
      } else if (key === "s") {
        e.preventDefault();
        if (activeTabId) void saveTab(activeTabId);
      } else if ((key === "w" || e.code === "KeyW") && !e.shiftKey && !e.altKey) {
        if (activeTabId) {
          e.preventDefault();
          triggerShortcutCloseActiveTab("keydown");
        }
      } else if (key === "\\") {
        e.preventDefault();
        toggleSidebar();
      } else if (key === "o") {
        e.preventDefault();
        void api.pickMarkdownFile(msg.sidebar.openFile).then((p) => {
          if (p) void openStandaloneFile(p);
        });
      } else if (key === "n") {
        e.preventDefault();
        if (activeSiteRoot) {
          setNewPostOpen(true);
        } else {
          createScratchTab();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    activeSiteRoot,
    activeTabId,
    closeConfirmTabId,
    commandPaletteOpen,
    createScratchTab,
    exitFocusMode,
    imageManagerOpen,
    inlineAiOpen,
    msg.sidebar.openFile,
    newPostOpen,
    openStandaloneFile,
    saveAllTabs,
    saveTab,
    saveTabAs,
    selectedImage,
    settingsOpen,
    setViewMode,
    toggleSidebar,
    triggerShortcutCloseActiveTab,
    viewMode,
  ]);

  // Image Manager data loaders
  const refreshLocalDocImages = useCallback(async () => {
    const tab = useAppStore
      .getState()
      .tabs.find((t) => t.id === useAppStore.getState().activeTabId);
    if (!tab) {
      setLocalDocImages([]);
      return;
    }
    const parsed = parseMarkdownDocument(tab.content);
    const srcs = extractLocalImageSrcs(parsed.body, {
      enableHexoTags: useAppStore.getState().enableHexoTags,
    });
    if (srcs.length === 0) {
      setLocalDocImages([]);
      return;
    }
    try {
      const resolved = await api.resolveLocalImages({
        docPath: tab.filePath,
        siteRoot: tab.siteRoot,
        sourceDir: tab.sourceDir,
        srcs,
      });
      const items: LocalDocumentImageItem[] = [];
      for (const entry of resolved) {
        if (entry.exists && entry.absolutePath) {
          items.push({
            rawSrc: entry.rawSrc,
            absolutePath: entry.absolutePath,
            fileName: getFileName(entry.absolutePath),
            previewUrl: api.toAssetUrl(entry.absolutePath),
          });
        }
      }
      setLocalDocImages(items);
    } catch {
      setLocalDocImages([]);
    }
  }, []);

  const handleScanUnusedImages = useCallback(async () => {
    const tab = useAppStore
      .getState()
      .tabs.find((t) => t.id === useAppStore.getState().activeTabId);
    if (!tab?.filePath) {
      setUnusedImages([]);
      setUnusedAllowedDirs([]);
      return;
    }
    setScanningUnused(true);
    try {
      const res = await imageBedApi.scanUnusedLocalImages({
        docPath: tab.filePath,
        siteRoot: tab.siteRoot,
        postAssetFolder: tab.postAssetFolder,
        sourceDir: tab.sourceDir,
        currentContent: tab.content,
      });
      setUnusedAllowedDirs(res.scannedDirs);
      setUnusedImages(
        res.unusedImages.map((img) => ({
          absolutePath: img.absolutePath,
          fileName: img.fileName,
          sizeBytes: img.sizeBytes,
          previewUrl: api.toAssetUrl(img.absolutePath),
        }))
      );
    } catch (err) {
      pushToast(String(err), "error");
    } finally {
      setScanningUnused(false);
    }
  }, [pushToast]);

  const openImageManagerModal = useCallback(
    (tab: ImageManagerTab = "upload") => {
      setImageManagerTab(tab);
      setUploadStatuses({});
      setImageManagerOpen(true);
      void refreshLocalDocImages();
      void handleScanUnusedImages();
    },
    [handleScanUnusedImages, refreshLocalDocImages]
  );

  const handleBatchUploadImages = useCallback(
    async (items: LocalDocumentImageItem[]) => {
      const currentTabId = useAppStore.getState().activeTabId;
      if (!currentTabId || items.length === 0) return;

      const initialStatuses: Record<string, ImageUploadStatusItem> = {};
      for (const item of items) {
        initialStatuses[item.absolutePath] = {
          absolutePath: item.absolutePath,
          status: "uploading",
        };
      }
      setUploadStatuses(initialStatuses);
      setUploadingImages(true);
      try {
        const res = await uploadTabImagesToBed(
          currentTabId,
          items.map((item) => ({
            rawSrc: item.rawSrc,
            absolutePath: item.absolutePath,
          }))
        );
        if (res) {
          const nextStatuses: Record<string, ImageUploadStatusItem> = {};
          for (const item of res.items) {
            nextStatuses[item.localPath] = {
              absolutePath: item.localPath,
              status: item.success ? "success" : "error",
              remoteUrl: item.remoteUrl,
              remoteKey: item.remoteKey,
              error: item.error,
            };
          }
          setUploadStatuses(nextStatuses);
          setImageVersion((v) => v + 1);
          await refreshLocalDocImages();
        }
      } finally {
        setUploadingImages(false);
      }
    },
    [refreshLocalDocImages, uploadTabImagesToBed]
  );

  const handleUndoLastUpload = useCallback(
    async (options: { deleteRemote: boolean }) => {
      const currentTabId = useAppStore.getState().activeTabId;
      if (!currentTabId) return;
      setUndoingUpload(true);
      try {
        await undoLastTabUpload(currentTabId, options);
        setImageVersion((v) => v + 1);
        await refreshLocalDocImages();
      } finally {
        setUndoingUpload(false);
      }
    },
    [refreshLocalDocImages, undoLastTabUpload]
  );

  const handleDeleteUnusedImages = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      setCleaningUnused(true);
      try {
        const res = await imageBedApi.deleteLocalImages(paths, unusedAllowedDirs);
        pushToast(
          formatMessage(msg.imageBed.cleanupSuccess, {
            count: res.deletedCount,
            size: formatBytes(res.freedBytes),
          }),
          "success"
        );
        await handleScanUnusedImages();
      } catch (err) {
        pushToast(String(err), "error");
      } finally {
        setCleaningUnused(false);
      }
    },
    [
      handleScanUnusedImages,
      msg.imageBed.cleanupSuccess,
      pushToast,
      unusedAllowedDirs,
    ]
  );

  const handleTestImageBed = useCallback(async (settings: ImageBedSettings) => {
    const res = await imageBedApi.testImageBedConnection(settings);
    return {
      ok: res.ok,
      message: res.message,
    };
  }, []);

  // Export standalone HTML (with offline Data URI images & preserved Mermaid SVGs)
  const handleExportHtml = useCallback(async () => {
    const state = useAppStore.getState();
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!tab) {
      pushToast(msg.export.exportNoDoc, "info");
      return;
    }

    const parsed = parseMarkdownDocument(tab.content);
    const exportTitle =
      (parsed.hasFrontMatter && parsed.data.title.trim()) ||
      tab.title.replace(/\.(md|markdown|mdx)$/i, "") ||
      msg.appName;

    try {
      let bodyHtml: string;
      const canReuseLivePreviewDom =
        state.previewSource === "markdown" &&
        (state.viewMode === "split" || state.viewMode === "read") &&
        Boolean(previewRef.current);

      if (canReuseLivePreviewDom) {
        bodyHtml = previewRef.current!.getRenderedHtml();
      } else {
        const srcs = extractLocalImageSrcs(parsed.body, {
          enableHexoTags: state.enableHexoTags,
        });
        const imageMap: Record<string, LocalImageEntry> = {};
        if (srcs.length > 0) {
          const resolved = await api.resolveLocalImages({
            docPath: tab.filePath,
            siteRoot: tab.siteRoot,
            sourceDir: tab.sourceDir,
            srcs,
          });
          for (const entry of resolved) {
            if (entry.exists && entry.absolutePath) {
              imageMap[entry.rawSrc] = {
                assetUrl: api.toAssetUrl(entry.absolutePath),
                absolutePath: entry.absolutePath,
              };
            }
          }
        }
        bodyHtml = renderMarkdownToHtml(parsed.body, {
          bodyStartLine: parsed.bodyStartLine,
          imageMap,
          enableHexoTags: state.enableHexoTags,
        });
      }

      const htmlDocument = await buildStandaloneHtmlDocument({
        title: exportTitle,
        date: parsed.hasFrontMatter ? parsed.data.date : null,
        categories: parsed.hasFrontMatter ? parsed.data.categories : [],
        tags: parsed.hasFrontMatter ? parsed.data.tags : [],
        markdownContent: tab.content,
        bodyHtml,
        themeCss: state.themeCss,
        codeTheme: state.editorPrefs.codeTheme,
        lang: state.locale,
        resolveLocalImageDataUri: async (absPath) => {
          try {
            return await imageBedApi.readLocalFileAsDataUri(absPath);
          } catch {
            return null;
          }
        },
      });

      const defaultName = `${exportTitle.replace(/[\\/:*?"<>|]/g, "_")}.html`;
      const targetPath = await api.pickSaveHtmlPath(defaultName);
      if (!targetPath) return;

      await api.writeTextFilePath(targetPath, htmlDocument);
      pushToast(
        formatMessage(msg.export.exportHtmlSuccess, {
          file: getFileName(targetPath),
        }),
        "success"
      );
    } catch (err) {
      pushToast(String(err), "error");
    }
  }, [msg.appName, msg.export.exportHtmlSuccess, msg.export.exportNoDoc, pushToast]);

  // Export PDF via native WebView print
  const handleExportPdf = useCallback(() => {
    const state = useAppStore.getState();
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!tab) {
      pushToast(msg.export.exportNoDoc, "info");
      return;
    }
    const parsed = parseMarkdownDocument(tab.content);
    const printTitle =
      (parsed.hasFrontMatter && parsed.data.title.trim()) ||
      tab.title.replace(/\.(md|markdown|mdx)$/i, "") ||
      msg.appName;
    try {
      triggerDocumentPrint({ title: printTitle });
    } catch (err) {
      pushToast(String(err), "error");
    }
  }, [msg.appName, msg.export.exportNoDoc, pushToast]);

  const handleFormatTables = useCallback(() => {
    const count = editorRef.current?.formatTables() ?? 0;
    pushToast(
      count > 0 ? msg.toast.tableFormatted : msg.toast.noTableFound,
      count > 0 ? "success" : "info"
    );
  }, [msg.toast.noTableFound, msg.toast.tableFormatted, pushToast]);

  const handleRenameLocalImage = async (oldAbsPath: string, newName: string) => {
    if (!activeTab) return;
    try {
      const res = await api.renameLocalImage({
        oldAbsPath,
        newNameInput: newName,
        currentContent: activeTab.content,
      });
      updateTabContent(activeTab.id, res.updatedContent);
      setImageVersion((v) => v + 1);
      pushToast(
        formatMessage(msg.toast.imageRenamed, { count: res.replacements }),
        "success"
      );
    } catch (err) {
      pushToast(String(err), "error");
    }
  };

  const handleSelectOutline = useCallback((line: number, id: string) => {
    editorRef.current?.scrollToSourceLine(line);
    previewRef.current?.scrollToHeadingId(id);
  }, []);

  const handleOpenRecent = useCallback(
    (entry: WelcomeRecentEntry) => {
      if (entry.kind === "site") {
        const known = sites.some((s) => s.rootPath === entry.path);
        if (known) {
          void switchSite(entry.path);
        } else {
          void addSite(entry.path);
        }
        return;
      }
      const matchedPost = posts.find((p) => p.filePath === entry.path);
      if (matchedPost) {
        void openPost(matchedPost);
      } else {
        void openStandaloneFile(entry.path);
      }
    },
    [addSite, openPost, openStandaloneFile, posts, sites, switchSite]
  );

  const handleRequestNewPost = useCallback(() => {
    if (activeSiteRoot) {
      setNewPostOpen(true);
    } else {
      createScratchTab();
    }
  }, [activeSiteRoot, createScratchTab]);

  const activePostSlug = useMemo(() => {
    if (!activeTab?.filePath) return null;
    const matched = posts.find((p) => p.filePath === activeTab.filePath);
    if (matched?.slug) return matched.slug;
    const name = activeTab.filePath.split(/[/\\]/).pop() ?? "";
    return name.replace(/\.(md|markdown|mdx)$/i, "") || null;
  }, [activeTab?.filePath, posts]);

  const activeLivePostUrl = useMemo(() => {
    if (!activeTab) return null;
    return buildHexoPostUrl({
      serverUrl: hexoCliStatus.serverUrl,
      siteRoot: activeTab.siteRoot ?? activeSiteRoot,
      sourceDir: activeTab.sourceDir,
      filePath: activeTab.filePath,
      content: activeTab.content,
      isDraft: activeTab.isDraft,
      isStandalone: activeTab.isStandalone,
      permalink: siteConfig?.permalink,
      root: siteConfig?.root,
      modifiedMs: activeTab.modifiedMs,
      engine: siteConfig?.engine,
    });
  }, [
    activeTab?.filePath,
    activeTab?.siteRoot,
    activeTab?.sourceDir,
    activeTab?.content,
    activeTab?.isDraft,
    activeTab?.isStandalone,
    activeTab?.modifiedMs,
    activeSiteRoot,
    hexoCliStatus.serverUrl,
    siteConfig?.permalink,
    siteConfig?.root,
    siteConfig?.engine,
  ]);

  const handleOpenExternalUrl = useCallback(
    async (url: string) => {
      try {
        await api.openExternalUrl(url);
      } catch (err) {
        pushToast(String(err), "error");
      }
    },
    [pushToast]
  );

  const handleRunHexoAction = useCallback(
    async (action: HexoCliAction) => {
      if (action === "server") {
        pendingAutoOpenServerRef.current = true;
      }
      await runHexoAction(action);
      if (action === "server") {
        const latest = useAppStore.getState().hexoCliStatus;
        if (!latest.running && !latest.serverRunning) {
          pendingAutoOpenServerRef.current = false;
        }
      }
    },
    [runHexoAction]
  );

  useEffect(() => {
    const wasRunning = prevServerRunningRef.current;
    prevServerRunningRef.current = hexoCliStatus.serverRunning;

    if (!hexoCliStatus.running && !hexoCliStatus.serverRunning) {
      pendingAutoOpenServerRef.current = false;
      return;
    }

    if (
      !wasRunning &&
      hexoCliStatus.serverRunning &&
      hexoCliStatus.serverUrl &&
      pendingAutoOpenServerRef.current
    ) {
      pendingAutoOpenServerRef.current = false;
      const targetUrl = activeLivePostUrl || hexoCliStatus.serverUrl;
      void handleOpenExternalUrl(targetUrl);
    }
  }, [
    hexoCliStatus.running,
    hexoCliStatus.serverRunning,
    hexoCliStatus.serverUrl,
    activeLivePostUrl,
    handleOpenExternalUrl,
  ]);

  const activeUploadBatchInfo = useMemo<LastUploadBatchInfo | null>(() => {
    if (!activeTab) return null;
    const stored = lastUploadBatches[activeTab.id];
    if (!stored || stored.records.length === 0) return null;
    const hasDeletedLocal = stored.records.some((r) => r.localDeleted);
    const remoteKeyCount = stored.records.filter(
      (r) => !r.localDeleted && Boolean(r.remoteKey)
    ).length;
    return {
      uploadedCount: stored.records.length,
      timestamp: stored.timestamp,
      canDeleteRemote: stored.canDeleteRemote && !hasDeletedLocal && remoteKeyCount > 0,
      remoteKeyCount,
      hasDeletedLocal,
    };
  }, [activeTab, lastUploadBatches]);

  const imageBedSummary = useMemo(
    () => summarizeImageBed(imageBed),
    [imageBed]
  );

  // Fallback print-only article for Write / Focus / Live-preview modes so Cmd+P and Export PDF always print full formatted article with resolved local images
  const needsPrintFallback = Boolean(
    activeTab &&
      !activeTab.isLoading &&
      (viewMode === "write" ||
        viewMode === "focus" ||
        previewSource === "live")
  );
  const [printFallbackImageMap, setPrintFallbackImageMap] = useState<
    Record<string, LocalImageEntry>
  >({});
  const [debouncedPrintTab, setDebouncedPrintTab] = useState<{
    id: string;
    content: string;
  } | null>(null);

  useEffect(() => {
    if (!needsPrintFallback || !activeTab) {
      setDebouncedPrintTab(null);
      return;
    }
    if (!debouncedPrintTab || debouncedPrintTab.id !== activeTab.id) {
      setDebouncedPrintTab({ id: activeTab.id, content: activeTab.content });
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedPrintTab({ id: activeTab.id, content: activeTab.content });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [needsPrintFallback, activeTab?.id, activeTab?.content]);

  const printParsed = useMemo(() => {
    if (!needsPrintFallback || !activeTab) return null;
    const contentForPrint =
      debouncedPrintTab && debouncedPrintTab.id === activeTab.id
        ? debouncedPrintTab.content
        : activeTab.content;
    return parseMarkdownDocument(contentForPrint);
  }, [needsPrintFallback, activeTab?.id, activeTab?.content, debouncedPrintTab]);

  const printLocalSrcs = useMemo(() => {
    if (!printParsed) return [];
    return extractLocalImageSrcs(printParsed.body, { enableHexoTags });
  }, [printParsed, enableHexoTags]);
  const printLocalSrcsKey = printLocalSrcs.join("\0");

  useEffect(() => {
    if (!needsPrintFallback || !activeTab) {
      setPrintFallbackImageMap({});
      return;
    }
    if (printLocalSrcs.length === 0) {
      setPrintFallbackImageMap({});
      return;
    }
    let cancelled = false;
    void api
      .resolveLocalImages({
        docPath: activeTab.filePath,
        siteRoot: activeTab.siteRoot,
        sourceDir: activeTab.sourceDir,
        srcs: printLocalSrcs,
      })
      .then((resolved) => {
        if (cancelled) return;
        const map: Record<string, LocalImageEntry> = {};
        for (const entry of resolved) {
          if (entry.exists && entry.absolutePath) {
            map[entry.rawSrc] = {
              assetUrl: api.toAssetUrl(entry.absolutePath),
              absolutePath: entry.absolutePath,
            };
          }
        }
        setPrintFallbackImageMap(map);
      })
      .catch(() => {
        if (!cancelled) setPrintFallbackImageMap({});
      });
    return () => {
      cancelled = true;
    };
  }, [
    needsPrintFallback,
    activeTab?.filePath,
    activeTab?.siteRoot,
    activeTab?.sourceDir,
    printLocalSrcsKey,
    imageVersion,
  ]);

  const scopedThemeCssForPrint = useMemo(
    () => scopePreviewThemeCss(themeCss),
    [themeCss]
  );

  const printFallbackData = useMemo(() => {
    if (!needsPrintFallback || !printParsed) return null;
    const html = renderMarkdownToHtml(printParsed.body, {
      bodyStartLine: printParsed.bodyStartLine,
      imageMap: printFallbackImageMap,
      enableHexoTags,
    });
    return { parsed: printParsed, html, scopedCss: scopedThemeCssForPrint };
  }, [
    needsPrintFallback,
    printParsed,
    printFallbackImageMap,
    enableHexoTags,
    scopedThemeCssForPrint,
  ]);

  const commandItems = useMemo<CommandPaletteItem[]>(() => {
    if (!commandPaletteOpen) return [];
    const items: CommandPaletteItem[] = [];

    // 1. Open Tabs
    for (const tab of tabs) {
      items.push({
        id: `tab:${tab.id}`,
        label: tab.title,
        group: msg.command.groupTabs,
        description: tab.filePath ?? undefined,
        keywords: ["tab", tab.title, tab.filePath ?? ""],
        icon: <FileText className="h-3.5 w-3.5" />,
        onSelect: () => setActiveTab(tab.id),
      });
    }

    // 2. Site Posts Jump
    for (const post of posts) {
      items.push({
        id: `post:${post.filePath}`,
        label: post.title,
        group: msg.command.groupPosts,
        description: post.relativePath,
        keywords: [post.slug, post.fileName, ...post.tags, ...post.categories],
        icon: <FileText className="h-3.5 w-3.5" />,
        onSelect: () => void openPost(post),
      });
    }

    // 3. Document & Workspace
    items.push(
      {
        id: "doc:new-post",
        label: msg.sidebar.newPost,
        group: msg.command.groupDocument,
        shortcut: "⌘N",
        keywords: ["new", "post", "create"],
        icon: <FilePlus2 className="h-3.5 w-3.5" />,
        onSelect: handleRequestNewPost,
      },
      {
        id: "doc:new-scratch",
        label: msg.command.newScratch,
        group: msg.command.groupDocument,
        keywords: ["scratch", "draft", "note"],
        icon: <FileEdit className="h-3.5 w-3.5" />,
        onSelect: createScratchTab,
      },
      {
        id: "doc:open-file",
        label: msg.sidebar.openFile,
        group: msg.command.groupDocument,
        shortcut: "⌘O",
        keywords: ["open", "file", "markdown"],
        icon: <FolderOpen className="h-3.5 w-3.5" />,
        onSelect: () => {
          void api.pickMarkdownFile(msg.sidebar.openFile).then((p) => {
            if (p) void openStandaloneFile(p);
          });
        },
      },
      {
        id: "doc:add-site",
        label: msg.sidebar.addSite,
        group: msg.command.groupDocument,
        keywords: ["site", "hexo", "blog", "folder"],
        icon: <FolderPlus className="h-3.5 w-3.5" />,
        onSelect: () => {
          void api.pickDirectory(msg.sidebar.addSite).then((dir) => {
            if (dir) void addSite(dir);
          });
        },
      },
      {
        id: "doc:refresh-site",
        label: msg.sidebar.refreshSite,
        group: msg.command.groupDocument,
        disabled: !activeSiteRoot,
        keywords: ["refresh", "rescan", "site"],
        icon: <RefreshCw className="h-3.5 w-3.5" />,
        onSelect: () => void refreshActiveSite(),
      },
      {
        id: "doc:save",
        label: msg.command.saveActive,
        group: msg.command.groupDocument,
        shortcut: "⌘S",
        disabled: !activeTab,
        keywords: ["save"],
        icon: <Save className="h-3.5 w-3.5" />,
        onSelect: () => {
          if (activeTab) void saveTab(activeTab.id);
        },
      },
      {
        id: "doc:save-as",
        label: msg.command.saveAsActive,
        group: msg.command.groupDocument,
        shortcut: "⌘⇧S",
        disabled: !activeTab,
        keywords: ["save as"],
        icon: <Save className="h-3.5 w-3.5" />,
        onSelect: () => {
          if (activeTab) void saveTabAs(activeTab.id);
        },
      },
      {
        id: "doc:save-all",
        label: msg.command.saveAllTabs,
        group: msg.command.groupDocument,
        shortcut: "⌘⌥S",
        disabled: tabs.length === 0,
        keywords: ["save", "all", "tabs"],
        icon: <Save className="h-3.5 w-3.5" />,
        onSelect: () => void saveAllTabs(),
      },
      {
        id: "doc:export-html",
        label: msg.command.exportHtml,
        group: msg.command.groupDocument,
        disabled: !activeTab,
        keywords: ["export", "html", "standalone", "offline"],
        icon: <Download className="h-3.5 w-3.5" />,
        onSelect: () => void handleExportHtml(),
      },
      {
        id: "doc:export-pdf",
        label: msg.command.exportPdf,
        group: msg.command.groupDocument,
        disabled: !activeTab,
        keywords: ["export", "pdf", "print"],
        icon: <Printer className="h-3.5 w-3.5" />,
        onSelect: handleExportPdf,
      },
      {
        id: "doc:image-upload",
        label: msg.command.openImageManager,
        group: msg.command.groupDocument,
        disabled: !activeTab,
        keywords: ["image", "bed", "upload", "picgo", "s3", "oss", "cos"],
        icon: <CloudUpload className="h-3.5 w-3.5" />,
        onSelect: () => openImageManagerModal("upload"),
      },
      {
        id: "doc:image-cleanup",
        label: msg.command.openImageCleanup,
        group: msg.command.groupDocument,
        disabled: !activeTab?.filePath,
        keywords: ["image", "unused", "clean", "cleanup"],
        icon: <Trash2 className="h-3.5 w-3.5" />,
        onSelect: () => openImageManagerModal("cleanup"),
      },
      {
        id: "doc:close-tab",
        label: msg.command.closeActiveTab,
        group: msg.command.groupDocument,
        shortcut: "⌘W",
        disabled: !activeTab,
        keywords: ["close", "tab"],
        icon: <X className="h-3.5 w-3.5" />,
        onSelect: () => {
          if (activeTab) handleRequestCloseTab(activeTab.id);
        },
      },
      {
        id: "doc:settings",
        label: msg.command.openSettings,
        group: msg.command.groupDocument,
        shortcut: "⌘,",
        keywords: ["settings", "preferences", "config", "font", "theme"],
        icon: <Settings className="h-3.5 w-3.5" />,
        onSelect: () => openSettingsModal("general"),
      },
      {
        id: "doc:toggle-sidebar",
        label: msg.tabs.toggleSidebar,
        group: msg.command.groupDocument,
        shortcut: "⌘\\",
        keywords: ["sidebar"],
        icon: <PanelLeft className="h-3.5 w-3.5" />,
        onSelect: toggleSidebar,
      },
      {
        id: "doc:sidebar-posts",
        label: msg.command.toggleSidebarPosts,
        group: msg.command.groupDocument,
        keywords: ["sidebar", "posts"],
        icon: <FolderTree className="h-3.5 w-3.5" />,
        onSelect: () => {
          setSidebarOpen(true);
          setSidebarTab("posts");
        },
      },
      {
        id: "doc:sidebar-outline",
        label: msg.command.toggleSidebarOutline,
        group: msg.command.groupDocument,
        keywords: ["sidebar", "outline", "toc"],
        icon: <ListTree className="h-3.5 w-3.5" />,
        onSelect: () => {
          setSidebarOpen(true);
          setSidebarTab("outline");
        },
      }
    );

    // 4. View & Editor Preferences
    items.push(
      {
        id: "view:write",
        label: msg.viewMode.write,
        group: msg.command.groupView,
        shortcut: "⌘⌥1",
        keywords: ["write", "editor", "view"],
        icon: <PenLine className="h-3.5 w-3.5" />,
        onSelect: () => setViewMode("write"),
      },
      {
        id: "view:split",
        label: msg.viewMode.split,
        group: msg.command.groupView,
        shortcut: "⌘⌥2",
        keywords: ["split", "preview", "view"],
        icon: <Columns2 className="h-3.5 w-3.5" />,
        onSelect: () => setViewMode("split"),
      },
      {
        id: "view:read",
        label: msg.viewMode.read,
        group: msg.command.groupView,
        shortcut: "⌘⌥3",
        keywords: ["read", "preview", "view"],
        icon: <BookOpen className="h-3.5 w-3.5" />,
        onSelect: () => setViewMode("read"),
      },
      {
        id: "view:focus",
        label: msg.viewMode.focus,
        group: msg.command.groupView,
        shortcut: "⌘⌥4",
        keywords: ["focus", "zen", "view"],
        icon: <Maximize2 className="h-3.5 w-3.5" />,
        onSelect: () => setViewMode("focus"),
      },
      {
        id: "view:toggle-toolbar",
        label: showToolbar
          ? msg.command.toggleToolbarOff
          : msg.command.toggleToolbarOn,
        group: msg.command.groupView,
        keywords: ["toolbar", "format"],
        icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
        onSelect: toggleToolbar,
      },
      {
        id: "view:toggle-line-numbers",
        label: showLineNumbers
          ? msg.command.toggleLineNumbersOff
          : msg.command.toggleLineNumbersOn,
        group: msg.command.groupView,
        keywords: ["line", "numbers", "gutter"],
        icon: <Hash className="h-3.5 w-3.5" />,
        onSelect: toggleLineNumbers,
      },
      {
        id: "view:toggle-sync-scroll",
        label: msg.command.toggleSyncScroll,
        group: msg.command.groupView,
        keywords: ["sync", "scroll"],
        icon: <Link2 className="h-3.5 w-3.5" />,
        onSelect: () => setSyncScroll(!syncScroll),
      },
      {
        id: "view:toggle-auto-save",
        label: msg.command.toggleAutoSave,
        group: msg.command.groupView,
        keywords: ["auto", "save"],
        icon: <Save className="h-3.5 w-3.5" />,
        onSelect: () => setAutoSave(!autoSave),
      },
      ...(isMacPlatform()
        ? [
            {
              id: "view:toggle-titlebar",
              label: msg.command.toggleTitleBar,
              group: msg.command.groupView,
              keywords: ["titlebar", "overlay", "system", "header", "macos"],
              icon: <Maximize2 className="h-3.5 w-3.5" />,
              onSelect: () =>
                setEditorPrefs({
                  titleBarMode:
                    (editorPrefs.titleBarMode ?? "overlay") === "overlay"
                      ? "system"
                      : "overlay",
                }),
            },
          ]
        : []),
      {
        id: "view:ui-font-sm",
        label: locale === "en-US" ? "UI Font Size: Small" : "界面字号：小",
        group: msg.command.groupView,
        keywords: ["font", "size", "small", "ui", "scale"],
        icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
        onSelect: () => setEditorPrefs({ uiFontSize: "sm" }),
      },
      {
        id: "view:ui-font-md",
        label: locale === "en-US" ? "UI Font Size: Medium" : "界面字号：中",
        group: msg.command.groupView,
        keywords: ["font", "size", "medium", "ui", "scale"],
        icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
        onSelect: () => setEditorPrefs({ uiFontSize: "md" }),
      },
      {
        id: "view:ui-font-lg",
        label: locale === "en-US" ? "UI Font Size: Large" : "界面字号：大",
        group: msg.command.groupView,
        keywords: ["font", "size", "large", "ui", "scale"],
        icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
        onSelect: () => setEditorPrefs({ uiFontSize: "lg" }),
      },
      {
        id: "view:toggle-terminal",
        label: msg.command.toggleTerminal,
        group: msg.command.groupView,
        keywords: ["terminal", "console", "logs", "hexo"],
        icon: <Terminal className="h-3.5 w-3.5" />,
        onSelect: () => setTerminalOpen(!terminalOpen),
      }
    );

    // 5. Theme & Preview
    items.push(
      {
        id: "theme:preview-markdown",
        label: msg.command.switchPreviewMarkdown,
        group: msg.command.groupTheme,
        keywords: ["preview", "markdown"],
        icon: <BookOpen className="h-3.5 w-3.5" />,
        onSelect: () => setPreviewSource("markdown"),
      },
      {
        id: "theme:preview-live",
        label: msg.command.switchPreviewLive,
        group: msg.command.groupTheme,
        keywords: ["preview", "live", "server", "iframe"],
        icon: <Globe className="h-3.5 w-3.5" />,
        onSelect: () => setPreviewSource("live"),
      },
      {
        id: "theme:toggle-hexo-tags",
        label: msg.command.toggleHexoTags,
        group: msg.command.groupTheme,
        keywords: ["hexo", "tags", "note", "tabs"],
        icon: <FileCode2 className="h-3.5 w-3.5" />,
        onSelect: () => setEnableHexoTags(!enableHexoTags),
      },
      {
        id: "theme:load-site-css",
        label: msg.preview.loadSiteCss,
        group: msg.command.groupTheme,
        disabled: !activeSiteRoot,
        keywords: ["theme", "css", "site", "import"],
        icon: <Sparkles className="h-3.5 w-3.5" />,
        onSelect: () => void loadSiteThemeCssAction(),
      },
      {
        id: "theme:pick-custom-css",
        label: msg.preview.pickCustomCss,
        group: msg.command.groupTheme,
        keywords: ["theme", "css", "custom", "file"],
        icon: <Upload className="h-3.5 w-3.5" />,
        onSelect: () => void importCustomThemeCssAction(),
      },
      {
        id: "theme:clear-css",
        label: msg.preview.clearThemeCss,
        group: msg.command.groupTheme,
        disabled: !themeCss,
        keywords: ["theme", "css", "clear", "reset"],
        icon: <Palette className="h-3.5 w-3.5" />,
        onSelect: clearThemeCssAction,
      }
    );

    // 6. Hexo / Hugo CLI Commands
    const isHugo = siteConfig?.engine === "hugo";
    const cliGroup = isHugo ? msg.command.groupHugo : msg.command.groupHexo;
    items.push(
      {
        id: "hexo:server",
        label: isHugo ? msg.command.hugoServer : msg.command.hexoServer,
        group: cliGroup,
        disabled: !activeSiteRoot || hexoCliStatus.running,
        keywords: [isHugo ? "hugo" : "hexo", "server", "s", "preview"],
        icon: <Play className="h-3.5 w-3.5" />,
        onSelect: () => void handleRunHexoAction("server"),
      },
      {
        id: "hexo:stop",
        label: isHugo ? msg.command.hugoStop : msg.command.hexoStop,
        group: cliGroup,
        disabled: !hexoCliStatus.running,
        keywords: [isHugo ? "hugo" : "hexo", "stop", "kill"],
        icon: <Square className="h-3.5 w-3.5" />,
        onSelect: () => void stopHexoAction(),
      },
      {
        id: "hexo:generate",
        label: isHugo ? msg.command.hugoGenerate : msg.command.hexoGenerate,
        group: cliGroup,
        disabled: !activeSiteRoot || hexoCliStatus.running,
        keywords: [isHugo ? "hugo" : "hexo", "generate", "g", "build"],
        icon: <Hammer className="h-3.5 w-3.5" />,
        onSelect: () => void handleRunHexoAction("generate"),
      },
      {
        id: "hexo:generate-deploy",
        label: isHugo
          ? msg.command.hugoGenerateDeploy
          : msg.command.hexoGenerateDeploy,
        group: cliGroup,
        disabled: !activeSiteRoot || hexoCliStatus.running,
        keywords: [isHugo ? "hugo" : "hexo", "g", "d", "deploy", "hgd"],
        icon: <Rocket className="h-3.5 w-3.5" />,
        onSelect: () => void handleRunHexoAction("generate_deploy"),
      },
      {
        id: "hexo:deploy",
        label: isHugo ? msg.command.hugoDeploy : msg.command.hexoDeploy,
        group: cliGroup,
        disabled: !activeSiteRoot || hexoCliStatus.running,
        keywords: [isHugo ? "hugo" : "hexo", "deploy", "d"],
        icon: <Send className="h-3.5 w-3.5" />,
        onSelect: () => void handleRunHexoAction("deploy"),
      },
      {
        id: "hexo:clean",
        label: isHugo ? msg.command.hugoClean : msg.command.hexoClean,
        group: cliGroup,
        disabled: !activeSiteRoot || hexoCliStatus.running,
        keywords: [isHugo ? "hugo" : "hexo", "clean"],
        icon: <Eraser className="h-3.5 w-3.5" />,
        onSelect: () => void handleRunHexoAction("clean"),
      },
      {
        id: "hexo:kill-port",
        label: isHugo ? msg.command.hugoKillPort : msg.command.hexoKillPort,
        group: cliGroup,
        keywords: [isHugo ? "hugo" : "hexo", "port", isHugo ? "1313" : "4000", "kill", "free"],
        icon: <PlugZap className="h-3.5 w-3.5" />,
        onSelect: () => void killHexoPort(),
      }
    );

    // 7. Quick Open
    items.push(
      {
        id: "quickopen:post_dir",
        label: msg.quickOpen.postDir,
        group: msg.command.groupQuickOpen,
        disabled: !activeTab?.filePath,
        keywords: ["open", "folder", "post", "dir"],
        icon: <FolderOpen className="h-3.5 w-3.5" />,
        onSelect: () => void openQuickOpenTarget("post_dir"),
      },
      {
        id: "quickopen:post_asset_dir",
        label: msg.quickOpen.postAssetDir,
        group: msg.command.groupQuickOpen,
        disabled: !activeTab?.filePath,
        keywords: ["open", "asset", "image", "folder"],
        icon: <Image className="h-3.5 w-3.5" />,
        onSelect: () => void openQuickOpenTarget("post_asset_dir"),
      },
      {
        id: "quickopen:images_dir",
        label: msg.quickOpen.imagesDir,
        group: msg.command.groupQuickOpen,
        disabled: !activeSiteRoot,
        keywords: ["open", "images", "folder"],
        icon: <Images className="h-3.5 w-3.5" />,
        onSelect: () => void openQuickOpenTarget("images_dir"),
      },
      {
        id: "quickopen:site_root",
        label: msg.quickOpen.siteRoot,
        group: msg.command.groupQuickOpen,
        disabled: !activeSiteRoot,
        keywords: ["open", "site", "root", "hexo"],
        icon: <FolderTree className="h-3.5 w-3.5" />,
        onSelect: () => void openQuickOpenTarget("site_root"),
      },
      {
        id: "quickopen:blog_home",
        label: msg.quickOpen.blogHome,
        group: msg.command.groupQuickOpen,
        disabled: !siteConfig?.url?.trim(),
        keywords: ["open", "blog", "home", "url"],
        icon: <Globe className="h-3.5 w-3.5" />,
        onSelect: () => void openQuickOpenTarget("blog_home"),
      },
      {
        id: "quickopen:local_preview",
        label: msg.quickOpen.localPreview,
        group: msg.command.groupQuickOpen,
        disabled: !(
          activeSiteRoot ||
          (hexoCliStatus.serverRunning && hexoCliStatus.serverUrl)
        ),
        keywords: ["open", "local", "preview", "localhost"],
        icon: <ExternalLink className="h-3.5 w-3.5" />,
        onSelect: () => void openQuickOpenTarget("local_preview"),
      }
    );

    // 8. AI Writing Assistant
    items.push(
      {
        id: "ai:toggle-drawer",
        label: msg.command.toggleAiDrawer,
        group: msg.command.groupAi,
        keywords: ["ai", "assistant", "acp", "drawer"],
        icon: <Sparkles className="h-3.5 w-3.5" />,
        onSelect: () => setAiDrawerOpen((v) => !v),
      },
      {
        id: "ai:inline-rewrite",
        label:
          locale === "en-US"
            ? "AI Inline Selection Rewrite (Diff)"
            : "AI 行内划词改写与 Diff",
        group: msg.command.groupAi,
        shortcut: isMacPlatform() ? "⌘I" : "Ctrl+I",
        disabled: !activeTab || viewMode === "read",
        keywords: ["ai", "inline", "diff", "rewrite", "selection"],
        icon: <Sparkles className="h-3.5 w-3.5" />,
        onSelect: () => setInlineAiOpen(true),
      },
      {
        id: "ai:frontmatter",
        label: msg.command.aiFrontMatter,
        group: msg.command.groupAi,
        disabled: !activeTab,
        keywords: ["ai", "frontmatter", "tags", "categories", "title"],
        icon: <Sparkles className="h-3.5 w-3.5" />,
        onSelect: () => triggerAiAction("frontmatter_complete"),
      },
      {
        id: "ai:polish",
        label: msg.command.aiPolish,
        group: msg.command.groupAi,
        disabled: !activeTab,
        keywords: ["ai", "polish", "rewrite", "edit"],
        icon: <Sparkles className="h-3.5 w-3.5" />,
        onSelect: () => triggerAiAction("polish"),
      },
      {
        id: "ai:theme-format",
        label: msg.command.aiThemeFormat,
        group: msg.command.groupAi,
        disabled: !activeTab,
        keywords: ["ai", "theme", "format", "next", "note", "tabs"],
        icon: <Sparkles className="h-3.5 w-3.5" />,
        onSelect: () => triggerAiAction("theme_format"),
      },
      {
        id: "ai:diagnose-terminal",
        label: msg.command.aiDiagnoseTerminal,
        group: msg.command.groupAi,
        disabled: hexoLogs.length === 0 && !activeSiteRoot,
        keywords: ["ai", "diagnose", "terminal", "error", "stderr"],
        icon: <Terminal className="h-3.5 w-3.5" />,
        onSelect: () => triggerAiAction("diagnose_terminal"),
      },
      {
        id: "ai:settings",
        label: msg.command.aiSettings,
        group: msg.command.groupAi,
        keywords: ["ai", "acp", "agent", "api", "settings"],
        icon: <Settings className="h-3.5 w-3.5" />,
        onSelect: () => openSettingsModal("ai"),
      }
    );

    return items;
  }, [
    activeSiteRoot,
    activeTab,
    addSite,
    autoSave,
    clearThemeCssAction,
    commandPaletteOpen,
    createScratchTab,
    enableHexoTags,
    handleExportHtml,
    handleExportPdf,
    handleRequestCloseTab,
    handleRequestNewPost,
    handleRunHexoAction,
    hexoCliStatus.running,
    hexoCliStatus.serverRunning,
    hexoCliStatus.serverUrl,
    importCustomThemeCssAction,
    killHexoPort,
    loadSiteThemeCssAction,
    msg,
    openImageManagerModal,
    openPost,
    openQuickOpenTarget,
    openSettingsModal,
    openStandaloneFile,
    posts,
    refreshActiveSite,
    saveAllTabs,
    saveTab,
    saveTabAs,
    setActiveTab,
    setAutoSave,
    setEditorPrefs,
    setEnableHexoTags,
    editorPrefs.titleBarMode,
    setPreviewSource,
    setSidebarOpen,
    setSidebarTab,
    setSyncScroll,
    setTerminalOpen,
    setViewMode,
    showLineNumbers,
    showToolbar,
    siteConfig?.url,
    stopHexoAction,
    syncScroll,
    tabs,
    terminalOpen,
    themeCss,
    toggleLineNumbers,
    toggleSidebar,
    toggleToolbar,
    triggerAiAction,
    hexoLogs.length,
  ]);

  const closeConfirmTab = tabs.find((t) => t.id === closeConfirmTabId) ?? null;
  const openTabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const isFocusMode = viewMode === "focus";
  const showSidebar = sidebarOpen && !isFocusMode;
  const activeSidebarWidth = draggingSidebarWidth ?? sidebarWidth;

  const renderPreviewPane = (centered = false) => {
    if (previewSource === "live") {
      return (
        <div className="no-print h-full w-full">
          <LiveSitePreview
            serverUrl={hexoCliStatus.serverUrl}
            serverRunning={hexoCliStatus.serverRunning}
            currentPostSlug={activePostSlug}
            currentPostUrl={activeLivePostUrl}
            onStartServer={
              activeSiteRoot ? () => void handleRunHexoAction("server") : undefined
            }
            onOpenExternal={(url) => void handleOpenExternalUrl(url)}
            locale={locale}
          />
        </div>
      );
    }

    if (!activeTab) return null;

    return (
      <MarkdownPreview
        ref={previewRef}
        docKey={activeTab.id}
        content={activeTab.content}
        docPath={activeTab.filePath}
        siteRoot={activeTab.siteRoot}
        sourceDir={activeTab.sourceDir}
        imageVersion={imageVersion}
        themeCss={themeCss}
        enableHexoTags={enableHexoTags}
        zoomLevel={editorPrefs.zoomLevel}
        onScrollLine={
          centered
            ? undefined
            : (line) => {
                if (syncScroll) {
                  editorRef.current?.scrollToSourceLine(line);
                }
              }
        }
        onClickLocalImage={setSelectedImage}
        centered={centered}
      />
    );
  };

  return (
    <div
      data-code-theme={editorPrefs.codeTheme}
      data-zoom-level={editorPrefs.zoomLevel}
      className="flex h-screen w-screen flex-col overflow-hidden bg-white text-zinc-900"
    >
      {/* Main Area (Fixed-Pixel Sidebar + Adaptive Editor Workspace) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showSidebar && (
          <>
            <div
              data-testid="sidebar-container"
              style={{ width: `${activeSidebarWidth}px` }}
              className="no-print h-full shrink-0 overflow-hidden"
            >
              <Sidebar
                onRequestNewPost={() => setNewPostOpen(true)}
                onSelectOutline={handleSelectOutline}
                overlayInset={useOverlayTitleBar}
              />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={
                locale === "en-US" ? "Resize sidebar" : "调整侧边栏宽度"
              }
              aria-valuemin={MIN_SIDEBAR_WIDTH}
              aria-valuemax={MAX_SIDEBAR_WIDTH}
              aria-valuenow={activeSidebarWidth}
              data-testid="sidebar-resize-handle"
              onMouseDown={handleSidebarResizeMouseDown}
              onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
              className={cn(
                "no-print relative z-20 -ml-[3px] -mr-[2px] w-[5px] shrink-0 cursor-col-resize select-none",
                "after:pointer-events-none after:absolute after:inset-y-0 after:left-[2px] after:w-[1px] after:transition-colors",
                draggingSidebarWidth !== null
                  ? "after:bg-zinc-400"
                  : "hover:after:bg-zinc-400/80"
              )}
            />
          </>
        )}

        <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
              {/* Top Tab Bar (hidden in Focus mode) */}
              {!isFocusMode && (
                <TabBar
                  onRequestCloseTab={handleRequestCloseTab}
                  onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                  onOpenSettings={() => openSettingsModal("general")}
                  onOpenImageManager={() => openImageManagerModal("upload")}
                  onExportHtml={() => void handleExportHtml()}
                  onExportPdf={handleExportPdf}
                  aiDrawerOpen={aiDrawerOpen}
                  onToggleAiDrawer={() => setAiDrawerOpen((v) => !v)}
                  overlayInset={useOverlayTitleBar && !showSidebar}
                />
              )}

              {/* Focus Mode Floating Exit Pill */}
              {isFocusMode && (
                <div className="no-print fixed right-4 top-3 z-40">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={exitFocusMode}
                    className="bg-white/90 backdrop-blur-xs shadow-xs text-zinc-500 hover:text-zinc-900"
                  >
                    <Minimize2 className="h-3 w-3" />
                    {msg.viewMode.exitFocus}
                  </Button>
                </div>
              )}

              {/* Startup Skeleton / Welcome Empty State / Active Document Workspace */}
              {!hydrated ? (
                <div
                  data-testid="startup-loading-skeleton"
                  className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#F8F8F9] px-6 select-none"
                  aria-busy="true"
                >
                  <div className="w-full max-w-md space-y-4 rounded-xl border border-zinc-200/80 bg-white p-6 shadow-2xs">
                    <div className="h-4 w-32 rounded bg-zinc-200/70 animate-pulse" />
                    <div className="space-y-2.5">
                      <div className="h-3.5 w-full rounded bg-zinc-100 animate-pulse" />
                      <div className="h-3.5 w-5/6 rounded bg-zinc-100 animate-pulse" />
                      <div className="h-3.5 w-2/3 rounded bg-zinc-100 animate-pulse" />
                    </div>
                    <div className="text-center text-[11px] text-zinc-400">
                      {locale === "en-US" ? "Loading workspace..." : "正在恢复工作区..."}
                    </div>
                  </div>
                </div>
              ) : !activeTab ? (
                <WelcomePane
                  recentEntries={recentEntries}
                  onOpenRecent={handleOpenRecent}
                  onRequestNewPost={handleRequestNewPost}
                  onOpenSettings={() => openSettingsModal("general")}
                />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="no-print shrink-0">
                    <ExternalChangeBanner tab={activeTab} />
                  </div>

                  {!isFocusMode && (
                    <div className="no-print shrink-0">
                      <FrontMatterBar
                        tab={activeTab}
                        onAiCompleteFrontMatter={() =>
                          triggerAiAction("frontmatter_complete")
                        }
                      />
                    </div>
                  )}

                  {showToolbar && !isFocusMode && viewMode !== "read" && (
                    <div className="no-print shrink-0">
                      <EditorToolbar
                        getView={() => editorRef.current?.getView() ?? null}
                        onInsertLocalImage={() =>
                          void handleInsertLocalImagePicker()
                        }
                        onFormatTables={handleFormatTables}
                      />
                    </div>
                  )}

                  {/* Editor / Preview Region */}
                  <div className="relative min-h-0 flex-1 overflow-hidden">
                    {activeTab.isLoading && (
                      <div
                        data-testid="doc-loading-skeleton"
                        className="absolute inset-0 z-30 flex flex-col bg-white p-8 select-none"
                        aria-busy="true"
                      >
                        <div className="mx-auto w-full max-w-3xl space-y-5">
                          <div className="space-y-2 border-b border-zinc-100 pb-4">
                            <div className="text-lg font-semibold text-zinc-800 truncate">
                              {activeTab.title}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-zinc-400">
                              <span className="h-2 w-2 rounded-full bg-zinc-300 animate-pulse" />
                              <span>
                                {locale === "en-US"
                                  ? "Loading document..."
                                  : "正在读取文章内容..."}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="h-3.5 w-11/12 rounded bg-zinc-100 animate-pulse" />
                            <div className="h-3.5 w-full rounded bg-zinc-100 animate-pulse" />
                            <div className="h-3.5 w-4/5 rounded bg-zinc-100 animate-pulse" />
                            <div className="h-24 w-full rounded-md bg-zinc-50 animate-pulse" />
                            <div className="h-3.5 w-3/4 rounded bg-zinc-100 animate-pulse" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Keep MarkdownEditor mounted in a stable tree slot across split/write/focus/read */}
                    <div
                      aria-hidden={viewMode === "read" || Boolean(activeTab.isLoading)}
                      className={
                        viewMode === "read" || activeTab.isLoading
                          ? "no-print pointer-events-none invisible absolute inset-0"
                          : "h-full w-full"
                      }
                    >
                      <PanelGroup
                        direction="horizontal"
                        autoSaveId="hexo-v2-split-panes"
                      >
                        <Panel
                          id="editor"
                          defaultSize={viewMode === "split" ? 50 : 100}
                          minSize={25}
                          order={1}
                          className="no-print"
                        >
                          <MarkdownEditor
                            ref={editorRef}
                            tabId={activeTab.id}
                            openTabIds={openTabIds}
                            isLoading={Boolean(activeTab.isLoading)}
                            value={activeTab.content}
                            onChange={(next) =>
                              updateTabContent(activeTab.id, next)
                            }
                            onCursorChange={(line, col) =>
                              updateTabCursor(activeTab.id, line, col)
                            }
                            onSelectionChange={(sel) =>
                              setEditorSelection(sel.text.trim() ? sel : null)
                            }
                            onScrollLine={(line, ratio) => {
                              if (
                                syncScroll &&
                                viewMode === "split" &&
                                previewSource === "markdown"
                              ) {
                                previewRef.current?.scrollToSourceLine(
                                  line,
                                  ratio
                                );
                              }
                            }}
                            onPasteImageBytes={handlePasteImageBytes}
                            onRequestInsertImage={() =>
                              void handleInsertLocalImagePicker()
                            }
                            onFormatTablesTriggered={handleFormatTables}
                            onHtmlConverted={() =>
                              pushToast(msg.toast.htmlConverted, "info")
                            }
                            placeholder={msg.tabs.editorPlaceholder}
                            focusMode={isFocusMode}
                            showLineNumbers={showLineNumbers}
                            fontFamily={editorPrefs.fontFamily}
                            fontSize={editorPrefs.fontSize}
                            lineHeight={editorPrefs.lineHeight}
                            tabSize={editorPrefs.tabSize}
                            zoomLevel={editorPrefs.zoomLevel}
                          />
                        </Panel>
                        {viewMode === "split" && (
                          <>
                            <PanelResizeHandle className="no-print w-[1px] bg-zinc-200/80 hover:bg-zinc-400 transition-colors cursor-col-resize" />
                            <Panel
                              id="preview"
                              defaultSize={50}
                              minSize={25}
                              order={2}
                            >
                              {!activeTab.isLoading && renderPreviewPane(false)}
                            </Panel>
                          </>
                        )}
                      </PanelGroup>
                    </div>

                    {viewMode === "read" && !activeTab.isLoading && (
                      <div className="relative z-10 h-full w-full bg-white">
                        {renderPreviewPane(true)}
                      </div>
                    )}

                    {/* Floating Selection Mini Trigger Pill + Inline AI Diff Popover */}
                    {editorSelection?.text.trim() &&
                      editorSelection.rect &&
                      !inlineAiOpen &&
                      !activeTab.isLoading &&
                      viewMode !== "read" && (
                        <button
                          type="button"
                          data-testid="inline-ai-selection-trigger"
                          style={{
                            position: "fixed",
                            top: Math.max(8, editorSelection.rect.top - 32),
                            left: Math.max(12, editorSelection.rect.left),
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setInlineAiOpen(true);
                          }}
                          className="no-print z-40 inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-sm backdrop-blur-xs transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 cursor-pointer"
                        >
                          <Sparkles className="h-3 w-3 text-zinc-600" />
                          <span>
                            {locale === "en-US" ? "AI Rewrite" : "AI 改写"}
                          </span>
                          <kbd className="font-mono text-[10px] text-zinc-400">
                            {isMacPlatform() ? "⌘I" : "Ctrl+I"}
                          </kbd>
                        </button>
                      )}

                    {inlineAiOpen && !activeTab.isLoading && viewMode !== "read" && (
                      <InlineAiPopover
                        open={inlineAiOpen}
                        onOpenChange={setInlineAiOpen}
                        locale={locale}
                        aiSettings={aiSettings ?? DEFAULT_AI_SETTINGS}
                        discoveredAgents={discoveredAgents ?? []}
                        activeSiteRoot={activeTab.siteRoot ?? activeSiteRoot}
                        activeDocPath={activeTab.filePath}
                        documentContent={activeTab.content}
                        selectionText={editorSelection?.text ?? ""}
                        selectionRect={editorSelection?.rect ?? null}
                        onApplyReplace={(outputText) => {
                          if (
                            editorSelection &&
                            editorRef.current?.replaceRange(
                              editorSelection.from,
                              editorSelection.to,
                              outputText
                            )
                          ) {
                            pushToast(msg.toast.aiTextApplied, "success");
                          } else {
                            handleApplyAiTextToEditor(
                              outputText,
                              editorSelection?.text.trim()
                                ? "replace-selection"
                                : "insert-cursor"
                            );
                          }
                          setInlineAiOpen(false);
                        }}
                        onOpenAiSettings={() => {
                          setInlineAiOpen(false);
                          openSettingsModal("ai");
                        }}
                      />
                    )}

                    {/* Print-only article fallback for Write / Focus / Live preview modes */}
                    {printFallbackData && (
                      <article className="print-only-article bg-white">
                        {printFallbackData.scopedCss && (
                          <style data-hexo-print-theme-css="true">
                            {printFallbackData.scopedCss}
                          </style>
                        )}
                        {printFallbackData.parsed.hasFrontMatter &&
                          printFallbackData.parsed.data.title && (
                            <header className="mb-6 border-b border-zinc-100 pb-4">
                              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                                {printFallbackData.parsed.data.title}
                              </h1>
                              {(printFallbackData.parsed.data.date ||
                                printFallbackData.parsed.data.categories.length >
                                  0) && (
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                                  {printFallbackData.parsed.data.date && (
                                    <span className="font-mono">
                                      {printFallbackData.parsed.data.date}
                                    </span>
                                  )}
                                  {printFallbackData.parsed.data.categories.map(
                                    (cat) => (
                                      <span
                                        key={cat}
                                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600"
                                      >
                                        {cat}
                                      </span>
                                    )
                                  )}
                                </div>
                              )}
                            </header>
                          )}
                        <div
                          className="markdown-preview markdown-preview-scoped"
                          dangerouslySetInnerHTML={{
                            __html: printFallbackData.html,
                          }}
                        />
                      </article>
                    )}
                  </div>
                </div>
              )}

              {/* Unified Workspace Footer & Collapsible CLI Drawer (hidden in Focus mode) */}
              {!isFocusMode && (
                <HexoTerminalDrawer
                  status={hexoCliStatus}
                  logs={hexoLogs}
                  open={terminalOpen}
                  onOpenChange={setTerminalOpen}
                  onRunAction={(action) => void handleRunHexoAction(action)}
                  onStop={() => void stopHexoAction()}
                  onKillPort={() => void killHexoPort()}
                  onClearLogs={clearHexoLogs}
                  targetUrl={activeLivePostUrl}
                  onOpenServerUrl={(url) => void handleOpenExternalUrl(url)}
                  onAiDiagnose={() => triggerAiAction("diagnose_terminal")}
                  disabled={!activeSiteRoot}
                  locale={locale}
                  engine={siteConfig?.engine}
                  activeTab={activeTab}
                  syncScroll={syncScroll}
                  onToggleSyncScroll={() => setSyncScroll(!syncScroll)}
                  autoSave={autoSave}
                  onToggleAutoSave={() => setAutoSave(!autoSave)}
                  onToggleLocale={() =>
                    setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")
                  }
                  uiFontSize={editorPrefs.uiFontSize ?? "md"}
                  onCycleUiFontSize={() => {
                    const current = editorPrefs.uiFontSize ?? "md";
                    const next =
                      current === "sm" ? "md" : current === "md" ? "lg" : "sm";
                    setEditorPrefs({ uiFontSize: next });
                  }}
                  className="no-print"
                />
              )}
        </div>

        {/* Collapsible Right AI Writing Assistant Drawer */}
        {!isFocusMode && aiDrawerOpen && (
          <AiAssistantDrawer
            open={aiDrawerOpen}
            onOpenChange={setAiDrawerOpen}
            locale={locale}
            aiSettings={aiSettings ?? DEFAULT_AI_SETTINGS}
            onAiSettingsChange={setAiSettings}
            discoveredAgents={discoveredAgents ?? []}
            onRefreshAgents={discoverAgents}
            activeSiteRoot={activeTab?.siteRoot ?? activeSiteRoot}
            activeDocPath={activeTab?.filePath ?? null}
            documentContent={activeTab?.content ?? ""}
            selectionText={aiEditorSelection.text}
            hasSelection={aiEditorSelection.hasSelection}
            terminalLogs={aiTerminalLogLines}
            pendingAction={aiPendingAction}
            onOpenAiSettings={() => openSettingsModal("ai")}
            onApplyTextToEditor={handleApplyAiTextToEditor}
            onApplyFrontMatter={handleApplyAiFrontMatter}
          />
        )}
      </div>

      {/* Command Palette (Cmd/Ctrl + K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        items={commandItems}
        placeholder={msg.command.placeholder}
        emptyText={msg.command.empty}
        locale={locale}
      />

      {/* In-App Settings Center (Cmd/Ctrl + ,) */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        locale={locale}
        initialSection={settingsSection}
        appVersion={appVersion}
        onLocaleChange={setLocale}
        autoSave={autoSave}
        onAutoSaveChange={setAutoSave}
        recentCount={recentEntries.length}
        onClearRecent={clearRecentEntries}
        editorPrefs={editorPrefs}
        onEditorPrefsChange={setEditorPrefs}
        onResetEditorPrefs={resetEditorPrefs}
        showLineNumbers={showLineNumbers}
        onShowLineNumbersChange={setShowLineNumbers}
        showToolbar={showToolbar}
        onShowToolbarChange={setShowToolbar}
        syncScroll={syncScroll}
        onSyncScrollChange={setSyncScroll}
        enableHexoTags={enableHexoTags}
        onEnableHexoTagsChange={setEnableHexoTags}
        themeCssLabel={themeCssLabel}
        hasActiveSite={Boolean(activeSiteRoot)}
        onLoadSiteThemeCss={loadSiteThemeCssAction}
        onImportCustomThemeCss={importCustomThemeCssAction}
        onClearThemeCss={clearThemeCssAction}
        imageBed={imageBed}
        onImageBedChange={setImageBed}
        onTestImageBedConnection={handleTestImageBed}
        aiSettings={aiSettings ?? DEFAULT_AI_SETTINGS}
        onAiSettingsChange={setAiSettings}
        discoveredAgents={discoveredAgents ?? []}
        onRefreshAgents={discoverAgents}
      />

      {/* Image Bed Batch Upload & Unused Local Asset Cleanup Dialog */}
      <ImageBedUploadDialog
        open={imageManagerOpen}
        onOpenChange={setImageManagerOpen}
        initialTab={imageManagerTab}
        locale={locale}
        localImages={localDocImages}
        imageBedConfig={imageBedSummary}
        uploadStatuses={uploadStatuses}
        uploading={uploadingImages}
        onBatchUpload={handleBatchUploadImages}
        onOpenSettings={() => {
          setImageManagerOpen(false);
          openSettingsModal("imagebed");
        }}
        lastUploadBatch={activeUploadBatchInfo}
        undoing={undoingUpload}
        onUndoLastUpload={handleUndoLastUpload}
        unusedImages={unusedImages}
        scanningUnused={scanningUnused}
        cleaningUnused={cleaningUnused}
        onScanUnused={handleScanUnusedImages}
        onDeleteUnused={handleDeleteUnusedImages}
        onAiSuggestImages={() => {
          setImageManagerOpen(false);
          triggerAiAction("image_caption");
        }}
      />

      {/* Modals & Toasts */}
      <NewPostDialog open={newPostOpen} onOpenChange={setNewPostOpen} />

      <ImageRenameDialog
        image={selectedImage}
        onOpenChange={(open) => !open && setSelectedImage(null)}
        onConfirmRename={handleRenameLocalImage}
      />

      <Dialog
        open={Boolean(closeConfirmTab)}
        onOpenChange={(open) => !open && setCloseConfirmTabId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{msg.tabs.unsavedTitle}</DialogTitle>
            <DialogDescription>
              {formatMessage(msg.tabs.unsavedDesc, {
                title: closeConfirmTab?.title ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCloseConfirmTabId(null)}
            >
              {msg.sidebar.cancel}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (closeConfirmTab) closeTab(closeConfirmTab.id);
                setCloseConfirmTabId(null);
              }}
            >
              {msg.tabs.discardAndClose}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!closeConfirmTab) return;
                void saveTab(closeConfirmTab.id).then((saved) => {
                  if (saved) closeTab(closeConfirmTab.id);
                  setCloseConfirmTabId(null);
                });
              }}
            >
              {msg.tabs.saveAndClose}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastHost />
    </div>
  );
}

export default App;
