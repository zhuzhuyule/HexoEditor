import {
  ExternalLink,
  FileText,
  Globe,
  Home,
  Play,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as api from "@/lib/tauri/api";
import type { Locale } from "@/types";

export interface LiveSitePreviewProps {
  serverUrl: string | null;
  serverRunning: boolean;
  currentPostSlug?: string | null;
  onStartServer?: () => void;
  onOpenExternal?: (url: string) => void;
  locale: Locale;
}

const COPY = {
  "zh-CN": {
    idleTitle: "Hexo 本地真机预览未启动",
    idleDesc: "启动本地 hexo server 后，可在此直接预览主题渲染后的真实站点页面。",
    startServer: "启动本地预览服务",
    homeTitle: "站点首页",
    currentPostTitle: "跳转到当前文章",
    refreshTitle: "刷新页面",
    openExternalTitle: "在浏览器中打开",
    addressPlaceholder: "输入地址或站内路径，回车跳转...",
    iframeTitle: "Hexo 本地实时预览",
  },
  "en-US": {
    idleTitle: "Hexo Local Server Not Running",
    idleDesc: "Start the local hexo server to preview the full theme-rendered site live.",
    startServer: "Start Hexo Server",
    homeTitle: "Site Home",
    currentPostTitle: "Jump to current post",
    refreshTitle: "Refresh",
    openExternalTitle: "Open in Browser",
    addressPlaceholder: "Enter URL or site path and press Enter...",
    iframeTitle: "Hexo Live Site Preview",
  },
} as const;

export function normalizeLivePreviewUrl(
  rawInput: string,
  baseServerUrl: string
): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Explicitly reject unsafe URI schemes
  if (/^(?:javascript|vbscript|data|file):/i.test(trimmed)) {
    return null;
  }

  try {
    const resolved = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, baseServerUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

export function buildPostPreviewUrl(baseServerUrl: string, slug: string): string | null {
  const cleanSlug = slug.trim().replace(/^\/+|\/+$/g, "");
  if (!cleanSlug) return null;
  const encodedPath = cleanSlug
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  try {
    const base = new URL(baseServerUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:") {
      return null;
    }
    const basePath = base.pathname.endsWith("/")
      ? base.pathname
      : `${base.pathname}/`;
    return new URL(`${encodedPath}/`, `${base.origin}${basePath}`).toString();
  } catch {
    return null;
  }
}

export function LiveSitePreview({
  serverUrl,
  serverRunning,
  currentPostSlug,
  onStartServer,
  onOpenExternal,
  locale,
}: LiveSitePreviewProps) {
  const copy = locale === "en-US" ? COPY["en-US"] : COPY["zh-CN"];

  const normalizedBaseUrl = useMemo(() => {
    if (!serverUrl) return null;
    return normalizeLivePreviewUrl(serverUrl, serverUrl);
  }, [serverUrl]);

  const [activeUrl, setActiveUrl] = useState<string>(normalizedBaseUrl ?? "");
  const [addressInput, setAddressInput] = useState<string>(normalizedBaseUrl ?? "");
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  useEffect(() => {
    if (normalizedBaseUrl) {
      setActiveUrl(normalizedBaseUrl);
      setAddressInput(normalizedBaseUrl);
    } else {
      setActiveUrl("");
      setAddressInput("");
    }
  }, [normalizedBaseUrl]);

  const postShortcutUrl = useMemo(() => {
    if (!normalizedBaseUrl || !currentPostSlug) return null;
    return buildPostPreviewUrl(normalizedBaseUrl, currentPostSlug);
  }, [normalizedBaseUrl, currentPostSlug]);

  if (!serverRunning || !normalizedBaseUrl) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-50/60 px-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-zinc-200/80 bg-white px-7 py-8 shadow-xs">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600">
            <Globe className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-900">{copy.idleTitle}</h3>
          <p className="text-xs leading-relaxed text-zinc-500">{copy.idleDesc}</p>
          {onStartServer && (
            <Button
              type="button"
              size="sm"
              className="mt-1"
              onClick={onStartServer}
            >
              <Play className="h-3.5 w-3.5" />
              {copy.startServer}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const navigateTo = (target: string) => {
    const resolved = normalizeLivePreviewUrl(target, normalizedBaseUrl);
    if (!resolved) {
      setAddressInput(activeUrl || normalizedBaseUrl);
      return;
    }
    setActiveUrl(resolved);
    setAddressInput(resolved);
    setReloadNonce((n) => n + 1);
  };

  const handleAddressSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigateTo(addressInput);
  };

  const handleRefresh = () => {
    setReloadNonce((n) => n + 1);
  };

  const handleOpenExternal = () => {
    const target = activeUrl || normalizedBaseUrl;
    if (!target) return;
    if (onOpenExternal) {
      onOpenExternal(target);
    } else {
      void api.openExternalUrl(target);
    }
  };

  const effectiveUrl = activeUrl || normalizedBaseUrl;

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-zinc-200 bg-zinc-50/80 px-2.5">
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          title={copy.homeTitle}
          aria-label={copy.homeTitle}
          onClick={() => navigateTo(normalizedBaseUrl)}
        >
          <Home className="h-3.5 w-3.5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          title={copy.refreshTitle}
          aria-label={copy.refreshTitle}
          onClick={handleRefresh}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>

        {postShortcutUrl && (
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            title={copy.currentPostTitle}
            aria-label={copy.currentPostTitle}
            onClick={() => navigateTo(postShortcutUrl)}
          >
            <FileText className="h-3.5 w-3.5" />
          </Button>
        )}

        <form onSubmit={handleAddressSubmit} className="flex min-w-0 flex-1 items-center">
          <Input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder={copy.addressPlaceholder}
            aria-label={copy.addressPlaceholder}
            className="h-6 bg-white font-mono text-[11px] text-zinc-700"
          />
        </form>

        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          title={copy.openExternalTitle}
          aria-label={copy.openExternalTitle}
          onClick={handleOpenExternal}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>

      <iframe
        key={`${effectiveUrl}#${reloadNonce}`}
        src={effectiveUrl}
        title={copy.iframeTitle}
        className="w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
