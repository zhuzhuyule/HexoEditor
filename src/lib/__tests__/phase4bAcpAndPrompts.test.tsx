import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiAssistantDrawer } from "@/components/ai/AiAssistantDrawer";
import { ImageBedUploadDialog } from "@/components/images/ImageBedUploadDialog";
import { renderSitePromptTemplate } from "@/lib/ai/prompts";
import * as aiApi from "@/lib/tauri/aiApi";
import {
  DEFAULT_AI_SETTINGS,
  type AcpPermissionRequestEvent,
  type AiSettings,
  type AiStreamEvent,
  type SiteContextSnapshot,
  type SitePromptTemplate,
} from "@/types/ai";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const SAMPLE_SITE_CTX: SiteContextSnapshot = {
  engine: "hexo",
  siteTitle: "Zac Tech Blog",
  language: "zh-CN",
  permalink: ":year/:month/:day/:title/",
  postAssetFolder: true,
  theme: "next",
  markdownConfig: {
    breaks: false,
    mathEnabled: true,
    mermaidEnabled: true,
  },
  enabledThemeTags: ["blockquote", "codeblock", "asset_img", "note"],
  existingCategories: ["Engineering"],
  existingTags: ["Rust", "ACP"],
  activeDoc: {
    relativePath: "source/_posts/acp-deep-dive.md",
    localImages: ["diagram.png", "unused-chart.png"],
  },
};

const SAMPLE_SITE_PROMPTS: SitePromptTemplate[] = [
  {
    id: "seo-meta",
    title: "SEO 摘要模板",
    description: "按站点主题生成 SEO 摘要",
    scope: "frontmatter",
    body: "站点 {{site.title}} ({{site.theme}} / {{site.language}}) 文章《{{doc.title}}》路径 {{doc.filePath}} 图片：{{doc.localImages}}",
    filePath: "/blog/.hexoeditor/prompts/seo-meta.md",
  },
];

