import { Link2, Unlink2 } from "lucide-react";
import { useMemo } from "react";

import { Switch } from "@/components/ui/switch";
import { formatMessage, getMessages } from "@/lib/i18n";
import { computeDocumentStats } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import type { EditorTab } from "@/types";

interface StatusBarProps {
  activeTab: EditorTab | null;
}

export function StatusBar({ activeTab }: StatusBarProps) {
  const {
    locale,
    setLocale,
    syncScroll,
    setSyncScroll,
    autoSave,
    setAutoSave,
    siteConfig,
  } = useAppStore();

  const msg = getMessages(locale);

  const stats = useMemo(
    () => (activeTab ? computeDocumentStats(activeTab.content) : null),
    [activeTab?.content]
  );

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-zinc-200/80 bg-zinc-50/70 px-3 text-[11px] text-zinc-500 select-none">
      {/* Left: Cursor, Word count, Read time */}
      <div className="flex items-center gap-3 min-w-0">
        {activeTab && stats ? (
          <>
            <span className="font-mono">
              {formatMessage(msg.status.lineCol, {
                line: activeTab.cursorLine,
                col: activeTab.cursorCol,
              })}
            </span>
            <span>
              {formatMessage(msg.status.words, { count: stats.totalWords })}
            </span>
            <span>
              {formatMessage(msg.status.readTime, {
                minutes: stats.readingMinutes,
              })}
            </span>
            <span className="hidden md:inline text-zinc-400">
              {activeTab.isDirty ? msg.status.unsaved : msg.status.saved}
            </span>
          </>
        ) : (
          <span className="text-zinc-400">
            {siteConfig ? siteConfig.title : msg.appName}
          </span>
        )}
      </div>

      {/* Right: Sync Scroll, Auto Save, Locale */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => setSyncScroll(!syncScroll)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-zinc-200/60 hover:text-zinc-800 transition-colors cursor-pointer"
          title={msg.status.syncScroll}
        >
          {syncScroll ? (
            <Link2 className="h-3 w-3 text-zinc-800" />
          ) : (
            <Unlink2 className="h-3 w-3 text-zinc-400" />
          )}
          <span className={syncScroll ? "text-zinc-700" : "text-zinc-400"}>
            {msg.status.syncScroll}
          </span>
        </button>

        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <span className="text-zinc-500">{msg.status.autoSave}</span>
          <Switch checked={autoSave} onCheckedChange={setAutoSave} />
        </label>

        <button
          type="button"
          onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}
          className="rounded px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900 cursor-pointer"
          title={msg.status.switchLanguage}
        >
          {locale === "zh-CN" ? "中文" : "EN"}
        </button>
      </div>
    </footer>
  );
}
