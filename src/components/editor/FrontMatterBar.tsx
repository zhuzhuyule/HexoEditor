import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderSync,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatCurrentLocalDate,
  parseMarkdownDocument,
  updateFrontMatterInMarkdown,
} from "@/lib/frontmatter";
import { getMessages } from "@/lib/i18n";
import { getFileStem, sanitizeSlugClient } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import type { EditorTab, FrontMatterData } from "@/types";

interface FrontMatterBarProps {
  tab: EditorTab;
  onAiCompleteFrontMatter?: () => void;
}

interface ChipAutocompleteProps {
  values: string[];
  suggestions: string[];
  placeholder: string;
  prefix?: string;
  onChange: (next: string[]) => void;
}

function ChipAutocomplete({
  values,
  suggestions,
  placeholder,
  prefix = "",
  onChange,
}: ChipAutocompleteProps) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);

  const filteredSuggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    return suggestions
      .filter((s) => !values.includes(s))
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 8);
  }, [suggestions, values, input]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (!values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };

  return (
    <div className="relative flex flex-wrap items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 focus-within:border-zinc-400">
      {values.map((v) => (
        <Badge key={v} variant="default" className="gap-1 pr-1">
          <span>
            {prefix}
            {v}
          </span>
          <button
            type="button"
            onClick={() => onChange(values.filter((item) => item !== v))}
            className="rounded hover:text-zinc-900 cursor-pointer"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 140)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(input);
          } else if (e.key === "Backspace" && !input && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        placeholder={values.length === 0 ? placeholder : ""}
        className="min-w-[84px] flex-1 bg-transparent text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none"
      />
      {focused && filteredSuggestions.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-40 w-full min-w-[160px] overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
          {filteredSuggestions.map((item) => (
            <button
              key={item}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(item);
              }}
              className="flex w-full items-center rounded px-2 py-1 text-left text-xs text-zinc-700 hover:bg-zinc-100 cursor-pointer"
            >
              {prefix}
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FrontMatterBar({
  tab,
  onAiCompleteFrontMatter,
}: FrontMatterBarProps) {
  const {
    locale,
    allTags,
    allCategories,
    updateTabContent,
    renameTabPostWithAssets,
    toggleDraftStatus,
  } = useAppStore();
  const msg = getMessages(locale);

  const [expanded, setExpanded] = useState(false);

  const parsed = useMemo(() => parseMarkdownDocument(tab.content), [tab.content]);
  const fm = parsed.data;
  const hasYamlError = Boolean(parsed.parseError);

  const updateFm = (patch: Partial<FrontMatterData>) => {
    if (hasYamlError) return;
    const next = updateFrontMatterInMarkdown(tab.content, (cur) => ({
      ...cur,
      ...patch,
    }));
    updateTabContent(tab.id, next);
  };

  const handleInitFrontMatter = () => {
    const defaultTitle = tab.filePath ? getFileStem(tab.filePath) : msg.frontMatter.titlePlaceholder;
    updateFm({
      title: defaultTitle,
      date: formatCurrentLocalDate(),
      tags: [],
      categories: [],
    });
    setExpanded(true);
  };

  const currentStem = tab.filePath ? getFileStem(tab.filePath) : "";
  const titleSlug = sanitizeSlugClient(fm.title);
  const canSyncFilename = Boolean(
    !hasYamlError &&
      tab.filePath &&
      parsed.hasFrontMatter &&
      titleSlug &&
      currentStem &&
      titleSlug !== currentStem
  );

  if (!parsed.hasFrontMatter) {
    return (
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-zinc-200/70 bg-zinc-50/40 px-3 text-[11px] text-zinc-400">
        <span>{msg.frontMatter.standaloneTip}</span>
        <button
          type="button"
          onClick={handleInitFrontMatter}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 cursor-pointer"
        >
          <Plus className="h-3 w-3" />
          Front-Matter
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-zinc-200/80 bg-zinc-50/40">
      {/* Compact Header Row */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          disabled={hasYamlError}
          title={expanded ? msg.frontMatter.collapse : msg.frontMatter.expand}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 disabled:opacity-40 cursor-pointer"
        >
          {expanded && !hasYamlError ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {hasYamlError ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span className="truncate">{msg.frontMatter.yamlSyntaxError}</span>
          </div>
        ) : (
          <input
            value={fm.title}
            onChange={(e) => updateFm({ title: e.target.value })}
            placeholder={msg.frontMatter.titlePlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-300 focus:outline-none"
          />
        )}

        {canSyncFilename && (
          <Button
            variant="outline"
            size="xs"
            title={msg.frontMatter.syncFileNameTip}
            onClick={() => void renameTabPostWithAssets(tab.id, fm.title)}
            className="shrink-0 gap-1 text-zinc-600"
          >
            <FolderSync className="h-3 w-3" />
            <span>{msg.frontMatter.syncFileName}</span>
          </Button>
        )}

        {!hasYamlError && onAiCompleteFrontMatter && (
          <Button
            variant="ghost"
            size="xs"
            title={msg.frontMatter.aiCompleteTip}
            onClick={onAiCompleteFrontMatter}
            className="shrink-0 gap-1 text-zinc-500 hover:text-zinc-900"
          >
            <Sparkles className="h-3 w-3" />
            <span>{msg.frontMatter.aiComplete}</span>
          </Button>
        )}

        {/* Collapsed Inline Summary Badges */}
        {!expanded && !hasYamlError && (
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            {fm.categories.slice(0, 2).map((c) => (
              <Badge key={c} variant="outline" className="text-[10px]">
                {c}
              </Badge>
            ))}
            {fm.tags.slice(0, 3).map((t) => (
              <Badge key={t} variant="subtle" className="text-[10px]">
                #{t}
              </Badge>
            ))}
            {fm.tags.length > 3 && (
              <span className="text-[10px] text-zinc-400">+{fm.tags.length - 3}</span>
            )}
          </div>
        )}

        {!tab.isStandalone && tab.filePath && (
          <button
            type="button"
            title={
              tab.isDraft
                ? msg.frontMatter.toggleToPublishedTip
                : msg.frontMatter.toggleToDraftTip
            }
            onClick={() =>
              void toggleDraftStatus({
                filePath: tab.filePath!,
                siteRoot: tab.siteRoot,
              })
            }
            className="shrink-0 cursor-pointer"
          >
            <Badge variant={tab.isDraft ? "amber" : "emerald"}>
              {tab.isDraft ? msg.frontMatter.draft : msg.frontMatter.published}
            </Badge>
          </button>
        )}
      </div>

      {/* Expanded Editable Properties Form */}
      {expanded && !hasYamlError && (
        <div className="grid grid-cols-1 gap-2.5 border-t border-zinc-200/60 bg-white/70 px-4 py-3 md:grid-cols-2">
          <div className="flex items-center gap-2">
            <label className="w-16 shrink-0 text-[11px] font-medium text-zinc-500">
              {msg.frontMatter.date}
            </label>
            <input
              value={fm.date}
              onChange={(e) => updateFm({ date: e.target.value })}
              placeholder="YYYY-MM-DD HH:mm:ss"
              className="h-7 flex-1 rounded-md border border-zinc-200 bg-white px-2 font-mono text-xs text-zinc-700 focus:border-zinc-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="w-16 shrink-0 text-[11px] font-medium text-zinc-500">
              {msg.frontMatter.updated}
            </label>
            <input
              value={fm.updated}
              onChange={(e) => updateFm({ updated: e.target.value })}
              placeholder="YYYY-MM-DD HH:mm:ss"
              className="h-7 flex-1 rounded-md border border-zinc-200 bg-white px-2 font-mono text-xs text-zinc-700 focus:border-zinc-400 focus:outline-none"
            />
          </div>

          <div className="flex items-start gap-2">
            <label className="w-16 shrink-0 pt-1.5 text-[11px] font-medium text-zinc-500">
              {msg.frontMatter.categories}
            </label>
            <div className="flex-1">
              <ChipAutocomplete
                values={fm.categories}
                suggestions={allCategories.map((c) => c.name)}
                placeholder={msg.frontMatter.addCategory}
                onChange={(categories) => updateFm({ categories })}
              />
            </div>
          </div>

          <div className="flex items-start gap-2">
            <label className="w-16 shrink-0 pt-1.5 text-[11px] font-medium text-zinc-500">
              {msg.frontMatter.tags}
            </label>
            <div className="flex-1">
              <ChipAutocomplete
                values={fm.tags}
                suggestions={allTags.map((t) => t.name)}
                placeholder={msg.frontMatter.addTag}
                prefix="#"
                onChange={(tags) => updateFm({ tags })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
