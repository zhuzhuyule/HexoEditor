import {
  Check,
  ChevronDown,
  ChevronUp,
  Eraser,
  ExternalLink,
  Globe,
  Hammer,
  Link2,
  MoreHorizontal,
  Play,
  PlugZap,
  Rocket,
  Send,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMessage, getMessages } from "@/lib/i18n";
import { cn, computeDocumentStats } from "@/lib/utils";
import type { EditorTab, Locale, SiteEngine } from "@/types";
import type { UiFontSize } from "@/types/settings";

export type HexoCliAction =
  | "server"
  | "generate"
  | "deploy"
  | "generate_deploy"
  | "clean";

export interface HexoTerminalLogEntry {
  id?: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
  timestamp: number;
}

export interface HexoTerminalStatus {
  running: boolean;
  action: HexoCliAction | string | null;
  serverRunning: boolean;
  serverUrl: string | null;
  exitCode?: number | null;
  message?: string | null;
}

export interface HexoTerminalDrawerProps {
  status: HexoTerminalStatus;
  logs: HexoTerminalLogEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunAction: (action: HexoCliAction) => void;
  onStop: () => void;
  onKillPort: () => void;
  onClearLogs: () => void;
  onOpenServerUrl?: (url: string) => void;
  onAiDiagnose?: () => void;
  targetUrl?: string | null;
  disabled?: boolean;
  locale?: Locale;
  engine?: SiteEngine;
  activeTab?: EditorTab | null;
  syncScroll?: boolean;
  onToggleSyncScroll?: () => void;
  autoSave?: boolean;
  onToggleAutoSave?: () => void;
  onToggleLocale?: () => void;
  uiFontSize?: UiFontSize;
  onCycleUiFontSize?: () => void;
  className?: string;
}

function formatActionCommand(
  action: string | null,
  engine: SiteEngine = "hexo"
): string {
  if (engine === "hugo") {
    switch (action) {
      case "server":
        return "hugo server -D";
      case "generate":
        return "hugo";
      case "deploy":
        return "hugo deploy";
      case "generate_deploy":
        return "hugo && hugo deploy";
      case "clean":
        return "hugo clean";
      default:
        return action ? `hugo ${action}` : "hugo";
    }
  }
  switch (action) {
    case "server":
      return "hexo s";
    case "generate":
      return "hexo g";
    case "deploy":
      return "hexo d";
    case "generate_deploy":
      return "hexo g -d";
    case "clean":
      return "hexo clean";
    default:
      return action ? `hexo ${action}` : "hexo";
  }
}

