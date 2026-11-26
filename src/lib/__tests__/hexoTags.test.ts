import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildPostPreviewUrl,
  LiveSitePreview,
  normalizeLivePreviewUrl,
} from "@/components/preview/LiveSitePreview";
import {
  MarkdownPreview,
  scopePreviewThemeCss,
  type MarkdownPreviewHandle,
} from "@/components/preview/MarkdownPreview";
import {
  extractHexoTagImageSrcs,
  preprocessHexoTags,
} from "@/lib/markdown/hexoTags";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("preprocessHexoTags", () => {
  it("skips fenced code blocks (``` and ~~~) and inline code spans", () => {
    const md = [
      "Inline example: `{% note warning %}ignored{% endnote %}` and ``{% link A https://a.com %}``.",
      "",
      "```markdown",
      "{% note danger %}",
      "Should not be transformed",
      "{% endnote %}",
      "{% asset_img inside-fence.png %}",
      "```",
      "",
      "~~~yaml",
      "{% youtube dQw4w9WgXcQ %}",
      "~~~",
      "",
      "{% note info %}",
      "Active note",
      "{% endnote %}",
    ].join("\n");

    const out = preprocessHexoTags(md);
    expect(out).toContain("`{% note warning %}ignored{% endnote %}`");
    expect(out).toContain("``{% link A https://a.com %}``");
    expect(out).toContain("```markdown\n{% note danger %}\nShould not be transformed\n{% endnote %}\n{% asset_img inside-fence.png %}\n```");
    expect(out).toContain("~~~yaml\n{% youtube dQw4w9WgXcQ %}\n~~~");
    expect(out).toContain('<div class="hexo-note hexo-note-info">');
    expect(out).toContain("Active note");
  });

  it("preserves {% raw %}...{% endraw %} content without expanding inner Hexo tags", () => {
    const md = [
      "Before {% raw %}{% note warning %}literal{% endnote %}{% endraw %} after.",
      "",
      "{% raw %}",
      "{% youtube dQw4w9WgXcQ %}",
      "{% endraw %}",
    ].join("\n");

    const out = preprocessHexoTags(md);
    expect(out).toContain("{% note warning %}literal{% endnote %}");
    expect(out).toContain("{% youtube dQw4w9WgXcQ %}");
    expect(out).not.toContain("hexo-note-warning");
    expect(out).not.toContain("hexo-youtube-card");
  });

  it("transforms {% codeblock %} with title, lang, link, and plain fenced fallback", () => {
    const withHeader = [
      "{% codeblock Array.map lang:ts https://mdn.io MDN Docs %}",
      "const res = [1, 2].map((x) => x * 2);",
      "{% endcodeblock %}",
    ].join("\n");

    const outHeader = preprocessHexoTags(withHeader);
    expect(outHeader).toContain('<figure class="hexo-codeblock">');
    expect(outHeader).toContain('<span class="hexo-codeblock-title">Array.map</span>');
    expect(outHeader).toContain('href="https://mdn.io"');
    expect(outHeader).toContain(">MDN Docs</a>");
    expect(outHeader).toContain("```ts\nconst res = [1, 2].map((x) => x * 2);\n```");

    const plain = [
      "{% codeblock lang:bash %}",
      "{% note info %}not expanded{% endnote %}",
      "{% endcodeblock %}",
    ].join("\n");
    const outPlain = preprocessHexoTags(plain);
    expect(outPlain).toContain("```bash\n{% note info %}not expanded{% endnote %}\n```");
    expect(outPlain).not.toContain("hexo-note-info");
  });

  it("handles nested backtick fences inside {% codeblock %} by extending fence length", () => {
    const md = [
      "{% codeblock Markdown Sample lang:markdown %}",
      "```js",
      "console.log(1);",
      "```",
      "{% endcodeblock %}",
    ].join("\n");

    const out = preprocessHexoTags(md);
    expect(out).toContain("````markdown\n```js\nconsole.log(1);\n```\n````");
  });

  it("transforms {% blockquote %} and {% pullquote %}", () => {
    const md = [
      "{% blockquote David Levithan, Wide Awake %}",
      "Do not just seek happiness for yourself.",
      "{% endblockquote %}",
      "",
      "{% blockquote Seth Godin https://example.com/post Welcome %}",
      "Ship it.",
      "{% endblockquote %}",
      "",
      "{% pullquote left custom-cls bad$class %}",
      "Pull quote body",
      "{% endpullquote %}",
    ].join("\n");

    const out = preprocessHexoTags(md);
    expect(out).toContain('<blockquote class="hexo-blockquote">');
    expect(out).toContain("<strong>David Levithan</strong><cite>Wide Awake</cite>");
    expect(out).toContain(
      '<strong>Seth Godin</strong><cite><a href="https://example.com/post" target="_blank" rel="noopener noreferrer">Welcome</a></cite>'
    );
    expect(out).toContain('<blockquote class="pullquote hexo-pullquote left custom-cls">');
    expect(out).not.toContain("bad$class");
  });

  it("transforms {% note %} for all 6 styles and no-icon modifier", () => {
    const styles = ["default", "primary", "success", "info", "warning", "danger"] as const;
    for (const style of styles) {
      const out = preprocessHexoTags(`{% note ${style} no-icon %}\nBody ${style}\n{% endnote %}`);
      expect(out).toContain(`<div class="hexo-note hexo-note-${style} no-icon">`);
      expect(out).toContain(`Body ${style}`);
    }
    const bare = preprocessHexoTags("{% note %}\nPlain\n{% endnote %}");
    expect(bare).toContain('<div class="hexo-note hexo-note-default">');
  });

  it("transforms {% tabs %} with active index, icon syntax, and semantic data attributes", () => {
    const md = [
      "{% tabs demo_tabs, 2 %}",
      "<!-- tab First Tab@code -->",
      "Panel **One**",
      "<!-- endtab -->",
      "<!-- tab Second Tab -->",
      "Panel **Two**",
      "<!-- endtab -->",
      "{% endtabs %}",
    ].join("\n");

    const out = preprocessHexoTags(md);
    expect(out).toContain('data-hexo-tabs="demo_tabs"');
    expect(out).toContain('data-tab-index="0">First Tab</button>');
    expect(out).toContain('class="hexo-tab-btn is-active active" role="tab" aria-selected="true" data-tab-index="1">Second Tab</button>');
    expect(out).toContain('data-tab-panel="0" hidden>');
    expect(out).toContain('class="hexo-tab-panel is-active active" role="tabpanel" data-tab-panel="1">');
  });

  it("transforms {% asset_img %}, {% img %}, {% link %}, {% iframe %}, and {% youtube %}", () => {
    const md = [
      "{% asset_img 封面 图.png 我的封面 %}",
      "{% asset_img demo.png Sample Title %}",
      '{% img left /images/pic.jpg 320 200 "Caption" "Alt Text" %}',
      '{% link Hexo Docs https://hexo.io true "Official" %}',
      "{% link Bad javascript:alert(1) %}",
      "{% iframe https://example.com/embed 800 450 %}",
      "{% iframe javascript:alert(1) %}",
      "{% youtube dQw4w9WgXcQ %}",
      "{% youtube https://youtu.be/abcDEF_1234 %}",
    ].join("\n");

    const out = preprocessHexoTags(md);
    expect(out).toContain('![Sample Title](<demo.png> "Sample Title")');
    expect(out).toContain('<img src="/images/pic.jpg" class="left" width="320" height="200" alt="Alt Text" title="Caption" />');
    expect(out).toContain('<a class="hexo-link" href="https://hexo.io" target="_blank" rel="noopener noreferrer" title="Official">Hexo Docs</a>');
    expect(out).not.toContain('href="javascript:alert(1)"');
    expect(out).toContain('<iframe src="https://example.com/embed" width="800" height="450" frameborder="0" loading="lazy" sandbox="allow-scripts allow-popups allow-presentation" allowfullscreen></iframe>');
    expect(out).not.toContain("allow-same-origin");
    expect(out).toContain("hexo-iframe-blocked");
    expect(out).toContain('data-youtube-id="dQw4w9WgXcQ"');
    expect(out).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(out).toContain('data-youtube-id="abcDEF_1234"');
  });

  it("extracts local image srcs from {% asset_img %} and {% img %} while skipping code and raw blocks", () => {
    const md = [
      "{% asset_img chart.png Chart %}",
      "{% asset_img 中文/图片.png 说明 %}",
      "{% img center /images/local.webp 400 %}",
      "{% img https://cdn.example.com/remote.png %}",
      "`{% asset_img inline-ignored.png %}`",
      "```md",
      "{% asset_img fenced-ignored.png %}",
      "```",
      "{% raw %}{% asset_img raw-ignored.png %}{% endraw %}",
    ].join("\n");

    const srcs = extractHexoTagImageSrcs(md);
    expect(srcs).toEqual(["chart.png", "中文/图片.png", "/images/local.webp"]);
  });
});

