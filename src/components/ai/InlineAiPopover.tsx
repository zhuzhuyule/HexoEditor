import {
  Check,
  Copy,
  Loader2,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveActiveAiProvider } from "@/components/ai/AiAssistantDrawer";
import { Button } from "@/components/ui/button";
import { computeLineDiffWithStats } from "@/lib/ai/diff";
import { buildSiteAwarePrompt } from "@/lib/ai/prompts";
import * as aiApi from "@/lib/tauri/aiApi";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";
import type {
  AiPromptAction,
  AiSettings,
  DiscoveredAgent,
  SiteContextSnapshot,
} from "@/types/ai";

export type InlineAiQuickAction =
  | "polish"
  | "concise"
  | "translate"
  | "theme_format";

export interface InlineAiSelectionRect {
  top: number;
  left: number;
  bottom: number;
}

export interface InlineAiPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  aiSettings: AiSettings;
  discoveredAgents: DiscoveredAgent[];
  activeSiteRoot?: string | null;
  activeDocPath?: string | null;
  siteContext?: SiteContextSnapshot | null;
  documentContent: string;
  selectionText: string;
  selectionRect?: InlineAiSelectionRect | null;
  onApplyReplace: (outputText: string) => void;
  onOpenAiSettings?: () => void;
}

interface LastRunSpec {
  action: InlineAiQuickAction | "custom";
  customInstruction?: string;
}

const POPOVER_WIDTH = 460;
const POPOVER_ESTIMATED_HEIGHT = 320;
const VIEWPORT_MARGIN = 12;

function computePopoverPosition(
  selectionRect: InlineAiSelectionRect | null | undefined
): { top: number; left: number; width: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth || 1024 : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight || 768 : 768;
  const width = Math.min(POPOVER_WIDTH, Math.max(280, vw - VIEWPORT_MARGIN * 2));

  if (
    selectionRect &&
    Number.isFinite(selectionRect.top) &&
    Number.isFinite(selectionRect.left) &&
    Number.isFinite(selectionRect.bottom)
  ) {
    const maxLeft = Math.max(VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN);
    const left = Math.max(VIEWPORT_MARGIN, Math.min(selectionRect.left, maxLeft));

    const belowTop = selectionRect.bottom + 8;
    const fitsBelow = belowTop + POPOVER_ESTIMATED_HEIGHT <= vh - VIEWPORT_MARGIN;
    const aboveTop = selectionRect.top - POPOVER_ESTIMATED_HEIGHT - 8;

    let top = belowTop;
    if (!fitsBelow && aboveTop >= VIEWPORT_MARGIN) {
      top = aboveTop;
    } else if (!fitsBelow) {
      top = Math.max(
        VIEWPORT_MARGIN,
        Math.min(belowTop, vh - 160 - VIEWPORT_MARGIN)
      );
    }

    return { top, left, width };
  }

  const centeredLeft = Math.max(
    VIEWPORT_MARGIN,
    Math.round((vw - width) / 2)
  );
  const top = Math.max(VIEWPORT_MARGIN, Math.min(72, vh - 200));
  return { top, left: centeredLeft, width };
}

