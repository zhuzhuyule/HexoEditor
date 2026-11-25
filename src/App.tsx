import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Minimize2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { FrontMatterBar } from "@/components/editor/FrontMatterBar";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/editor/MarkdownEditor";
import { ExternalChangeBanner } from "@/components/layout/ExternalChangeBanner";
import { StatusBar } from "@/components/layout/StatusBar";
import { ToastHost } from "@/components/layout/ToastHost";
import { WelcomePane } from "@/components/layout/WelcomePane";
import {
  ImageRenameDialog,
  type SelectedLocalImage,
} from "@/components/preview/ImageRenameDialog";
import {
  MarkdownPreview,
  type MarkdownPreviewHandle,
} from "@/components/preview/MarkdownPreview";
import { NewPostDialog } from "@/components/sidebar/NewPostDialog";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { TabBar } from "@/components/tabs/TabBar";
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
import { formatMarkdownImageSnippet } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const MD_EXT_RE = /\.(md|markdown|mdx)$/i;

export function App() {
  const {
    locale,
    sidebarOpen,
    toggleSidebar,
    activeSiteRoot,
    tabs,
    activeTabId,
    viewMode,
    setViewMode,
    exitFocusMode,
    syncScroll,
    autoSave,
    hydrate,
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
    void api.listenExternalFileChanges((event) => {
      handleExternalChange(event);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [handleExternalChange]);

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
      const tab = useAppStore.getState().tabs.find(
        (t) => t.id === useAppStore.getState().activeTabId
      );
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
    const tab = useAppStore.getState().tabs.find(
      (t) => t.id === useAppStore.getState().activeTabId
    );
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

  // Listen for Tauri native OS file drag-and-drop (handles local image & .md drop reliably on macOS/Win/Linux)
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
  }, [autoSave, activeTab?.id, activeTab?.content, activeTab?.isDirty, activeTab?.filePath, saveTab]);

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

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (
        e.key === "Escape" &&
        viewMode === "focus" &&
        !closeConfirmTabId &&
        !newPostOpen &&
        !selectedImage
      ) {
        e.preventDefault();
        exitFocusMode();
        return;
      }

      if (!mod) return;

      if (e.shiftKey && !e.altKey) {
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

      const key = e.key.toLowerCase();
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

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeSiteRoot,
    activeTabId,
    closeConfirmTabId,
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

  const closeConfirmTab = tabs.find((t) => t.id === closeConfirmTabId) ?? null;
  const isFocusMode = viewMode === "focus";
  const showSidebar = sidebarOpen && !isFocusMode;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-zinc-900">
      {/* Main Area (Sidebar + Editor Workspace) */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="hexo-v2-main-layout">
          {showSidebar && (
            <>
              <Panel id="sidebar" defaultSize={21} minSize={15} maxSize={36} order={1}>
                <Sidebar onRequestNewPost={() => setNewPostOpen(true)} />
              </Panel>
              <PanelResizeHandle className="w-[1px] bg-transparent hover:bg-zinc-300 transition-colors cursor-col-resize" />
            </>
          )}

          <Panel id="workspace" defaultSize={showSidebar ? 79 : 100} order={2} minSize={50}>
            <div className="relative flex h-full w-full flex-col overflow-hidden">
              {/* Top Tab Bar (hidden in Focus mode) */}
              {!isFocusMode && (
                <TabBar onRequestCloseTab={handleRequestCloseTab} />
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
                <WelcomePane />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <ExternalChangeBanner tab={activeTab} />

                  {!isFocusMode && <FrontMatterBar tab={activeTab} />}

                  {!isFocusMode && viewMode !== "read" && (
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
                              if (syncScroll && viewMode === "split") {
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
                          />
                        </Panel>
                        {viewMode === "split" && (
                          <>
                            <PanelResizeHandle className="w-[1px] bg-zinc-200/80 hover:bg-zinc-400 transition-colors cursor-col-resize" />
                            <Panel id="preview" defaultSize={50} minSize={25} order={2}>
                              <MarkdownPreview
                                ref={previewRef}
                                content={activeTab.content}
                                docPath={activeTab.filePath}
                                siteRoot={activeTab.siteRoot}
                                sourceDir={activeTab.sourceDir}
                                imageVersion={imageVersion}
                                onScrollLine={(line) => {
                                  if (syncScroll) {
                                    editorRef.current?.scrollToSourceLine(line);
                                  }
                                }}
                                onClickLocalImage={setSelectedImage}
                              />
                            </Panel>
                          </>
                        )}
                      </PanelGroup>
                    </div>

                    {viewMode === "read" && (
                      <div className="relative z-10 h-full w-full bg-white">
                        <MarkdownPreview
                          ref={previewRef}
                          content={activeTab.content}
                          docPath={activeTab.filePath}
                          siteRoot={activeTab.siteRoot}
                          sourceDir={activeTab.sourceDir}
                          imageVersion={imageVersion}
                          onClickLocalImage={setSelectedImage}
                          centered
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Bottom Status Bar (hidden in Focus mode) */}
      {!isFocusMode && <StatusBar activeTab={activeTab} />}

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
