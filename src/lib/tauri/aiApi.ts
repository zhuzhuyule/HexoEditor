import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  AcpPermissionRequestEvent,
  AcpProbeResult,
  AcpRegistryEntry,
  AcpRegistryResult,
  AiConnectionResult,
  AiProviderConfig,
  AiRunRequest,
  AiStreamEvent,
  DiscoveredAgent,
  SiteContextSnapshot,
  SitePromptTemplate,
} from "@/types/ai";

import { isTauriRuntime } from "./api";

export const AI_STREAM_EVENT = "ai-stream";
export const AI_PERMISSION_REQUEST_EVENT = "ai-permission-request";

export const BUILTIN_ACP_REGISTRY_AGENTS: AcpRegistryEntry[] = [
  {
    id: "antigravity",
    name: "Antigravity",
    version: null,
    description: "Google Antigravity local ACP coding & writing agent.",
    executable: "agy",
    args: ["acp"],
    protocol: "acp",
    homepage: "https://antigravity.google",
    installHint: "agy acp",
  },
  {
    id: "opencode",
    name: "OpenCode",
    version: null,
    description: "Open-source terminal coding agent with native ACP server support.",
    executable: "opencode",
    args: ["acp"],
    protocol: "acp",
    homepage: "https://opencode.ai",
    installHint: "npm i -g opencode-ai",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    version: null,
    description: "Google Gemini CLI with experimental ACP stdio mode.",
    executable: "gemini",
    args: ["--experimental-acp"],
    protocol: "acp",
    homepage: "https://github.com/google-gemini/gemini-cli",
    installHint: "npm i -g @google/gemini-cli",
  },
  {
    id: "goose",
    name: "Goose",
    version: null,
    description: "Block's extensible local developer agent over ACP.",
    executable: "goose",
    args: ["acp"],
    protocol: "acp",
    homepage: "https://block.github.io/goose",
    installHint: "brew install block/tap/goose",
  },
  {
    id: "claude-code-acp",
    name: "Claude Code (ACP)",
    version: null,
    description: "ACP adapter for Anthropic Claude Code via Zed Industries bridge.",
    executable: "npx",
    args: ["-y", "@zed-industries/claude-code-acp"],
    protocol: "acp",
    homepage: "https://github.com/zed-industries/claude-code-acp",
    installHint: "npx -y @zed-industries/claude-code-acp",
  },
  {
    id: "codex-acp",
    name: "Codex (ACP)",
    version: null,
    description: "ACP adapter for OpenAI Codex CLI via Zed Industries bridge.",
    executable: "npx",
    args: ["-y", "@zed-industries/codex-acp"],
    protocol: "acp",
    homepage: "https://github.com/zed-industries/codex-acp",
    installHint: "npx -y @zed-industries/codex-acp",
  },
];

export async function discoverLocalAgents(): Promise<DiscoveredAgent[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<DiscoveredAgent[]>("discover_local_agents");
}

export async function probeAcpAgent(
  executable: string,
  args: string[],
  env?: Record<string, string>,
  cwd?: string | null
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
  return invoke<AcpProbeResult>("probe_acp_agent", {
    executable,
    args,
    env: env ?? null,
    cwd: cwd ?? null,
  });
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

export async function listSitePrompts(
  siteRoot: string
): Promise<SitePromptTemplate[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<SitePromptTemplate[]>("list_site_prompts", { siteRoot });
}

export async function fetchAcpRegistry(): Promise<AcpRegistryResult> {
  if (!isTauriRuntime()) {
    return {
      source: "builtin",
      fetchedAt: null,
      agents: BUILTIN_ACP_REGISTRY_AGENTS,
      message: null,
    };
  }
  return invoke<AcpRegistryResult>("fetch_acp_registry");
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

export async function aiRespondPermission(
  permissionId: string,
  optionId: string | null,
  cancelled: boolean
): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  return invoke<boolean>("ai_respond_permission", {
    permissionId,
    optionId,
    cancelled,
  });
}

export async function aiResetSession(sessionKey?: string | null): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  return invoke<boolean>("ai_reset_session", {
    sessionKey: sessionKey ?? null,
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

export async function listenAiPermissionRequest(
  handler: (event: AcpPermissionRequestEvent) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  return listen<AcpPermissionRequestEvent>(AI_PERMISSION_REQUEST_EVENT, (ev) => {
    handler(ev.payload);
  });
}
