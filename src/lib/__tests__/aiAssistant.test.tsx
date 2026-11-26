import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import {
  AiAssistantDrawer,
  resolveActiveAiProvider,
} from "@/components/ai/AiAssistantDrawer";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  formatArgsString,
  formatEnvText,
  parseArgsString,
  parseEnvText,
} from "@/lib/ai/profiles";
import {
  buildSiteAwarePrompt,
  parseSuggestedFrontMatter,
} from "@/lib/ai/prompts";
import * as aiApi from "@/lib/tauri/aiApi";
import { useAppStore } from "@/stores/useAppStore";
import type { EditorTab } from "@/types";
import {
  DEFAULT_AI_SETTINGS,
  type AiSettings,
  type AiStreamEvent,
  type DiscoveredAgent,
  type SiteContextSnapshot,
} from "@/types/ai";
import {
  DEFAULT_EDITOR_PREFS,
  DEFAULT_IMAGE_BED_SETTINGS,
} from "@/types/settings";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    }) as unknown as DOMRectList;
}
if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

const SAMPLE_SITE_CTX: SiteContextSnapshot = {
  engine: "hexo",
  siteTitle: "Zac Blog",
  language: "zh-CN",
  permalink: ":year/:month/:day/:title/",
  postAssetFolder: true,
  theme: "next",
  markdownConfig: {
    breaks: false,
    mathEnabled: true,
    mermaidEnabled: true,
  },
  enabledThemeTags: ["blockquote", "codeblock", "asset_img", "note", "tabs", "mermaid", "math"],
  existingCategories: ["Engineering", "Notes"],
  existingTags: ["Rust", "Tauri"],
  activeDoc: {
    relativePath: "source/_posts/ai-demo.md",
    localImages: ["arch.png"],
  },
};

const SAMPLE_AGENTS: DiscoveredAgent[] = [
  {
    id: "opencode",
    label: "OpenCode (ACP / 免费额度)",
    executable: "/Users/test/.opencode/bin/opencode",
    args: ["acp"],
    protocol: "acp",
    version: "2.2.5",
  },
  {
    id: "antigravity",
    label: "Antigravity (ACP)",
    executable: "/Users/test/.local/bin/agy",
    args: ["acp"],
    protocol: "acp",
    version: "1.5.17",
  },
];

