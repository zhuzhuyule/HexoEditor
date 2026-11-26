import {
  BookOpen,
  Check,
  CloudUpload,
  Columns2,
  Command,
  ExternalLink,
  FileCode2,
  FileText,
  FolderOpen,
  FolderTree,
  Globe,
  Hash,
  Image,
  Images,
  Maximize2,
  MoreHorizontal,
  PanelLeft,
  PenLine,
  Printer,
  Save,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { type QuickOpenAvailability } from "@/components/quickopen/QuickOpenMenu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMessage, getMessages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import type { ViewMode } from "@/types";

interface TabBarProps {
  onRequestCloseTab: (tabId: string) => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onOpenImageManager: () => void;
  onExportHtml: () => void;
  onExportPdf: () => void;
  aiDrawerOpen?: boolean;
  onToggleAiDrawer?: () => void;
  overlayInset?: boolean;
}

export function TabBar({
  onRequestCloseTab,
  onOpenCommandPalette,
  onOpenSettings,
  onOpenImageManager,
  onExportHtml,
  onExportPdf,
  aiDrawerOpen = false,
  onToggleAiDrawer,
  overlayInset = false,
}: TabBarProps) {
  const {
    locale,
    sidebarOpen,
    toggleSidebar,
    activeSiteRoot,
    siteConfig,
    tabs,
    activeTabId,
    setActiveTab,
    viewMode,
    setViewMode,
    saveTab,
    showToolbar,
    toggleToolbar,
    showLineNumbers,
    toggleLineNumbers,
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
    openQuickOpenTarget,
  } = useAppStore();

  const msg = getMessages(locale);
  const isEn = locale === "en-US";
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const modes: {
    id: ViewMode;
    icon: typeof PenLine;
    label: string;
    shortcut: string;
  }[] = [
    { id: "write", icon: PenLine, label: msg.viewMode.write, shortcut: "⌘⌥1" },
    { id: "split", icon: Columns2, label: msg.viewMode.split, shortcut: "⌘⌥2" },
    { id: "read", icon: BookOpen, label: msg.viewMode.read, shortcut: "⌘⌥3" },
    { id: "focus", icon: Maximize2, label: msg.viewMode.focus, shortcut: "⌘⌥4" },
  ];

  const quickOpenAvailability: QuickOpenAvailability = {
    postDir: Boolean(activeTab?.filePath),
    postAssetDir: Boolean(activeTab?.filePath),
    imagesDir: Boolean(activeSiteRoot),
    siteRoot: Boolean(activeSiteRoot),
    blogHome: Boolean(siteConfig?.url?.trim()),
    localPreview: Boolean(
      activeSiteRoot || (hexoCliStatus.serverRunning && hexoCliStatus.serverUrl)
    ),
  };

  const isLivePreview = previewSource === "live";

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "no-print flex h-10 shrink-0 items-center justify-between gap-2 border-b border-zinc-200/80 bg-zinc-50/75 pr-2 select-none",
        overlayInset ? "pl-[76px]" : "pl-2"
      )}
    >
      {/* Left: Sidebar Toggle + Open Tabs */}
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center gap-1"
      >
        <Button
          variant="ghost"
          size="icon"
          title={msg.tabs.toggleSidebar}
          aria-label={msg.tabs.toggleSidebar}
          onClick={toggleSidebar}
          className={cn(!sidebarOpen && "text-zinc-900 bg-zinc-200/60")}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </Button>

        <div
          data-tauri-drag-region
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onRequestCloseTab(tab.id);
                  }
                }}
                title={tab.filePath || tab.title}
                className={cn(
                  "group flex h-7 max-w-[190px] shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors cursor-pointer",
                  isActive
                    ? "bg-white text-zinc-900 font-medium shadow-2xs ring-1 ring-zinc-200/90"
                    : "text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-800"
                )}
              >
                {tab.isDirty && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                    aria-label="unsaved"
                  />
                )}
                <span className="truncate">{tab.title}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestCloseTab(tab.id);
                  }}
                  className={cn(
                    "ml-0.5 rounded p-0.5 text-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-700 cursor-pointer",
                    isActive
                      ? "opacity-70 group-hover:opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Primary Actions + More Tools Menu + Compact View Mode Switcher */}
      <div className="flex shrink-0 items-center gap-0.5">
        {activeTab && (
          <Button
            variant="ghost"
            size="icon"
            title={`${msg.tabs.save} (⌘S)`}
            aria-label={msg.tabs.save}
            disabled={!activeTab.isDirty && Boolean(activeTab.filePath)}
            onClick={() => void saveTab(activeTab.id)}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Markdown Preview / Live Server Preview Switcher */}
        <Button
          variant="ghost"
          size="icon"
          title={
            isLivePreview ? msg.preview.sourceMarkdown : msg.preview.sourceLive
          }
          aria-label={
            isLivePreview ? msg.preview.sourceMarkdown : msg.preview.sourceLive
          }
          aria-pressed={isLivePreview}
          onClick={() => setPreviewSource(isLivePreview ? "markdown" : "live")}
          className={cn(isLivePreview && "bg-zinc-200/70 text-zinc-900")}
        >
          <Globe className="h-3.5 w-3.5" />
        </Button>

        {/* AI Writing Assistant Drawer Toggle */}
        {onToggleAiDrawer && (
          <Button
            variant="ghost"
            size="icon"
            title={msg.ai.openDrawer}
            aria-label={msg.ai.openDrawer}
            aria-pressed={aiDrawerOpen}
            onClick={onToggleAiDrawer}
            className={cn(aiDrawerOpen && "bg-zinc-200/70 text-zinc-900")}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* More Tools Menu (Editor Options, Theme CSS, Image Bed, Export, Quick Open, Cmd+K) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              title={msg.tabs.moreTools}
              aria-label={msg.tabs.moreTools}
              className={cn(
                "relative",
                (showToolbar || showLineNumbers || Boolean(themeCss)) &&
                  "text-zinc-800"
              )}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
              {themeCss && (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-zinc-900"
                />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-60 max-h-[75vh] overflow-y-auto"
          >
            <DropdownMenuLabel>
              {isEn ? "Editor Options" : "编辑器显示"}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={toggleToolbar}
              className="justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-500" />
                <span>{msg.toolbar.toggleToolbar}</span>
              </span>
              {showToolbar && <Check className="h-3.5 w-3.5 text-zinc-900" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={toggleLineNumbers}
              className="justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-zinc-500" />
                <span>{msg.toolbar.toggleLineNumbers}</span>
              </span>
              {showLineNumbers && (
                <Check className="h-3.5 w-3.5 text-zinc-900" />
              )}
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="truncate font-normal text-zinc-500">
              {themeCssLabel
                ? formatMessage(msg.preview.themeCssActive, {
                    label: themeCssLabel,
                  })
                : msg.preview.themeCssNone}
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!activeSiteRoot}
              onSelect={() => void loadSiteThemeCssAction()}
            >
              <Sparkles className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.preview.loadSiteCss}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void importCustomThemeCssAction()}
            >
              <Upload className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.preview.pickCustomCss}</span>
            </DropdownMenuItem>
            {themeCss && (
              <DropdownMenuItem onSelect={clearThemeCssAction}>
                <Trash2 className="h-3.5 w-3.5 text-zinc-500" />
                <span>{msg.preview.clearThemeCss}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => setEnableHexoTags(!enableHexoTags)}
              className="justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <FileCode2 className="h-3.5 w-3.5 text-zinc-500" />
                <span>{msg.preview.toggleHexoTags}</span>
              </span>
              {enableHexoTags && (
                <Check className="h-3.5 w-3.5 text-zinc-900" />
              )}
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              {isEn ? "Assets & Export" : "资源与导出"}
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!activeTab}
              onSelect={onOpenImageManager}
            >
              <CloudUpload className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.tabs.imageManager}</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!activeTab} onSelect={onExportHtml}>
              <FileText className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.export.exportHtml}</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!activeTab} onSelect={onExportPdf}>
              <Printer className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.export.exportPdf}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>{msg.quickOpen.trigger}</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!quickOpenAvailability.postDir}
              onSelect={() => void openQuickOpenTarget("post_dir")}
            >
              <FolderOpen className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.quickOpen.postDir}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!quickOpenAvailability.postAssetDir}
              onSelect={() => void openQuickOpenTarget("post_asset_dir")}
            >
              <Image className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.quickOpen.postAssetDir}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!quickOpenAvailability.imagesDir}
              onSelect={() => void openQuickOpenTarget("images_dir")}
            >
              <Images className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.quickOpen.imagesDir}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!quickOpenAvailability.siteRoot}
              onSelect={() => void openQuickOpenTarget("site_root")}
            >
              <FolderTree className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.quickOpen.siteRoot}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!quickOpenAvailability.localPreview}
              onSelect={() => void openQuickOpenTarget("local_preview")}
            >
              <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.quickOpen.localPreview}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!quickOpenAvailability.blogHome}
              onSelect={() => void openQuickOpenTarget("blog_home")}
            >
              <Globe className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.quickOpen.blogHome}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenCommandPalette}>
              <Command className="h-3.5 w-3.5 text-zinc-500" />
              <span>{msg.command.openPalette}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings Dialog Trigger (Cmd+,) */}
        <Button
          variant="ghost"
          size="icon"
          title={`${msg.tabs.settings} (⌘,)`}
          aria-label={msg.tabs.settings}
          onClick={onOpenSettings}
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>

        <span className="mx-1 h-3.5 w-px bg-zinc-200/80" aria-hidden="true" />

        {/* Compact Icon-Only View Modes */}
        <div className="inline-flex items-center rounded-md bg-zinc-200/60 p-0.5">
          {modes.map((m) => {
            const Icon = m.icon;
            const active = viewMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                title={`${m.label} (${m.shortcut})`}
                aria-label={m.label}
                aria-pressed={active}
                onClick={() => setViewMode(m.id)}
                className={cn(
                  "inline-flex h-6 items-center justify-center rounded px-1.5 text-[11px] font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-white text-zinc-900 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-800"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