describe("Phase 4B: Site custom prompts, ACP permission approval, multi-turn sessions, registry, and unused-image AI hook", () => {
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

  it("renders site prompt templates with {{site.*}} and {{doc.*}} placeholders", () => {
    const rendered = renderSitePromptTemplate(
      "Engine={{site.engine}}, Title={{ site.title }}, Theme={{site.theme}}, Lang={{site.language}}, Doc={{doc.title}}, File={{doc.filePath}}, Images={{doc.localImages}}, Keep={{unknown.key}}",
      SAMPLE_SITE_CTX,
      { title: "ACP 架构实践", filePath: "/blog/source/_posts/acp-deep-dive.md" }
    );

    expect(rendered).toBe(
      "Engine=hexo, Title=Zac Tech Blog, Theme=next, Lang=zh-CN, Doc=ACP 架构实践, File=/blog/source/_posts/acp-deep-dive.md, Images=diagram.png, unused-chart.png, Keep={{unknown.key}}"
    );
  });

  it("loads site prompts, handles ACP permission approval card, keeps multi-turn session, and resets via 新会话", async () => {
    let streamListener: ((ev: AiStreamEvent) => void) | null = null;
    let permListener: ((ev: AcpPermissionRequestEvent) => void) | null = null;

    vi.spyOn(aiApi, "buildSiteAiContext").mockResolvedValue(SAMPLE_SITE_CTX);
    vi.spyOn(aiApi, "listSitePrompts").mockResolvedValue(SAMPLE_SITE_PROMPTS);
    vi.spyOn(aiApi, "listenAiStream").mockImplementation(async (fn) => {
      streamListener = fn;
      return () => {
        streamListener = null;
      };
    });
    vi.spyOn(aiApi, "listenAiPermissionRequest").mockImplementation(async (fn) => {
      permListener = fn;
      return () => {
        permListener = null;
      };
    });
    const runSpy = vi.spyOn(aiApi, "aiRunPrompt").mockImplementation(async (req) => {
      return req.requestId ?? "req-1";
    });
    const respondPermSpy = vi
      .spyOn(aiApi, "aiRespondPermission")
      .mockResolvedValue(true);
    const resetSessionSpy = vi
      .spyOn(aiApi, "aiResetSession")
      .mockResolvedValue(true);

    await act(async () => {
      root.render(
        <AiAssistantDrawer
          open
          onOpenChange={() => {}}
          locale="zh-CN"
          aiSettings={DEFAULT_AI_SETTINGS}
          onAiSettingsChange={() => {}}
          discoveredAgents={[]}
          activeSiteRoot="/blog"
          activeDocPath="/blog/source/_posts/acp-deep-dive.md"
          documentContent={"---\ntitle: ACP 实战\n---\n\n正文内容"}
          selectionText=""
          hasSelection={false}
          terminalLogs={[]}
          onOpenAiSettings={() => {}}
          onApplyTextToEditor={() => {}}
          onApplyFrontMatter={() => {}}
        />
      );
    });

    // Site prompt chip rendered
    const sitePromptBtn = container.querySelector<HTMLButtonElement>(
      '[data-site-prompt-id="seo-meta"]'
    )!;
    expect(sitePromptBtn).not.toBeNull();
    expect(sitePromptBtn.textContent).toContain("SEO 摘要模板");

    await act(async () => {
      sitePromptBtn.click();
    });

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy.mock.calls[0][0]).toMatchObject({
      sessionKey: "site:/blog",
      keepSession: true,
    });
    expect(runSpy.mock.calls[0][0].prompt).toContain("Zac Tech Blog");
    expect(runSpy.mock.calls[0][0].prompt).toContain("ACP 实战");
    expect(runSpy.mock.calls[0][0].prompt).toContain("diagram.png, unused-chart.png");

    const reqId1 = await runSpy.mock.results[0].value;

    // Emit ACP permission request and approve it
    await act(async () => {
      permListener?.({
        permissionId: "perm-101",
        requestId: reqId1,
        toolTitle: "read_site_config",
        kind: "read",
        options: [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
          { optionId: "reject-once", name: "Deny", kind: "reject_once" },
        ],
      });
    });

    const permCard = container.querySelector('[data-testid="acp-permission-card"]');
    expect(permCard).not.toBeNull();
    expect(permCard!.textContent).toContain("read_site_config");

    const allowBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="acp-permission-allow"]'
    )!;
    await act(async () => {
      allowBtn.click();
    });
    expect(respondPermSpy).toHaveBeenCalledWith("perm-101", "allow-once", false);
    expect(container.querySelector('[data-testid="acp-permission-card"]')).toBeNull();

    // Finish turn 1 stream
    await act(async () => {
      streamListener?.({
        requestId: reqId1,
        kind: "delta",
        text: "Turn 1 response",
        done: false,
      });
      streamListener?.({
        requestId: reqId1,
        kind: "done",
        text: "",
        done: true,
      });
    });
    expect(
      container.querySelector('[data-testid="ai-output-text"]')?.textContent
    ).toBe("Turn 1 response");

    // Trigger turn 2 via 未引用图片建议 pill
    const unusedImgBtn = container.querySelector<HTMLButtonElement>(
      '[data-ai-action="image_caption"]'
    )!;
    expect(unusedImgBtn.textContent).toContain("未引用图片建议");
    await act(async () => {
      unusedImgBtn.click();
    });

    expect(runSpy).toHaveBeenCalledTimes(2);
    expect(runSpy.mock.calls[1][0].sessionKey).toBe("site:/blog");
    expect(runSpy.mock.calls[1][0].keepSession).toBe(true);
    expect(
      container.querySelector('[data-testid="ai-conversation-turns"]')?.textContent
    ).toContain("Turn 1 response");

    const reqId2 = await runSpy.mock.results[1].value;
    await act(async () => {
      streamListener?.({
        requestId: reqId2,
        kind: "delta",
        text: "Turn 2 image suggestions",
        done: false,
      });
      streamListener?.({
        requestId: reqId2,
        kind: "done",
        text: "",
        done: true,
      });
    });

    // Reset via 新会话
    const newSessionBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="ai-new-session-btn"]'
    )!;
    await act(async () => {
      newSessionBtn.click();
    });
    expect(resetSessionSpy).toHaveBeenCalledWith("site:/blog");
    expect(container.querySelector('[data-testid="ai-output-text"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="ai-conversation-turns"]')
    ).toBeNull();
  });

  it("supports ACP Registry popover apply and pendingAction image_caption", async () => {
    vi.spyOn(aiApi, "buildSiteAiContext").mockResolvedValue(SAMPLE_SITE_CTX);
    vi.spyOn(aiApi, "listSitePrompts").mockResolvedValue([]);
    vi.spyOn(aiApi, "listenAiStream").mockResolvedValue(() => {});
    vi.spyOn(aiApi, "listenAiPermissionRequest").mockResolvedValue(() => {});
    vi.spyOn(aiApi, "fetchAcpRegistry").mockResolvedValue({
      source: "builtin",
      fetchedAt: null,
      agents: aiApi.BUILTIN_ACP_REGISTRY_AGENTS,
      message: null,
    });
    const runSpy = vi.spyOn(aiApi, "aiRunPrompt").mockResolvedValue("req-img-1");

    function DrawerHarness() {
      const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
      return (
        <AiAssistantDrawer
          open
          onOpenChange={() => {}}
          locale="zh-CN"
          aiSettings={settings}
          onAiSettingsChange={(patch) =>
            setSettings((prev) => ({ ...prev, ...patch }))
          }
          discoveredAgents={[]}
          activeSiteRoot="/blog"
          activeDocPath="/blog/source/_posts/acp-deep-dive.md"
          documentContent={"---\ntitle: Demo\n---\n\nBody"}
          selectionText=""
          hasSelection={false}
          terminalLogs={[]}
          pendingAction={{ action: "image_caption", nonce: 99 }}
          onOpenAiSettings={() => {}}
          onApplyTextToEditor={() => {}}
          onApplyFrontMatter={() => {}}
        />
      );
    }

    await act(async () => {
      root.render(<DrawerHarness />);
    });

    // pendingAction image_caption fired automatically
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy.mock.calls[0][0].prompt).toContain("unused-chart.png");

    // Open ACP registry popover and apply Claude Code ACP
    const regToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="ai-registry-toggle"]'
    )!;
    await act(async () => {
      regToggle.click();
    });

    const popover = container.querySelector('[data-testid="acp-registry-popover"]');
    expect(popover).not.toBeNull();
    const claudeCard = popover!.querySelector('[data-registry-agent="claude-code-acp"]')!;
    const addBtn = claudeCard.querySelector("button")!;
    await act(async () => {
      addBtn.click();
    });

    const select = container.querySelector<HTMLSelectElement>(
      '[data-testid="ai-provider-select"]'
    )!;
    expect(select.value).toBe("profile:registry-claude-code-acp");
  });

  it("renders AI 建议插入与配文 button in ImageBedUploadDialog cleanup tab and invokes onAiSuggestImages", async () => {
    const onAiSuggestImages = vi.fn();

    await act(async () => {
      root.render(
        <ImageBedUploadDialog
          open
          onOpenChange={() => {}}
          initialTab="cleanup"
          locale="zh-CN"
          localImages={[]}
          imageBedConfig={{ provider: "none", configured: false }}
          onBatchUpload={() => {}}
          unusedImages={[
            {
              absolutePath: "/blog/source/_posts/demo/unused-chart.png",
              fileName: "unused-chart.png",
              sizeBytes: 2048,
            },
          ]}
          onAiSuggestImages={onAiSuggestImages}
        />
      );
    });

    const aiBtn = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="ai-suggest-unused-images-btn"]'
    )!;
    expect(aiBtn).not.toBeNull();
    expect(aiBtn.textContent).toContain("AI 建议插入与配文");

    await act(async () => {
      aiBtn.click();
    });
    expect(onAiSuggestImages).toHaveBeenCalledTimes(1);
  });
});
