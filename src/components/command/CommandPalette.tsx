import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CornerDownLeft, Search } from "lucide-react";
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { Locale } from "@/types";

export interface CommandPaletteItem {
  id: string;
  label: string;
  group: string;
  description?: string;
  keywords?: string[];
  shortcut?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandPaletteItem[];
  placeholder?: string;
  emptyText?: string;
  locale?: Locale;
}

function scoreTextMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!t) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800;

  const idx = t.indexOf(q);
  if (idx !== -1) {
    return 600 - Math.min(idx, 200);
  }

  // Fuzzy subsequence match (e.g. "hgd" -> "hexo g -d")
  let qi = 0;
  let consecutive = 0;
  let bestConsecutive = 0;
  let firstMatch = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstMatch === -1) firstMatch = ti;
      qi++;
      consecutive++;
      if (consecutive > bestConsecutive) bestConsecutive = consecutive;
    } else {
      consecutive = 0;
    }
  }

  if (qi < q.length) return 0;
  return 200 + bestConsecutive * 20 - Math.min(firstMatch, 100);
}

export function matchCommandItem(
  query: string,
  item: CommandPaletteItem
): number {
  const trimmed = query.trim();
  if (!trimmed) return 1;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  let totalScore = 0;

  for (const token of tokens) {
    const labelScore = scoreTextMatch(token, item.label) * 1.4;
    const descScore = item.description
      ? scoreTextMatch(token, item.description)
      : 0;
    const groupScore = scoreTextMatch(token, item.group) * 0.8;
    const keywordScore = item.keywords
      ? item.keywords.reduce(
          (max, kw) => Math.max(max, scoreTextMatch(token, kw) * 1.1),
          0
        )
      : 0;

    const best = Math.max(labelScore, descScore, groupScore, keywordScore);
    if (best <= 0) return 0;
    totalScore += best;
  }

  return totalScore;
}

interface GroupedEntries {
  group: string;
  entries: Array<{ item: CommandPaletteItem; flatIndex: number }>;
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder,
  emptyText,
  locale = "zh-CN",
}: CommandPaletteProps) {
  const isEn = locale === "en-US";
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  const filteredItems = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return items;

    return items
      .map((item, idx) => ({ item, idx, score: matchCommandItem(trimmed, item) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.idx - b.idx)
      .map((entry) => entry.item);
  }, [items, query]);

  const groups = useMemo<GroupedEntries[]>(() => {
    const map = new Map<string, Array<{ item: CommandPaletteItem; flatIndex: number }>>();
    const ordered: GroupedEntries[] = [];

    filteredItems.forEach((item, flatIndex) => {
      let bucket = map.get(item.group);
      if (!bucket) {
        bucket = [];
        map.set(item.group, bucket);
        ordered.push({ group: item.group, entries: bucket });
      }
      bucket.push({ item, flatIndex });
    });

    return ordered;
  }, [filteredItems]);

  // Reset search & selection whenever palette opens
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const firstEnabled = items.findIndex((i) => !i.disabled);
    setActiveIndex(firstEnabled >= 0 ? firstEnabled : 0);
  }, [open, items]);

  // Clamp activeIndex when filtered list changes
  useEffect(() => {
    if (filteredItems.length === 0) {
      setActiveIndex(-1);
      return;
    }
    const current = filteredItems[activeIndex];
    if (!current || current.disabled) {
      const firstEnabled = filteredItems.findIndex((i) => !i.disabled);
      setActiveIndex(firstEnabled);
    }
  }, [filteredItems, activeIndex]);

  useEffect(() => {
    const el = activeItemRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const moveSelection = (delta: 1 | -1) => {
    const total = filteredItems.length;
    if (total === 0) return;

    let cursor = activeIndex < 0 ? (delta === 1 ? -1 : 0) : activeIndex;
    for (let step = 0; step < total; step++) {
      cursor = (cursor + delta + total) % total;
      if (!filteredItems[cursor]?.disabled) {
        setActiveIndex(cursor);
        return;
      }
    }
  };

  const executeItem = (item: CommandPaletteItem | undefined) => {
    if (!item || item.disabled) return;
    onOpenChange(false);
    item.onSelect();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeItem(filteredItems[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  const resolvedPlaceholder =
    placeholder ??
    (isEn
      ? "Type a command or search posts..."
      : "输入命令、切换视图或搜索文章...");
  const resolvedEmptyText =
    emptyText ?? (isEn ? "No matching commands" : "未找到匹配的命令");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-900/20 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed left-1/2 top-[15%] z-50 w-[min(92vw,560px)] -translate-x-1/2 overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-2xl focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            {isEn ? "Command Palette" : "全局命令面板"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {isEn
              ? "Search and execute workspace commands using keyboard navigation."
              : "使用键盘搜索并执行工作台命令。"}
          </DialogPrimitive.Description>

          {/* Search Input */}
          <div className="flex items-center gap-2.5 border-b border-zinc-100 px-3.5 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={resolvedPlaceholder}
              aria-label={resolvedPlaceholder}
              className="h-7 w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            />
            <kbd className="hidden shrink-0 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Grouped Results */}
          <div
            role="listbox"
            className="max-h-[340px] overflow-y-auto p-1.5"
          >
            {groups.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-zinc-400 select-none">
                {resolvedEmptyText}
              </div>
            ) : (
              groups.map((section) => (
                <div key={section.group} className="mb-1.5 last:mb-0">
                  <div className="px-2.5 py-1 text-[10.5px] font-medium text-zinc-400 select-none">
                    {section.group}
                  </div>
                  <div className="space-y-0.5">
                    {section.entries.map(({ item, flatIndex }) => {
                      const isActive = flatIndex === activeIndex;
                      return (
                        <button
                          key={item.id}
                          ref={isActive ? activeItemRef : null}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          disabled={item.disabled}
                          data-command-id={item.id}
                          onMouseEnter={() => {
                            if (!item.disabled) setActiveIndex(flatIndex);
                          }}
                          onClick={() => executeItem(item)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                            item.disabled
                              ? "cursor-not-allowed opacity-40"
                              : "cursor-pointer",
                            isActive
                              ? "bg-zinc-100 text-zinc-950"
                              : "text-zinc-700 hover:bg-zinc-50"
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            {item.icon && (
                              <span
                                className={cn(
                                  "flex h-4 w-4 shrink-0 items-center justify-center",
                                  isActive ? "text-zinc-900" : "text-zinc-400"
                                )}
                              >
                                {item.icon}
                              </span>
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {item.label}
                              </div>
                              {item.description && (
                                <div className="truncate text-[11px] text-zinc-400">
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {item.shortcut && (
                              <kbd className="rounded border border-zinc-200/80 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                                {item.shortcut}
                              </kbd>
                            )}
                            {isActive && !item.disabled && (
                              <CornerDownLeft className="h-3 w-3 text-zinc-400" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Subtle Keyboard Legend */}
          <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/70 px-3.5 py-1.5 text-[10.5px] text-zinc-400 select-none">
            <span className="inline-flex items-center gap-2">
              <span>↑↓ {isEn ? "Navigate" : "选择"}</span>
              <span>↵ {isEn ? "Run" : "执行"}</span>
            </span>
            <span>ESC {isEn ? "Close" : "关闭"}</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
