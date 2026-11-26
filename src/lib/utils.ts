import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface DocumentStats {
  cjkCount: number;
  latinWordCount: number;
  totalWords: number;
  charCount: number;
  readingMinutes: number;
}

/**
 * Computes CJK + Latin word count & estimated reading duration,
 * stripping YAML front-matter and fenced code punctuation noise.
 */
export function computeDocumentStats(markdown: string): DocumentStats {
  const withoutFm = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
  const plain = withoutFm
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, ""))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`_~|-]/g, " ");

  const cjkMatches = plain.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  const nonCjk = plain.replace(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g, " ");
  const latinMatches = nonCjk.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);
  const latinWordCount = latinMatches ? latinMatches.length : 0;

  const totalWords = cjkCount + latinWordCount;
  const charCount = withoutFm.replace(/\s+/g, "").length;
  // Standard reading speed: ~300 CJK chars/min, ~200 English words/min
  const rawMinutes = cjkCount / 300 + latinWordCount / 200;
  const readingMinutes = totalWords === 0 ? 0 : Math.max(1, Math.ceil(rawMinutes));

  return {
    cjkCount,
    latinWordCount,
    totalWords,
    charCount,
    readingMinutes,
  };
}

export function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

export function getFileStem(filePath: string): string {
  const name = getFileName(filePath);
  return name.replace(/\.[^.]+$/, "");
}

export function sanitizeSlugClient(raw: string): string {
  return raw
    .trim()
    .replace(/[/\\:*?"<>|\n\r\t]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}

export function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const match = dateStr.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : dateStr.slice(0, 10);
}

/**
 * Normalizes a filesystem path for cross-platform comparisons (Windows slashes, `\\?\` prefix, drive letter case).
 */
export function normalizeFsPath(rawPath: string): string {
  let normalized = rawPath.replace(/\\/g, "/");
  if (normalized.startsWith("//?/") && !normalized.startsWith("//?/UNC/")) {
    normalized = normalized.slice(4);
  }
  if (/^[A-Za-z]:\//.test(normalized)) {
    normalized = `${normalized[0].toLowerCase()}${normalized.slice(1)}`;
  }
  return normalized.replace(/\/+$/, "");
}

/**
 * Checks whether the current runtime is macOS (or a headless test env defaulting to Mac shortcut conventions).
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return true;
  const platform = navigator.platform || "";
  const ua = navigator.userAgent || "";
  if (/mac/i.test(platform) || /macintosh|mac os x|darwin/i.test(ua)) {
    return true;
  }
  if (
    /\bwin(?:32|64|dows)?\b/i.test(platform) ||
    /windows/i.test(ua) ||
    /linux|x11/i.test(`${platform} ${ua}`)
  ) {
    return false;
  }
  return true;
}

/**
 * Checks whether `filePath` is strictly inside (or equal to) `dirPath`,
 * respecting path separator boundaries so `/a/blog-2/x.md` does not match `/a/blog`.
 */
export function isPathInsideDir(filePath: string, dirPath: string): boolean {
  const normFile = normalizeFsPath(filePath);
  const normDir = normalizeFsPath(dirPath);
  if (!normDir) return false;
  return normFile === normDir || normFile.startsWith(`${normDir}/`);
}

/**
 * Formats a Markdown image snippet safely, wrapping paths containing spaces or parentheses in <...>.
 */
export function formatMarkdownImageSnippet(markdownPath: string): string {
  const alt = markdownPath.split("/").pop()?.replace(/\.[^.]+$/, "") || "image";
  const safeTarget = /[\s()]/.test(markdownPath) ? `<${markdownPath}>` : markdownPath;
  return `![${alt}](${safeTarget})`;
}
