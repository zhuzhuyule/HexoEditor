import {
  BookOpen,
  Columns2,
  Maximize2,
  PanelLeft,
  PenLine,
  Save,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import type { ViewMode } from "@/types";

interface TabBarProps {
  onRequestCloseTab: (tabId: string) => void;
}

export function TabBar({ onRequestCloseTab }: TabBarProps) {
  const {
    locale,
    sidebarOpen,
    toggleSidebar,
    tabs,
    activeTabId,
    setActiveTab,
    viewMode,
    setViewMode,
    saveTab,
  } = useAppStore();

  const msg = getMessages(locale);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const modes: { id: ViewMode; icon: typeof PenLine; label: string; shortcut: string }[] = [
    { id: "write", icon: PenLine, label: msg.viewMode.write, shortcut: "⌘⇧1" },
    { id: "split", icon: Columns2, label: msg.viewMode.split, shortcut: "⌘⇧2" },
    { id: "read", icon: BookOpen, label: msg.viewMode.read, shortcut: "⌘⇧3" },
    { id: "focus", icon: Maximize2, label: msg.viewMode.focus, shortcut: "⌘⇧4" },
  ];

  return (
    <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-zinc-200/80 bg-zinc-50/50 px-2 select-none">
      {/* Left: Sidebar Toggle + Open Tabs */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          title={msg.tabs.toggleSidebar}
          onClick={toggleSidebar}
          className={cn(!sidebarOpen && "text-zinc-900 bg-zinc-200/60")}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar">
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
                    isActive ? "opacity-70 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Save + View Mode Switcher */}
      <div className="flex shrink-0 items-center gap-1.5">
        {activeTab && (
          <Button
            variant="ghost"
            size="icon"
            title={`${msg.tabs.save} (⌘S)`}
            disabled={!activeTab.isDirty && Boolean(activeTab.filePath)}
            onClick={() => void saveTab(activeTab.id)}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
        )}

        <div className="inline-flex items-center rounded-md bg-zinc-200/60 p-0.5">
          {modes.map((m) => {
            const Icon = m.icon;
            const active = viewMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                title={`${m.label} (${m.shortcut})`}
                onClick={() => setViewMode(m.id)}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-white text-zinc-900 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-800"
                )}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden lg:inline">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
