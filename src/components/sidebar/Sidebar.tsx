import {
  Check,
  ChevronDown,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  FolderTree,
  MoreHorizontal,
  RefreshCw,
  Search,
  Send,
  Tag,
  Trash2,
  X,
  Archive,
} from "lucide-react";
import { useMemo, useState } from "react";

import { OutlinePanel } from "@/components/sidebar/OutlinePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMessage, getMessages } from "@/lib/i18n";
import { extractMarkdownToc } from "@/lib/markdown/toc";
import * as api from "@/lib/tauri/api";
import { cn, formatShortDate } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import type { PostSummary } from "@/types";

interface SidebarProps {
  onRequestNewPost: () => void;
  onSelectOutline?: (line: number, id: string) => void;
}

export function Sidebar({ onRequestNewPost, onSelectOutline }: SidebarProps) {
  const {
    locale,
    sites,
    activeSiteRoot,
    siteConfig,
    posts,
    allTags,
    allCategories,
    isScanning,
    sidebarTab,
    setSidebarTab,
    filterTab,
    searchQuery,
    selectedCategory,
    selectedTag,
    tabs,
    activeTabId,
    setFilterTab,
    setSearchQuery,
    setSelectedCategory,
    setSelectedTag,
    clearFilters,
    addSite,
    switchSite,
    removeSite,
    refreshActiveSite,
    openPost,
    openStandaloneFile,
    toggleDraftStatus,
    deletePostItem,
  } = useAppStore();

  const msg = getMessages(locale);
  const [deleteTarget, setDeleteTarget] = useState<PostSummary | null>(null);
  const [deleteAssets, setDeleteAssets] = useState(true);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  const activeFilePath = activeTab?.filePath ?? null;

  const outlineItems = useMemo(
    () => (activeTab ? extractMarkdownToc(activeTab.content) : []),
    [activeTab?.content]
  );

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((post) => {
      if (filterTab === "posts" && post.isDraft) return false;
      if (filterTab === "drafts" && !post.isDraft) return false;
      if (selectedCategory && !post.categories.includes(selectedCategory)) return false;
      if (selectedTag && !post.tags.includes(selectedTag)) return false;
      if (q) {
        const hay = [
          post.title,
          post.fileName,
          ...post.tags,
          ...post.categories,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [posts, filterTab, selectedCategory, selectedTag, searchQuery]);

  const hasActiveFilters = Boolean(selectedCategory || selectedTag || searchQuery.trim());

  const handlePickSite = async () => {
    const picked = await api.pickDirectory(msg.sidebar.addSite);
    if (picked) {
      await addSite(picked);
    }
  };

  const handlePickFile = async () => {
    const picked = await api.pickMarkdownFile(msg.sidebar.openFile);
    if (picked) {
      await openStandaloneFile(picked);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await deletePostItem(deleteTarget.filePath, deleteAssets);
    setDeleteTarget(null);
  };

  return (
    <aside className="flex h-full w-full flex-col bg-zinc-50/70 border-r border-zinc-200/80 select-none overflow-hidden">
      {/* Site Selector & Primary Actions */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-zinc-200/70 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center justify-between gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-zinc-800 hover:bg-zinc-200/60 transition-colors cursor-pointer"
            >
              <span className="truncate">
                {siteConfig?.title || msg.sidebar.noSite}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60" align="start">
            {sites.length > 0 && (
              <>
                <DropdownMenuLabel>{msg.sidebar.sitesLabel}</DropdownMenuLabel>
                {sites.map((site) => (
                  <DropdownMenuItem
                    key={site.rootPath}
                    onSelect={() => void switchSite(site.rootPath)}
                    className="justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-zinc-800">
                        {site.title}
                      </div>
                      <div className="truncate text-[10px] text-zinc-400">
                        {site.rootPath}
                      </div>
                    </div>
                    {site.rootPath === activeSiteRoot && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-zinc-900" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => void handlePickSite()}>
              <FolderPlus className="h-3.5 w-3.5 text-zinc-500" />
              {msg.sidebar.addSite}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handlePickFile()}>
              <FolderOpen className="h-3.5 w-3.5 text-zinc-500" />
              {msg.sidebar.openFile}
            </DropdownMenuItem>
            {activeSiteRoot && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void refreshActiveSite()}>
                  <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
                  {msg.sidebar.refreshSite}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onSelect={() => void removeSite(activeSiteRoot)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {msg.sidebar.removeSite}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {activeSiteRoot && (
          <Button
            variant="ghost"
            size="icon"
            title={msg.sidebar.newPost}
            onClick={onRequestNewPost}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          title={msg.sidebar.openFile}
          onClick={() => void handlePickFile()}
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Posts / Outline Switcher */}
      <div className="border-b border-zinc-200/70 px-2.5 py-1.5 shrink-0">
        <div
          role="tablist"
          aria-label={msg.sidebar.panelPosts}
          className="grid grid-cols-2 rounded-md bg-zinc-200/60 p-0.5"
        >
          {(["posts", "outline"] as const).map((tabKey) => {
            const active = sidebarTab === tabKey;
            const label =
              tabKey === "posts" ? msg.sidebar.panelPosts : msg.sidebar.panelOutline;
            return (
              <button
                key={tabKey}
                type="button"
                role="tab"
                aria-selected={active}
                data-sidebar-tab={tabKey}
                onClick={() => setSidebarTab(tabKey)}
                className={cn(
                  "rounded py-1 text-[11px] font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-white text-zinc-900 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-800"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Outline Panel or Posts Panel */}
      {sidebarTab === "outline" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <OutlinePanel
            items={outlineItems}
            activeLine={activeTab?.cursorLine ?? 1}
            onSelectLine={(line, id) => onSelectOutline?.(line, id)}
            emptyText={
              activeTab ? msg.sidebar.emptyOutline : msg.sidebar.noActiveDocOutline
            }
            locale={locale}
          />
        </div>
      ) : !activeSiteRoot ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
          <div className="mb-3 rounded-lg border border-zinc-200 bg-white p-2.5 text-zinc-400">
            <FolderTree className="h-5 w-5" />
          </div>
          <p className="text-xs font-medium text-zinc-700">{msg.sidebar.emptySite}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
            {msg.sidebar.emptySiteHint}
          </p>
          <div className="mt-4 flex flex-col gap-2 w-full">
            <Button size="sm" className="w-full" onClick={() => void handlePickSite()}>
              <FolderPlus className="h-3.5 w-3.5" />
              {msg.sidebar.addSite}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => void handlePickFile()}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {msg.sidebar.openFile}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Search + All/Posts/Drafts + Taxonomy Filters */}
          <div className="space-y-2 px-2.5 py-2 border-b border-zinc-200/70 shrink-0">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={msg.sidebar.searchPlaceholder}
                className="h-7 bg-white pl-7 pr-6 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-1">
              <div className="inline-flex rounded-md bg-zinc-200/60 p-0.5">
                {(["all", "posts", "drafts"] as const).map((tab) => {
                  const label =
                    tab === "all"
                      ? msg.sidebar.tabAll
                      : tab === "posts"
                      ? msg.sidebar.tabPosts
                      : msg.sidebar.tabDrafts;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilterTab(tab)}
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                        filterTab === tab
                          ? "bg-white text-zinc-900 shadow-2xs"
                          : "text-zinc-500 hover:text-zinc-800"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-0.5">
                {/* Category Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title={msg.sidebar.filterCategory}
                      className={cn(
                        "inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] transition-colors cursor-pointer",
                        selectedCategory
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-800"
                      )}
                    >
                      <FolderTree className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="end">
                    <div className="mb-1.5 flex items-center justify-between px-1">
                      <span className="text-[11px] font-medium text-zinc-500">
                        {msg.sidebar.filterCategory}
                      </span>
                      {selectedCategory && (
                        <button
                          type="button"
                          onClick={() => setSelectedCategory(null)}
                          className="text-[11px] text-zinc-500 hover:text-zinc-900 cursor-pointer"
                        >
                          {msg.sidebar.clearFilters}
                        </button>
                      )}
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-0.5">
                      {allCategories.length === 0 ? (
                        <p className="px-2 py-2 text-[11px] text-zinc-400">—</p>
                      ) : (
                        allCategories.map((cat) => (
                          <button
                            key={cat.name}
                            type="button"
                            onClick={() =>
                              setSelectedCategory(
                                selectedCategory === cat.name ? null : cat.name
                              )
                            }
                            className={cn(
                              "flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition-colors cursor-pointer",
                              selectedCategory === cat.name
                                ? "bg-zinc-900 text-white"
                                : "hover:bg-zinc-100 text-zinc-700"
                            )}
                          >
                            <span className="truncate">{cat.name}</span>
                            <span className="text-[10px] opacity-70">{cat.count}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Tag Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title={msg.sidebar.filterTag}
                      className={cn(
                        "inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] transition-colors cursor-pointer",
                        selectedTag
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-800"
                      )}
                    >
                      <Tag className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 p-2" align="end">
                    <div className="mb-1.5 flex items-center justify-between px-1">
                      <span className="text-[11px] font-medium text-zinc-500">
                        {msg.sidebar.filterTag}
                      </span>
                      {selectedTag && (
                        <button
                          type="button"
                          onClick={() => setSelectedTag(null)}
                          className="text-[11px] text-zinc-500 hover:text-zinc-900 cursor-pointer"
                        >
                          {msg.sidebar.clearFilters}
                        </button>
                      )}
                    </div>
                    <div className="flex max-h-52 flex-wrap gap-1 overflow-y-auto p-0.5">
                      {allTags.length === 0 ? (
                        <p className="px-2 py-2 text-[11px] text-zinc-400">—</p>
                      ) : (
                        allTags.map((tag) => (
                          <button
                            key={tag.name}
                            type="button"
                            onClick={() =>
                              setSelectedTag(selectedTag === tag.name ? null : tag.name)
                            }
                            className={cn(
                              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer",
                              selectedTag === tag.name
                                ? "bg-zinc-900 text-white"
                                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                            )}
                          >
                            <span>#{tag.name}</span>
                            <span className="text-[10px] opacity-65">{tag.count}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {(selectedCategory || selectedTag) && (
              <div className="flex flex-wrap items-center gap-1">
                {selectedCategory && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    {selectedCategory}
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(null)}
                      className="hover:text-zinc-900 cursor-pointer"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                )}
                {selectedTag && (
                  <Badge variant="outline" className="gap-1 pr-1">
                    #{selectedTag}
                    <button
                      type="button"
                      onClick={() => setSelectedTag(null)}
                      className="hover:text-zinc-900 cursor-pointer"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Post List (Single Scroll Container) */}
          <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-0.5">
            {filteredPosts.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-zinc-400">
                <p>{msg.sidebar.emptyPosts}</p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-2 text-zinc-600 underline underline-offset-2 hover:text-zinc-900 cursor-pointer"
                  >
                    {msg.sidebar.clearFilters}
                  </button>
                )}
              </div>
            ) : (
              filteredPosts.map((post) => {
                const isActive = activeFilePath === post.filePath;
                return (
                  <div
                    key={post.filePath}
                    onClick={() => void openPost(post)}
                    className={cn(
                      "group relative flex flex-col gap-1 rounded-md px-2.5 py-2 transition-colors cursor-pointer",
                      isActive
                        ? "bg-white text-zinc-900 shadow-2xs ring-1 ring-zinc-200/90"
                        : "text-zinc-700 hover:bg-zinc-200/50"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-1.5" title={post.title}>
                      <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium leading-snug">
                        {post.title}
                      </span>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "absolute right-1.5 top-1.5 rounded p-0.5 text-zinc-400 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 hover:text-zinc-700 transition-opacity cursor-pointer",
                            isActive
                              ? "bg-white/95 hover:bg-zinc-100"
                              : "bg-zinc-100/95 hover:bg-zinc-200/90"
                          )}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onSelect={() => void toggleDraftStatus(post)}
                        >
                          {post.isDraft ? (
                            <>
                              <Send className="h-3.5 w-3.5 text-zinc-500" />
                              {msg.sidebar.publishAction}
                            </>
                          ) : (
                            <>
                              <Archive className="h-3.5 w-3.5 text-zinc-500" />
                              {msg.sidebar.moveToDraftAction}
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => void api.revealInFileManager(post.filePath)}
                        >
                          <FolderOpen className="h-3.5 w-3.5 text-zinc-500" />
                          {msg.sidebar.revealAction}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onSelect={() => {
                            setDeleteAssets(post.hasAssetFolder);
                            setDeleteTarget(post);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {msg.sidebar.deleteAction}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex min-w-0 items-center justify-between gap-2 pl-5 text-[11px] text-zinc-400">
                      <div className="flex shrink-0 items-center gap-1.5">
                        {post.isDraft && (
                          <Badge variant="amber" className="px-1.5 py-0.5 text-[10px]">
                            {msg.sidebar.draftBadge}
                          </Badge>
                        )}
                        <span className="shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums">
                          {formatShortDate(post.date)}
                        </span>
                      </div>
                      {post.tags.length > 0 && (
                        <span
                          className="min-w-0 truncate text-right text-[10px] text-zinc-400"
                          title={post.tags.map((t) => `#${t}`).join(" ")}
                        >
                          #{post.tags[0]}
                          {post.tags.length > 1 ? ` +${post.tags.length - 1}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="flex items-center justify-between border-t border-zinc-200/70 px-3 py-1.5 text-[11px] text-zinc-400 shrink-0">
            <span>
              {formatMessage(msg.sidebar.postCount, { count: filteredPosts.length })}
            </span>
            <button
              type="button"
              onClick={() => void refreshActiveSite()}
              disabled={isScanning}
              title={msg.sidebar.refreshSite}
              className="rounded p-0.5 hover:bg-zinc-200/70 hover:text-zinc-700 cursor-pointer"
            >
              <RefreshCw
                className={cn("h-3 w-3", isScanning && "animate-spin")}
              />
            </button>
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{msg.sidebar.deleteConfirmTitle}</DialogTitle>
            <DialogDescription>
              {formatMessage(msg.sidebar.deleteConfirmDesc, {
                title: deleteTarget?.title ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget?.hasAssetFolder && (
            <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteAssets}
                onChange={(e) => setDeleteAssets(e.target.checked)}
                className="rounded border-zinc-300"
              />
              {msg.sidebar.deleteWithAssets}
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              {msg.sidebar.cancel}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleConfirmDelete()}
            >
              {msg.sidebar.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
