import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import katex from "katex";
import MarkdownIt, { type Options as MarkdownItOptions } from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type Token from "markdown-it/lib/token.mjs";

export interface LocalImageEntry {
  assetUrl: string;
  absolutePath: string;
}

export interface RenderOptions {
  /** 1-based line offset where body starts in the full file (after front-matter) */
  bodyStartLine?: number;
  /** Map of raw markdown src -> resolved Tauri assetUrl + absolutePath */
  imageMap?: Record<string, LocalImageEntry>;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeDecodeURI(uri: string): string {
  try {
    return decodeURI(uri);
  } catch {
    try {
      return decodeURIComponent(uri);
    } catch {
      return uri;
    }
  }
}

function lookupLocalImage(
  imageMap: Record<string, LocalImageEntry> | undefined,
  rawSrc: string
): LocalImageEntry | undefined {
  if (!imageMap) return undefined;
  const direct = imageMap[rawSrc];
  if (direct) return direct;
  const decoded = safeDecodeURI(rawSrc);
  if (decoded !== rawSrc && imageMap[decoded]) {
    return imageMap[decoded];
  }
  try {
    const encoded = encodeURI(decoded);
    if (imageMap[encoded]) return imageMap[encoded];
  } catch {
    // ignore malformed URI
  }
  return undefined;
}

function isValidMathDelim(
  src: string,
  pos: number
): { canOpen: boolean; canClose: boolean } {
  const prevChar = pos > 0 ? src.charCodeAt(pos - 1) : -1;
  const nextChar = pos + 1 < src.length ? src.charCodeAt(pos + 1) : -1;

  let canOpen = true;
  let canClose = true;

  // Opening $ cannot be followed by whitespace, closing $ cannot be preceded by whitespace
  if (
    prevChar === 0x20 ||
    prevChar === 0x09 ||
    (nextChar >= 0x30 && nextChar <= 0x39)
  ) {
    canClose = false;
  }
  if (nextChar === 0x20 || nextChar === 0x09) {
    canOpen = false;
  }

  return { canOpen, canClose };
}

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== "$") return false;
  if (state.src[state.pos + 1] === "$") return false;

  const res = isValidMathDelim(state.src, state.pos);
  if (!res.canOpen) {
    if (!silent) state.pending += "$";
    state.pos += 1;
    return true;
  }

  const start = state.pos + 1;
  let match = start;
  while ((match = state.src.indexOf("$", match)) !== -1) {
    // Skip escaped \$
    let pos = match - 1;
    while (pos >= 0 && state.src[pos] === "\\") pos--;
    if ((match - pos) % 2 === 1) break;
    match += 1;
  }

  if (match === -1) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return true;
  }

  if (match - start === 0) {
    if (!silent) state.pending += "$$";
    state.pos = start + 1;
    return true;
  }

  const closeRes = isValidMathDelim(state.src, match);
  if (!closeRes.canClose) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return true;
  }

  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.markup = "$";
    token.content = state.src.slice(start, match);
  }
  state.pos = match + 1;
  return true;
}

function mathBlockRule(
  state: StateBlock,
  start: number,
  end: number,
  silent: boolean
): boolean {
  const pos = state.bMarks[start] + state.tShift[start];
  const max = state.eMarks[start];

  if (pos + 2 > max) return false;
  if (state.src.slice(pos, pos + 2) !== "$$") return false;

  const firstLine = state.src.slice(pos + 2, max);
  if (silent) return true;

  // Single-line $$ ... $$
  if (firstLine.trim().endsWith("$$") && firstLine.trim().length >= 2) {
    const trimmed = firstLine.trim();
    const content = trimmed.slice(0, -2).trim();
    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.content = content;
    token.map = [start, start + 1];
    token.markup = "$$";
    state.line = start + 1;
    return true;
  }

  let next = start;
  let found = false;
  let lastLine = "";

  while (++next < end) {
    const linePos = state.bMarks[next] + state.tShift[next];
    const lineMax = state.eMarks[next];
    if (linePos < lineMax && state.tShift[next] < state.blkIndent) break;

    const lineText = state.src.slice(linePos, lineMax);
    if (lineText.trim().endsWith("$$")) {
      const idx = lineText.lastIndexOf("$$");
      lastLine = lineText.slice(0, idx);
      found = true;
      break;
    }
  }

  const token = state.push("math_block", "math", 0);
  token.block = true;
  const middle = state.getLines(start + 1, next, state.tShift[start], true);
  token.content = [firstLine.trim(), middle.trim(), lastLine.trim()]
    .filter(Boolean)
    .join("\n");
  token.map = [start, found ? next + 1 : next];
  token.markup = "$$";
  state.line = found ? next + 1 : next;
  return true;
}

function renderKatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      output: "html",
      throwOnError: false,
      strict: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<span class="katex-error" title="${escapeHtml(msg)}">${escapeHtml(tex)}</span>`;
  }
}

function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    typographer: false,
  });

  md.inline.ruler.after("escape", "math_inline", mathInlineRule);
  md.block.ruler.after("blockquote", "math_block", mathBlockRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });

  md.renderer.rules.math_inline = (tokens, idx) =>
    renderKatex(tokens[idx].content, false);

  md.renderer.rules.math_block = (tokens, idx, _options, env) => {
    const offset = typeof env?.bodyStartLine === "number" ? env.bodyStartLine - 1 : 0;
    const line = tokens[idx].map ? tokens[idx].map[0] + 1 + offset : undefined;
    const lineAttr = line ? ` data-source-line="${line}"` : "";
    return `<div class="katex-display-wrapper"${lineAttr}>${renderKatex(
      tokens[idx].content,
      true
    )}</div>\n`;
  };

  // Task list support: transform `[ ] ` / `[x] ` at start of list items
  md.core.ruler.after("inline", "gfm_task_lists", (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      if (
        tokens[i].type === "inline" &&
        tokens[i - 1].type === "paragraph_open" &&
        tokens[i - 2].type === "list_item_open"
      ) {
        const inlineToken = tokens[i];
        const firstChild = inlineToken.children?.[0];
        if (!firstChild || firstChild.type !== "text") continue;
        const match = firstChild.content.match(/^\[([ xX])\]\s+/);
        if (!match) continue;

        const checked = match[1].toLowerCase() === "x";
        firstChild.content = firstChild.content.slice(match[0].length);

        const checkboxToken = new state.Token("html_inline", "", 0);
        checkboxToken.content = `<input type="checkbox" class="task-list-checkbox" disabled ${
          checked ? "checked" : ""
        } />`;
        inlineToken.children?.unshift(checkboxToken);
        tokens[i - 2].attrJoin("class", "task-list-item");
      }
    }
  });

  // Inject data-source-line onto block tokens for accurate bidirectional scroll sync
  const lineTrackedRules = [
    "paragraph_open",
    "heading_open",
    "blockquote_open",
    "bullet_list_open",
    "ordered_list_open",
    "list_item_open",
    "table_open",
    "tr_open",
    "hr",
  ];
  for (const ruleName of lineTrackedRules) {
    const orig =
      md.renderer.rules[ruleName] ||
      ((tokens, idx, options, _env, self) =>
        self.renderToken(tokens, idx, options));

    md.renderer.rules[ruleName] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token.map && token.level >= 0) {
        const offset = typeof env?.bodyStartLine === "number" ? env.bodyStartLine - 1 : 0;
        token.attrSet("data-source-line", String(token.map[0] + 1 + offset));
      }
      return orig(tokens, idx, options, env, self);
    };
  }

  // Fenced code blocks: Mermaid placeholder + Highlight.js syntax highlighting
  md.renderer.rules.fence = (tokens, idx, _options, env) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : "";
    const lang = info.split(/\s+/g)[0]?.toLowerCase() || "";
    const offset = typeof env?.bodyStartLine === "number" ? env.bodyStartLine - 1 : 0;
    const line = token.map ? token.map[0] + 1 + offset : undefined;
    const lineAttr = line ? ` data-source-line="${line}"` : "";

    if (lang === "mermaid") {
      const encoded = encodeURIComponent(token.content);
      return `<div class="mermaid-block"${lineAttr} data-mermaid-source="${encoded}"><div class="mermaid-loading">Rendering diagram...</div></div>\n`;
    }

    let highlighted: string;
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(token.content, {
        language: lang,
        ignoreIllegals: true,
      }).value;
    } else {
      highlighted = escapeHtml(token.content);
    }

    const langBadge = lang ? `<span class="code-lang-badge">${escapeHtml(lang)}</span>` : "";
    return `<div class="code-block-wrapper"${lineAttr}>${langBadge}<pre><code class="hljs${
      lang ? ` language-${escapeHtml(lang)}` : ""
    }">${highlighted}</code></pre></div>\n`;
  };

  // Local image resolution & clickable data attributes for quick rename
  const defaultImageRender =
    md.renderer.rules.image ||
    ((tokens: Token[], idx: number, options: MarkdownItOptions, _env: unknown, self) =>
      self.renderToken(tokens, idx, options));

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const srcIdx = token.attrIndex("src");
    if (srcIdx >= 0 && token.attrs) {
      const rawSrc = token.attrs[srcIdx][1];
      const imageMap = env?.imageMap as Record<string, LocalImageEntry> | undefined;
      const entry = lookupLocalImage(imageMap, rawSrc);
      if (entry) {
        token.attrs[srcIdx][1] = entry.assetUrl;
        token.attrSet("data-local-image", "true");
        token.attrSet("data-local-abs-path", entry.absolutePath);
        token.attrSet("data-raw-src", safeDecodeURI(rawSrc));
      } else if (!/^(https?:|data:|blob:|asset:|\/\/)/i.test(rawSrc)) {
        token.attrSet("data-raw-src", safeDecodeURI(rawSrc));
        token.attrJoin("class", "local-image-missing");
      }
    }
    return defaultImageRender(tokens, idx, options, env, self);
  };

  // External links open cleanly in browser
  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet("href") || "";
    if (/^https?:\/\//i.test(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return md;
}

