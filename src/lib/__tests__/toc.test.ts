import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@/lib/frontmatter";
import { renderMarkdownToHtml } from "@/lib/markdown/renderer";
import { extractMarkdownToc, slugifyHeading } from "@/lib/markdown/toc";

describe("extractMarkdownToc", () => {
  it("subtracts YAML front-matter lines and skips headings inside code/raw blocks", () => {
    const raw = [
      "---",
      "title: 测试文章",
      "date: 2026-11-25 10:00:00",
      "tags:",
      "  - hexo",
      "---",
      "",
      "# 一级标题",
      "",
      "```python",
      "# Python 注释不是标题",
      "## 依然不是标题",
      "```",
      "",
      "~~~bash",
      "# Shell 注释也不是标题",
      "~~~",
      "",
      "{% codeblock lang:ruby %}",
      "# Ruby comment",
      "{% endcodeblock %}",
      "",
      "{% raw %}",
      "# Raw block heading ignored",
      "{% endraw %}",
      "",
      "## 二级 **加粗** 与 `code` 标题",
      "### [链接标题](https://hexo.io) ###",
      "#### 四级标题",
      "##### 五级标题",
      "###### 六级标题",
    ].join("\n");

    const toc = extractMarkdownToc(raw);
    expect(toc).toEqual([
      { id: "一级标题", level: 1, text: "一级标题", line: 8 },
      { id: "二级-加粗-与-code-标题", level: 2, text: "二级 加粗 与 code 标题", line: 27 },
      { id: "链接标题", level: 3, text: "链接标题", line: 28 },
      { id: "四级标题", level: 4, text: "四级标题", line: 29 },
      { id: "五级标题", level: 5, text: "五级标题", line: 30 },
      { id: "六级标题", level: 6, text: "六级标题", line: 31 },
    ]);
  });

  it("handles documents without front-matter, CRLF line endings, and duplicate headings", () => {
    const raw = [
      "# Overview",
      "",
      "---",
      "",
      "## Overview",
      "### Overview",
      "## ???",
    ].join("\r\n");

    const toc = extractMarkdownToc(raw);
    expect(toc).toEqual([
      { id: "overview", level: 1, text: "Overview", line: 1 },
      { id: "overview-1", level: 2, text: "Overview", line: 5 },
      { id: "overview-2", level: 3, text: "Overview", line: 6 },
      { id: "section", level: 2, text: "???", line: 7 },
    ]);
    expect(slugifyHeading("Quick Start 2.0")).toBe("quick-start-20");
  });

  it("matches rendered HTML heading ids and data-source-line even after multi-line Hexo tags", () => {
    const raw = [
      "---",
      "title: Sync Parity",
      "---",
      "",
      "# 引言",
      "",
      "{% note info %}",
      "注意：这是一段提示内容。",
      "{% endnote %}",
      "",
      "{% tabs install, 1 %}",
      "<!-- tab npm -->",
      "npm install",
      "<!-- endtab -->",
      "<!-- tab pnpm -->",
      "pnpm install",
      "<!-- endtab -->",
      "{% endtabs %}",
      "",
      "## 安装步骤",
      "",
      "## 安装步骤",
    ].join("\n");

    const toc = extractMarkdownToc(raw);
    const parsed = parseMarkdownDocument(raw);
    const html = renderMarkdownToHtml(parsed.body, {
      bodyStartLine: parsed.bodyStartLine,
    });

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const renderedHeadings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6")).map(
      (el) => ({
        id: el.getAttribute("id"),
        level: Number(el.tagName.slice(1)),
        line: Number(el.getAttribute("data-source-line")),
      })
    );

    expect(renderedHeadings).toEqual(
      toc.map((item) => ({
        id: item.id,
        level: item.level,
        line: item.line,
      }))
    );
  });
});
