import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  AcpProbeResult,
  AiConnectionResult,
  AiProviderConfig,
  AiRunRequest,
  AiStreamEvent,
  DiscoveredAgent,
  SiteContextSnapshot,
} from "@/types/ai";

import { isTauriRuntime } from "./api";

export const AI_STREAM_EVENT = "ai-stream";

export async function discoverLocalAgents(): Promise<DiscoveredAgent[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<DiscoveredAgent[]>("discover_local_agents");
}

export async function probeAcpAgent(
  executable: string,
  args: string[]
): Promise<AcpProbeResult> {
  if (!isTauriRuntime()) {
    return {
      ok: false,
      protocolVersion: null,
      agentInfo: null,
      agentCapabilities: {},
      authMethods: [],
      message: "Tauri desktop runtime is required to probe local ACP agents.",
      latencyMs: 0,
    };
  }
  return invoke<AcpProbeResult>("probe_acp_agent", { executable, args });
}

export async function buildSiteAiContext(
  siteRoot: string,
  docPath?: string | null
): Promise<SiteContextSnapshot> {
  if (!isTauriRuntime()) {
    return {
      engine: "hexo",
      siteTitle: "Hexo Preview",
      language: "zh-CN",
      permalink: ":year/:month/:day/:title/",
      postAssetFolder: true,
      theme: null,
      markdownConfig: {
        breaks: true,
        mathEnabled: false,
        mermaidEnabled: false,
      },
      enabledThemeTags: ["blockquote", "codeblock", "asset_img"],
      existingCategories: [],
      existingTags: [],
      activeDoc: docPath
        ? {
            relativePath: docPath,
            localImages: [],
          }
        : null,
    };
  }
  return invoke<SiteContextSnapshot>("build_site_ai_context", {
    siteRoot,
    docPath: docPath ?? null,
  });
}

export async function testAiConnection(
  config: AiProviderConfig
): Promise<AiConnectionResult> {
  if (!isTauriRuntime()) {
    return {
      ok: false,
      provider: config.mode,
      message: "Tauri desktop runtime is required to test AI connections.",
      latencyMs: 0,
    };
  }
  return invoke<AiConnectionResult>("test_ai_connection", { config });
}

export async function aiRunPrompt(request: AiRunRequest): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Tauri desktop runtime is required to execute AI prompts.");
  }
  return invoke<string>("ai_run_prompt", { request });
}

export async function aiCancelPrompt(requestId?: string | null): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  return invoke<boolean>("ai_cancel_prompt", {
    requestId: requestId ?? null,
  });
}

export async function listenAiStream(
  handler: (event: AiStreamEvent) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  return listen<AiStreamEvent>(AI_STREAM_EVENT, (ev) => {
    handler(ev.payload);
  });
}