export function InlineAiPopover({
  open,
  onOpenChange,
  locale,
  aiSettings,
  discoveredAgents,
  activeSiteRoot = null,
  activeDocPath = null,
  siteContext: siteContextProp,
  documentContent,
  selectionText,
  selectionRect = null,
  onApplyReplace,
  onOpenAiSettings,
}: InlineAiPopoverProps) {
  const isEn = locale === "en-US";
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const lastRunRef = useRef<LastRunSpec | null>(null);

  const [fetchedSiteContext, setFetchedSiteContext] =
    useState<SiteContextSnapshot | null>(null);
  const [customInstruction, setCustomInstruction] = useState("");
  const [outputText, setOutputText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const resolvedSiteContext =
    siteContextProp !== undefined ? siteContextProp : fetchedSiteContext;

  const stopActiveRequest = useCallback(async () => {
    const reqId = activeRequestIdRef.current;
    activeRequestIdRef.current = null;
    setRunning(false);
    setStatusText("");
    if (reqId) {
      try {
        await aiApi.aiCancelPrompt(reqId);
      } catch {
        // Ignore cancellation failures
      }
    }
  }, []);

  const handleClose = useCallback(() => {
    void stopActiveRequest();
    onOpenChange(false);
  }, [onOpenChange, stopActiveRequest]);

  // Reset transient state and focus input when opened
  useEffect(() => {
    if (!open) {
      void stopActiveRequest();
      return;
    }
    setCustomInstruction("");
    setOutputText("");
    setStatusText("");
    setErrorText(null);
    setRunning(false);
    setCopied(false);
    lastRunRef.current = null;

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, stopActiveRequest]);

  // Fetch compact site context if not supplied directly
  useEffect(() => {
    if (!open || siteContextProp !== undefined) return;
    if (!activeSiteRoot) {
      setFetchedSiteContext(null);
      return;
    }
    let cancelled = false;
    void aiApi
      .buildSiteAiContext(activeSiteRoot, activeDocPath)
      .then((ctx) => {
        if (!cancelled) setFetchedSiteContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setFetchedSiteContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, siteContextProp, activeSiteRoot, activeDocPath]);

  // Listen to backend AI stream events while open
  useEffect(() => {
    if (!open) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void aiApi
      .listenAiStream((ev) => {
        if (ev.requestId !== activeRequestIdRef.current) return;
        if (ev.kind === "delta") {
          setOutputText((prev) => prev + ev.text);
          setStatusText("");
        } else if (ev.kind === "status") {
          setStatusText(ev.text);
        } else if (ev.kind === "error") {
          setErrorText(
            ev.text || (isEn ? "AI request failed" : "AI 请求失败")
          );
          setStatusText("");
          setRunning(false);
          activeRequestIdRef.current = null;
        } else if (ev.kind === "done" || ev.done) {
          setStatusText("");
          setRunning(false);
          activeRequestIdRef.current = null;
        }
      })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [open, isEn]);

  // Close on Escape anywhere while popover is open
  useEffect(() => {
    if (!open) return;
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [open, handleClose]);

  const executeInlinePrompt = useCallback(
    async (spec: LastRunSpec) => {
      if (activeRequestIdRef.current) {
        await stopActiveRequest();
      }

      lastRunRef.current = spec;
      const provider = resolveActiveAiProvider(aiSettings, discoveredAgents);

      let ctx = resolvedSiteContext;
      if (ctx === null && siteContextProp === undefined && activeSiteRoot) {
        try {
          ctx = await aiApi.buildSiteAiContext(activeSiteRoot, activeDocPath);
          setFetchedSiteContext(ctx);
        } catch {
          ctx = null;
        }
      }

      const promptAction: AiPromptAction =
        spec.action === "concise" ? "custom" : spec.action;
      const instructionForPrompt =
        spec.action === "concise"
          ? isEn
            ? "Make the content more concise and direct while preserving technical accuracy, Markdown structure, code, math formulas, and Hexo tags. Output ONLY the revised Markdown text."
            : "精简以下内容，去除冗余表达，保持技术准确性与清晰流畅的表达。严格保留 Markdown 结构、代码块、数学公式、链接和 Hexo 标签。只输出修改后的 Markdown 正文，不要额外解释。"
          : spec.customInstruction;

      const built = buildSiteAwarePrompt({
        action: promptAction,
        siteContext: ctx,
        documentContent,
        selectionText,
        customInstruction: instructionForPrompt,
      });

      const reqId = `inline-ai-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      activeRequestIdRef.current = reqId;
      setOutputText("");
      setErrorText(null);
      setStatusText("");
      setCopied(false);
      setRunning(true);

      try {
        const returnedId = await aiApi.aiRunPrompt({
          requestId: reqId,
          provider,
          systemPrompt: built.systemPrompt,
          prompt: built.userPrompt,
          cwd: provider.cwd || activeSiteRoot,
        });
        if (returnedId && activeRequestIdRef.current === reqId) {
          activeRequestIdRef.current = returnedId;
        }
      } catch (err) {
        if (activeRequestIdRef.current === reqId) {
          activeRequestIdRef.current = null;
          setRunning(false);
          setErrorText(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [
      activeDocPath,
      activeSiteRoot,
      aiSettings,
      discoveredAgents,
      documentContent,
      isEn,
      resolvedSiteContext,
      selectionText,
      siteContextProp,
      stopActiveRequest,
    ]
  );

  const handleSubmitCustom = () => {
    const trimmed = customInstruction.trim();
    if (!trimmed) return;
    void executeInlinePrompt({ action: "custom", customInstruction: trimmed });
  };

  const handleRetry = () => {
    if (!lastRunRef.current) return;
    void executeInlinePrompt(lastRunRef.current);
  };

  const handleCopy = async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failures in restricted environments
    }
  };

  const handleConfirmReplace = () => {
    if (!outputText) return;
    if (activeRequestIdRef.current) {
      void stopActiveRequest();
    }
    onApplyReplace(outputText);
    onOpenChange(false);
  };

  const baselineText = selectionText ? selectionText : "";
  const diffResult = useMemo(
    () =>
      outputText
        ? computeLineDiffWithStats(baselineText, outputText)
        : null,
    [baselineText, outputText]
  );

  if (!open) return null;

  const position = computePopoverPosition(selectionRect);
  const hasSelection = selectionText.trim().length > 0;
  const canRun = hasSelection || documentContent.trim().length > 0;

  const quickActions: Array<{ id: InlineAiQuickAction; label: string }> = [
    { id: "polish", label: isEn ? "Polish" : "润色" },
    { id: "concise", label: isEn ? "Concise" : "精简" },
    { id: "translate", label: isEn ? "Translate" : "翻译" },
    { id: "theme_format", label: isEn ? "Theme Format" : "主题排版" },
  ];

  const labels = {
    title: isEn ? "Inline AI" : "AI 内联编辑",
    scopeBadge: hasSelection
      ? isEn
        ? `${selectionText.length} chars`
        : `已选 ${selectionText.length} 字`
      : isEn
        ? "Insert at cursor"
        : "光标处生成",
    placeholder: isEn
      ? "Enter custom instruction (Enter to run)..."
      : "输入自定义改写指令，按 Enter 生成...",
    generating: isEn ? "Generating..." : "正在生成...",
    diffPreview: isEn ? "Diff Preview" : "变更对比",
    confirmReplace: isEn ? "Apply Replace" : "应用替换",
    copy: isEn ? "Copy" : "复制",
    copied: isEn ? "Copied" : "已复制",
    retry: isEn ? "Retry" : "重试",
    cancel: isEn ? "Cancel" : "取消",
    stop: isEn ? "Stop" : "停止",
    close: isEn ? "Close" : "关闭",
    settings: isEn ? "AI Settings" : "AI 设置",
  };

  return (
    <div
      role="dialog"
      aria-label={labels.title}
      data-testid="inline-ai-popover"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          handleClose();
        }
      }}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
      }}
      className="no-print fixed z-50 flex flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white text-zinc-900 shadow-lg ring-1 ring-zinc-900/5"
    >
      {/* Header */}
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/75 px-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-700" />
          <span className="text-xs font-semibold text-zinc-900">
            {labels.title}
          </span>
          <span className="rounded bg-zinc-200/70 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
            {labels.scopeBadge}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {onOpenAiSettings && (
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              onClick={onOpenAiSettings}
              title={labels.settings}
              aria-label={labels.settings}
            >
              <Settings className="h-3 w-3 text-zinc-500" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            onClick={handleClose}
            title={labels.close}
            aria-label={labels.close}
          >
            <X className="h-3.5 w-3.5 text-zinc-500" />
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 px-2.5 py-2">
        {quickActions.map((act) => (
          <button
            key={act.id}
            type="button"
            data-inline-ai-action={act.id}
            disabled={!canRun && act.id !== "theme_format" ? true : false}
            onClick={() => void executeInlinePrompt({ action: act.id })}
            className="inline-flex items-center rounded-md border border-zinc-200/90 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
          >
            {act.label}
          </button>
        ))}
      </div>

      {/* Custom Instruction Input */}
      <div className="border-b border-zinc-100 px-2.5 py-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2 py-1 focus-within:border-zinc-400 focus-within:bg-white">
          <input
            ref={inputRef}
            type="text"
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSubmitCustom();
              }
            }}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            className="min-w-0 flex-1 bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
          {running ? (
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              onClick={() => void stopActiveRequest()}
              title={labels.stop}
              aria-label={labels.stop}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Square className="h-3 w-3 fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="iconSm"
              disabled={!customInstruction.trim()}
              onClick={handleSubmitCustom}
              title={isEn ? "Send" : "发送"}
              aria-label={isEn ? "Send" : "发送"}
            >
              <Send className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Streaming Status / Error / Inline Diff Preview */}
      {(running || statusText || errorText || diffResult) && (
        <div className="space-y-2 bg-zinc-50/40 px-2.5 py-2">
          {running && !outputText && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
              <span>{statusText || labels.generating}</span>
            </div>
          )}

          {errorText && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11.5px] text-red-700 whitespace-pre-wrap"
            >
              {errorText}
            </div>
          )}

          {diffResult && (
            <div className="overflow-hidden rounded-lg border border-zinc-200/90 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/70 px-2.5 py-1 text-[10.5px]">
                <span className="font-medium text-zinc-600">
                  {labels.diffPreview}
                </span>
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  {running && (
                    <span className="inline-flex items-center gap-1 font-sans text-zinc-500">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      {labels.generating}
                    </span>
                  )}
                  <span className="text-emerald-700">
                    +{diffResult.stats.addedLines}
                  </span>
                  <span className="text-red-700">
                    -{diffResult.stats.removedLines}
                  </span>
                </div>
              </div>

              <div
                data-testid="inline-ai-diff"
                className="max-h-56 overflow-y-auto py-1 font-mono text-[11.5px] leading-relaxed"
              >
                {diffResult.hunks.map((hunk, idx) => {
                  const sign =
                    hunk.type === "added"
                      ? "+"
                      : hunk.type === "removed"
                        ? "-"
                        : " ";
                  return (
                    <div
                      key={`${idx}-${hunk.type}`}
                      data-diff-type={hunk.type}
                      className={cn(
                        "flex gap-1.5 px-2.5 py-0.5 whitespace-pre-wrap break-words",
                        hunk.type === "removed" &&
                          "border-l-2 border-red-400 bg-red-50 text-red-700",
                        hunk.type === "added" &&
                          "border-l-2 border-emerald-500 bg-emerald-50 text-emerald-700",
                        hunk.type === "equal" && "text-zinc-600"
                      )}
                    >
                      <span className="w-3 shrink-0 select-none opacity-80">
                        {sign}
                      </span>
                      <span className="min-w-0 flex-1">
                        {hunk.text === "" ? " " : hunk.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex shrink-0 items-center justify-between gap-1.5 border-t border-zinc-100 bg-zinc-50/75 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          {outputText && (
            <Button
              type="button"
              variant="default"
              size="xs"
              onClick={handleConfirmReplace}
            >
              {labels.confirmReplace}
            </Button>
          )}
          {outputText && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void handleCopy()}
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-600" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span>{copied ? labels.copied : labels.copy}</span>
            </Button>
          )}
          {(outputText || errorText) && lastRunRef.current && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={running}
              onClick={handleRetry}
            >
              <RotateCcw className="h-3 w-3" />
              <span>{labels.retry}</span>
            </Button>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={handleClose}
          className="ml-auto text-zinc-500 hover:text-zinc-900"
        >
          {labels.cancel}
        </Button>
      </div>
    </div>
  );
}
