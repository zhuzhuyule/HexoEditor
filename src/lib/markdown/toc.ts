import { parseMarkdownDocument } from "@/lib/frontmatter";

export interface TocItem {
  id: string;
  level: number;
  text: string;
  /** 1-based line number in the full raw markdown file (including front-matter) */
  line: number;
}

/**
 * Generates a deterministic, URL- and DOM-safe heading slug supporting Unicode (including CJK).
 */
export function slugifyHeading(text: string): string {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "section";
}

/**
 * Creates a per-document heading slugger that deduplicates repeated headings
 * identically between TOC extraction and HTML rendering (`foo`, `foo-1`, `foo-2`).
 */
export function createHeadingSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = slugifyHeading(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

/**
 * Strips common inline Markdown syntax from a raw heading line so the extracted
 * display text and slug match markdown-it's rendered heading text.
 */
export function stripInlineMarkdown(rawText: string): string {
  let text = rawText.trim();

  // Remove inline HTML tags while keeping inner text
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, "");

  // Images: ![alt](url "title") -> alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Links: [label](url "title") -> label
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Reference links: [label][ref] -> label
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");

  // Inline code spans: `code` -> code
  text = text.replace(/(`+)([\s\S]*?)\1/g, "$2");

  // Bold / italic / strikethrough wrappers
  text = text.replace(/(\*\*\*|___)(.+?)\1/g, "$2");
  text = text.replace(/(\*\*|__)(.+?)\1/g, "$2");
  text = text.replace(/(\*|_)(.+?)\1/g, "$2");
  text = text.replace(/~~(.+?)~~/g, "$1");

  // Unescape backslash-escaped ASCII punctuation
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, "$1");

  return text.replace(/\s+/g, " ").trim();
}

const FENCE_OPEN_RE = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/;
const ATX_HEADING_RE = /^[ ]{0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const SETEXT_UNDERLINE_RE = /^[ ]{0,3}(=+|-+)[ \t]*$/;
const HEXO_RAW_OPEN_RE = /\{%\s*raw\s*%\}/i;
const HEXO_RAW_CLOSE_RE = /\{%\s*endraw\s*%\}/i;
const HEXO_CODEBLOCK_OPEN_RE = /\{%\s*(?:codeblock|code)(?:\s+[^%]*)?%\}/i;
const HEXO_CODEBLOCK_CLOSE_RE = /\{%\s*(?:endcodeblock|endcode)\s*%\}/i;

function canBeSetextParagraphLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^[ ]{0,3}(?:#{1,6}(?:[ \t]|$)|>|[-*+][ \t]|\d+[.)][ \t]|<|<!--|\{%|\$\$|\|)/.test(line)) {
    return false;
  }
  return true;
}

/**
 * Extracts table of contents items (H1-H6) from a full Markdown document.
 * Accurately accounts for YAML Front-Matter lines and ignores `#` lines inside
 * fenced code blocks, Hexo `{% codeblock %}`, and `{% raw %}` blocks.
 */
export function extractMarkdownToc(rawMarkdown: string): TocItem[] {
  const parsed = parseMarkdownDocument(rawMarkdown);
  const lines = parsed.body.split("\n");
  const slugger = createHeadingSlugger();
  const items: TocItem[] = [];

  let activeFenceChar: "`" | "~" | null = null;
  let activeFenceLen = 0;
  let inHexoRaw = false;
  let inHexoCodeblock = false;
  let prevParagraphLine: { text: string; lineNum: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sourceLine = parsed.bodyStartLine + i;

    // Handle active fenced code block
    if (activeFenceChar !== null) {
      const closeRe = new RegExp(`^[ ]{0,3}${activeFenceChar}{${activeFenceLen},}[ \\t]*$`);
      if (closeRe.test(line)) {
        activeFenceChar = null;
        activeFenceLen = 0;
      }
      prevParagraphLine = null;
      continue;
    }

    // Handle active {% raw %} block
    if (inHexoRaw) {
      if (HEXO_RAW_CLOSE_RE.test(line)) {
        inHexoRaw = false;
      }
      prevParagraphLine = null;
      continue;
    }

    // Handle active {% codeblock %} block
    if (inHexoCodeblock) {
      if (HEXO_CODEBLOCK_CLOSE_RE.test(line)) {
        inHexoCodeblock = false;
      }
      prevParagraphLine = null;
      continue;
    }

    // Detect opening fenced code block
    const fenceMatch = line.match(FENCE_OPEN_RE);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const info = fenceMatch[2] ?? "";
      // CommonMark: backtick fence info string cannot contain backticks
      if (!(marker[0] === "`" && info.includes("`"))) {
        activeFenceChar = marker[0] as "`" | "~";
        activeFenceLen = marker.length;
        prevParagraphLine = null;
        continue;
      }
    }

    // Detect opening {% raw %} that does not close on the same line
    if (HEXO_RAW_OPEN_RE.test(line)) {
      if (!HEXO_RAW_CLOSE_RE.test(line)) {
        inHexoRaw = true;
      }
      prevParagraphLine = null;
      continue;
    }

    // Detect opening {% codeblock %} that does not close on the same line
    if (HEXO_CODEBLOCK_OPEN_RE.test(line)) {
      if (!HEXO_CODEBLOCK_CLOSE_RE.test(line)) {
        inHexoCodeblock = true;
      }
      prevParagraphLine = null;
      continue;
    }

    // ATX headings (# ... ######)
    const atxMatch = line.match(ATX_HEADING_RE);
    if (atxMatch) {
      const level = atxMatch[1].length;
      let rawText = atxMatch[2] ?? "";
      // Strip optional closing sequence of `#` preceded by whitespace (or sole `#`s)
      rawText = rawText.replace(/(?:^|[ \t]+)#+[ \t]*$/, "").trim();
      const cleanText = stripInlineMarkdown(rawText);
      if (cleanText) {
        items.push({
          id: slugger(cleanText),
          level,
          text: cleanText,
          line: sourceLine,
        });
      }
      prevParagraphLine = null;
      continue;
    }

    // Setext headings (=== / --- immediately below a plain paragraph line)
    if (prevParagraphLine) {
      const setextMatch = line.match(SETEXT_UNDERLINE_RE);
      if (setextMatch) {
        const level = setextMatch[1][0] === "=" ? 1 : 2;
        const cleanText = stripInlineMarkdown(prevParagraphLine.text);
        if (cleanText) {
          items.push({
            id: slugger(cleanText),
            level,
            text: cleanText,
            line: prevParagraphLine.lineNum,
          });
        }
        prevParagraphLine = null;
        continue;
      }
    }

    if (canBeSetextParagraphLine(line)) {
      prevParagraphLine = { text: line, lineNum: sourceLine };
    } else {
      prevParagraphLine = null;
    }
  }

  return items;
}
