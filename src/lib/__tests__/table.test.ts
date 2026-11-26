import { describe, expect, it } from "vitest";

import { formatMarkdownTables, generateMarkdownTable } from "@/lib/markdown/table";

describe("markdown table generator & formatter", () => {
  it("generates a valid GFM table with clamped dimensions", () => {
    const md = generateMarkdownTable(2, 3);
    const lines = md.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("列 1");
    expect(lines[0]).toContain("列 3");
    expect(lines[1]).toMatch(/^\| -+ \| -+ \| -+ \|$/);
  });

  it("formats misaligned CJK + English tables while preserving alignments", () => {
    const input = [
      "| 名称 | Type | Score |",
      "|:---|---:|:---:|",
      "| 中文标题 | int | 98 |",
      "| A | string | 100 |",
    ].join("\n");

    const { formatted, tablesFormatted } = formatMarkdownTables(input);
    expect(tablesFormatted).toBe(1);
    const lines = formatted.split("\n");
    expect(lines[1]).toMatch(/^\| :-+ \| -+: \| :-+: \|$/);
    // Right-aligned column should pad on the left
    expect(lines[2]).toContain("|    int |");
  });

  it("ignores pipe syntax inside fenced code blocks", () => {
    const input = [
      "```bash",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
      "```",
    ].join("\n");

    const { formatted, tablesFormatted } = formatMarkdownTables(input);
    expect(tablesFormatted).toBe(0);
    expect(formatted).toBe(input);
  });

  it("formats only targeted table when cursor line is supplied", () => {
    const input = [
      "| a | b |",
      "|---|---|",
      "| 1 | 2222 |",
      "",
      "| x | y |",
      "|---|---|",
      "| 9 | 8888 |",
    ].join("\n");

    const { formatted, tablesFormatted } = formatMarkdownTables(input, 1);
    expect(tablesFormatted).toBe(1);
    expect(formatted).toContain("| 1   | 2222 |");
    expect(formatted).toContain("|---|---|");
  });
});
