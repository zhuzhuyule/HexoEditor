export interface DiscoveredAgent {
  id: string;
  label: string;
  executable: string;
  args: string[];
  protocol: "acp" | "cli" | string;
  version?: string | null;
}

export interface AcpAgentInfo {
  name: string;
  version?: string | null;
  title?: string | null;
}

export interface AcpAuthMethod {
  id: string;
  name: string;
  description?: string | null;
}

export interface AcpProbeResult {
  ok: boolean;
  protocolVersion?: number | null;
  agentInfo?: AcpAgentInfo | null;
  agentCapabilities: Record<string, unknown>;
  authMethods: AcpAuthMethod[];
  message: string;
  latencyMs: number;
}

export interface SiteMarkdownConfig {
  breaks?: boolean | null;
  mathEnabled: boolean;
  mermaidEnabled: boolean;
}

export interface ActiveDocContext {
  relativePath: string;
  localImages: string[];
}

export interface SiteContextSnapshot {
  engine: "hexo" | "hugo" | "unknown" | string;
  siteTitle: string;
  language: string;
  permalink: string;
  postAssetFolder: boolean;
  theme?: string | null;
  markdownConfig: SiteMarkdownConfig;
  enabledThemeTags: string[];
  existingCategories: string[];
  existingTags: string[];
  activeDoc?: ActiveDocContext | null;
}

export type AiApiPreset = "openai_compatible" | "anthropic" | "ollama";

export type AiProviderMode =
  | "acp"
  | "cli"
  | "openai_compatible"
  | "anthropic"
  | "ollama";

export interface AiProviderConfig {
  mode: AiProviderMode | string;
  executable?: string | null;
  args: string[];
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
}

export interface AiRunRequest {
  requestId?: string;
  provider: AiProviderConfig;
  systemPrompt?: string | null;
  prompt: string;
  cwd?: string | null;
}

export interface AiStreamEvent {
  requestId: string;
  kind: "delta" | "thought" | "status" | "done" | "error" | string;
  text: string;
  done: boolean;
}

export interface AiConnectionResult {
  ok: boolean;
  provider: string;
  message: string;
  latencyMs: number;
}

export interface AiSettings {
  /** `"api"` or `"agent:<id>"` (e.g. `"agent:opencode"`) */
  selectedProviderKey: string;
  apiPreset: AiApiPreset;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  selectedProviderKey: "api",
  apiPreset: "openai_compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

export type AiPromptAction =
  | "frontmatter_complete"
  | "polish"
  | "translate"
  | "theme_format"
  | "image_caption"
  | "diagnose_terminal"
  | "custom";

export interface SuggestedFrontMatter {
  title?: string;
  description?: string;
  categories?: string[];
  tags?: string[];
  summaryExcerpt?: string;
}
