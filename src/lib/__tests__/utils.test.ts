import { describe, expect, it } from "vitest";

import {
  computeDocumentStats,
  formatMarkdownImageSnippet,
  formatShortDate,
  getFileStem,
  isPathInsideDir,
  sanitizeSlugClient,
} from "@/lib/utils";

describe("document statistics & path helpers", () => {
  it("computes CJK + Latin word count while stripping front-matter", () => {
    const doc = [
      "---",
      "title: Ignored Header Words",
      "---",
      "",
      "你好世界 Hello HexoEditor V2",
    ].join("\n");

    const stats = computeDocumentStats(doc);
    expect(stats.cjkCount).toBe(4);
    expect(stats.latinWordCount).toBe(3);
    expect(stats.totalWords).toBe(7);
    expect(stats.readingMinutes).toBe(1);
  });

  it("handles empty document stats gracefully", () => {
    const stats = computeDocumentStats("");
    expect(stats.totalWords).toBe(0);
    expect(stats.readingMinutes).toBe(0);
  });

  it("sanitizes slugs and extracts file stems cleanly", () => {
    expect(sanitizeSlugClient("  Rust / Tauri: V2?  ")).toBe("Rust---Tauri--V2");
    expect(getFileStem("/Users/blog/source/_posts/my-note.md")).toBe("my-note");
    expect(formatShortDate("2026-11-25 20:00:00")).toBe("2026-11-25");
  });

  it("checks directory containment on path boundaries and formats space-safe image links", () => {
    expect(isPathInsideDir("/Users/zac/blog/source/_posts/a.md", "/Users/zac/blog")).toBe(true);
    expect(isPathInsideDir("/Users/zac/blog-2/source/_posts/a.md", "/Users/zac/blog")).toBe(false);
    expect(isPathInsideDir("/Users/zac/blog/a.md", "/Users/zac/blog/")).toBe(true);

    expect(formatMarkdownImageSnippet("my-post/fig.png")).toBe("![fig](my-post/fig.png)");
    expect(formatMarkdownImageSnippet("My Post/fig 1.png")).toBe("![fig 1](<My Post/fig 1.png>)");
  });
});