describe("scopePreviewThemeCss", () => {
  it("scopes element, root/body, and @media rules while stripping dangerous directives", () => {
    const rawCss = `
      @import url("https://evil.example/x.css");
      body { font-family: Georgia, serif; color: #222; }
      html.dark p { color: #eee; }
      h1, h2 { letter-spacing: 0.02em; }
      @media (max-width: 768px) {
        p { font-size: 14px; }
      }
      @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
      .bad { width: expression(alert(1)); background: url(javascript:alert(2)); }
      .bad2 { background: url ( "vbscript:msgbox(1)" ); list-style-image: url(data:text/html,<script>alert(4)</script>); }
      </ style><script>alert(3)</script>
    `;

    const scoped = scopePreviewThemeCss(rawCss);
    expect(scoped).not.toContain("@import");
    expect(scoped).not.toContain("</style");
    expect(scoped).not.toContain("</ style");
    expect(scoped).not.toContain("expression(");
    expect(scoped).not.toContain("javascript:");
    expect(scoped).not.toContain("vbscript:");
    expect(scoped).not.toContain("data:text/html");
    expect(scoped).toContain(".markdown-preview-scoped { font-family: Georgia, serif; color: #222; }");
    expect(scoped).toContain(".markdown-preview-scoped p { color: #eee; }");
    expect(scoped).toContain(".markdown-preview-scoped h1, .markdown-preview-scoped h2 { letter-spacing: 0.02em; }");
    expect(scoped).toContain("@media (max-width: 768px) {\n.markdown-preview-scoped p { font-size: 14px; }\n}");
    expect(scoped).toContain("@keyframes fade");
  });
});

