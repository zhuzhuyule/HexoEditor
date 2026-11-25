import { scopePreviewThemeCss } from "@/components/preview/MarkdownPreview";

export type ExportCodeTheme =
  | "github-light"
  | "atom-one-light"
  | "github-dark"
  | "atom-one-dark";

export interface StandaloneHtmlExportOptions {
  title: string;
  date?: string | null;
  categories?: string[];
  tags?: string[];
  markdownContent: string;
  bodyHtml: string;
  themeCss?: string | null;
  codeTheme?: ExportCodeTheme | string | null;
  lang?: string;
  resolveLocalImageDataUri?: (absPath: string) => Promise<string | null>;
}

const VALID_CODE_THEMES = new Set<ExportCodeTheme>([
  "github-light",
  "atom-one-light",
  "github-dark",
  "atom-one-dark",
]);

const EDITOR_ONLY_ATTRIBUTES = [
  "data-local-image",
  "data-local-abs-path",
  "data-raw-src",
  "data-source-line",
  "data-mermaid-source",
] as const;

export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeExportCodeTheme(
  theme?: string | null
): ExportCodeTheme {
  if (theme && VALID_CODE_THEMES.has(theme as ExportCodeTheme)) {
    return theme as ExportCodeTheme;
  }
  return "github-light";
}

function isSafeImageDataUri(uri: string | null | undefined): uri is string {
  if (!uri) return false;
  return /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(uri.trim());
}

