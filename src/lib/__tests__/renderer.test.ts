import { describe, expect, it } from "vitest";

import {
  extractLocalImageSrcs,
  renderMarkdownToHtml,
} from "@/lib/markdown/renderer";

describe("markdown renderer (KaTeX, hljs, Mermaid, local images, DOMPurify)", () => {
  it("renders headings with bodyStartLine offset, KaTeX math, and task lists", () => {
    const body = [
      "# Title",
      "",
      "Inline math $E = mc^2$ and price $5 to $10.",
      "",
      "$$",
      "a^2 + b^2 = c^2",
      "$$",
      "",
      "- [x] Done",
      "- [ ] Todo",
    ].join("\n");

    const html = renderMarkdownToHtml(body, { bodyStartLine: 6 });
    expect(html).toContain('data-source-line="6"');
    expect(html).toContain("katex");
    // Currency $5 to $10 should remain plain text (not converted to math error)
    expect(html).toContain("$5 to $10");
    expect(html).toContain('class="task-list-checkbox"');
    expect(html).toContain("checked");
  });

  it("renders mermaid placeholder and highlight.js code blocks", () => {
    const body = [
      "```mermaid",
      "graph TD;",
      "  A-->B;",
      "```",
      "",
      "```ts",
      "const x: number = 42;",
      "```",
    ].join("\n");

    const html = renderMarkdownToHtml(body);
    expect(html).toContain('class="mermaid-block"');
    expect(html).toContain("data-mermaid-source=");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("language-ts");
  });

  it("extracts local image srcs and rewrites resolved local asset URLs", () => {
    const body = [
      "![local1](my-post/fig1.png)",
      "![remote](https://example.com/a.png)",
      '<img src="/images/my-post/fig2.jpg" alt="fig2" />',
      "![data](data:image/png;base64,AAA)",
    ].join("\n");

    const srcs = extractLocalImageSrcs(body);
    expect(srcs).toEqual(["my-post/fig1.png", "/images/my-post/fig2.jpg"]);

    const html = renderMarkdownToHtml(body, {
      imageMap: {
        "my-post/fig1.png": {
          assetUrl: "http://asset.localhost/tmp/my-post/fig1.png",
          absolutePath: "/tmp/my-post/fig1.png",
        },
        "/images/my-post/fig2.jpg": {
          assetUrl: "http://asset.localhost/tmp/images/my-post/fig2.jpg",
          absolutePath: "/tmp/images/my-post/fig2.jpg",
        },
      },
    });

    expect(html).toContain('src="http://asset.localhost/tmp/my-post/fig1.png"');
    expect(html).toContain('data-local-image="true"');
    expect(html).toContain('data-local-abs-path="/tmp/my-post/fig1.png"');
    expect(html).toContain('data-local-abs-path="/tmp/images/my-post/fig2.jpg"');
  });

  it("resolves Chinese and space-containing local image paths after markdown-it URI encoding", () => {
    const body = [
      "![中文图](我的文章/测试图.png)",
      "![空格图](<my post/hello world.png>)",
      '<img src="我的文章/测试图.png" alt="html-cjk" />',
    ].join("\n");

    const srcs = extractLocalImageSrcs(body);
    expect(srcs).toEqual(["我的文章/测试图.png", "my post/hello world.png"]);

    const html = renderMarkdownToHtml(body, {
      imageMap: {
        "我的文章/测试图.png": {
          assetUrl: "asset://localhost/%2Ftmp%2F%E6%88%91%E7%9A%84%E6%96%87%E7%AB%A0%2F%E6%B5%8B%E8%AF%95%E5%9B%BE.png",
          absolutePath: "/tmp/我的文章/测试图.png",
        },
        "my post/hello world.png": {
          assetUrl: "asset://localhost/%2Ftmp%2Fmy%20post%2Fhello%20world.png",
          absolutePath: "/tmp/my post/hello world.png",
        },
      },
    });

    expect(html).not.toContain("local-image-missing");
    expect(html).toContain('data-local-abs-path="/tmp/我的文章/测试图.png"');
    expect(html).toContain('data-local-abs-path="/tmp/my post/hello world.png"');
  });

  it("renders KaTeX cleanly without leaked MathML raw annotation text", () => {
    const html = renderMarkdownToHtml("$$\\frac{a^2 + b^2}{c^2}$$");
    expect(html).toContain('class="katex-display"');
    expect(html).not.toContain("\\frac{a^2");
  });

  it("sanitizes dangerous XSS scripts and event handlers via DOMPurify", () => {
    const xss = '<script>alert(1)</script><img src="x" onerror="alert(2)" /><a href="javascript:alert(3)">bad</a>';
    const html = renderMarkdownToHtml(xss);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });

  it("highlights common languages via highlight.js/lib/common and escapes unknown languages safely", () => {
    const body = [
      "```rust",
      "fn main() { println!(\"hi\"); }",
      "```",
      "",
      "```python",
      "def greet(name: str) -> str:",
      "    return name",
      "```",
      "",
      "```unknownlang",
      "const a = 1 < 2 && 3 > 1;",
      "```",
    ].join("\n");

    const html = renderMarkdownToHtml(body);
    expect(html).toContain("language-rust");
    expect(html).toContain("language-python");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("language-unknownlang");
    expect(html).toContain("1 &lt; 2 &amp;&amp; 3 &gt; 1;");
  });

  it("renders Hexo tags end-to-end and preserves DOMPurify-whitelisted attributes safely", () => {
    const body = [
      "# Hexo 标签演示",
      "",
      "{% note warning %}",
      "请勿在生产环境开启 **debug** 模式。",
      "{% endnote %}",
      "",
      "{% tabs lang_demo, 2 %}",
      "<!-- tab JS -->",
      "`console.log(1)`",
      "<!-- endtab -->",
      "<!-- tab Rust -->",
      "`println!(\"hi\")`",
      "<!-- endtab -->",
      "{% endtabs %}",
      "",
      "{% blockquote Lu Xun, Call to Arms %}",
      "Hope is like a road in the country.",
      "{% endblockquote %}",
      "",
      "{% iframe https://example.com/widget 640 360 %}",
      '<iframe src="javascript:alert(1)"></iframe>',
      '<iframe src="https://example.com/ok" srcdoc="<script>alert(2)</script>"></iframe>',
    ].join("\n");

    const html = renderMarkdownToHtml(body, { bodyStartLine: 4 });
    expect(html).toContain('<h1 id="hexo-标签演示" data-source-line="4">Hexo 标签演示</h1>');
    expect(html).toContain('class="hexo-note hexo-note-warning"');
    expect(html).toContain("<strong>debug</strong>");
    expect(html).toContain('data-hexo-tabs="lang_demo"');
    expect(html).toContain('data-tab-index="0"');
    expect(html).toContain('data-tab-panel="1"');
    expect(html).toContain('<blockquote class="hexo-blockquote">');
    expect(html).toContain("<strong>Lu Xun</strong><cite>Call to Arms</cite>");
    expect(html).toContain('src="https://example.com/widget"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"');
    expect(html).not.toContain("javascript:alert");
    expect(html).not.toContain("srcdoc");
  });

  it("extracts and resolves local images from Hexo {% asset_img %} and {% img %} tags", () => {
    const body = [
      "{% asset_img 架构图.png 系统架构 %}",
      "{% img center my-post/banner.png 600 300 标题 %}",
      "{% img https://cdn.example.com/remote.jpg %}",
    ].join("\n");

    const srcs = extractLocalImageSrcs(body);
    expect(srcs).toEqual(["架构图.png", "my-post/banner.png"]);

    const html = renderMarkdownToHtml(body, {
      imageMap: {
        "架构图.png": {
          assetUrl: "asset://localhost/%2Ftmp%2F%E6%9E%B6%E6%9E%84%E5%9B%BE.png",
          absolutePath: "/tmp/架构图.png",
        },
        "my-post/banner.png": {
          assetUrl: "asset://localhost/%2Ftmp%2Fmy-post%2Fbanner.png",
          absolutePath: "/tmp/my-post/banner.png",
        },
      },
    });

    expect(html).not.toContain("local-image-missing");
    expect(html).toContain('data-local-image="true"');
    expect(html).toContain('data-local-abs-path="/tmp/架构图.png"');
    expect(html).toContain('data-local-abs-path="/tmp/my-post/banner.png"');
    expect(html).toContain('width="600"');
    expect(html).toContain('height="300"');
  });

  it("allows disabling Hexo tag preprocessing via enableHexoTags: false", () => {
    const body = "{% note info %}\nHello\n{% endnote %}";
    const html = renderMarkdownToHtml(body, { enableHexoTags: false });
    expect(html).toContain("{% note info %}");
    expect(html).not.toContain("hexo-note-info");
  });
});
