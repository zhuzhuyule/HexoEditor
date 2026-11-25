import {
  Clock,
  FileEdit,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  FolderTree,
} from "lucide-react";

import { getMessages } from "@/lib/i18n";
import * as api from "@/lib/tauri/api";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import type { Locale } from "@/types";

export interface WelcomeRecentEntry {
  path: string;
  title: string;
  kind: "file" | "site";
  openedAt: number;
}

export interface WelcomePaneProps {
  recentEntries?: WelcomeRecentEntry[];
  onOpenRecent?: (entry: WelcomeRecentEntry) => void;
  onRequestNewPost?: () => void;
}

function formatRecentTime(timestamp: number, locale: Locale): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  const isEn = locale === "en-US";

  if (diffSec < 60) {
    return isEn ? "Just now" : "刚刚";
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return isEn ? `${diffMin}m ago` : `${diffMin} 分钟前`;
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return isEn ? `${diffHour}h ago` : `${diffHour} 小时前`;
  }

  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const currentYear = new Date(now).getFullYear();
  return year === currentYear
    ? `${month}-${day} ${hours}:${minutes}`
    : `${year}-${month}-${day}`;
}

export function WelcomePane({
  recentEntries = [],
  onOpenRecent,
  onRequestNewPost,
}: WelcomePaneProps = {}) {
  const {
    locale,
    addSite,
    switchSite,
    openStandaloneFile,
    createScratchTab,
  } = useAppStore();
  const msg = getMessages(locale);
  const isEn = locale === "en-US";

  const handleNewPost = () => {
    if (onRequestNewPost) {
      onRequestNewPost();
      return;
    }
    createScratchTab();
  };

  const handleAddSite = async () => {
    const dir = await api.pickDirectory(msg.sidebar.addSite);
    if (dir) await addSite(dir);
  };

  const handleOpenFile = async () => {
    const file = await api.pickMarkdownFile(msg.sidebar.openFile);
    if (file) await openStandaloneFile(file);
  };

  const handleOpenRecent = (entry: WelcomeRecentEntry) => {
    if (onOpenRecent) {
      onOpenRecent(entry);
      return;
    }
    if (entry.kind === "site") {
      void switchSite(entry.path);
    } else {
      void openStandaloneFile(entry.path);
    }
  };

  const quickActions = [
    {
      id: "new-post",
      label: msg.sidebar.newPost,
      hint: isEn ? "Create a Hexo post" : "创建新文章",
      icon: FilePlus2,
      onClick: handleNewPost,
    },
    {
      id: "open-file",
      label: msg.welcome.openFile,
      hint: isEn ? "Edit any .md file" : "打开任意 Markdown",
      icon: FolderOpen,
      onClick: () => void handleOpenFile(),
    },
    {
      id: "add-site",
      label: msg.welcome.addSite,
      hint: isEn ? "Connect a Hexo blog" : "接入本地博客目录",
      icon: FolderPlus,
      onClick: () => void handleAddSite(),
    },
    {
      id: "new-scratch",
      label: msg.welcome.newScratch,
      hint: isEn ? "Quick untitled note" : "立即开始轻量草稿",
      icon: FileEdit,
      onClick: createScratchTab,
    },
  ];

  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-y-auto bg-[#F8F8F9] px-6 py-10 select-none">
      <div className="w-full max-w-xl space-y-8">
        {/* Minimalist Title Header */}
        <div className="space-y-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {msg.appName}
          </h1>
          <p className="text-xs text-zinc-400">{msg.welcome.subtitle}</p>
        </div>

        {/* 4 Concise Quick Entry Cards */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                className={cn(
                  "group flex flex-col items-start gap-2.5 rounded-lg border border-zinc-200/80 bg-white p-3.5 text-left transition-all cursor-pointer",
                  "hover:border-zinc-300 hover:bg-white hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40"
                )}
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100/90 text-zinc-600 transition-colors group-hover:bg-zinc-900 group-hover:text-white">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 w-full space-y-0.5">
                  <div className="truncate text-xs font-medium text-zinc-800 group-hover:text-zinc-950">
                    {action.label}
                  </div>
                  <div className="truncate text-[11px] text-zinc-400">
                    {action.hint}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Recent Opened Entries */}
        {recentEntries.length > 0 && (
          <section className="space-y-2" aria-label={isEn ? "Recent" : "最近打开"}>
            <div className="flex items-center justify-between px-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                <Clock className="h-3 w-3 text-zinc-400" />
                {isEn ? "Recent" : "最近打开"}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-zinc-400">
                {recentEntries.length}
              </span>
            </div>

            <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200/80 bg-white">
              {recentEntries.map((entry) => {
                const EntryIcon = entry.kind === "site" ? FolderTree : FileText;
                return (
                  <button
                    key={`${entry.kind}:${entry.path}`}
                    type="button"
                    onClick={() => handleOpenRecent(entry)}
                    className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-3.5 py-2.5 text-left transition-colors hover:bg-zinc-50 cursor-pointer focus-visible:bg-zinc-50 focus-visible:outline-none"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <EntryIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400 group-hover:text-zinc-600" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-zinc-800 group-hover:text-zinc-950">
                          {entry.title}
                        </div>
                        <div
                          className="truncate font-mono text-[11px] text-zinc-400"
                          title={entry.path}
                        >
                          {entry.path}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
                      {formatRecentTime(entry.openedAt, locale)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <p className="text-center text-[11px] text-zinc-400">
          {msg.welcome.shortcutHint}
        </p>
      </div>
    </div>
  );
}