async function resolveUniquePathsWithConcurrency(
  paths: string[],
  resolver: (absPath: string) => Promise<string | null>,
  concurrency = 6
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (paths.length === 0) return results;

  let cursor = 0;
  const workerCount = Math.min(concurrency, paths.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < paths.length) {
      const idx = cursor++;
      const absPath = paths[idx];
      try {
        const dataUri = await resolver(absPath);
        if (isSafeImageDataUri(dataUri)) {
          results.set(absPath, dataUri.trim());
        }
      } catch {
        // Keep original src intact when resolving a single local image fails
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Replaces local `<img data-local-image="true" data-local-abs-path="...">` sources
 * with offline Data URIs and strips editor-only interactive attributes.
 */
export async function inlineLocalImagesInHtml(
  bodyHtml: string,
  resolveLocalImageDataUri?: (absPath: string) => Promise<string | null>
): Promise<string> {
  if (!bodyHtml) return "";

  if (typeof DOMParser !== "undefined") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${bodyHtml}</body>`, "text/html");
    const root = doc.body;

    const localImgs = Array.from(
      root.querySelectorAll<HTMLImageElement>(
        'img[data-local-image="true"][data-local-abs-path]'
      )
    );

    if (resolveLocalImageDataUri && localImgs.length > 0) {
      const uniquePaths = Array.from(
        new Set(
          localImgs
            .map((img) => img.getAttribute("data-local-abs-path")?.trim() ?? "")
            .filter(Boolean)
        )
      );

      const resolvedMap = await resolveUniquePathsWithConcurrency(
        uniquePaths,
        resolveLocalImageDataUri
      );

      for (const img of localImgs) {
        const absPath = img.getAttribute("data-local-abs-path")?.trim() ?? "";
        const dataUri = resolvedMap.get(absPath);
        if (dataUri) {
          img.setAttribute("src", dataUri);
          img.classList.remove("local-image-missing");
        }
      }
    }

    // Remove editor-only interactive attributes across the exported fragment
    const attrSelector = EDITOR_ONLY_ATTRIBUTES.map((a) => `[${a}]`).join(",");
    for (const el of Array.from(root.querySelectorAll(attrSelector))) {
      for (const attr of EDITOR_ONLY_ATTRIBUTES) {
        el.removeAttribute(attr);
      }
    }

    return root.innerHTML;
  }

  // Fallback for non-DOM runtimes
  let processed = bodyHtml;
  const imgTagRe = /<img\b[^>]*>/gi;
  const matchedTags = bodyHtml.match(imgTagRe) ?? [];

  const uniquePaths = new Set<string>();
  for (const tag of matchedTags) {
    if (!/\bdata-local-image=(["'])true\1/i.test(tag)) continue;
    const absMatch = tag.match(/\bdata-local-abs-path=(["'])([^"']+)\1/i);
    if (absMatch?.[2]) {
      uniquePaths.add(absMatch[2]);
    }
  }

  const resolvedMap =
    resolveLocalImageDataUri && uniquePaths.size > 0
      ? await resolveUniquePathsWithConcurrency(
          Array.from(uniquePaths),
          resolveLocalImageDataUri
        )
      : new Map<string, string>();

  processed = processed.replace(imgTagRe, (tag) => {
    let nextTag = tag;
    if (/\bdata-local-image=(["'])true\1/i.test(nextTag)) {
      const absMatch = nextTag.match(/\bdata-local-abs-path=(["'])([^"']+)\1/i);
      const dataUri = absMatch?.[2] ? resolvedMap.get(absMatch[2]) : undefined;
      if (dataUri) {
        nextTag = nextTag.replace(
          /\bsrc=(["'])[^"']*\1/i,
          `src="${escapeHtmlText(dataUri)}"`
        );
      }
    }
    for (const attr of EDITOR_ONLY_ATTRIBUTES) {
      nextTag = nextTag.replace(
        new RegExp(`\\s+${attr}=(?:["'][^"']*["']|[^\\s>]+)`, "gi"),
        ""
      );
    }
    return nextTag;
  });

  for (const attr of EDITOR_ONLY_ATTRIBUTES) {
    processed = processed.replace(
      new RegExp(`\\s+${attr}=(?:["'][^"']*["']|[^\\s>]+)`, "gi"),
      ""
    );
  }

  return processed;
}

function getCodeThemeCss(theme: ExportCodeTheme): string {
  switch (theme) {
    case "atom-one-light":
      return `
[data-code-theme="atom-one-light"] .code-block-wrapper,
[data-code-theme="atom-one-light"] .hexo-codeblock {
  background-color: #fafafa;
  border-color: #e4e4e7;
}
[data-code-theme="atom-one-light"] .code-lang-badge { color: #a0a1a7; }
[data-code-theme="atom-one-light"] .hljs { color: #383a42; }
[data-code-theme="atom-one-light"] .hljs-comment,
[data-code-theme="atom-one-light"] .hljs-quote { color: #a0a1a7; font-style: italic; }
[data-code-theme="atom-one-light"] .hljs-doctag,
[data-code-theme="atom-one-light"] .hljs-keyword,
[data-code-theme="atom-one-light"] .hljs-formula { color: #a626a4; }
[data-code-theme="atom-one-light"] .hljs-section,
[data-code-theme="atom-one-light"] .hljs-name,
[data-code-theme="atom-one-light"] .hljs-selector-tag,
[data-code-theme="atom-one-light"] .hljs-deletion,
[data-code-theme="atom-one-light"] .hljs-subst { color: #e45649; }
[data-code-theme="atom-one-light"] .hljs-literal { color: #0184bb; }
[data-code-theme="atom-one-light"] .hljs-string,
[data-code-theme="atom-one-light"] .hljs-regexp,
[data-code-theme="atom-one-light"] .hljs-addition,
[data-code-theme="atom-one-light"] .hljs-attribute,
[data-code-theme="atom-one-light"] .hljs-meta .hljs-string { color: #50a14f; }
[data-code-theme="atom-one-light"] .hljs-attr,
[data-code-theme="atom-one-light"] .hljs-variable,
[data-code-theme="atom-one-light"] .hljs-template-variable,
[data-code-theme="atom-one-light"] .hljs-type,
[data-code-theme="atom-one-light"] .hljs-selector-class,
[data-code-theme="atom-one-light"] .hljs-selector-attr,
[data-code-theme="atom-one-light"] .hljs-selector-pseudo,
[data-code-theme="atom-one-light"] .hljs-number { color: #986801; }
[data-code-theme="atom-one-light"] .hljs-symbol,
[data-code-theme="atom-one-light"] .hljs-bullet,
[data-code-theme="atom-one-light"] .hljs-link,
[data-code-theme="atom-one-light"] .hljs-meta,
[data-code-theme="atom-one-light"] .hljs-selector-id,
[data-code-theme="atom-one-light"] .hljs-title { color: #4078f2; }
[data-code-theme="atom-one-light"] .hljs-built_in,
[data-code-theme="atom-one-light"] .hljs-title.class_,
[data-code-theme="atom-one-light"] .hljs-class .hljs-title { color: #c18401; }
[data-code-theme="atom-one-light"] .hljs-emphasis { font-style: italic; }
[data-code-theme="atom-one-light"] .hljs-strong { font-weight: 700; }`;

    case "github-dark":
      return `
[data-code-theme="github-dark"] .code-block-wrapper,
[data-code-theme="github-dark"] .hexo-codeblock {
  background-color: #0d1117;
  border-color: #30363d;
}
[data-code-theme="github-dark"] .hexo-codeblock-header,
[data-code-theme="github-dark"] .hexo-codeblock figcaption {
  background-color: #161b22;
  border-bottom-color: #30363d;
  color: #8b949e;
}
[data-code-theme="github-dark"] .hexo-codeblock-title { color: #e6edf3; }
[data-code-theme="github-dark"] .hexo-codeblock-link { color: #58a6ff; }
[data-code-theme="github-dark"] .code-lang-badge { color: #8b949e; }
[data-code-theme="github-dark"] .hljs { color: #c9d1d9; }
[data-code-theme="github-dark"] .hljs-doctag,
[data-code-theme="github-dark"] .hljs-keyword,
[data-code-theme="github-dark"] .hljs-meta .hljs-keyword,
[data-code-theme="github-dark"] .hljs-template-tag,
[data-code-theme="github-dark"] .hljs-template-variable,
[data-code-theme="github-dark"] .hljs-type,
[data-code-theme="github-dark"] .hljs-variable.language_ { color: #ff7b72; }
[data-code-theme="github-dark"] .hljs-title,
[data-code-theme="github-dark"] .hljs-title.class_,
[data-code-theme="github-dark"] .hljs-title.function_ { color: #d2a8ff; }
[data-code-theme="github-dark"] .hljs-attr,
[data-code-theme="github-dark"] .hljs-attribute,
[data-code-theme="github-dark"] .hljs-literal,
[data-code-theme="github-dark"] .hljs-meta,
[data-code-theme="github-dark"] .hljs-number,
[data-code-theme="github-dark"] .hljs-operator,
[data-code-theme="github-dark"] .hljs-selector-attr,
[data-code-theme="github-dark"] .hljs-selector-class,
[data-code-theme="github-dark"] .hljs-selector-id,
[data-code-theme="github-dark"] .hljs-variable { color: #79c0ff; }
[data-code-theme="github-dark"] .hljs-meta .hljs-string,
[data-code-theme="github-dark"] .hljs-regexp,
[data-code-theme="github-dark"] .hljs-string { color: #a5d6ff; }
[data-code-theme="github-dark"] .hljs-built_in,
[data-code-theme="github-dark"] .hljs-symbol { color: #ffa657; }
[data-code-theme="github-dark"] .hljs-comment,
[data-code-theme="github-dark"] .hljs-code,
[data-code-theme="github-dark"] .hljs-formula { color: #8b949e; }
[data-code-theme="github-dark"] .hljs-name,
[data-code-theme="github-dark"] .hljs-quote,
[data-code-theme="github-dark"] .hljs-selector-pseudo,
[data-code-theme="github-dark"] .hljs-selector-tag { color: #7ee787; }
[data-code-theme="github-dark"] .hljs-addition { color: #aff5b4; background-color: #033a16; }
[data-code-theme="github-dark"] .hljs-deletion { color: #ffdcd7; background-color: #67060c; }
[data-code-theme="github-dark"] .hljs-emphasis { font-style: italic; }
[data-code-theme="github-dark"] .hljs-strong { font-weight: 700; }`;

    case "atom-one-dark":
      return `
[data-code-theme="atom-one-dark"] .code-block-wrapper,
[data-code-theme="atom-one-dark"] .hexo-codeblock {
  background-color: #282c34;
  border-color: #3e4451;
}
[data-code-theme="atom-one-dark"] .hexo-codeblock-header,
[data-code-theme="atom-one-dark"] .hexo-codeblock figcaption {
  background-color: #21252b;
  border-bottom-color: #3e4451;
  color: #9da5b4;
}
[data-code-theme="atom-one-dark"] .hexo-codeblock-title { color: #dcdfe4; }
[data-code-theme="atom-one-dark"] .hexo-codeblock-link { color: #61afef; }
[data-code-theme="atom-one-dark"] .code-lang-badge { color: #7f848e; }
[data-code-theme="atom-one-dark"] .hljs { color: #abb2bf; }
[data-code-theme="atom-one-dark"] .hljs-comment,
[data-code-theme="atom-one-dark"] .hljs-quote { color: #5c6370; font-style: italic; }
[data-code-theme="atom-one-dark"] .hljs-doctag,
[data-code-theme="atom-one-dark"] .hljs-keyword,
[data-code-theme="atom-one-dark"] .hljs-formula { color: #c678dd; }
[data-code-theme="atom-one-dark"] .hljs-section,
[data-code-theme="atom-one-dark"] .hljs-name,
[data-code-theme="atom-one-dark"] .hljs-selector-tag,
[data-code-theme="atom-one-dark"] .hljs-deletion,
[data-code-theme="atom-one-dark"] .hljs-subst { color: #e06c75; }
[data-code-theme="atom-one-dark"] .hljs-literal { color: #56b6c2; }
[data-code-theme="atom-one-dark"] .hljs-string,
[data-code-theme="atom-one-dark"] .hljs-regexp,
[data-code-theme="atom-one-dark"] .hljs-addition,
[data-code-theme="atom-one-dark"] .hljs-attribute,
[data-code-theme="atom-one-dark"] .hljs-meta .hljs-string { color: #98c379; }
[data-code-theme="atom-one-dark"] .hljs-attr,
[data-code-theme="atom-one-dark"] .hljs-variable,
[data-code-theme="atom-one-dark"] .hljs-template-variable,
[data-code-theme="atom-one-dark"] .hljs-type,
[data-code-theme="atom-one-dark"] .hljs-selector-class,
[data-code-theme="atom-one-dark"] .hljs-selector-attr,
[data-code-theme="atom-one-dark"] .hljs-selector-pseudo,
[data-code-theme="atom-one-dark"] .hljs-number { color: #d19a66; }
[data-code-theme="atom-one-dark"] .hljs-symbol,
[data-code-theme="atom-one-dark"] .hljs-bullet,
[data-code-theme="atom-one-dark"] .hljs-link,
[data-code-theme="atom-one-dark"] .hljs-meta,
[data-code-theme="atom-one-dark"] .hljs-selector-id,
[data-code-theme="atom-one-dark"] .hljs-title { color: #61afef; }
[data-code-theme="atom-one-dark"] .hljs-built_in,
[data-code-theme="atom-one-dark"] .hljs-title.class_,
[data-code-theme="atom-one-dark"] .hljs-class .hljs-title { color: #e6c07b; }
[data-code-theme="atom-one-dark"] .hljs-emphasis { font-style: italic; }
[data-code-theme="atom-one-dark"] .hljs-strong { font-weight: 700; }`;

    case "github-light":
    default:
      return `
[data-code-theme="github-light"] .code-block-wrapper,
[data-code-theme="github-light"] .hexo-codeblock {
  background-color: #fafafa;
  border-color: #e4e4e7;
}
[data-code-theme="github-light"] .code-lang-badge { color: #a1a1aa; }
[data-code-theme="github-light"] .hljs { color: #24292e; }
[data-code-theme="github-light"] .hljs-doctag,
[data-code-theme="github-light"] .hljs-keyword,
[data-code-theme="github-light"] .hljs-meta .hljs-keyword,
[data-code-theme="github-light"] .hljs-template-tag,
[data-code-theme="github-light"] .hljs-template-variable,
[data-code-theme="github-light"] .hljs-type,
[data-code-theme="github-light"] .hljs-variable.language_ { color: #d73a49; }
[data-code-theme="github-light"] .hljs-title,
[data-code-theme="github-light"] .hljs-title.class_,
[data-code-theme="github-light"] .hljs-title.function_ { color: #6f42c1; }
[data-code-theme="github-light"] .hljs-attr,
[data-code-theme="github-light"] .hljs-attribute,
[data-code-theme="github-light"] .hljs-literal,
[data-code-theme="github-light"] .hljs-meta,
[data-code-theme="github-light"] .hljs-number,
[data-code-theme="github-light"] .hljs-operator,
[data-code-theme="github-light"] .hljs-selector-attr,
[data-code-theme="github-light"] .hljs-selector-class,
[data-code-theme="github-light"] .hljs-selector-id,
[data-code-theme="github-light"] .hljs-variable { color: #005cc5; }
[data-code-theme="github-light"] .hljs-meta .hljs-string,
[data-code-theme="github-light"] .hljs-regexp,
[data-code-theme="github-light"] .hljs-string { color: #032f62; }
[data-code-theme="github-light"] .hljs-built_in,
[data-code-theme="github-light"] .hljs-symbol { color: #e36209; }
[data-code-theme="github-light"] .hljs-comment,
[data-code-theme="github-light"] .hljs-code,
[data-code-theme="github-light"] .hljs-formula { color: #6a737d; }
[data-code-theme="github-light"] .hljs-name,
[data-code-theme="github-light"] .hljs-quote,
[data-code-theme="github-light"] .hljs-selector-pseudo,
[data-code-theme="github-light"] .hljs-selector-tag { color: #22863a; }
[data-code-theme="github-light"] .hljs-addition { color: #22863a; background-color: #f0fff4; }
[data-code-theme="github-light"] .hljs-deletion { color: #b31d28; background-color: #ffeef0; }
[data-code-theme="github-light"] .hljs-emphasis { font-style: italic; }
[data-code-theme="github-light"] .hljs-strong { font-weight: 700; }`;
  }
}

const KATEX_OFFLINE_CSS = `
/* Offline KaTeX structural typography */
.katex-display-wrapper { margin: 1.25em 0; overflow-x: auto; overflow-y: hidden; padding: 4px 0; text-align: center; }
.katex { font: normal 1.12em "KaTeX_Main", "Cambria Math", "STIX Two Math", "Times New Roman", serif; line-height: 1.2; text-indent: 0; text-rendering: auto; }
.katex .katex-mathml { position: absolute; clip: rect(1px, 1px, 1px, 1px); padding: 0; border: 0; height: 1px; width: 1px; overflow: hidden; }
.katex .katex-html > .newline { display: block; }
.katex .base { position: relative; display: inline-block; white-space: nowrap; width: min-content; }
.katex .strut { display: inline-block; }
.katex .mathnormal { font-style: italic; }
.katex .mathbf { font-weight: 700; }
.katex .textit { font-style: italic; }
.katex .textbf { font-weight: 700; }
.katex .texttt { font-family: "JetBrains Mono", ui-monospace, monospace; }
.katex .msupsub { text-align: left; }
.katex .mfrac > span > span { text-align: center; }
.katex .mfrac .frac-line { display: inline-block; width: 100%; border-bottom-style: solid; border-bottom-width: 0.06em; }
.katex .vlist-t { display: inline-table; table-layout: fixed; border-collapse: collapse; }
.katex .vlist-r { display: table-row; }
.katex .vlist { display: table-cell; vertical-align: bottom; position: relative; }
.katex .vlist > span { display: block; height: 0; position: relative; }
.katex .vlist > span > span { display: inline-block; }
.katex .vlist-t2 { margin-right: -2px; }
.katex .vlist-s { display: table-cell; vertical-align: bottom; font-size: 1px; width: 2px; min-width: 2px; }
.katex .mtable .col-align-c > .vlist-t { text-align: center; }
.katex .mtable .col-align-l > .vlist-t { text-align: left; }
.katex .mtable .col-align-r > .vlist-t { text-align: right; }
.katex .mbin { margin: 0 0.22em; }
.katex .mrel { margin: 0 0.28em; }
.katex .mpunct { margin-right: 0.16em; }
.katex-display { display: block; margin: 1em 0; text-align: center; }
.katex-display > .katex { display: block; text-align: center; white-space: nowrap; }
.katex-error { color: #dc2626; background-color: #fef2f2; padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 0.88em; }`;

const BASE_DOCUMENT_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background-color: #ffffff;
  color: #18181b;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.hexo-export-page {
  min-height: 100vh;
  padding: 40px 24px 72px;
}
.hexo-export-article {
  max-width: 780px;
  margin: 0 auto;
}
.hexo-export-header {
  margin-bottom: 28px;
  padding-bottom: 18px;
  border-bottom: 1px solid #f4f4f5;
}
.hexo-export-title {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: #18181b;
}
.hexo-export-meta {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #71717a;
}
.hexo-export-date {
  font-family: "JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #71717a;
}
.hexo-export-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  background-color: #f4f4f5;
  color: #52525b;
  font-size: 11px;
  font-weight: 500;
}
.hexo-export-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid #e4e4e7;
  background-color: #ffffff;
  color: #52525b;
  font-size: 11px;
}
.markdown-preview {
  color: #27272a;
  font-size: 15px;
  line-height: 1.8;
  word-wrap: break-word;
}
.markdown-preview h1,
.markdown-preview h2,
.markdown-preview h3,
.markdown-preview h4,
.markdown-preview h5,
.markdown-preview h6 {
  color: #18181b;
  font-weight: 600;
  line-height: 1.35;
  margin-top: 1.6em;
  margin-bottom: 0.65em;
  letter-spacing: -0.015em;
}
.markdown-preview h1 { font-size: 1.75em; padding-bottom: 0.3em; border-bottom: 1px solid #f4f4f5; }
.markdown-preview h2 { font-size: 1.4em; padding-bottom: 0.25em; border-bottom: 1px solid #f4f4f5; }
.markdown-preview h3 { font-size: 1.18em; }
.markdown-preview h4 { font-size: 1.02em; }
.markdown-preview p { margin-top: 0; margin-bottom: 1em; }
.markdown-preview a { color: #2563eb; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(37, 99, 235, 0.35); }
.markdown-preview a:hover { text-decoration-color: #2563eb; }
.markdown-preview blockquote {
  margin: 1.1em 0;
  padding: 0.25em 1em;
  border-left: 3px solid #d4d4d8;
  background-color: #fafafa;
  color: #52525b;
  border-radius: 0 4px 4px 0;
}
.markdown-preview blockquote > p:last-child { margin-bottom: 0; }
.markdown-preview ul, .markdown-preview ol { margin: 0.85em 0; padding-left: 1.65em; }
.markdown-preview ul { list-style-type: disc; }
.markdown-preview ol { list-style-type: decimal; }
.markdown-preview li { margin: 0.3em 0; }
.markdown-preview li.task-list-item { list-style-type: none; margin-left: -1.3em; }
.markdown-preview .task-list-checkbox { margin-right: 0.5em; vertical-align: middle; accent-color: #18181b; }
.markdown-preview code:not(.hljs) {
  font-family: "JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.87em;
  background-color: #f4f4f5;
  color: #b91c1c;
  padding: 0.14em 0.38em;
  border-radius: 4px;
}
.markdown-preview .code-block-wrapper {
  position: relative;
  margin: 1.1em 0;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background-color: #fafafa;
  overflow: hidden;
}
.markdown-preview .code-lang-badge {
  position: absolute;
  top: 6px;
  right: 10px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 10px;
  color: #a1a1aa;
  text-transform: lowercase;
  user-select: none;
}
.markdown-preview .code-block-wrapper pre,
.markdown-preview .hexo-codeblock pre {
  margin: 0;
  padding: 14px 16px;
  overflow-x: auto;
  font-family: "JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.65;
  background: transparent;
}
.markdown-preview .code-block-wrapper code.hljs { padding: 0; background: transparent; }
.markdown-preview table { width: 100%; border-collapse: collapse; margin: 1.2em 0; font-size: 0.92em; }
.markdown-preview th, .markdown-preview td { border: 1px solid #e4e4e7; padding: 8px 12px; text-align: left; }
.markdown-preview th { background-color: #fafafa; font-weight: 600; color: #18181b; }
.markdown-preview hr { border: none; border-top: 1px solid #e4e4e7; margin: 1.8em 0; }
.markdown-preview img { display: block; max-width: 100%; height: auto; margin: 1.2em auto; border-radius: 6px; border: 1px solid #f4f4f5; }
.markdown-preview .mermaid-block { margin: 1.25em 0; padding: 16px; border: 1px solid #e4e4e7; border-radius: 8px; background-color: #fafafa; display: flex; justify-content: center; overflow-x: auto; }
.markdown-preview .mermaid-block svg { max-width: 100%; height: auto; }
.markdown-preview .hexo-note { margin: 1.15em 0; padding: 0.85em 1.05em; border: 1px solid #e4e4e7; border-left: 3.5px solid #71717a; border-radius: 0 8px 8px 0; background-color: #f8f8f9; color: #3f3f46; }
.markdown-preview .hexo-note > :last-child { margin-bottom: 0; }
.markdown-preview .hexo-note-primary, .markdown-preview .hexo-note.primary { border-color: #ddd6fe; border-left-color: #7c3aed; background-color: #f5f3ff; color: #4c1d95; }
.markdown-preview .hexo-note-success, .markdown-preview .hexo-note.success { border-color: #bbf7d0; border-left-color: #16a34a; background-color: #f0fdf4; color: #14532d; }
.markdown-preview .hexo-note-info, .markdown-preview .hexo-note.info { border-color: #bae6fd; border-left-color: #0284c7; background-color: #f0f9ff; color: #0c4a6e; }
.markdown-preview .hexo-note-warning, .markdown-preview .hexo-note.warning { border-color: #fde68a; border-left-color: #d97706; background-color: #fffbeb; color: #78350f; }
.markdown-preview .hexo-note-danger, .markdown-preview .hexo-note.danger { border-color: #fecaca; border-left-color: #dc2626; background-color: #fef2f2; color: #7f1d1d; }
.markdown-preview .hexo-tabs { margin: 1.2em 0; border: 1px solid #e4e4e7; border-radius: 8px; background-color: #ffffff; overflow: hidden; }
.markdown-preview .hexo-tabs-nav, .markdown-preview .hexo-tabs [role="tablist"] { display: flex; flex-wrap: wrap; gap: 2px; margin: 0; padding: 6px 8px 0; list-style: none; background-color: #f8f8f9; border-bottom: 1px solid #e4e4e7; }
.markdown-preview .hexo-tabs [data-tab-index], .markdown-preview .hexo-tabs [role="tab"] { border: none; border-bottom: 2px solid transparent; background: transparent; padding: 6px 12px; font-size: 12.5px; font-weight: 500; color: #71717a; }
.markdown-preview .hexo-tabs [data-tab-index].active, .markdown-preview .hexo-tabs [aria-selected="true"] { color: #18181b; background-color: #ffffff; border-bottom-color: #18181b; }
.markdown-preview .hexo-tabs [data-tab-panel] { padding: 14px 16px; }
.markdown-preview .hexo-tabs [data-tab-panel][hidden] { display: none; }
.markdown-preview .hexo-codeblock { margin: 1.15em 0; border: 1px solid #e4e4e7; border-radius: 8px; background-color: #f8f8f9; overflow: hidden; }
.markdown-preview .hexo-codeblock-header, .markdown-preview .hexo-codeblock figcaption { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 14px; border-bottom: 1px solid #e4e4e7; background-color: #f4f4f5; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; color: #52525b; }
.markdown-preview .hexo-codeblock .code-block-wrapper { margin: 0; border: none; border-radius: 0; background-color: transparent; }
.markdown-preview .hexo-pullquote { margin: 1.4em 0; padding: 0.9em 1.25em; border-left: 2px solid #a1a1aa; background-color: #fafafa; color: #3f3f46; font-style: italic; border-radius: 0 6px 6px 0; }
@media print {
  @page { margin: 16mm 14mm; }
  .hexo-export-page { padding: 0; }
  .hexo-export-article { max-width: 100%; }
  .markdown-preview h1, .markdown-preview h2, .markdown-preview h3, .markdown-preview h4 { break-after: avoid; page-break-after: avoid; }
  .markdown-preview .code-block-wrapper, .markdown-preview .hexo-codeblock, .markdown-preview pre, .markdown-preview blockquote, .markdown-preview .hexo-note, .markdown-preview img, .markdown-preview tr { break-inside: avoid; page-break-inside: avoid; }
  .markdown-preview pre { white-space: pre-wrap; word-break: break-word; overflow-x: visible; }
}`;

function detectDocumentLang(options: StandaloneHtmlExportOptions): string {
  if (options.lang && options.lang.trim()) {
    return options.lang.trim();
  }
  const sample = `${options.title}\n${options.markdownContent.slice(0, 400)}`;
  return /[\u3400-\u9fff]/.test(sample) ? "zh-CN" : "en";
}

function hasKatexMarkup(bodyHtml: string): boolean {
  return /\bclass=(["'])[^"']*\bkatex(?:-display)?\b[^"']*\1/i.test(bodyHtml);
}

/**
 * Builds a clean, self-contained standalone HTML5 document with offline inlined local images,
 * minimalist light typography, syntax highlighting styles, optional KaTeX styles, and sanitized theme CSS.
 */
export async function buildStandaloneHtmlDocument(
  options: StandaloneHtmlExportOptions
): Promise<string> {
  const safeTitle = escapeHtmlText(options.title.trim() || "Untitled");
  const safeLang = escapeHtmlText(detectDocumentLang(options));
  const normalizedCodeTheme = normalizeExportCodeTheme(options.codeTheme);

  const processedBody = await inlineLocalImagesInHtml(
    options.bodyHtml,
    options.resolveLocalImageDataUri
  );

  const includeKatex = hasKatexMarkup(processedBody);
  const sanitizedThemeInput = options.themeCss
    ? options.themeCss
        .replace(/<\/?\s*style[^>]*>/gi, "")
        .replace(/<\s*script\b[\s\S]*?<\/\s*script\s*>/gi, "")
        .replace(/<\/?\s*script[^>]*>/gi, "")
    : options.themeCss;
  const scopedThemeCss = scopePreviewThemeCss(
    sanitizedThemeInput,
    ".markdown-preview-scoped"
  ).replace(/<\/\s*style/gi, "");

  const categories = (options.categories ?? []).filter((c) => c.trim().length > 0);
  const tags = (options.tags ?? []).filter((t) => t.trim().length > 0);
  const dateText = options.date?.trim() ?? "";
  const hasMeta = Boolean(dateText || categories.length > 0 || tags.length > 0);

  const metaParts: string[] = [];
  if (dateText) {
    metaParts.push(`<time class="hexo-export-date">${escapeHtmlText(dateText)}</time>`);
  }
  for (const cat of categories) {
    metaParts.push(`<span class="hexo-export-pill">${escapeHtmlText(cat)}</span>`);
  }
  for (const tag of tags) {
    metaParts.push(`<span class="hexo-export-tag">#${escapeHtmlText(tag)}</span>`);
  }

  const headerHtml = `<header class="hexo-export-header">
      <h1 class="hexo-export-title">${safeTitle}</h1>${
        hasMeta
          ? `\n      <div class="hexo-export-meta">\n        ${metaParts.join(
              "\n        "
            )}\n      </div>`
          : ""
      }
    </header>`;

  const combinedStyles = [
    BASE_DOCUMENT_CSS.trim(),
    getCodeThemeCss(normalizedCodeTheme).trim(),
    includeKatex ? KATEX_OFFLINE_CSS.trim() : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const themeStyleBlock = scopedThemeCss.trim()
    ? `\n  <style data-hexo-theme-css="true">\n${scopedThemeCss}\n  </style>`
    : "";

  return `<!DOCTYPE html>
<html lang="${safeLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="generator" content="HexoEditor V2" />
  <title>${safeTitle}</title>
  <style>
${combinedStyles}
  </style>${themeStyleBlock}
</head>
<body>
  <main class="hexo-export-page">
    <article class="hexo-export-article" data-code-theme="${normalizedCodeTheme}">
    ${headerHtml}
    <div class="markdown-preview markdown-preview-scoped">
${processedBody}
    </div>
    </article>
  </main>
</body>
</html>
`;
}
