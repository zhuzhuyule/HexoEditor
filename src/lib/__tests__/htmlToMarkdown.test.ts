import { describe, expect, it } from "vitest";

import {
  convertHtmlToMarkdown,
  shouldConvertHtmlPaste,
} from "@/lib/markdown/htmlToMarkdown";

describe("htmlToMarkdown paste handling", () => {
  it("converts web HTML with headings, links, bold, and tables to GFM Markdown", () => {
    const html = `
      <h2>Architecture</h2>
      <p>Built with <strong>Tauri v2</strong> and <a href="https://hexo.io">Hexo</a>.</p>
      <table>
        <thead><tr><th>Layer</th><th>Tech</th></tr></thead>
        <tbody><tr><td>UI</td><td>React 19</td></tr></tbody>
      </table>
    `;
    expect(shouldConvertHtmlPaste(html, "Architecture Built with Tauri v2")).toBe(true);
    const md = convertHtmlToMarkdown(html);
    expect(md).toContain("## Architecture");
    expect(md).toContain("**Tauri v2**");
    expect(md).toContain("[Hexo](https://hexo.io)");
    expect(md).toContain("| Layer | Tech |");
  });

  it("does not convert IDE editor HTML or text that is already Markdown", () => {
    const vscodeHtml = `<div data-vscode-context="true"><p>const a = 1;</p></div>`;
    expect(shouldConvertHtmlPaste(vscodeHtml, "const a = 1;")).toBe(false);

    const rawMdPlain = "## Already Heading\n\n![img](a.png)";
    expect(shouldConvertHtmlPaste("<p>## Already Heading</p>", rawMdPlain)).toBe(false);

    expect(shouldConvertHtmlPaste("<span>plain</span>", "plain")).toBe(false);
  });
});
