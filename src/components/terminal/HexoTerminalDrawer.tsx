import {
  ChevronDown,
  ChevronUp,
  Eraser,
  ExternalLink,
  Hammer,
  Play,
  PlugZap,
  Rocket,
  Send,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";

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
  disabled?: boolean;
  locale?: Locale;
  className?: string;
}

function formatActionCommand(action: string | null): string {
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
  disabled = false,
  locale = "zh-CN",
  className,
}: HexoTerminalDrawerProps) {
  const logListRef = useRef<HTMLDivElement | null>(null);
  const isEn = locale === "en-US";

  useEffect(() => {
    if (!open) return;
    const container = logListRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [open, logs.length]);

  const isBusy = status.running && !status.serverRunning;
  const actionDisabled = disabled || status.running;

  const statusText = (() => {
    if (status.serverRunning) {
      return status.serverUrl
        ? isEn
          ? `Server running ${status.serverUrl}`
          : `本地服务运行中 ${status.serverUrl}`
        : isEn
        ? "Hexo server running..."
        : "本地服务运行中...";
    }
    if (status.running) {
      const cmd = formatActionCommand(status.action);
      return isEn ? `Running ${cmd}...` : `正在运行 ${cmd}...`;
    }
    if (status.message) {
      return status.message;
    }
    return isEn ? "Hexo Console" : "Hexo 终端";
  })();

  const labels = {
    startServer: isEn ? "Preview (hexo s)" : "启动预览 (hexo s)",
    stopServer: isEn ? "Stop Preview" : "停止预览",
    stopTask: isEn ? "Stop" : "停止",
    generate: isEn ? "Generate (g)" : "生成 (g)",
    generateDeploy: isEn ? "Deploy All (g -d)" : "一键部署 (g -d)",
    deploy: isEn ? "Deploy (d)" : "部署 (d)",
    clean: isEn ? "Clean" : "清理 (clean)",
    killPort: isEn ? "Free Port" : "释放端口",
    clearLogs: isEn ? "Clear Logs" : "清空日志",
    expand: isEn ? "Expand Console" : "展开日志",
    collapse: isEn ? "Collapse Console" : "收起日志",
    emptyLogs: isEn
      ? "No Hexo command output yet."
      : "暂无 Hexo 命令输出日志",
  };

  return (
    <section
      aria-label={isEn ? "Hexo Command Console" : "Hexo 命令终端"}
      className={cn(
        "flex shrink-0 flex-col border-t border-zinc-200/80 bg-white select-none",
        className
      )}
    >
      {/* Compact Command Bar / Collapsed Trigger */}
      <div className="flex h-8 items-center justify-between gap-2 px-2.5 bg-zinc-50/75">
        {/* Left: Status trigger & running indicator */}
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            className="inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 cursor-pointer"
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

          {status.serverRunning && status.serverUrl && onOpenServerUrl && (
            <button
              type="button"
              onClick={() => onOpenServerUrl(status.serverUrl!)}
              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-blue-600 transition-colors hover:bg-blue-50 cursor-pointer"
              title={status.serverUrl}
            >
              <ExternalLink className="h-3 w-3" />
              <span className="hidden sm:inline">{status.serverUrl}</span>
            </button>
          )}
        </div>

        {/* Right: Concise Hexo CLI Actions */}
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto no-scrollbar">
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
              <span>{labels.stopServer}</span>
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
              <span>{labels.startServer}</span>
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
            size="xs"
            disabled={actionDisabled}
            onClick={() => onRunAction("generate")}
            title={labels.generate}
          >
            <Hammer className="h-3 w-3" />
            <span>{labels.generate}</span>
          </Button>

          <Button
            variant="ghost"
            size="xs"
            disabled={actionDisabled}
            onClick={() => onRunAction("generate_deploy")}
            title={labels.generateDeploy}
          >
            <Rocket className="h-3 w-3" />
            <span>{labels.generateDeploy}</span>
          </Button>

          <Button
            variant="ghost"
            size="xs"
            disabled={actionDisabled}
            onClick={() => onRunAction("deploy")}
            title={labels.deploy}
          >
            <Send className="h-3 w-3" />
            <span>{labels.deploy}</span>
          </Button>

          <Button
            variant="ghost"
            size="xs"
            disabled={actionDisabled}
            onClick={() => onRunAction("clean")}
            title={labels.clean}
          >
            <Eraser className="h-3 w-3" />
            <span>{labels.clean}</span>
          </Button>

          <Button
            variant="ghost"
            size="xs"
            disabled={disabled}
            onClick={onKillPort}
            title={labels.killPort}
          >
            <PlugZap className="h-3 w-3" />
            <span>{labels.killPort}</span>
          </Button>

          <span className="mx-0.5 h-3.5 w-px bg-zinc-200" aria-hidden="true" />

          <Button
            variant="ghost"
            size="iconSm"
            disabled={logs.length === 0}
            onClick={onClearLogs}
            title={labels.clearLogs}
            aria-label={labels.clearLogs}
          >
            <Trash2 className="h-3 w-3" />
          </Button>

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
      </div>

      {/* Expandable Light Monospace Log Drawer */}
      {open && (
        <div
          ref={logListRef}
          role="log"
          aria-live="polite"
          className="h-44 overflow-y-auto border-t border-zinc-200/80 bg-[#F8F8F9] px-3 py-2 font-mono text-[12px] leading-relaxed select-text"
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
    </section>
  );
}