const mdInstance = createMarkdownIt();

/**
 * Extracts all unique non-remote image src strings from Markdown & HTML <img> tags.
 */
export function extractLocalImageSrcs(markdownBody: string): string[] {
  const srcs = new Set<string>();
  const addIfLocal = (raw: string) => {
    const trimmed = raw.trim().replace(/^<|>$/g, "");
    if (!trimmed) return;
    if (/^(https?:|data:|blob:|asset:|\/\/)/i.test(trimmed)) return;
    srcs.add(trimmed);
  };

  // Markdown syntax ![alt](path "title")
  const mdImgRe = /!\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdImgRe.exec(markdownBody)) !== null) {
    addIfLocal(match[1]);
  }

  // Raw HTML <img src="...">
  const htmlImgRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlImgRe.exec(markdownBody)) !== null) {
    addIfLocal(match[1]);
  }

  return Array.from(srcs);
}

/**
 * Replaces raw HTML <img src="local"> attributes too (outside markdown image rule)
 */
function rewriteRawHtmlImages(
  html: string,
  imageMap?: Record<string, LocalImageEntry>
): string {
  if (!imageMap || Object.keys(imageMap).length === 0) return html;
  return html.replace(
    /<img\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>/gi,
    (full, before: string, quote: string, src: string, after: string) => {
      if (before.includes("data-local-image") || after.includes("data-local-image")) {
        return full;
      }
      const entry = lookupLocalImage(imageMap, src);
      if (!entry) return full;
      return `<img${before}src=${quote}${escapeHtml(
        entry.assetUrl
      )}${quote} data-local-image="true" data-local-abs-path="${escapeHtml(
        entry.absolutePath
      )}" data-raw-src="${escapeHtml(src)}"${after}>`;
    }
  );
}

export function renderMarkdownToHtml(
  markdownBody: string,
  options: RenderOptions = {}
): string {
  const rawHtml = mdInstance.render(markdownBody, {
    bodyStartLine: options.bodyStartLine ?? 1,
    imageMap: options.imageMap ?? {},
  });

  const withLocalHtmlImgs = rewriteRawHtmlImages(rawHtml, options.imageMap);

  return DOMPurify.sanitize(withLocalHtmlImgs, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|asset|data|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ADD_ATTR: [
      "target",
      "rel",
      "data-source-line",
      "data-mermaid-source",
      "data-local-image",
      "data-local-abs-path",
      "data-raw-src",
      "checked",
      "disabled",
      "aria-hidden",
    ],
    ADD_TAGS: ["input"],
  });
}