function localizeIdleStatusMessage(message: string, isEn: boolean): string {
  if (isEn) return message;
  const stopped = message.match(/^Stopped `([^`]+)`\.?$/i);
  if (stopped) return `已停止 ${stopped[1]}`;
  const completed = message.match(/^Completed `([^`]+)`\.?$/i);
  if (completed) return `已完成 ${completed[1]}`;
  const exited = message.match(/^`([^`]+)` exited with code (.+)\.?$/i);
  if (exited) return `${exited[1]} 已退出（退出码 ${exited[2]}）`;
  return message;
}

function formatLogTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function HexoTerminalDrawer({
  status,
  logs,
  open,
  onOpenChange,
  onRunAction,
  onStop,
  onKillPort,
  onClearLogs,
  onOpenServerUrl,
  onAiDiagnose,
  targetUrl,
  disabled = false,
  locale = "zh-CN",
  engine = "hexo",
  activeTab = null,
  syncScroll,
  onToggleSyncScroll,
  autoSave,
  onToggleAutoSave,
  onToggleLocale,
  uiFontSize = "md",
  onCycleUiFontSize,
  className,
}: HexoTerminalDrawerProps) {
  const logListRef = useRef<HTMLDivElement | null>(null);
  const isEn = locale === "en-US";
  const isHugo = engine === "hugo";
  const msg = getMessages(locale);

  const stats = useMemo(
    () => (activeTab ? computeDocumentStats(activeTab.content) : null),
    [activeTab?.content]
  );

  useEffect(() => {
    if (!open) return;
    const container = logListRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [open, logs.length]);

  const isBusy = status.running && !status.serverRunning;
  const actionDisabled = disabled || status.running;
  const hasTerminalError =
    logs.some((l) => l.stream === "stderr") ||
    (status.exitCode !== null &&
      status.exitCode !== undefined &&
      status.exitCode !== 0);
  const showAiDiagnose = Boolean(onAiDiagnose && hasTerminalError);
  const hasDedicatedPostUrl = Boolean(
    targetUrl && targetUrl !== status.serverUrl
  );

  const statusText = (() => {
    if (status.serverRunning) {
      if (hasDedicatedPostUrl) {
        return isEn ? "Server running" : "本地服务运行中";
      }
      return status.serverUrl
        ? isEn
          ? `Server running ${status.serverUrl}`
          : `本地服务运行中 ${status.serverUrl}`
        : isEn
        ? isHugo
          ? "Hugo server running..."
          : "Hexo server running..."
        : "本地服务运行中...";
    }
    if (status.running) {
      const cmd = formatActionCommand(status.action, engine);
      return isEn ? `Running ${cmd}...` : `正在运行 ${cmd}...`;
    }
    if (status.message) {
      return localizeIdleStatusMessage(status.message, isEn);
    }
    if (isHugo) {
      return isEn ? "Hugo Console" : "Hugo 终端";
    }
    return isEn ? "Hexo Console" : "Hexo 终端";
  })();

  const labels = {
    startServer: isHugo
      ? isEn
        ? "Preview (hugo server -D)"
        : "启动预览 (hugo server -D)"
      : isEn
      ? "Preview (hexo s)"
      : "启动预览 (hexo s)",
    compactPreview: isEn ? "Preview" : "预览",
    stopServer: isEn ? "Stop Preview" : "停止预览",
    compactStop: isEn ? "Stop" : "停止",
    stopTask: isEn ? "Stop" : "停止",
    generate: isHugo
      ? isEn
        ? "Build (hugo)"
        : "构建 (hugo)"
      : isEn
      ? "Generate (g)"
      : "生成 (g)",
    generateDeploy: isHugo
      ? isEn
        ? "Build & Deploy"
        : "构建并部署"
      : isEn
      ? "Deploy All (g -d)"
      : "一键部署 (g -d)",
    deploy: isHugo
      ? isEn
        ? "Deploy (hugo deploy)"
        : "部署 (hugo deploy)"
      : isEn
      ? "Deploy (d)"
      : "部署 (d)",
    clean: isEn ? "Clean" : "清理 (clean)",
    killPort: isEn ? "Free Port" : "释放端口",
    clearLogs: isEn ? "Clear Logs" : "清空日志",
    moreActions: isEn ? "More Site & Editor Actions" : "更多操作",
    expand: isEn ? "Expand Console" : "展开日志",
    collapse: isEn ? "Collapse Console" : "收起日志",
    emptyLogs: isHugo
      ? isEn
        ? "No Hugo command output yet."
        : "暂无 Hugo 命令输出日志"
      : isEn
      ? "No Hexo command output yet."
      : "暂无 Hexo 命令输出日志",
    aiDiagnose: isEn ? "AI Diagnose" : "AI 诊断",
    aiDiagnoseTip: isEn
      ? "Diagnose terminal errors with AI"
      : "使用 AI 诊断终端报错",
  };

  const hasEditorToggles = Boolean(
    onToggleSyncScroll ||
      onToggleAutoSave ||
      onToggleLocale ||
      onCycleUiFontSize
  );

  const uiFontSizeLabel = isEn
    ? uiFontSize === "sm"
      ? "UI Font: Small"
      : uiFontSize === "lg"
      ? "UI Font: Large"
      : "UI Font: Medium"
    : uiFontSize === "sm"
    ? "界面字号：小"
    : uiFontSize === "lg"
    ? "界面字号：大"
    : "界面字号：中";

  return (
    <section
      aria-label={
        isHugo
          ? isEn
            ? "Hugo Command Console"
            : "Hugo 命令终端"
          : isEn
          ? "Hexo Command Console"
          : "Hexo 命令终端"
      }
      className={cn(
        "flex shrink-0 flex-col border-t border-zinc-200/80 bg-white select-none",
        className
      )}
    >
      {/* Expandable Light Monospace Log Drawer (above footer bar so bottom bar stays aligned with sidebar h-8) */}
      {open && (
        <div
          ref={logListRef}
          role="log"
          aria-live="polite"
          className="h-44 overflow-y-auto border-b border-zinc-200/80 bg-[#F8F8F9] px-3 py-2 font-mono text-[12px] leading-relaxed select-text"
        >
          {logs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs font-sans text-zinc-400 select-none">
              {labels.emptyLogs}
            </div>
          ) : (
            <div className="space-y-0.5">
              {logs.map((entry, idx) => {
                const key = entry.id ?? `${entry.timestamp}-${idx}`;
                const timeStr = formatLogTime(entry.timestamp);
                return (
                  <div
                    key={key}
                    data-stream={entry.stream}
                    className={cn(
                      "flex items-baseline gap-2.5 whitespace-pre-wrap break-all",
                      entry.stream === "stderr" && "text-red-600",
                      entry.stream === "system" && "text-sky-700",
                      entry.stream === "stdout" && "text-zinc-700"
                    )}
                  >
                    {timeStr && (
                      <span className="shrink-0 text-[10.5px] tabular-nums text-zinc-400 select-none">
                        {timeStr}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">{entry.line}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Unified Single Workspace Footer Bar (32px, aligned with Sidebar Footer) */}
      <footer className="no-print flex h-[32px] items-center justify-between gap-2 bg-zinc-50/75 px-2.5">
        {/* Left: Status trigger + running indicator + clickable live URL */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 cursor-pointer"
            title={open ? labels.collapse : labels.expand}
          >
            <Terminal className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                status.serverRunning
                  ? "bg-emerald-500"
                  : status.running
                  ? "bg-amber-500 animate-pulse"
                  : "bg-zinc-300"
              )}
            />
            <span className="truncate font-medium">{statusText}</span>
            {logs.length > 0 && (
              <span className="shrink-0 rounded bg-zinc-200/80 px-1 font-mono text-[10px] tabular-nums text-zinc-500">
                {logs.length}
              </span>
            )}
          </button>

          {status.serverRunning &&
            (targetUrl || status.serverUrl) &&
            onOpenServerUrl &&
            (() => {
              const openUrlTarget = (targetUrl || status.serverUrl)!;
              let readableUrl = openUrlTarget;
              try {
                readableUrl = decodeURI(openUrlTarget);
              } catch {
                // ignore malformed URI
              }
              const displayLabel = hasDedicatedPostUrl
                ? readableUrl.replace(/^https?:\/\//i, "")
                : status.serverUrl;
              return (
                <button
                  type="button"
                  onClick={() => onOpenServerUrl(openUrlTarget)}
                  className="inline-flex min-w-0 max-w-[320px] items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-blue-600 transition-colors hover:bg-blue-50 cursor-pointer"
                  title={readableUrl}
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="hidden truncate sm:inline">
                    {displayLabel}
                  </span>
                </button>
              );
            })()}
        </div>

        {/* Right: Document Stats + Primary Actions + More Menu + Log Toggle */}
        <div className="flex shrink-0 items-center gap-1">
          {activeTab && stats && (
            <>
              <div className="hidden md:inline-flex items-center gap-2 font-mono text-[10.5px] text-zinc-400 tabular-nums">
                <span>
                  {formatMessage(msg.status.lineCol, {
                    line: activeTab.cursorLine,
                    col: activeTab.cursorCol,
                  })}
                </span>
                <span>·</span>
                <span>
                  {formatMessage(msg.status.words, { count: stats.totalWords })}
                </span>
                {activeTab.isDirty ? (
                  <span
                    className="inline-flex items-center gap-1 text-amber-600"
                    title={msg.status.unsaved}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span className="hidden lg:inline">
                      {msg.status.unsaved}
                    </span>
                  </span>
                ) : (
                  <span className="hidden lg:inline text-zinc-400">
                    {msg.status.saved}
                  </span>
                )}
              </div>
              <span
                className="hidden md:block mx-1 h-3.5 w-px bg-zinc-200/80"
                aria-hidden="true"
              />
            </>
          )}

          {/* Primary Outer Actions */}
          {showAiDiagnose && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onAiDiagnose}
              title={labels.aiDiagnoseTip}
              aria-label={labels.aiDiagnose}
              data-testid="terminal-ai-diagnose"
              className="h-6 gap-1 rounded border border-red-200/80 bg-red-50/70 px-2 text-[11px] font-medium text-red-700 hover:bg-red-100/80 hover:text-red-800"
            >
              <Sparkles className="h-3 w-3 shrink-0" />
              <span>{labels.aiDiagnose}</span>
            </Button>
          )}
          {status.serverRunning ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={disabled}
              onClick={onStop}
              title={labels.stopServer}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>{labels.compactStop}</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              disabled={actionDisabled}
              onClick={() => onRunAction("server")}
              title={labels.startServer}
            >
              <Play className="h-3 w-3" />
              <span>{labels.compactPreview}</span>
            </Button>
          )}

          {isBusy && (
            <Button
              variant="ghost"
              size="xs"
              disabled={disabled}
              onClick={onStop}
              title={labels.stopTask}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>{labels.stopTask}</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="iconSm"
            disabled={actionDisabled}
            onClick={() => onRunAction("generate_deploy")}
            title={labels.generateDeploy}
            aria-label={labels.generateDeploy}
          >
            <Rocket className="h-3 w-3" />
          </Button>

          {/* More Site Commands & Workspace Toggles */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                title={labels.moreActions}
                aria-label={labels.moreActions}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                {isHugo
                  ? isEn
                    ? "Hugo Actions"
                    : "Hugo 操作"
                  : isEn
                  ? "Hexo Actions"
                  : "Hexo 操作"}
              </DropdownMenuLabel>
              <DropdownMenuItem
                disabled={actionDisabled}
                onSelect={() => onRunAction("generate")}
              >
                <Hammer className="h-3.5 w-3.5 text-zinc-500" />
                <span>{labels.generate}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={actionDisabled}
                onSelect={() => onRunAction("deploy")}
              >
                <Send className="h-3.5 w-3.5 text-zinc-500" />
                <span>{labels.deploy}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={actionDisabled}
                onSelect={() => onRunAction("clean")}
              >
                <Eraser className="h-3.5 w-3.5 text-zinc-500" />
                <span>{labels.clean}</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={disabled} onSelect={onKillPort}>
                <PlugZap className="h-3.5 w-3.5 text-zinc-500" />
                <span>{labels.killPort}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={logs.length === 0}
                onSelect={onClearLogs}
              >
                <Trash2 className="h-3.5 w-3.5 text-zinc-500" />
                <span>{labels.clearLogs}</span>
              </DropdownMenuItem>

              {hasEditorToggles && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>
                    {isEn ? "Workspace" : "写作偏好"}
                  </DropdownMenuLabel>
                  {onToggleSyncScroll && (
                    <DropdownMenuItem
                      onSelect={onToggleSyncScroll}
                      className="justify-between"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Link2 className="h-3.5 w-3.5 text-zinc-500" />
                        <span>{msg.status.syncScroll}</span>
                      </span>
                      {syncScroll && (
                        <Check className="h-3.5 w-3.5 text-zinc-900" />
                      )}
                    </DropdownMenuItem>
                  )}
                  {onToggleAutoSave && (
                    <DropdownMenuItem
                      onSelect={onToggleAutoSave}
                      className="justify-between"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Check
                          className={cn(
                            "h-3.5 w-3.5",
                            autoSave ? "text-zinc-900" : "text-transparent"
                          )}
                        />
                        <span>{msg.status.autoSave}</span>
                      </span>
                    </DropdownMenuItem>
                  )}
                  {onToggleLocale && (
                    <DropdownMenuItem onSelect={onToggleLocale}>
                      <Globe className="h-3.5 w-3.5 text-zinc-500" />
                      <span>
                        {isEn ? "Language: English" : "界面语言：中文"}
                      </span>
                    </DropdownMenuItem>
                  )}
                  {onCycleUiFontSize && (
                    <DropdownMenuItem onSelect={onCycleUiFontSize}>
                      <Type className="h-3.5 w-3.5 text-zinc-500" />
                      <span>{uiFontSizeLabel}</span>
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => onOpenChange(!open)}
            title={open ? labels.collapse : labels.expand}
            aria-label={open ? labels.collapse : labels.expand}
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </footer>
    </section>
  );
}
