import { describe, expect, it } from "vitest";

import {
  parseMarkdownDocument,
  serializeMarkdownDocument,
  updateFrontMatterInMarkdown,
} from "@/lib/frontmatter";

describe("frontmatter bidirectional parsing & serialization", () => {
  it("parses standard Hexo front-matter and computes bodyStartLine", () => {
    const raw = [
      "---",
      "title: Hexo V2 架构笔记",
      "date: 2026-05-01 12:30:00",
      "tags:",
      "  - Tauri",
      "  - Rust",
      "categories:",
      "  - Engineering",
      "cover: /images/cover.png",
      "---",
      "",
      "# 正文标题",
      "你好世界",
    ].join("\n");

    const parsed = parseMarkdownDocument(raw);
    expect(parsed.hasFrontMatter).toBe(true);
    expect(parsed.data.title).toBe("Hexo V2 架构笔记");
    expect(parsed.data.date).toBe("2026-05-01 12:30:00");
    expect(parsed.data.tags).toEqual(["Tauri", "Rust"]);
    expect(parsed.data.categories).toEqual(["Engineering"]);
    expect(parsed.data.extra.cover).toBe("/images/cover.png");
    expect(parsed.bodyStartLine).toBe(11);
    expect(parsed.body.trim()).toContain("# 正文标题");
  });

  it("preserves unknown custom fields with native YAML types and body across bidirectional updates", () => {
    const raw = [
      "---",
      "title: Old Title",
      "date: 2026-05-01 09:00:00",
      "toc: true",
      "comments: false",
      "sticky: 10",
      "---",
      "",
      "Paragraph body with **bold**.",
    ].join("\n");

    const updated = updateFrontMatterInMarkdown(raw, (fm) => ({
      ...fm,
      title: "New Title",
      tags: ["Hexo", "V2"],
    }));

    expect(updated).toContain("comments: false");
    expect(updated).toContain("toc: true");
    expect(updated).toContain("sticky: 10");

    const reparsed = parseMarkdownDocument(updated);
    expect(reparsed.data.title).toBe("New Title");
    expect(reparsed.data.tags).toEqual(["Hexo", "V2"]);
    expect(reparsed.data.date).toBe("2026-05-01 09:00:00");
    expect(reparsed.data.extra.toc).toBe(true);
    expect(reparsed.data.extra.comments).toBe(false);
    expect(reparsed.data.extra.sticky).toBe(10);
    expect(reparsed.body.trim()).toBe("Paragraph body with **bold**.");
  });

  it("handles documents without front-matter, empty docs, and BOM/CRLF", () => {
    const empty = parseMarkdownDocument("");
    expect(empty.hasFrontMatter).toBe(false);
    expect(empty.bodyStartLine).toBe(1);

    const plain = parseMarkdownDocument("# Pure Markdown\nHello");
    expect(plain.hasFrontMatter).toBe(false);
    expect(plain.body).toBe("# Pure Markdown\nHello");

    const bomCrlf = "\uFEFF---\r\ntitle: WinPost\r\n---\r\n\r\nContent";
    const parsedBom = parseMarkdownDocument(bomCrlf);
    expect(parsedBom.hasFrontMatter).toBe(true);
    expect(parsedBom.data.title).toBe("WinPost");
    expect(parsedBom.body.trim()).toBe("Content");
  });

  it("does not throw on malformed YAML and refuses destructive mutation while invalid", () => {
    const broken = "---\ntitle: [unterminated\ncomments: false\n---\n\nBody text";
    const parsed = parseMarkdownDocument(broken);
    expect(parsed.hasFrontMatter).toBe(true);
    expect(parsed.parseError).toBeTruthy();
    expect(parsed.body.trim()).toBe("Body text");

    // Must not overwrite malformed YAML with emptyData
    const untouched = updateFrontMatterInMarkdown(broken, (fm) => ({
      ...fm,
      title: "Attempted Edit",
    }));
    expect(untouched).toBe(broken);

    // Empty front-matter computes accurate bodyStartLine = 3
    const emptyFm = parseMarkdownDocument("---\n---\nBody line 3");
    expect(emptyFm.hasFrontMatter).toBe(true);
    expect(emptyFm.bodyStartLine).toBe(3);
  });

  it("serializes cleanly with empty body", () => {
    const serialized = serializeMarkdownDocument(
      {
        title: "Solo",
        date: "2026-05-01 00:00:00",
        updated: "",
        tags: [],
        categories: [],
        abbrlink: "",
        extra: {},
      },
      ""
    );
    expect(serialized).toContain("title: Solo");
    expect(serialized.endsWith("---\n")).toBe(true);
  });

  it("handles edge cases: trailing spaces, EOF delimiter, comment-only YAML, non-mapping YAML, lone HR, and body HRs", () => {
    // Trailing spaces & EOF without trailing newline
    const eofFm = "---   \ntitle: EOF Post\n---  ";
    const parsedEof = parseMarkdownDocument(eofFm);
    expect(parsedEof.hasFrontMatter).toBe(true);
    expect(parsedEof.data.title).toBe("EOF Post");
    expect(parsedEof.body).toBe("");
    expect(parsedEof.bodyStartLine).toBe(4);

    // Comment-only YAML block
    const commentFm = "---\n# comment only\n---\nBody after comment";
    const parsedComment = parseMarkdownDocument(commentFm);
    expect(parsedComment.hasFrontMatter).toBe(true);
    expect(parsedComment.parseError).toBeUndefined();
    expect(parsedComment.body).toBe("Body after comment");

    // Non-object YAML (scalar / array) reports parseError and prevents clobbering
    const arrayFm = "---\n- a\n- b\n---\nBody";
    const parsedArray = parseMarkdownDocument(arrayFm);
    expect(parsedArray.hasFrontMatter).toBe(true);
    expect(parsedArray.parseError).toBeTruthy();
    expect(updateFrontMatterInMarkdown(arrayFm, (fm) => ({ ...fm, title: "X" }))).toBe(arrayFm);

    // Lone horizontal rule without closing ---
    const loneHr = "---\n# Just a heading";
    const parsedLone = parseMarkdownDocument(loneHr);
    expect(parsedLone.hasFrontMatter).toBe(false);
    expect(parsedLone.body).toBe(loneHr);
    expect(parsedLone.bodyStartLine).toBe(1);

    // Four dashes is not front-matter
    const fourDashes = "----\ntitle: nope\n----\nBody";
    expect(parseMarkdownDocument(fourDashes).hasFrontMatter).toBe(false);

    // Subsequent horizontal rules in body remain intact
    const bodyHr = "---\ntitle: With HR\n---\n\nPart 1\n\n---\n\nPart 2";
    const parsedBodyHr = parseMarkdownDocument(bodyHr);
    expect(parsedBodyHr.hasFrontMatter).toBe(true);
    expect(parsedBodyHr.data.title).toBe("With HR");
    expect(parsedBodyHr.body).toContain("Part 1\n\n---\n\nPart 2");
  });
});
