import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Globe,
  Loader2,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  ShieldAlert,
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
  renderSitePromptTemplate,
} from "@/lib/ai/prompts";
import { parseMarkdownDocument } from "@/lib/frontmatter";
import { formatMessage, getMessages } from "@/lib/i18n";
import * as aiApi from "@/lib/tauri/aiApi";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";
import type {
  AcpPermissionRequestEvent,
  AcpRegistryEntry,
  AcpRegistryResult,
  AiConversationTurn,
  AiPromptAction,
  AiProviderConfig,
  AiSettings,
  CustomAcpProfile,
  DiscoveredAgent,
  SiteContextSnapshot,
  SitePromptTemplate,
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
  if (key.startsWith("profile:")) {
    const profileId = key.slice("profile:".length);
    const matchedProfile = (aiSettings.customAcpProfiles ?? []).find(
      (p) => p.id === profileId && p.enabled
    );
    if (matchedProfile) {
      return {
        mode: matchedProfile.protocol,
        executable: matchedProfile.executable,
        args: matchedProfile.args,
        env: matchedProfile.env,
        cwd: matchedProfile.cwd || null,
        baseUrl: null,
        apiKey: null,
        model: null,
      };
    }
  }
  if (key.startsWith("agent:")) {
    const agentId = key.slice("agent:".length);
    const matched = discoveredAgents.find((a) => a.id === agentId);
    if (matched) {
      return {
        mode: matched.protocol === "cli" ? "cli" : "acp",
        executable: matched.executable,
        args: matched.args,
        env: {},
        cwd: null,
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
    env: {},
    cwd: null,
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

function pickAllowOptionId(ev: AcpPermissionRequestEvent): string | null {
  if (!ev.options || ev.options.length === 0) {
    return "allow_once";
  }
  const preferred = ev.options.find(
    (opt) =>
      opt.kind === "allow_once" ||
      opt.kind === "allow" ||
      opt.optionId.toLowerCase().includes("allow")
  );
  if (preferred) return preferred.optionId;
  const nonReject = ev.options.find(
    (opt) =>
      !opt.kind?.toLowerCase().includes("reject") &&
      !opt.optionId.toLowerCase().includes("reject") &&
      !opt.optionId.toLowerCase().includes("deny")
  );
  return nonReject?.optionId ?? ev.options[0]?.optionId ?? "allow_once";
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
  const isEn = locale === "en-US";

  const [siteContext, setSiteContext] = useState<SiteContextSnapshot | null>(null);
  const [sitePrompts, setSitePrompts] = useState<SitePromptTemplate[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [turns, setTurns] = useState<AiConversationTurn[]>([]);
  const [outputText, setOutputText] = useState("");
  const [thoughtText, setThoughtText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [refreshingAgents, setRefreshingAgents] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingPermission, setPendingPermission] =
    useState<AcpPermissionRequestEvent | null>(null);
  const [respondingPermission, setRespondingPermission] = useState(false);

  const [registryOpen, setRegistryOpen] = useState(false);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryData, setRegistryData] = useState<AcpRegistryResult | null>(null);

  const activeRequestIdRef = useRef<string | null>(null);
  const lastPendingNonceRef = useRef<number | null>(null);
  const outputTextRef = useRef("");
  outputTextRef.current = outputText;

  const sessionKey = useMemo(
    () => (activeSiteRoot ? `site:${activeSiteRoot}` : "drawer-default"),
    [activeSiteRoot]
  );

  // Load compact site context snapshot & site custom prompts when drawer opens or active site/doc changes
  useEffect(() => {
    if (!open) return;
    if (!activeSiteRoot) {
      setSiteContext(null);
      setSitePrompts([]);
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
    void aiApi
      .listSitePrompts(activeSiteRoot)
      .then((prompts) => {
        if (!cancelled) setSitePrompts(prompts);
      })
      .catch(() => {
        if (!cancelled) setSitePrompts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeSiteRoot, activeDocPath]);

  // Listen to backend AI stream events and ACP permission requests
  useEffect(() => {
    let unlistenStream: (() => void) | undefined;
    let unlistenPerm: (() => void) | undefined;
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
          setPendingPermission(null);
          activeRequestIdRef.current = null;
        } else if (ev.kind === "done" || ev.done) {
          setStatusText("");
          setRunning(false);
          setPendingPermission(null);
          activeRequestIdRef.current = null;
        }
      })
      .then((fn) => {
        unlistenStream = fn;
      });

    void aiApi
      .listenAiPermissionRequest((ev) => {
        if (ev.requestId !== activeRequestIdRef.current) return;
        setPendingPermission(ev);
      })
      .then((fn) => {
        unlistenPerm = fn;
      });

    return () => {
      unlistenStream?.();
      unlistenPerm?.();
    };
  }, []);

  const handleStop = useCallback(async () => {
    const reqId = activeRequestIdRef.current;
    activeRequestIdRef.current = null;
    setRunning(false);
    setStatusText("");
    setPendingPermission(null);
    try {
      await aiApi.aiCancelPrompt(reqId);
    } catch {
      // Ignore cancellation errors
    }
  }, []);

  const handleNewSession = useCallback(async () => {
    if (activeRequestIdRef.current) {
      await handleStop();
    }
    setTurns([]);
    setOutputText("");
    setThoughtText("");
    setStatusText("");
    setErrorText(null);
    setPendingPermission(null);
    try {
      await aiApi.aiResetSession(sessionKey);
    } catch {
      // Ignore reset errors in non-Tauri preview
    }
  }, [handleStop, sessionKey]);

  const runAction = useCallback(
    async (
      action: AiPromptAction,
      customInstruction?: string,
      displayLabel?: string
    ) => {
      if (activeRequestIdRef.current) {
        await handleStop();
      }

      const previousOutput = outputTextRef.current.trim();
      const userSummary =
        displayLabel ||
        customInstruction?.trim() ||
        action;

      setTurns((prev) => {
        const next = [...prev];
        if (previousOutput) {
          next.push({
            id: `turn-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role: "assistant",
            content: previousOutput,
          });
        }
        next.push({
          id: `turn-u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: "user",
          content: userSummary,
          action,
        });
        return next;
      });

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
      setPendingPermission(null);
      setRunning(true);

      try {
        const returnedId = await aiApi.aiRunPrompt({
          requestId: reqId,
          provider,
          systemPrompt: built.systemPrompt,
          prompt: built.userPrompt,
          cwd: provider.cwd || activeSiteRoot,
          sessionKey,
          keepSession: true,
        });
        if (returnedId && activeRequestIdRef.current === reqId) {
          activeRequestIdRef.current = returnedId;
        }
      } catch (err) {
        if (activeRequestIdRef.current === reqId) {
          activeRequestIdRef.current = null;
          setRunning(false);
          setPendingPermission(null);
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
      sessionKey,
      siteContext,
      terminalLogs,
    ]
  );

  // Trigger pending action requested externally (e.g. FrontMatterBar "AI 补全", Cmd+K, or ImageManager "image_caption")
  useEffect(() => {
    if (!open || !pendingAction) return;
    if (lastPendingNonceRef.current === pendingAction.nonce) return;
    lastPendingNonceRef.current = pendingAction.nonce;
    void runAction(pendingAction.action);
  }, [open, pendingAction, runAction]);

  const loadRegistry = useCallback(async () => {
    setRegistryLoading(true);
    try {
      const res = await aiApi.fetchAcpRegistry();
      setRegistryData(res);
    } finally {
      setRegistryLoading(false);
    }
  }, []);

  const handleToggleRegistry = () => {
    const next = !registryOpen;
    setRegistryOpen(next);
    if (next && !registryData && !registryLoading) {
      void loadRegistry();
    }
  };

  const handleApplyRegistryEntry = (entry: AcpRegistryEntry) => {
    const matchedAgent = discoveredAgents.find(
      (a) =>
        a.id === entry.id ||
        a.executable === entry.executable ||
        a.executable.endsWith(`/${entry.executable}`)
    );
    if (matchedAgent) {
      onAiSettingsChange({ selectedProviderKey: `agent:${matchedAgent.id}` });
      setRegistryOpen(false);
      return;
    }

    const profileId = `registry-${entry.id}`;
    const existing = aiSettings.customAcpProfiles ?? [];
    const nextProfile: CustomAcpProfile = {
      id: profileId,
      name: entry.name,
      protocol: entry.protocol === "cli" ? "cli" : "acp",
      executable: entry.executable,
      args: entry.args,
      env: {},
      baseAgentId: entry.id,
      enabled: true,
    };
    const filtered = existing.filter((p) => p.id !== profileId);
    onAiSettingsChange({
      customAcpProfiles: [...filtered, nextProfile],
      selectedProviderKey: `profile:${profileId}`,
    });
    setRegistryOpen(false);
  };

  const handleRespondPermission = async (allow: boolean) => {
    if (!pendingPermission || respondingPermission) return;
    setRespondingPermission(true);
    const target = pendingPermission;
    const optionId = allow ? pickAllowOptionId(target) : null;
    try {
      await aiApi.aiRespondPermission(target.permissionId, optionId, !allow);
      setPendingPermission(null);
    } finally {
      setRespondingPermission(false);
    }
  };

  const handleRunSitePrompt = (tpl: SitePromptTemplate) => {
    const parsedDoc = parseMarkdownDocument(documentContent);
    const docTitle = parsedDoc.data.title || undefined;
    const rendered = renderSitePromptTemplate(tpl.body, siteContext, {
      title: docTitle,
      filePath: activeDocPath,
    });
    void runAction("custom", rendered, tpl.title);
  };

  const suggestedFrontMatter = useMemo(
    () => parseSuggestedFrontMatter(outputText),
    [outputText]
  );

  const enabledCustomProfiles = useMemo(
    () => (aiSettings.customAcpProfiles ?? []).filter((p) => p.enabled),
    [aiSettings.customAcpProfiles]
  );

  const selectedValue = useMemo(() => {
    const key = aiSettings.selectedProviderKey || "api";
    if (key.startsWith("profile:")) {
      const pid = key.slice("profile:".length);
      if (enabledCustomProfiles.some((p) => p.id === pid)) return key;
    }
    if (key.startsWith("agent:")) {
      const id = key.slice("agent:".length);
      if (discoveredAgents.some((a) => a.id === id)) return key;
    }
    return "api";
  }, [aiSettings.selectedProviderKey, discoveredAgents, enabledCustomProfiles]);

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

  const unusedImageActionLabel = isEn
    ? "Unused Image Suggestions"
    : "未引用图片建议";

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
      label: unusedImageActionLabel,
      disabled: !documentContent.trim() && !activeSiteRoot,
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
            size="xs"
            data-testid="ai-new-session-btn"
            title={isEn ? "New Session" : "新会话"}
            aria-label={isEn ? "New Session" : "新会话"}
            onClick={() => void handleNewSession()}
            className="gap-1 px-1.5 text-[11px] text-zinc-600"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{isEn ? "New Session" : "新会话"}</span>
          </Button>
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
        <div className="flex items-center gap-1.5">
          <select
            aria-label="AI Provider"
            data-testid="ai-provider-select"
            value={selectedValue}
            onChange={(e) =>
              onAiSettingsChange({ selectedProviderKey: e.target.value })
            }
            className="h-7 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-800 focus:border-zinc-400 focus:outline-none"
          >
            {enabledCustomProfiles.length > 0 && (
              <optgroup
                label={
                  isEn
                    ? "Custom ACP / Multi-Account"
                    : "自定义 ACP / 多账号"
                }
              >
                {enabledCustomProfiles.map((profile) => (
                  <option key={profile.id} value={`profile:${profile.id}`}>
                    {profile.name}
                    {profile.accountLabel ? ` (${profile.accountLabel})` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            {discoveredAgents.length > 0 && (
              <optgroup
                label={
                  isEn
                    ? "Auto-Discovered Local Agents"
                    : "本地自动发现（默认）"
                }
              >
                {discoveredAgents.map((agent) => (
                  <option key={agent.id} value={`agent:${agent.id}`}>
                    {agent.label}
                    {agent.version ? ` · ${agent.version}` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="api">
              {formatMessage(msg.ai.apiProviderLabel, {
                model: aiSettings.model || aiSettings.apiPreset,
              })}
            </option>
          </select>

          <Button
            type="button"
            variant={registryOpen ? "secondary" : "outline"}
            size="xs"
            data-testid="ai-registry-toggle"
            title={isEn ? "ACP Registry" : "ACP 目录"}
            onClick={handleToggleRegistry}
            className="h-7 shrink-0 gap-1 px-2 text-[11px]"
          >
            <Globe className="h-3 w-3 text-zinc-500" />
            <span>{isEn ? "Registry" : "目录"}</span>
          </Button>
        </div>

        {/* ACP Registry Light-Mode Popover */}
        {registryOpen && (
          <div
            data-testid="acp-registry-popover"
            className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-2 text-xs text-zinc-800 space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-zinc-900">
                  {isEn ? "ACP Agent Registry" : "ACP Agent 目录"}
                </span>
                {registryData && (
                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 border border-zinc-200/80">
                    {registryData.source === "remote"
                      ? isEn
                        ? "Remote"
                        : "在线源"
                      : isEn
                        ? "Built-in"
                        : "内置离线"}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={registryLoading}
                onClick={() => void loadRegistry()}
                className="text-[10.5px] text-zinc-500 hover:text-zinc-900 cursor-pointer disabled:opacity-40"
              >
                {registryLoading
                  ? isEn
                    ? "Loading..."
                    : "加载中..."
                  : isEn
                    ? "Refresh"
                    : "刷新"}
              </button>
            </div>

            {registryLoading && !registryData ? (
              <div className="flex items-center gap-1.5 py-2 text-[11px] text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{isEn ? "Fetching ACP registry..." : "正在获取 ACP 目录..."}</span>
              </div>
            ) : (
              <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
                {(registryData?.agents ?? []).map((entry) => {
                  const installed = discoveredAgents.some(
                    (a) =>
                      a.id === entry.id ||
                      a.executable === entry.executable ||
                      a.executable.endsWith(`/${entry.executable}`)
                  );
                  return (
                    <div
                      key={entry.id}
                      data-registry-agent={entry.id}
                      className="flex items-center justify-between gap-2 rounded border border-zinc-200/70 bg-white px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[11px] font-medium text-zinc-900">
                            {entry.name}
                          </span>
                          <span className="truncate font-mono text-[10px] text-zinc-400">
                            {entry.executable}
                          </span>
                        </div>
                        {entry.installHint && (
                          <div className="truncate font-mono text-[10px] text-zinc-400">
                            {entry.installHint}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => handleApplyRegistryEntry(entry)}
                        className="h-6 shrink-0 gap-1 px-2 text-[10.5px]"
                      >
                        <PackagePlus className="h-2.5 w-2.5" />
                        <span>
                          {installed
                            ? isEn
                              ? "Use"
                              : "使用"
                            : isEn
                              ? "Add"
                              : "添加配置"}
                        </span>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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

        {/* Site Custom Prompts (.hexoeditor/prompts/*.md) */}
        {sitePrompts.length > 0 && (
          <div data-testid="site-prompts-bar" className="space-y-1 pt-0.5">
            <div className="text-[10.5px] font-medium text-zinc-400">
              {isEn ? "Site Prompt Templates" : "站点模板"}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sitePrompts.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  data-site-prompt-id={tpl.id}
                  title={tpl.description || tpl.title}
                  disabled={running}
                  onClick={() => handleRunSitePrompt(tpl)}
                  className="inline-flex items-center gap-1 rounded-md border border-sky-200/80 bg-sky-50/70 px-2 py-0.5 text-[11px] font-medium text-sky-800 transition-colors hover:border-sky-300 hover:bg-sky-100/80 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <Sparkles className="h-2.5 w-2.5 text-sky-500" />
                  <span className="truncate max-w-[140px]">{tpl.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Streaming Response & Multi-Turn Viewport */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {turns.length > 0 && (
          <div data-testid="ai-conversation-turns" className="space-y-2">
            {turns.map((turn) => (
              <div
                key={turn.id}
                data-turn-role={turn.role}
                className={cn(
                  "rounded-lg px-2.5 py-2 text-[11.5px] leading-relaxed whitespace-pre-wrap break-words",
                  turn.role === "user"
                    ? "ml-6 border border-zinc-200/80 bg-zinc-100/80 text-zinc-700"
                    : "border border-zinc-200/70 bg-zinc-50/60 text-zinc-700"
                )}
              >
                {turn.content}
              </div>
            ))}
          </div>
        )}

        {/* Inline Light-Mode ACP Permission Approval Card */}
        {pendingPermission && (
          <div
            data-testid="acp-permission-card"
            className="rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-zinc-900 space-y-2"
          >
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-zinc-900">
                  {isEn ? "Permission Requested" : "Agent 请求执行权限"}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-700">
                  <span className="font-mono font-medium">
                    {pendingPermission.toolTitle}
                  </span>
                  {pendingPermission.kind && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                      {pendingPermission.kind}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-testid="acp-permission-deny"
                disabled={respondingPermission}
                onClick={() => void handleRespondPermission(false)}
                className="border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
              >
                {isEn ? "Deny" : "拒绝"}
              </Button>
              <Button
                type="button"
                variant="default"
                size="xs"
                data-testid="acp-permission-allow"
                disabled={respondingPermission}
                onClick={() => void handleRespondPermission(true)}
              >
                {isEn ? "Allow once" : "允许一次"}
              </Button>
            </div>
          </div>
        )}

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
          !running &&
          turns.length === 0 && (
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
