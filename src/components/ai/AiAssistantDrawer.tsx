import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Square,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  buildSiteAwarePrompt,
  parseSuggestedFrontMatter,
} from "@/lib/ai/prompts";
import { formatMessage, getMessages } from "@/lib/i18n";
import * as aiApi from "@/lib/tauri/aiApi";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";
import type {
  AiPromptAction,
  AiProviderConfig,
  AiSettings,
  DiscoveredAgent,
  SiteContextSnapshot,
  SuggestedFrontMatter,
} from "@/types/ai";

export interface AiPendingAction {
  action: AiPromptAction;
  nonce: number;
}

export interface AiAssistantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  aiSettings: AiSettings;
  onAiSettingsChange: (patch: Partial<AiSettings>) => void;
  discoveredAgents: DiscoveredAgent[];
  onRefreshAgents?: () => Promise<DiscoveredAgent[] | void>;
  activeSiteRoot: string | null;
  activeDocPath: string | null;
  documentContent: string;
  selectionText: string;
  hasSelection: boolean;
  terminalLogs: string[];
  pendingAction?: AiPendingAction | null;
  onOpenAiSettings: () => void;
  onApplyTextToEditor: (
    text: string,
    mode: "replace-selection" | "insert-cursor"
  ) => void;
  onApplyFrontMatter: (suggested: SuggestedFrontMatter) => void;
}

export function resolveActiveAiProvider(
  aiSettings: AiSettings,
  discoveredAgents: DiscoveredAgent[]
): AiProviderConfig {
  const key = aiSettings.selectedProviderKey || "api";
  if (key.startsWith("agent:")) {
    const agentId = key.slice("agent:".length);
    const matched = discoveredAgents.find((a) => a.id === agentId);
    if (matched) {
      return {
        mode: matched.protocol === "cli" ? "cli" : "acp",
        executable: matched.executable,
        args: matched.args,
        baseUrl: null,
        apiKey: null,
        model: null,
      };
    }
  }

  return {
    mode: aiSettings.apiPreset,
    executable: null,
    args: [],
    baseUrl: aiSettings.baseUrl.trim() || null,
    apiKey: aiSettings.apiKey.trim() || null,
    model: aiSettings.model.trim() || null,
  };
}

export function formatContextChipLabel(
  ctx: SiteContextSnapshot | null,
  standaloneLabel: string
): string {
  if (!ctx) return standaloneLabel;
  const parts: string[] = [ctx.engine === "hugo" ? "Hugo" : "Hexo"];
  if (ctx.theme) parts.push(ctx.theme);
  if (ctx.existingTags.length > 0) parts.push(`${ctx.existingTags.length} tags`);
  const imgCount = ctx.activeDoc?.localImages.length ?? 0;
  if (imgCount > 0) parts.push(`${imgCount} 图`);
  return parts.join(" · ");
}