describe("Phase 4A: Site-aware AI prompts, drawer, and settings", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("builds site-aware prompts for all 6 scenarios and parses suggested Front-Matter JSON", () => {
    const doc = "---\ntitle: Draft\n---\n\nHello $E=mc^2$ and `code`.\n";

    const fmPrompt = buildSiteAwarePrompt({
      action: "frontmatter_complete",
      siteContext: SAMPLE_SITE_CTX,
      documentContent: doc,
    });
    expect(fmPrompt.systemPrompt).toContain("Engine: hexo");
    expect(fmPrompt.systemPrompt).toContain("Existing Tags: Rust, Tauri");
    expect(fmPrompt.userPrompt).toContain("JSON");

    const polishPrompt = buildSiteAwarePrompt({
      action: "polish",
      siteContext: SAMPLE_SITE_CTX,
      documentContent: doc,
      selectionText: "Selected sentence.",
    });
    expect(polishPrompt.userPrompt).toContain("Selected sentence.");
    expect(polishPrompt.userPrompt).toContain("selected excerpt");

    const translatePrompt = buildSiteAwarePrompt({
      action: "translate",
      siteContext: SAMPLE_SITE_CTX,
      documentContent: doc,
      selectionText: "这是一段技术说明。",
    });
    expect(translatePrompt.userPrompt).toContain("Chinese to natural technical English");

    const themePrompt = buildSiteAwarePrompt({
      action: "theme_format",
      siteContext: SAMPLE_SITE_CTX,
      documentContent: doc,
    });
    expect(themePrompt.userPrompt).toContain("Enabled Theme Tags: blockquote, codeblock, asset_img, note, tabs, mermaid, math");
    expect(themePrompt.userPrompt).toContain("Mermaid Diagrams Allowed: yes");

    const imagePrompt = buildSiteAwarePrompt({
      action: "image_caption",
      siteContext: SAMPLE_SITE_CTX,
      documentContent: doc,
    });
    expect(imagePrompt.userPrompt).toContain("arch.png");
    expect(imagePrompt.userPrompt).toContain("post_asset_folder is true");

    const diagPrompt = buildSiteAwarePrompt({
      action: "diagnose_terminal",
      siteContext: SAMPLE_SITE_CTX,
      documentContent: doc,
      terminalLogs: ["[stderr] Error: EADDRINUSE 4000"],
    });
    expect(diagPrompt.userPrompt).toContain("EADDRINUSE 4000");

    const parsed = parseSuggestedFrontMatter(
      '```json\n{"title":"ACP 架构实践","description":"深入解析 ACP 协议","categories":["Engineering"],"tags":["Rust","ACP"]}\n```'
    );
    expect(parsed).toEqual({
      title: "ACP 架构实践",
      description: "深入解析 ACP 协议",
      categories: ["Engineering"],
      tags: ["Rust", "ACP"],
      summaryExcerpt: undefined,
    });
  });

  it("renders AiAssistantDrawer, switches providers, streams thought & delta events, and triggers apply callbacks", async () => {
    let streamListener: ((ev: AiStreamEvent) => void) | null = null;
    vi.spyOn(aiApi, "buildSiteAiContext").mockResolvedValue(SAMPLE_SITE_CTX);
    vi.spyOn(aiApi, "listenAiStream").mockImplementation(async (fn) => {
      streamListener = fn;
      return () => {
        streamListener = null;
      };
    });
    const runSpy = vi.spyOn(aiApi, "aiRunPrompt").mockImplementation(async (req) => {
      return req.requestId ?? "req-1";
    });

    const onAiSettingsChange = vi.fn();
    const onApplyTextToEditor = vi.fn();
    const onApplyFrontMatter = vi.fn();

    await act(async () => {
      root.render(
        <AiAssistantDrawer
          open
          onOpenChange={() => {}}
          locale="zh-CN"
          aiSettings={{ ...DEFAULT_AI_SETTINGS, selectedProviderKey: "agent:opencode" }}
          onAiSettingsChange={onAiSettingsChange}
          discoveredAgents={SAMPLE_AGENTS}
          activeSiteRoot="/blog"
          activeDocPath="/blog/source/_posts/ai-demo.md"
          documentContent={"---\ntitle: Demo\n---\n\nBody text"}
          selectionText="Body text"
          hasSelection
          terminalLogs={["[stderr] Port 4000 in use"]}
          onOpenAiSettings={() => {}}
          onApplyTextToEditor={onApplyTextToEditor}
          onApplyFrontMatter={onApplyFrontMatter}
        />
      );
    });

    // Site context chip rendered
    expect(
      container.querySelector('[data-testid="ai-context-chip"]')?.textContent
    ).toContain("hexo".replace("h", "H"));
    expect(
      container.querySelector('[data-testid="ai-context-chip"]')?.textContent
    ).toContain("next");
    expect(
      container.querySelector('[data-testid="ai-context-chip"]')?.textContent
    ).toContain("1 图");

    // Provider switch updates settings
    const select = container.querySelector<HTMLSelectElement>(
      '[data-testid="ai-provider-select"]'
    )!;
    expect(select.value).toBe("agent:opencode");
    await act(async () => {
      select.value = "agent:antigravity";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onAiSettingsChange).toHaveBeenCalledWith({
      selectedProviderKey: "agent:antigravity",
    });

    // Click "补全 Front-Matter"
    const fmBtn = container.querySelector<HTMLButtonElement>(
      '[data-ai-action="frontmatter_complete"]'
    )!;
    await act(async () => {
      fmBtn.click();
    });
    expect(runSpy).toHaveBeenCalledTimes(1);
    const reqId = await runSpy.mock.results[0].value;

    // Emit streaming events
    await act(async () => {
      streamListener?.({
        requestId: reqId,
        kind: "thought",
        text: "Analyzing existing tags...",
        done: false,
      });
      streamListener?.({
        requestId: reqId,
        kind: "delta",
        text: '{"title":"AI 优化标题","tags":["Rust"],"categories":["Engineering"]}',
        done: false,
      });
      streamListener?.({
        requestId: reqId,
        kind: "done",
        text: "",
        done: true,
      });
    });

    expect(
      container.querySelector('[data-testid="ai-output-text"]')?.textContent
    ).toContain("AI 优化标题");

    // Apply Front-Matter button appears and works
    const applyFmBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("应用 Front-Matter")
    )!;
    await act(async () => {
      applyFmBtn.click();
    });
    expect(onApplyFrontMatter).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "AI 优化标题",
        tags: ["Rust"],
        categories: ["Engineering"],
      })
    );

    // Replace selection button works
    const replaceBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("替换选区")
    )!;
    await act(async () => {
      replaceBtn.click();
    });
    expect(onApplyTextToEditor).toHaveBeenCalledWith(
      '{"title":"AI 优化标题","tags":["Rust"],"categories":["Engineering"]}',
      "replace-selection"
    );
  });

  it("renders SettingsDialog AI section with discovered agents, ACP handshake probe, and API test", async () => {
    const probeSpy = vi.spyOn(aiApi, "probeAcpAgent").mockResolvedValue({
      ok: true,
      protocolVersion: 1,
      agentInfo: { name: "opencode", version: "2.2.5", title: "OpenCode" },
      agentCapabilities: { loadSession: true, image: false },
      authMethods: [],
      message: "ACP v1 ready (OpenCode 2.2.5)",
      latencyMs: 38,
    });
    const testConnSpy = vi.spyOn(aiApi, "testAiConnection").mockResolvedValue({
      ok: true,
      provider: "anthropic",
      message: "Anthropic API connected (45ms)",
      latencyMs: 45,
    });

    function AiSettingsHarness() {
      const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
      return (
        <SettingsDialog
          open
          onOpenChange={() => {}}
          locale="zh-CN"
          initialSection="ai"
          onLocaleChange={() => {}}
          autoSave
          onAutoSaveChange={() => {}}
          editorPrefs={DEFAULT_EDITOR_PREFS}
          onEditorPrefsChange={() => {}}
          showLineNumbers={false}
          onShowLineNumbersChange={() => {}}
          showToolbar
          onShowToolbarChange={() => {}}
          syncScroll
          onSyncScrollChange={() => {}}
          enableHexoTags
          onEnableHexoTagsChange={() => {}}
          imageBed={DEFAULT_IMAGE_BED_SETTINGS}
          onImageBedChange={() => {}}
          aiSettings={aiSettings}
          onAiSettingsChange={(patch) =>
            setAiSettings((prev) => ({ ...prev, ...patch }))
          }
          discoveredAgents={SAMPLE_AGENTS}
          onRefreshAgents={async () => SAMPLE_AGENTS}
        />
      );
    }

    await act(async () => {
      root.render(<AiSettingsHarness />);
    });

    expect(
      document.body.querySelector('[data-settings-panel="ai"]')
    ).not.toBeNull();
    expect(
      document.body.querySelector('[data-discovered-agent="opencode"]')
    ).not.toBeNull();

    // Probe OpenCode ACP handshake
    const opencodeCard = document.body.querySelector(
      '[data-discovered-agent="opencode"]'
    )!;
    const probeBtn = Array.from(opencodeCard.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("ACP 握手测试")
    )!;
    await act(async () => {
      probeBtn.click();
    });
    expect(probeSpy).toHaveBeenCalledWith(
      "/Users/test/.opencode/bin/opencode",
      ["acp"]
    );
    expect(
      document.body.querySelector('[data-testid="acp-probe-result-opencode"]')
        ?.textContent
    ).toContain("loadSession");

    // Switch preset to Anthropic & test API connection
    const anthropicBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
    ).find((b) => b.textContent?.trim() === "Anthropic")!;
    await act(async () => {
      anthropicBtn.click();
    });
    expect(
      document.body.querySelector<HTMLInputElement>("#settings-ai-base-url")?.value
    ).toBe("https://api.anthropic.com");

    const testApiBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("测试连接")
    )!;
    await act(async () => {
      testApiBtn.click();
    });
    expect(testConnSpy).toHaveBeenCalledTimes(1);
    expect(
      document.body.querySelector('[data-testid="ai-test-result"]')?.textContent
    ).toContain("Anthropic API connected");
  });

  it("toggles AiAssistantDrawer from TabBar and triggers Front-Matter AI completion from FrontMatterBar", async () => {
    vi.spyOn(aiApi, "buildSiteAiContext").mockResolvedValue(SAMPLE_SITE_CTX);
    vi.spyOn(aiApi, "listenAiStream").mockResolvedValue(() => {});
    const runSpy = vi.spyOn(aiApi, "aiRunPrompt").mockResolvedValue("req-app-1");

    const tab: EditorTab = {
      id: "tab-ai-app",
      filePath: "/blog/source/_posts/ai-demo.md",
      title: "AI Demo",
      content: "---\ntitle: AI Demo\n---\n\nHello world",
      savedContent: "---\ntitle: AI Demo\n---\n\nHello world",
      isDirty: false,
      isDraft: false,
      isStandalone: false,
      siteRoot: "/blog",
      postAssetFolder: true,
      sourceDir: "source",
      modifiedMs: Date.now(),
      externalChange: null,
      cursorLine: 5,
      cursorCol: 1,
    };

    useAppStore.setState({
      hydrated: true,
      locale: "zh-CN",
      activeSiteRoot: "/blog",
      tabs: [tab],
      activeTabId: tab.id,
      discoveredAgents: SAMPLE_AGENTS,
      aiSettings: { ...DEFAULT_AI_SETTINGS, selectedProviderKey: "agent:opencode" },
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    // Default closed
    expect(
      container.querySelector('[data-testid="ai-assistant-drawer"]')
    ).toBeNull();

    // Open via TabBar Sparkles button
    const tabBarAiBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="AI 写作助手"]'
    )!;
    await act(async () => {
      tabBarAiBtn.click();
    });
    expect(
      container.querySelector('[data-testid="ai-assistant-drawer"]')
    ).not.toBeNull();

    // Close drawer, then trigger via FrontMatterBar "AI 补全"
    await act(async () => {
      tabBarAiBtn.click();
    });
    expect(
      container.querySelector('[data-testid="ai-assistant-drawer"]')
    ).toBeNull();

    const fmAiBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("AI 补全")
    )!;
    await act(async () => {
      fmAiBtn.click();
    });
    expect(
      container.querySelector('[data-testid="ai-assistant-drawer"]')
    ).not.toBeNull();
    expect(runSpy).toHaveBeenCalledTimes(1);

    // UI font size preference syncs dataset attribute on <html>
    await act(async () => {
      useAppStore.getState().setEditorPrefs({ uiFontSize: "lg" });
    });
    expect(document.documentElement.dataset.uiFontSize).toBe("lg");
  });

  it("supports OMB-style custom & multi-account ACP profiles with custom env/cwd and helper parsers", async () => {
    expect(parseArgsString('acp --profile "work acc"')).toEqual([
      "acp",
      "--profile",
      "work acc",
    ]);
    expect(formatArgsString(["acp", "--dir", "/my blog"])).toBe(
      'acp --dir "/my blog"'
    );
    const parsedEnv = parseEnvText(
      "# comment\nXDG_CONFIG_HOME=/tmp/acc2\nTOKEN='secret val'"
    );
    expect(parsedEnv).toEqual({
      XDG_CONFIG_HOME: "/tmp/acc2",
      TOKEN: "secret val",
    });
    expect(formatEnvText(parsedEnv)).toContain("XDG_CONFIG_HOME=/tmp/acc2");

    const customSettings: AiSettings = {
      ...DEFAULT_AI_SETTINGS,
      selectedProviderKey: "profile:p-acc2",
      customAcpProfiles: [
        {
          id: "p-acc2",
          name: "OpenCode 免费号 2",
          protocol: "acp",
          executable: "/Users/test/.opencode/bin/opencode",
          args: ["acp"],
          env: { XDG_CONFIG_HOME: "/tmp/opencode-acc2" },
          cwd: "/tmp/blog",
          accountLabel: "账号 2",
          enabled: true,
        },
      ],
    };

    expect(resolveActiveAiProvider(customSettings, SAMPLE_AGENTS)).toEqual({
      mode: "acp",
      executable: "/Users/test/.opencode/bin/opencode",
      args: ["acp"],
      env: { XDG_CONFIG_HOME: "/tmp/opencode-acc2" },
      cwd: "/tmp/blog",
      baseUrl: null,
      apiKey: null,
      model: null,
    });

    const probeSpy = vi.spyOn(aiApi, "probeAcpAgent").mockResolvedValue({
      ok: true,
      protocolVersion: 1,
      agentInfo: { name: "opencode", version: "2.2.5" },
      agentCapabilities: { loadSession: true },
      authMethods: [],
      message: "ACP v1 ready (opencode 2.2.5)",
      latencyMs: 12,
    });

    function CustomAcpHarness() {
      const [aiSettings, setAiSettings] = useState<AiSettings>({
        ...DEFAULT_AI_SETTINGS,
        selectedProviderKey: "agent:opencode",
        customAcpProfiles: [],
      });
      return (
        <SettingsDialog
          open
          onOpenChange={() => {}}
          locale="zh-CN"
          initialSection="ai"
          onLocaleChange={() => {}}
          autoSave
          onAutoSaveChange={() => {}}
          editorPrefs={DEFAULT_EDITOR_PREFS}
          onEditorPrefsChange={() => {}}
          showLineNumbers={false}
          onShowLineNumbersChange={() => {}}
          showToolbar={false}
          onShowToolbarChange={() => {}}
          syncScroll
          onSyncScrollChange={() => {}}
          enableHexoTags
          onEnableHexoTagsChange={() => {}}
          imageBed={DEFAULT_IMAGE_BED_SETTINGS}
          onImageBedChange={() => {}}
          aiSettings={aiSettings}
          onAiSettingsChange={(patch) =>
            setAiSettings((prev) => ({ ...prev, ...patch }))
          }
          discoveredAgents={SAMPLE_AGENTS}
          onRefreshAgents={async () => SAMPLE_AGENTS}
        />
      );
    }

    await act(async () => {
      root.render(<CustomAcpHarness />);
    });

    // Click "+ 多账号" on OpenCode discovered card
    const opencodeCard = document.body.querySelector(
      '[data-discovered-agent="opencode"]'
    )!;
    const addAccountBtn = Array.from(opencodeCard.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("+ 多账号")
    )!;
    await act(async () => {
      addAccountBtn.click();
    });

    const form = document.body.querySelector('[data-testid="custom-acp-form"]');
    expect(form).not.toBeNull();
    const envTextarea = document.body.querySelector<HTMLTextAreaElement>(
      "#acp-profile-env"
    )!;
    expect(envTextarea.value).toContain("XDG_CONFIG_HOME=");

    const saveBtn = Array.from(form!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("保存配置")
    )!;
    await act(async () => {
      saveBtn.click();
    });

    const profileCard = document.body.querySelector('[data-custom-acp-profile]');
    expect(profileCard).not.toBeNull();
    expect(profileCard!.textContent).toContain("账号 2");
    expect(profileCard!.textContent).toContain("当前使用");

    // Probe custom ACP profile passes custom env
    const probeCustomBtn = Array.from(
      profileCard!.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("ACP 握手测试"))!;
    await act(async () => {
      probeCustomBtn.click();
    });
    expect(probeSpy).toHaveBeenCalledWith(
      "/Users/test/.opencode/bin/opencode",
      ["acp"],
      { XDG_CONFIG_HOME: "~/.config/opencode-acc2" },
      null
    );
  });
});
