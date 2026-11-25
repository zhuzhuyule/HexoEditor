import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  BookOpen,
  Columns2,
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
  RefreshCw,
  Rocket,
  Save,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import {
  CommandPalette,
  type CommandPaletteItem,
} from "@/components/command/CommandPalette";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { FrontMatterBar } from "@/components/editor/FrontMatterBar";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/editor/MarkdownEditor";
import { ExternalChangeBanner } from "@/components/layout/ExternalChangeBanner";
import { StatusBar } from "@/components/layout/StatusBar";
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
  type MarkdownPreviewHandle,
} from "@/components/preview/MarkdownPreview";
import { NewPostDialog } from "@/components/sidebar/NewPostDialog";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { TabBar } from "@/components/tabs/TabBar";
import { HexoTerminalDrawer } from "@/components/terminal/HexoTerminalDrawer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMessage, getMessages } from "@/lib/i18n";
import * as api from "@/lib/tauri/api";
import * as hexoApi from "@/lib/tauri/hexoApi";
import { formatMarkdownImageSnippet } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const MD_EXT_RE = /\.(md|markdown|mdx)$/i;

export function App() {
  const {
    locale,
    sidebarOpen,
    toggleSidebar,
    setSidebarOpen,
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
    toggleToolbar,
    showLineNumbers,
    toggleLineNumbers,
    recentEntries,
    enableHexoTags,
    setEnableHexoTags,
    themeCss,
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
    hydrate,
    addSite,
    switchSite,
    refreshActiveSite,
    openPost,
    updateTabContent,
    updateTabCursor,
    saveTab,
    saveTabAs,
    closeTab,
    openStandaloneFile,
    createScratchTab,
    handleExternalChange,
    pushToast,
  } = useAppStore();

  const msg = getMessages(locale);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const previewRef = useRef<MarkdownPreviewHandle | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const lastCloseShortcutRef = useRef<{
    source: "menu" | "keydown";
    at: number;
  }>({ source: "keydown", at: -Infinity });

  const [newPostOpen, setNewPostOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [closeConfirmTabId, setCloseConfirmTabId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedLocalImage | null>(null);
  const [imageVersion, setImageVersion] = useState(0);

  // Hydrate persisted state & active Hexo site on boot
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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
        // Avoid inserting into a different tab if user switched tabs mid-save
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

  // Global keyboard shortcuts (capture phase ensures Cmd/Ctrl+K works even when CodeMirror has focus)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Cmd/Ctrl + K -> Command Palette (never conflicts with Mod-Shift-k code block)
      if (mod && !e.shiftKey && !e.altKey && (key === "k" || e.code === "KeyK")) {
        e.preventDefault();
        e.stopPropagation();
        setCommandPaletteOpen((open) => !open);
        return;
      }

      if (
        e.key === "Escape" &&
        viewMode === "focus" &&
        !commandPaletteOpen &&
        !closeConfirmTabId &&
        !newPostOpen &&
        !selectedImage
      ) {
        e.preventDefault();
        exitFocusMode();
        return;
      }

      if (!mod) return;

      // Support both Cmd/Ctrl+Shift+1..4 and Cmd/Ctrl+Option/Alt+1..4 (avoids macOS screenshot shortcuts)
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
    msg.sidebar.openFile,
    newPostOpen,
    openStandaloneFile,
    saveTab,
    saveTabAs,
    selectedImage,
    setViewMode,
    toggleSidebar,
    triggerShortcutCloseActiveTab,
    viewMode,
  ]);

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

  const commandItems = useMemo<CommandPaletteItem[]>(() => {
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

    // 6. Hexo CLI Commands
    items.push(
      {
        id: "hexo:server",
        label: msg.command.hexoServer,
        group: msg.command.groupHexo,
        disabled: !activeSiteRoot || hexoCliStatus.running,
        keywords: ["hexo", "server", "s", "preview"],
        icon: <Play className="h-3.5 w-3.5" />,
        onSelect: () => void runHexoAction("server"),
      },
      {
        id: "hexo:stop",
        label: msg.command.hexoStop,
        group: msg.command.groupHexo,
        disabled: !hexoCliStatus.running,
        keywords: ["hexo", "stop", "kill"],
        icon: <Square className="h-3.5 w-3.5" />,
        onSelect: () => void stopHexoAction(),
      },
      {
        id: "hexo:generate",
        label: msg.command.hexoGenerate,
        group: msg.command.groupHexo,
        disabled: !activeSiteRoot || hexoCliStatus.running,
        keywords: ["hexo", "generate", "g", "build"],
        icon: <Hammer className="h-3.5 w-3.5" />,
        onSelect: () => void runHexoAction("generate"),
      },
      {
        id: "hexo:generate-deploy",
        label: msg.command.hexoGenerateDeploy,
        group: msg.command.groupHexo,
        disabled: !activeSiteRoot || hexoCliStatus.running,
        keywords: ["hexo", "g", "d", "deploy", "hgd"],
        icon: <Rocket className="h-3.5 w-3.5" />,
        onSelect: () => void runHexoAction("generate_deploy"),
      },
      {
        id: "hexo:deploy",
        label: msg.command.hexoDeploy,
        group: msg.command.groupHexo,
        disabled: !activeSiteRoot || hexoCliStatus.running,
        keywords: ["hexo", "deploy", "d"],
        icon: <Send className="h-3.5 w-3.5" />,
        onSelect: () => void runHexoAction("deploy"),
      },
      {
        id: "hexo:clean",
        label: msg.command.hexoClean,
        group: msg.command.groupHexo,
        disabled: !activeSiteRoot || hexoCliStatus.running,
        keywords: ["hexo", "clean"],
        icon: <Eraser className="h-3.5 w-3.5" />,
        onSelect: () => void runHexoAction("clean"),
      },
      {
        id: "hexo:kill-port",
        label: msg.command.hexoKillPort,
        group: msg.command.groupHexo,
        keywords: ["hexo", "port", "4000", "kill", "free"],
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

    return items;
  }, [
    activeSiteRoot,
    activeTab,
    addSite,
    autoSave,
    clearThemeCssAction,
    createScratchTab,
    enableHexoTags,
    handleRequestCloseTab,
    handleRequestNewPost,
    hexoCliStatus.running,
    hexoCliStatus.serverRunning,
    hexoCliStatus.serverUrl,
    importCustomThemeCssAction,
    killHexoPort,
    loadSiteThemeCssAction,
    msg,
    openPost,
    openQuickOpenTarget,
    openStandaloneFile,
    posts,
    refreshActiveSite,
    runHexoAction,
    saveTab,
    saveTabAs,
    setActiveTab,
    setAutoSave,
    setEnableHexoTags,
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
  ]);

  const closeConfirmTab = tabs.find((t) => t.id === closeConfirmTabId) ?? null;
  const isFocusMode = viewMode === "focus";
  const showSidebar = sidebarOpen && !isFocusMode;

  const renderPreviewPane = (centered = false) => {
    if (previewSource === "live") {
      return (
        <LiveSitePreview
          serverUrl={hexoCliStatus.serverUrl}
          serverRunning={hexoCliStatus.serverRunning}
          currentPostSlug={activePostSlug}
          onStartServer={
            activeSiteRoot ? () => void runHexoAction("server") : undefined
          }
          onOpenExternal={(url) => void api.openExternalUrl(url)}
          locale={locale}
        />
      );
    }

    if (!activeTab) return null;

    return (
      <MarkdownPreview
        ref={previewRef}
        content={activeTab.content}
        docPath={activeTab.filePath}
        siteRoot={activeTab.siteRoot}
        sourceDir={activeTab.sourceDir}
        imageVersion={imageVersion}
        themeCss={themeCss}
        enableHexoTags={enableHexoTags}
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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-zinc-900">
      {/* Main Area (Sidebar + Editor Workspace) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="hexo-v2-main-layout">
          {showSidebar && (
            <>
              <Panel id="sidebar" defaultSize={21} minSize={15} maxSize={36} order={1}>
                <Sidebar
                  onRequestNewPost={() => setNewPostOpen(true)}
                  onSelectOutline={handleSelectOutline}
                />
              </Panel>
              <PanelResizeHandle className="w-[1px] bg-transparent hover:bg-zinc-300 transition-colors cursor-col-resize" />
            </>
          )}

          <Panel
            id="workspace"
            defaultSize={showSidebar ? 79 : 100}
            order={2}
            minSize={50}
          >
            <div className="relative flex h-full w-full flex-col overflow-hidden">
              {/* Top Tab Bar (hidden in Focus mode) */}
              {!isFocusMode && (
                <TabBar
                  onRequestCloseTab={handleRequestCloseTab}
                  onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                />
              )}

              {/* Focus Mode Floating Exit Pill */}
              {isFocusMode && (
                <div className="fixed right-4 top-3 z-40">
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

              {/* Active Document Workspace or Welcome Empty State */}
              {!activeTab ? (
                <WelcomePane
                  recentEntries={recentEntries}
                  onOpenRecent={handleOpenRecent}
                  onRequestNewPost={handleRequestNewPost}
                />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <ExternalChangeBanner tab={activeTab} />

                  {!isFocusMode && <FrontMatterBar tab={activeTab} />}

                  {showToolbar && !isFocusMode && viewMode !== "read" && (
                    <EditorToolbar
                      getView={() => editorRef.current?.getView() ?? null}
                      onInsertLocalImage={() => void handleInsertLocalImagePicker()}
                      onFormatTables={handleFormatTables}
                    />
                  )}

                  {/* Editor / Preview Region */}
                  <div className="relative min-h-0 flex-1 overflow-hidden">
                    {/* Keep MarkdownEditor mounted in a stable tree slot across split/write/focus/read */}
                    <div
                      aria-hidden={viewMode === "read"}
                      className={
                        viewMode === "read"
                          ? "pointer-events-none invisible absolute inset-0"
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
                        >
                          <MarkdownEditor
                            key={activeTab.id}
                            ref={editorRef}
                            value={activeTab.content}
                            onChange={(next) =>
                              updateTabContent(activeTab.id, next)
                            }
                            onCursorChange={(line, col) =>
                              updateTabCursor(activeTab.id, line, col)
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
                          />
                        </Panel>
                        {viewMode === "split" && (
                          <>
                            <PanelResizeHandle className="w-[1px] bg-zinc-200/80 hover:bg-zinc-400 transition-colors cursor-col-resize" />
                            <Panel
                              id="preview"
                              defaultSize={50}
                              minSize={25}
                              order={2}
                            >
                              {renderPreviewPane(false)}
                            </Panel>
                          </>
                        )}
                      </PanelGroup>
                    </div>

                    {viewMode === "read" && (
                      <div className="relative z-10 h-full w-full bg-white">
                        {renderPreviewPane(true)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Collapsible Hexo CLI Terminal Drawer (hidden in Focus mode) */}
              {!isFocusMode && (
                <HexoTerminalDrawer
                  status={hexoCliStatus}
                  logs={hexoLogs}
                  open={terminalOpen}
                  onOpenChange={setTerminalOpen}
                  onRunAction={(action) => void runHexoAction(action)}
                  onStop={() => void stopHexoAction()}
                  onKillPort={() => void killHexoPort()}
                  onClearLogs={clearHexoLogs}
                  onOpenServerUrl={(url) => void api.openExternalUrl(url)}
                  disabled={!activeSiteRoot}
                  locale={locale}
                />
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Bottom Status Bar (hidden in Focus mode) */}
      {!isFocusMode && <StatusBar activeTab={activeTab} />}

      {/* Command Palette (Cmd/Ctrl + K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        items={commandItems}
        placeholder={msg.command.placeholder}
        emptyText={msg.command.empty}
        locale={locale}
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