export function AiAssistantDrawer({
  open,
  onOpenChange,
  locale,
  aiSettings,
  onAiSettingsChange,
  discoveredAgents,
  onRefreshAgents,
  activeSiteRoot,
  activeDocPath,
  documentContent,
  selectionText,
  hasSelection,
  terminalLogs,
  pendingAction,
  onOpenAiSettings,
  onApplyTextToEditor,
  onApplyFrontMatter,
}: AiAssistantDrawerProps) {
  const msg = getMessages(locale);

  const [siteContext, setSiteContext] = useState<SiteContextSnapshot | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [outputText, setOutputText] = useState("");
  const [thoughtText, setThoughtText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [refreshingAgents, setRefreshingAgents] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeRequestIdRef = useRef<string | null>(null);
  const lastPendingNonceRef = useRef<number | null>(null);

  // Load compact site context snapshot when drawer opens or active site/doc changes
  useEffect(() => {
    if (!open) return;
    if (!activeSiteRoot) {
      setSiteContext(null);
      return;
    }
    let cancelled = false;
    void aiApi
      .buildSiteAiContext(activeSiteRoot, activeDocPath)
      .then((ctx) => {
        if (!cancelled) setSiteContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setSiteContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeSiteRoot, activeDocPath]);

  // Listen to backend AI stream events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void aiApi
      .listenAiStream((ev) => {
        if (ev.requestId !== activeRequestIdRef.current) return;
        if (ev.kind === "delta") {
          setOutputText((prev) => prev + ev.text);
          setStatusText("");
        } else if (ev.kind === "thought") {
          setThoughtText((prev) => prev + ev.text);
        } else if (ev.kind === "status") {
          setStatusText(ev.text);
        } else if (ev.kind === "error") {
          setErrorText(ev.text || "AI request failed");
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
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, []);

  const handleStop = useCallback(async () => {
    const reqId = activeRequestIdRef.current;
    activeRequestIdRef.current = null;
    setRunning(false);
    setStatusText("");
    try {
      await aiApi.aiCancelPrompt(reqId);
    } catch {
      // Ignore cancellation errors
    }
  }, []);

  const runAction = useCallback(
    async (action: AiPromptAction, customInstruction?: string) => {
      if (activeRequestIdRef.current) {
        await handleStop();
      }

      const provider = resolveActiveAiProvider(aiSettings, discoveredAgents);
      let resolvedSiteContext = siteContext;
      if (!resolvedSiteContext && activeSiteRoot) {
        try {
          resolvedSiteContext = await aiApi.buildSiteAiContext(
            activeSiteRoot,
            activeDocPath
          );
          setSiteContext(resolvedSiteContext);
        } catch {
          resolvedSiteContext = null;
        }
      }

      const built = buildSiteAwarePrompt({
        action,
        siteContext: resolvedSiteContext,
        documentContent,
        selectionText,
        terminalLogs,
        customInstruction,
      });

      const reqId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      activeRequestIdRef.current = reqId;
      setOutputText("");
      setThoughtText("");
      setErrorText(null);
      setStatusText("");
      setRunning(true);

      try {
        const returnedId = await aiApi.aiRunPrompt({
          requestId: reqId,
          provider,
          systemPrompt: built.systemPrompt,
          prompt: built.userPrompt,
          cwd: activeSiteRoot,
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
      handleStop,
      selectionText,
      siteContext,
      terminalLogs,
    ]
  );

  // Trigger pending action requested externally (e.g. FrontMatterBar "AI 补全" or Cmd+K)
  useEffect(() => {
    if (!open || !pendingAction) return;
    if (lastPendingNonceRef.current === pendingAction.nonce) return;
    lastPendingNonceRef.current = pendingAction.nonce;
    void runAction(pendingAction.action);
  }, [open, pendingAction, runAction]);

  const suggestedFrontMatter = useMemo(
    () => parseSuggestedFrontMatter(outputText),
    [outputText]
  );

  const selectedValue = useMemo(() => {
    const key = aiSettings.selectedProviderKey || "api";
    if (key.startsWith("agent:")) {
      const id = key.slice("agent:".length);
      if (discoveredAgents.some((a) => a.id === id)) return key;
    }
    return "api";
  }, [aiSettings.selectedProviderKey, discoveredAgents]);

  const handleRefreshAgents = async () => {
    if (!onRefreshAgents || refreshingAgents) return;
    setRefreshingAgents(true);
    try {
      await onRefreshAgents();
    } finally {
      setRefreshingAgents(false);
    }
  };

  const handleCopy = async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failures in restricted test environments
    }
  };

  const handleSendCustom = () => {
    const text = customInput.trim();
    if (!text) return;
    setCustomInput("");
    void runAction("custom", text);
  };

  if (!open) return null;

  const actionPills: Array<{
    id: AiPromptAction;
    label: string;
    disabled?: boolean;
  }> = [
    {
      id: "frontmatter_complete",
      label: msg.ai.frontMatterComplete,
      disabled: !documentContent.trim(),
    },
    {
      id: "polish",
      label: hasSelection ? msg.ai.polishSelection : msg.ai.polishFull,
      disabled: !documentContent.trim() && !selectionText.trim(),
    },
    {
      id: "theme_format",
      label: msg.ai.themeFormat,
      disabled: !documentContent.trim(),
    },
    {
      id: "translate",
      label: msg.ai.translate,
      disabled: !documentContent.trim() && !selectionText.trim(),
    },
    {
      id: "image_caption",
      label: msg.ai.imageCaption,
      disabled: !documentContent.trim(),
    },
    {
      id: "diagnose_terminal",
      label: msg.ai.diagnoseTerminal,
      disabled: terminalLogs.length === 0 && !activeSiteRoot,
    },
  ];

  return (
    <aside
      data-testid="ai-assistant-drawer"
      aria-label={msg.ai.drawerTitle}
      className="no-print flex h-full w-[356px] shrink-0 flex-col border-l border-zinc-200/80 bg-white text-zinc-900"
    >
      {/* Top Bar */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-zinc-200/80 bg-zinc-50/60 px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-700" />
          <span className="truncate text-xs font-semibold text-zinc-900">
            {msg.ai.drawerTitle}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={msg.ai.refreshAgents}
            aria-label={msg.ai.refreshAgents}
            disabled={refreshingAgents}
            onClick={() => void handleRefreshAgents()}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshingAgents && "animate-spin")}
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={msg.ai.openSettings}
            aria-label={msg.ai.openSettings}
            onClick={onOpenAiSettings}
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={msg.ai.closeDrawer}
            aria-label={msg.ai.closeDrawer}
            onClick={() => onOpenChange(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Provider Switcher + Site Context Chip */}
      <div className="shrink-0 space-y-2 border-b border-zinc-100 px-3 py-2.5">
        <select
          aria-label="AI Provider"
          data-testid="ai-provider-select"
          value={selectedValue}
          onChange={(e) =>
            onAiSettingsChange({ selectedProviderKey: e.target.value })
          }
          className="h-7 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-800 focus:border-zinc-400 focus:outline-none"
        >
          {discoveredAgents.map((agent) => (
            <option key={agent.id} value={`agent:${agent.id}`}>
              {agent.label}
              {agent.version ? ` · ${agent.version}` : ""}
            </option>
          ))}
          <option value="api">
            {formatMessage(msg.ai.apiProviderLabel, {
              model: aiSettings.model || aiSettings.apiPreset,
            })}
          </option>
        </select>

        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
          <span
            data-testid="ai-context-chip"
            className="inline-flex max-w-full items-center gap-1 truncate rounded bg-zinc-100 px-2 py-0.5 text-[10.5px] font-medium text-zinc-600"
          >
            <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
            <span className="truncate">
              {formatContextChipLabel(siteContext, msg.ai.standaloneContext)}
            </span>
          </span>
        </div>

        {/* Action Pills */}
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {actionPills.map((pill) => (
            <button
              key={pill.id}
              type="button"
              data-ai-action={pill.id}
              disabled={pill.disabled || running}
              onClick={() => void runAction(pill.id)}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200/90 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <Wand2 className="h-2.5 w-2.5 text-zinc-400" />
              <span>{pill.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Streaming Response Viewport */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {thoughtText && (
          <div className="rounded-md border border-zinc-200/80 bg-zinc-50/70 text-[11px] text-zinc-500">
            <button
              type="button"
              onClick={() => setThoughtOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
            >
              {thoughtOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>{msg.ai.thinking}</span>
            </button>
            {thoughtOpen && (
              <div className="border-t border-zinc-200/60 px-2.5 py-2 whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-zinc-500">
                {thoughtText}
              </div>
            )}
          </div>
        )}

        {statusText && (
          <div className="flex items-center gap-1.5 rounded-md bg-zinc-50 px-2.5 py-1.5 text-[11px] text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
            <span className="truncate">{statusText}</span>
          </div>
        )}

        {errorText && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700 whitespace-pre-wrap"
          >
            {errorText}
          </div>
        )}

        {outputText ? (
          <div
            data-testid="ai-output-text"
            className="rounded-lg border border-zinc-200/80 bg-zinc-50/40 p-3 text-xs leading-relaxed text-zinc-800 whitespace-pre-wrap break-words font-sans"
          >
            {outputText}
          </div>
        ) : (
          !errorText &&
          !running && (
            <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/40 px-3 py-5 text-center text-[11.5px] leading-relaxed text-zinc-400">
              {documentContent.trim() ? msg.ai.emptyHint : msg.ai.noDocHint}
            </div>
          )
        )}
      </div>

      {/* Explicit Confirmation Action Bar */}
      {(outputText.trim().length > 0 || running) && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-zinc-100 bg-zinc-50/60 px-3 py-2">
          {running && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void handleStop()}
              className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              <span>{msg.ai.stop}</span>
            </Button>
          )}

          {outputText.trim().length > 0 && (
            <>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() =>
                  onApplyTextToEditor(
                    outputText,
                    hasSelection ? "replace-selection" : "insert-cursor"
                  )
                }
              >
                {hasSelection ? msg.ai.replaceSelection : msg.ai.insertAtCursor}
              </Button>

              {suggestedFrontMatter && (
                <Button
                  type="button"
                  variant="default"
                  size="xs"
                  onClick={() => onApplyFrontMatter(suggestedFrontMatter)}
                >
                  {msg.ai.applyFrontMatter}
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => void handleCopy()}
                className="ml-auto gap-1"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span>{copied ? msg.ai.copied : msg.ai.copyResult}</span>
              </Button>
            </>
          )}
        </div>
      )}

      {/* Custom Prompt Input */}
      <div className="shrink-0 border-t border-zinc-200/80 bg-white p-2.5">
        <div className="flex items-end gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50/50 p-1.5 focus-within:border-zinc-400 focus-within:bg-white">
          <textarea
            rows={2}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendCustom();
              }
            }}
            placeholder={msg.ai.inputPlaceholder}
            className="min-h-[40px] max-h-28 flex-1 resize-none bg-transparent px-1.5 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
          <Button
            type="button"
            variant="default"
            size="icon"
            title={msg.ai.send}
            aria-label={msg.ai.send}
            disabled={running || !customInput.trim()}
            onClick={handleSendCustom}
            className="h-7 w-7 shrink-0"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
