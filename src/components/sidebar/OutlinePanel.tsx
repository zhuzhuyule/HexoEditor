import { useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";
import type { Locale } from "@/types";

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  line: number;
}

export interface OutlinePanelProps {
  items: OutlineItem[];
  activeLine: number;
  onSelectLine: (line: number, id: string) => void;
  emptyText: string;
  locale?: Locale;
  className?: string;
}

function clampHeadingLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(6, Math.round(level)));
}

export function OutlinePanel({
  items,
  activeLine,
  onSelectLine,
  emptyText,
  locale = "zh-CN",
  className,
}: OutlinePanelProps) {
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);

  const minLevel = useMemo(() => {
    if (items.length === 0) return 1;
    return items.reduce(
      (min, item) => Math.min(min, clampHeadingLevel(item.level)),
      6
    );
  }, [items]);

  const activeId = useMemo(() => {
    let matched: OutlineItem | null = null;
    for (const item of items) {
      if (item.line <= activeLine) {
        if (!matched || item.line >= matched.line) {
          matched = item;
        }
      }
    }
    return matched ? `${matched.id}:${matched.line}` : null;
  }, [items, activeLine]);

  useEffect(() => {
    const el = activeButtonRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeId]);

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center px-4 text-center text-xs text-zinc-400 select-none",
          className
        )}
      >
        <span>{emptyText}</span>
      </div>
    );
  }

  return (
    <nav
      aria-label={locale === "en-US" ? "Document Outline" : "文档大纲"}
      className={cn(
        "h-full w-full overflow-y-auto px-2 py-2 select-none",
        className
      )}
    >
      <ul className="space-y-0.5">
        {items.map((item) => {
          const level = clampHeadingLevel(item.level);
          const itemKey = `${item.id}:${item.line}`;
          const isActive = activeId === itemKey;
          const indentPx = 10 + (level - minLevel) * 12;

          return (
            <li key={itemKey}>
              <button
                ref={isActive ? activeButtonRef : null}
                type="button"
                data-outline-id={item.id}
                data-outline-line={item.line}
                data-level={level}
                aria-current={isActive ? "location" : undefined}
                onClick={() => onSelectLine(item.line, item.id)}
                style={{ paddingLeft: `${indentPx}px` }}
                className={cn(
                  "group relative flex w-full items-center rounded-md py-1.5 pr-2.5 text-left transition-colors cursor-pointer",
                  level === 1 && "text-[12.5px]",
                  level === 2 && "text-xs",
                  level >= 3 && "text-[11.5px]",
                  isActive
                    ? "bg-white font-medium text-zinc-900 shadow-2xs ring-1 ring-zinc-200/80"
                    : level <= 2
                    ? "font-medium text-zinc-700 hover:bg-zinc-200/50 hover:text-zinc-900"
                    : "font-normal text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-800"
                )}
                title={item.text}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-1 top-1.5 bottom-1.5 w-[2px] rounded-full bg-zinc-900"
                  />
                )}
                <span className="truncate leading-snug">{item.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