describe("MarkdownPreview interactions and LiveSitePreview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("switches {% tabs %} panels on click, injects scoped themeCss, and supports scrollToHeadingId", async () => {
    const previewRef = createRef<MarkdownPreviewHandle>();
    const content = [
      "---",
      "title: Tab Test",
      "---",
      "",
      "## First Section",
      "",
      "{% tabs demo, 1 %}",
      "<!-- tab Alpha -->",
      "Alpha content",
      "<!-- endtab -->",
      "<!-- tab Beta -->",
      "Beta content",
      "<!-- endtab -->",
      "{% endtabs %}",
    ].join("\n");

    await act(async () => {
      root.render(
        React.createElement(MarkdownPreview, {
          ref: previewRef,
          content,
          docPath: null,
          siteRoot: null,
          sourceDir: null,
          themeCss: "body { line-height: 2; } h2 { color: navy; }",
        })
      );
    });

    const styleEl = container.querySelector('style[data-hexo-theme-css="true"]');
    expect(styleEl?.textContent).toContain(".markdown-preview-scoped h2 { color: navy; }");

    const tabBtns = container.querySelectorAll<HTMLButtonElement>("[data-tab-index]");
    const tabPanels = container.querySelectorAll<HTMLElement>("[data-tab-panel]");
    expect(tabBtns.length).toBe(2);
    expect(tabPanels[0].hasAttribute("hidden")).toBe(false);
    expect(tabPanels[1].hasAttribute("hidden")).toBe(true);

    await act(async () => {
      tabBtns[1].click();
    });

    expect(tabBtns[0].getAttribute("aria-selected")).toBe("false");
    expect(tabBtns[1].getAttribute("aria-selected")).toBe("true");
    expect(tabPanels[0].hasAttribute("hidden")).toBe(true);
    expect(tabPanels[1].hasAttribute("hidden")).toBe(false);

    // Ensure scrollToHeadingId is exposed and callable without throwing
    expect(typeof previewRef.current?.scrollToHeadingId).toBe("function");
    expect(() => previewRef.current?.scrollToHeadingId("first-section")).not.toThrow();
  });

  it("renders LiveSitePreview idle onboarding and active iframe controls", async () => {
    expect(normalizeLivePreviewUrl("/archives/", "http://localhost:4000")).toBe(
      "http://localhost:4000/archives/"
    );
    expect(normalizeLivePreviewUrl("javascript:alert(1)", "http://localhost:4000")).toBeNull();
    expect(buildPostPreviewUrl("http://localhost:4000", "2026/我的文章")).toBe(
      "http://localhost:4000/2026/%E6%88%91%E7%9A%84%E6%96%87%E7%AB%A0/"
    );
    expect(buildPostPreviewUrl("http://localhost:4000/blog/", "2026/我的文章")).toBe(
      "http://localhost:4000/blog/2026/%E6%88%91%E7%9A%84%E6%96%87%E7%AB%A0/"
    );
    expect(buildPostPreviewUrl("http://localhost:4000/blog", "hello-hexo")).toBe(
      "http://localhost:4000/blog/hello-hexo/"
    );

    const onStartServer = vi.fn();
    await act(async () => {
      root.render(
        React.createElement(LiveSitePreview, {
          serverUrl: null,
          serverRunning: false,
          onStartServer,
          locale: "zh-CN",
        })
      );
    });

    const startBtn = container.querySelector("button");
    expect(startBtn?.textContent).toContain("启动本地预览服务");
    await act(async () => {
      startBtn?.click();
    });
    expect(onStartServer).toHaveBeenCalledTimes(1);

    const onOpenExternal = vi.fn();
    await act(async () => {
      root.render(
        React.createElement(LiveSitePreview, {
          serverUrl: "http://localhost:4000",
          serverRunning: true,
          currentPostSlug: "hello-hexo",
          onOpenExternal,
          locale: "en-US",
        })
      );
    });

    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("http://localhost:4000/");

    const jumpPostBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Jump to current post"]'
    );
    await act(async () => {
      jumpPostBtn?.click();
    });
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(
      "http://localhost:4000/hello-hexo/"
    );

    const openExtBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open in Browser"]'
    );
    await act(async () => {
      openExtBtn?.click();
    });
    expect(onOpenExternal).toHaveBeenCalledWith("http://localhost:4000/hello-hexo/");
  });
});
