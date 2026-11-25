/**
 * Lightweight, zero-Node-dependency Hexo tag preprocessor & renderer.
 * Supports core Hexo and popular theme (NexT / Butterfly) tag plugins while
 * strictly skipping fenced code blocks and inline code spans.
 */

export interface PreprocessedHexoResult {
  markdown: string;
  /** Raw blocks protected from markdown-it parsing, keyed by placeholder token */
  rawBlocks: Map<string, string>;
  /** Maps 0-based preprocessed line index -> 0-based original source line index */
  lineMap: number[];
}

const VALID_NOTE_STYLES = new Set([
  "default",
  "primary",
  "success",
  "info",
  "warning",
  "danger",
]);

const SAFE_CLASS_TOKEN_RE = /^[a-zA-Z0-9_-]+$/;
const DIMENSION_RE = /^\d+(?:px|%|vh|vw)?$/i;
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif|ico)(?:[?#].*)?$/i;
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\/[^\s"'<>]+$/i.test(url.trim());
}

function isSafeLinkHref(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(?:javascript|vbscript|data):/i.test(trimmed)) return false;
  return /^(?:https?:\/\/|\/\/|\/|\.{1,2}\/|#|mailto:)/i.test(trimmed);
}

/**
 * Splits tag arguments respecting single and double quoted segments.
 */
function tokenizeArgs(raw: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}

function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function countChar(str: string, ch: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ch) count++;
  }
  return count;
}

function longestBacktickRun(code: string): number {
  let maxRun = 0;
  const matches = code.match(/`+/g);
  if (matches) {
    for (const m of matches) {
      if (m.length > maxRun) maxRun = m.length;
    }
  }
  return maxRun;
}

/**
 * Tracks a string alongside its 0-based original source line mapping so
 * block expansions never shift `data-source-line` for subsequent headings/blocks.
 */
interface TrackedDoc {
  text: string;
  lineMap: number[];
}

function createTrackedDoc(input: string): TrackedDoc {
  const lineCount = countChar(input, "\n") + 1;
  const lineMap = new Array<number>(lineCount);
  for (let i = 0; i < lineCount; i++) {
    lineMap[i] = i;
  }
  return { text: input, lineMap };
}

function replaceTrackedSpan(
  doc: TrackedDoc,
  startIdx: number,
  endIdx: number,
  replacement: string,
  replacementLineMap?: number[]
): TrackedDoc {
  const startLine = countChar(doc.text.slice(0, startIdx), "\n");
  const spanNewlines = countChar(doc.text.slice(startIdx, endIdx), "\n");
  const endLine = startLine + spanNewlines;
  const repNewlines = countChar(replacement, "\n");

  const nextText = doc.text.slice(0, startIdx) + replacement + doc.text.slice(endIdx);

  if (spanNewlines === 0 && repNewlines === 0 && !replacementLineMap) {
    return { text: nextText, lineMap: doc.lineMap };
  }

  let repLines: number[];
  if (replacementLineMap && replacementLineMap.length === repNewlines + 1) {
    repLines = replacementLineMap;
  } else {
    repLines = new Array<number>(repNewlines + 1);
    const origStart = doc.lineMap[startLine] ?? startLine;
    const origEnd = doc.lineMap[endLine] ?? endLine;
    for (let k = 0; k <= repNewlines; k++) {
      if (k === 0) {
        repLines[k] = origStart;
      } else if (k === repNewlines) {
        repLines[k] = origEnd;
      } else {
        const mappedOffset = Math.round((k / Math.max(1, repNewlines)) * spanNewlines);
        repLines[k] = doc.lineMap[Math.min(endLine, startLine + mappedOffset)] ?? origStart;
      }
    }
  }

  const nextLineMap = [
    ...doc.lineMap.slice(0, startLine),
    ...repLines,
    ...doc.lineMap.slice(endLine + 1),
  ];

  return { text: nextText, lineMap: nextLineMap };
}

interface MaskEntry {
  placeholder: string;
  original: string;
  lineMap: number[];
}

function makePlaceholder(kind: string, index: number): string {
  return `\uE000HEXO_${kind}_${index}\uE001`;
}

/**
 * Masks fenced code blocks (``` / ~~~) and inline code spans (`...`) so Hexo tag
 * processing never touches example code.
 */
function maskCodeSegments(doc: TrackedDoc): { doc: TrackedDoc; masks: MaskEntry[] } {
  const masks: MaskEntry[] = [];
  const lines = doc.text.split("\n");
  const outLines: string[] = [];
  const outLineMap: number[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceOpen = line.match(/^[ ]{0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceOpen) {
      const marker = fenceOpen[1];
      const info = fenceOpen[2] ?? "";
      if (!(marker[0] === "`" && info.includes("`"))) {
        const start = i;
        const fenceChar = marker[0];
        const closeRe = new RegExp(`^[ ]{0,3}${fenceChar}{${marker.length},}[ \\t]*$`);
        i++;
        while (i < lines.length && !closeRe.test(lines[i])) {
          i++;
        }
        const end = i < lines.length ? i : lines.length - 1;
        const blockLines = lines.slice(start, end + 1);
        const blockMap = doc.lineMap.slice(start, end + 1);
        const placeholder = makePlaceholder("CODEBLOCK_MASK", masks.length);
        masks.push({
          placeholder,
          original: blockLines.join("\n"),
          lineMap: blockMap,
        });
        outLines.push(placeholder);
        outLineMap.push(blockMap[0] ?? start);
        i = end + 1;
        continue;
      }
    }
    outLines.push(line);
    outLineMap.push(doc.lineMap[i] ?? i);
    i++;
  }

  let text = outLines.join("\n");
  const lineMap = outLineMap;

  // Mask inline code spans (`...`, ``...``, etc.) outside fenced blocks
  let result = "";
  let pos = 0;
  while (pos < text.length) {
    if (text[pos] === "`") {
      let tickEnd = pos;
      while (tickEnd < text.length && text[tickEnd] === "`") tickEnd++;
      const tickLen = tickEnd - pos;

      // Search for matching exact-length closing backtick run (without crossing blank line)
      let search = tickEnd;
      let closeStart = -1;
      while (search < text.length) {
        if (text[search] === "\n" && text[search + 1] === "\n") {
          break;
        }
        if (text[search] === "`") {
          let runEnd = search;
          while (runEnd < text.length && text[runEnd] === "`") runEnd++;
          if (runEnd - search === tickLen) {
            closeStart = search;
            break;
          }
          search = runEnd;
          continue;
        }
        search++;
      }

      if (closeStart !== -1) {
        const spanEnd = closeStart + tickLen;
        const original = text.slice(pos, spanEnd);
        const startLine = countChar(text.slice(0, pos), "\n");
        const spanNewlines = countChar(original, "\n");
        const spanMap = lineMap.slice(startLine, startLine + spanNewlines + 1);
        const placeholder = makePlaceholder("INLINECODE_MASK", masks.length);
        masks.push({ placeholder, original, lineMap: spanMap });

        // Keep exact line count for inline code spans that wrap across a single line break
        const padNewlines = spanNewlines > 0 ? "\n".repeat(spanNewlines) : "";
        result += placeholder + padNewlines;
        if (padNewlines) {
          // Record placeholder with the same padding so restoration matches cleanly
          masks[masks.length - 1].placeholder = placeholder + padNewlines;
        }
        pos = spanEnd;
        continue;
      }

      result += text.slice(pos, tickEnd);
      pos = tickEnd;
      continue;
    }

    result += text[pos];
    pos++;
  }

  text = result;
  return { doc: { text, lineMap }, masks };
}

function restoreMasks(doc: TrackedDoc, masks: MaskEntry[]): TrackedDoc {
  let current = doc;
  // Restore in reverse order in case nested masks exist
  for (let i = masks.length - 1; i >= 0; i--) {
    const entry = masks[i];
    const idx = current.text.indexOf(entry.placeholder);
    if (idx !== -1) {
      current = replaceTrackedSpan(
        current,
        idx,
        idx + entry.placeholder.length,
        entry.original,
        entry.lineMap
      );
    }
  }
  return current;
}

/**
 * Masks `{% raw %}...{% endraw %}` so inner content is protected from both
 * Hexo tag parsing and (optionally) markdown-it parsing.
 */
function extractRawTags(
  doc: TrackedDoc,
  rawBlocks: Map<string, string>,
  preserveRawAsPlaceholders: boolean
): { doc: TrackedDoc; rawRestoreMasks: MaskEntry[] } {
  const rawRestoreMasks: MaskEntry[] = [];
  const rawRe = /\{%\s*raw\s*%\}([\s\S]*?)\{%\s*endraw\s*%\}/gi;
  let current = doc;

  while (true) {
    rawRe.lastIndex = 0;
    const match = rawRe.exec(current.text);
    if (!match) break;

    const fullStart = match.index;
    const fullEnd = fullStart + match[0].length;
    const inner = match[1];
    const startLine = countChar(current.text.slice(0, fullStart), "\n");
    const endLine = startLine + countChar(match[0], "\n");
    const origStart = current.lineMap[startLine] ?? startLine;

    const isBlockLevel =
      (fullStart === 0 || current.text[fullStart - 1] === "\n") &&
      (fullEnd === current.text.length || current.text[fullEnd] === "\n");

    const id = rawBlocks.size;
    if (preserveRawAsPlaceholders) {
      const token = isBlockLevel
        ? `<!--HEXO-RAW-BLOCK-${id}-->`
        : `HEXORAWINLINE${id}TOKEN`;
      rawBlocks.set(token, inner);
      current = replaceTrackedSpan(current, fullStart, fullEnd, token, [origStart]);
    } else {
      const placeholder = makePlaceholder("RAW_MASK", rawRestoreMasks.length);
      const innerLines = countChar(inner, "\n") + 1;
      const innerMap = new Array<number>(innerLines);
      const innerStartOffset = countChar(match[0].slice(0, match[0].indexOf(inner)), "\n");
      for (let k = 0; k < innerLines; k++) {
        innerMap[k] = current.lineMap[Math.min(endLine, startLine + innerStartOffset + k)] ?? origStart;
      }
      rawRestoreMasks.push({ placeholder, original: inner, lineMap: innerMap });
      current = replaceTrackedSpan(current, fullStart, fullEnd, placeholder, [origStart]);
    }
  }

  return { doc: current, rawRestoreMasks };
}

function parseCodeblockArgs(rawArgs: string): {
  title: string;
  lang: string;
  url: string;
  linkText: string;
} {
  let working = rawArgs.trim();
  let lang = "";

  const langMatch = working.match(/(?:^|\s)lang:([^\s]+)/i);
  if (langMatch) {
    lang = langMatch[1].trim().replace(/[^a-zA-Z0-9_+-]/g, "");
    working = (working.slice(0, langMatch.index) + working.slice((langMatch.index ?? 0) + langMatch[0].length)).trim();
  }

  // Strip additional Hexo codeblock options like mark:1,2 line_number:false first_line:10 wrap:false
  working = working
    .replace(/(?:^|\s)(?:line_number|highlight|first_line|mark|wrap|line_threshold|caption):[^\s]+/gi, "")
    .trim();

  let url = "";
  let title = "";
  let linkText = "";

  const urlMatch = working.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch && urlMatch.index !== undefined) {
    url = urlMatch[1];
    title = stripMatchingQuotes(working.slice(0, urlMatch.index).trim());
    linkText = stripMatchingQuotes(working.slice(urlMatch.index + url.length).trim());
  } else {
    title = stripMatchingQuotes(working);
  }

  return { title, lang, url, linkText };
}

function restoreRawMaskText(text: string, masks: MaskEntry[]): string {
  let out = text;
  for (let i = masks.length - 1; i >= 0; i--) {
    const entry = masks[i];
    if (out.includes(entry.placeholder)) {
      out = out.replace(entry.placeholder, () => entry.original);
    }
  }
  return out;
}

function processCodeblockTags(
  doc: TrackedDoc,
  codeMasks: MaskEntry[],
  priorCodeMasks: MaskEntry[]
): TrackedDoc {
  const codeblockRe = /\{%\s*(codeblock|code)(?:\s+([^%]*?))?\s*%\}([\s\S]*?)\{%\s*end\1\s*%\}/gi;
  let current = doc;

  while (true) {
    codeblockRe.lastIndex = 0;
    const match = codeblockRe.exec(current.text);
    if (!match) break;

    const fullStart = match.index;
    const fullEnd = fullStart + match[0].length;
    const rawArgs = match[2] ?? "";
    // Restore any masked fenced/inline code inside codeblock so backtick fence length is computed accurately
    const rawCode = restoreRawMaskText(match[3] ?? "", priorCodeMasks);

    // Trim leading/trailing single newline introduced by tag delimiters
    const code = rawCode.replace(/^\n/, "").replace(/\n$/, "");
    const { title, lang, url, linkText } = parseCodeblockArgs(rawArgs);
    const fence = "`".repeat(Math.max(3, longestBacktickRun(code) + 1));
    const fencedBlock = `${fence}${lang}\n${code}\n${fence}`;

    const startLine = countChar(current.text.slice(0, fullStart), "\n");
    const endLine = startLine + countChar(match[0], "\n");
    const origStart = current.lineMap[startLine] ?? startLine;
    const origEnd = current.lineMap[endLine] ?? endLine;

    let rendered: string;
    if (title || url) {
      const headerParts: string[] = [];
      if (title) {
        headerParts.push(`<span class="hexo-codeblock-title">${escapeHtml(title)}</span>`);
      }
      if (url && isSafeHttpUrl(url)) {
        const label = linkText || url;
        headerParts.push(
          `<a class="hexo-codeblock-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
        );
      }
      rendered =
        `<figure class="hexo-codeblock">\n` +
        `<figcaption class="hexo-codeblock-header">${headerParts.join("")}</figcaption>\n\n` +
        `${fencedBlock}\n\n` +
        `</figure>`;
    } else {
      rendered = fencedBlock;
    }

    const repLines = countChar(rendered, "\n") + 1;
    const repMap = new Array<number>(repLines);
    for (let k = 0; k < repLines; k++) {
      if (k === 0) repMap[k] = origStart;
      else if (k === repLines - 1) repMap[k] = origEnd;
      else {
        const offset = Math.round((k / Math.max(1, repLines - 1)) * (endLine - startLine));
        repMap[k] = current.lineMap[Math.min(endLine, startLine + offset)] ?? origStart;
      }
    }

    // Mask the generated codeblock so inner `{% ... %}` inside code is never expanded
    const placeholder = makePlaceholder("HEXO_CODEBLOCK", codeMasks.length);
    codeMasks.push({ placeholder, original: rendered, lineMap: repMap });
    current = replaceTrackedSpan(current, fullStart, fullEnd, placeholder, [origStart]);
  }

  return current;
}

function buildWrappedBlockReplacement(
  openHtml: string,
  closeHtml: string,
  inner: string,
  doc: TrackedDoc,
  fullStart: number,
  fullMatch: string,
  innerOffsetInMatch: number
): { replacement: string; lineMap: number[] } {
  const startLine = countChar(doc.text.slice(0, fullStart), "\n");
  const endLine = startLine + countChar(fullMatch, "\n");
  const origStart = doc.lineMap[startLine] ?? startLine;
  const origEnd = doc.lineMap[endLine] ?? endLine;

  const trimmedInner = inner.replace(/^\n+/, "").replace(/\n+$/, "");
  const leadingTrimmedNewlines = inner.length - inner.replace(/^\n+/, "").length;
  const innerBaseLine =
    startLine + countChar(fullMatch.slice(0, innerOffsetInMatch), "\n") + leadingTrimmedNewlines;

  const openLines = openHtml.split("\n");
  const closeLines = closeHtml.split("\n");
  const innerLines = trimmedInner ? trimmedInner.split("\n") : [];

  const replacement = trimmedInner
    ? `${openHtml}\n\n${trimmedInner}\n\n${closeHtml}`
    : `${openHtml}\n${closeHtml}`;

  const lineMap: number[] = [];
  for (let i = 0; i < openLines.length; i++) {
    lineMap.push(origStart);
  }
  if (trimmedInner) {
    // Blank separator line after opening tag
    lineMap.push(origStart);
    for (let i = 0; i < innerLines.length; i++) {
      lineMap.push(doc.lineMap[Math.min(endLine, innerBaseLine + i)] ?? origStart);
    }
    // Blank separator line before closing tag
    lineMap.push(origEnd);
  }
  for (let i = 0; i < closeLines.length; i++) {
    lineMap.push(origEnd);
  }

  return { replacement, lineMap };
}

function processNoteTags(doc: TrackedDoc): TrackedDoc {
  const noteRe = /\{%\s*note(?:\s+([^%]*?))?\s*%\}([\s\S]*?)\{%\s*endnote\s*%\}/gi;
  let current = doc;

  while (true) {
    noteRe.lastIndex = 0;
    const match = noteRe.exec(current.text);
    if (!match) break;

    const fullStart = match.index;
    const fullEnd = fullStart + match[0].length;
    const args = tokenizeArgs(match[1] ?? "");
    const inner = match[2] ?? "";

    let style = "default";
    let noIcon = false;
    for (const token of args) {
      const lower = token.toLowerCase();
      if (VALID_NOTE_STYLES.has(lower)) {
        style = lower;
      } else if (lower === "no-icon") {
        noIcon = true;
      }
    }

    const classes = `hexo-note hexo-note-${style}${noIcon ? " no-icon" : ""}`;
    const openHtml = `<div class="${classes}">`;
    const closeHtml = `</div>`;
    const innerOffset = match[0].indexOf(inner, match[0].indexOf("%}") + 2);
    const { replacement, lineMap } = buildWrappedBlockReplacement(
      openHtml,
      closeHtml,
      inner,
      current,
      fullStart,
      match[0],
      innerOffset
    );

    current = replaceTrackedSpan(current, fullStart, fullEnd, replacement, lineMap);
  }

  return current;
}

function parseBlockquoteArgs(rawArgs: string): {
  author: string;
  source: string;
  link: string;
} {
  const trimmed = rawArgs.trim();
  if (!trimmed) {
    return { author: "", source: "", link: "" };
  }

  const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch && urlMatch.index !== undefined) {
    const link = urlMatch[1];
    const author = trimmed.slice(0, urlMatch.index).trim().replace(/,\s*$/, "");
    let source = trimmed.slice(urlMatch.index + link.length).trim();
    if (!source) {
      try {
        const parsed = new URL(link);
        source = parsed.host + (parsed.pathname !== "/" ? parsed.pathname : "");
      } catch {
        source = link;
      }
    }
    return { author, source, link };
  }

  const commaIdx = trimmed.indexOf(",");
  if (commaIdx !== -1) {
    const author = trimmed.slice(0, commaIdx).trim();
    const source = trimmed.slice(commaIdx + 1).trim();
    return { author, source, link: "" };
  }

  return { author: trimmed, source: "", link: "" };
}

function processBlockquoteTags(doc: TrackedDoc): TrackedDoc {
  const bqRe = /\{%\s*(blockquote|quote)(?:\s+([^%]*?))?\s*%\}([\s\S]*?)\{%\s*end\1\s*%\}/gi;
  let current = doc;

  while (true) {
    bqRe.lastIndex = 0;
    const match = bqRe.exec(current.text);
    if (!match) break;

    const fullStart = match.index;
    const fullEnd = fullStart + match[0].length;
    const inner = match[3] ?? "";
    const { author, source, link } = parseBlockquoteArgs(match[2] ?? "");

    let footerHtml = "";
    if (author || source || link) {
      const parts: string[] = [];
      if (author) {
        parts.push(`<strong>${escapeHtml(author)}</strong>`);
      }
      if (link && isSafeHttpUrl(link)) {
        parts.push(
          `<cite><a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source || link)}</a></cite>`
        );
      } else if (source) {
        parts.push(`<cite>${escapeHtml(source)}</cite>`);
      }
      footerHtml = `<footer class="hexo-blockquote-footer">${parts.join("")}</footer>\n`;
    }

    const openHtml = `<blockquote class="hexo-blockquote">`;
    const closeHtml = `${footerHtml}</blockquote>`;
    const innerOffset = match[0].indexOf(inner, match[0].indexOf("%}") + 2);
    const { replacement, lineMap } = buildWrappedBlockReplacement(
      openHtml,
      closeHtml,
      inner,
      current,
      fullStart,
      match[0],
      innerOffset
    );

    current = replaceTrackedSpan(current, fullStart, fullEnd, replacement, lineMap);
  }

  return current;
}

function processPullquoteTags(doc: TrackedDoc): TrackedDoc {
  const pqRe = /\{%\s*pullquote(?:\s+([^%]*?))?\s*%\}([\s\S]*?)\{%\s*endpullquote\s*%\}/gi;
  let current = doc;

  while (true) {
    pqRe.lastIndex = 0;
    const match = pqRe.exec(current.text);
    if (!match) break;

    const fullStart = match.index;
    const fullEnd = fullStart + match[0].length;
    const extraClasses = tokenizeArgs(match[1] ?? "").filter((t) =>
      SAFE_CLASS_TOKEN_RE.test(t)
    );
    const classList = ["pullquote", "hexo-pullquote", ...extraClasses].join(" ");
    const inner = match[2] ?? "";

    const openHtml = `<blockquote class="${classList}">`;
    const closeHtml = `</blockquote>`;
    const innerOffset = match[0].indexOf(inner, match[0].indexOf("%}") + 2);
    const { replacement, lineMap } = buildWrappedBlockReplacement(
      openHtml,
      closeHtml,
      inner,
      current,
      fullStart,
      match[0],
      innerOffset
    );

    current = replaceTrackedSpan(current, fullStart, fullEnd, replacement, lineMap);
  }

  return current;
}

function processTabsTags(doc: TrackedDoc): TrackedDoc {
  const tabsRe = /\{%\s*tabs(?:\s+([^%]*?))?\s*%\}([\s\S]*?)\{%\s*endtabs\s*%\}/gi;
  const tabItemRe = /<!--\s*tab(?:\s+([\s\S]*?))?\s*-->([\s\S]*?)<!--\s*endtab\s*-->/gi;
  let current = doc;
  let tabGroupSeq = 0;

  while (true) {
    tabsRe.lastIndex = 0;
    const match = tabsRe.exec(current.text);
    if (!match) break;

    const fullStart = match.index;
    const fullEnd = fullStart + match[0].length;
    const rawArgs = (match[1] ?? "").trim();
    const body = match[2] ?? "";

    const argParts = rawArgs.split(",").map((s) => s.trim());
    const rawName = stripMatchingQuotes(argParts[0] || `tabs-${++tabGroupSeq}`);
    const safeName = rawName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, "-") || `tabs-${tabGroupSeq}`;
    const parsedActive = argParts[1] ? Number.parseInt(argParts[1], 10) : 1;

    const tabs: Array<{ title: string; content: string; contentOffset: number }> = [];
    const bodyOffset = match[0].indexOf(body, match[0].indexOf("%}") + 2);
    tabItemRe.lastIndex = 0;
    let tabMatch: RegExpExecArray | null;
    while ((tabMatch = tabItemRe.exec(body)) !== null) {
      let rawTitle = stripMatchingQuotes((tabMatch[1] ?? "").trim());
      // Support NexT `Title@icon-name` syntax by extracting title cleanly
      if (rawTitle.includes("@")) {
        const [beforeAt] = rawTitle.split("@");
        if (beforeAt.trim()) {
          rawTitle = beforeAt.trim();
        }
      }
      const title = rawTitle || `${rawName} ${tabs.length + 1}`;
      const content = tabMatch[2] ?? "";
      const contentOffset =
        bodyOffset + tabMatch.index + tabMatch[0].indexOf(content, tabMatch[0].indexOf("-->") + 3);
      tabs.push({ title, content, contentOffset });
    }

    if (tabs.length === 0) {
      // No valid <!-- tab --> children; strip wrapper safely
      const innerOffset = bodyOffset;
      const { replacement, lineMap } = buildWrappedBlockReplacement(
        `<div class="hexo-tabs" data-hexo-tabs="${escapeHtml(safeName)}">`,
        `</div>`,
        body,
        current,
        fullStart,
        match[0],
        innerOffset
      );
      current = replaceTrackedSpan(current, fullStart, fullEnd, replacement, lineMap);
      continue;
    }

    // Hexo NexT/Butterfly active index is 1-based; clamp safely to [0, tabs.length - 1]
    const activeIndex =
      Number.isFinite(parsedActive) && parsedActive >= 1
        ? Math.min(parsedActive - 1, tabs.length - 1)
        : 0;

    const startLine = countChar(current.text.slice(0, fullStart), "\n");
    const endLine = startLine + countChar(match[0], "\n");
    const origStart = current.lineMap[startLine] ?? startLine;
    const origEnd = current.lineMap[endLine] ?? endLine;

    const outLines: string[] = [];
    const outMap: number[] = [];

    const pushMetaLine = (lineText: string, origLine: number) => {
      outLines.push(lineText);
      outMap.push(origLine);
    };

    pushMetaLine(`<div class="hexo-tabs" data-hexo-tabs="${escapeHtml(safeName)}">`, origStart);
    pushMetaLine(`<div class="hexo-tabs-nav" role="tablist">`, origStart);
    tabs.forEach((tab, idx) => {
      const isActive = idx === activeIndex;
      const activeClasses = isActive ? " is-active active" : "";
      pushMetaLine(
        `<button type="button" class="hexo-tab-btn${activeClasses}" role="tab" aria-selected="${
          isActive ? "true" : "false"
        }" data-tab-index="${idx}">${escapeHtml(tab.title)}</button>`,
        origStart
      );
    });
    pushMetaLine(`</div>`, origStart);
    pushMetaLine(`<div class="hexo-tabs-content">`, origStart);

    tabs.forEach((tab, idx) => {
      const isActive = idx === activeIndex;
      const activeClasses = isActive ? " is-active active" : "";
      const hiddenAttr = isActive ? "" : " hidden";
      const trimmedContent = tab.content.replace(/^\n+/, "").replace(/\n+$/, "");
      const leadTrim = tab.content.length - tab.content.replace(/^\n+/, "").length;
      const contentBaseLine =
        startLine + countChar(match[0].slice(0, tab.contentOffset), "\n") + leadTrim;
      const panelStartOrig = current.lineMap[Math.min(endLine, contentBaseLine)] ?? origStart;

      pushMetaLine(
        `<div class="hexo-tab-panel${activeClasses}" role="tabpanel" data-tab-panel="${idx}"${hiddenAttr}>`,
        panelStartOrig
      );
      if (trimmedContent) {
        pushMetaLine("", panelStartOrig);
        const contentLines = trimmedContent.split("\n");
        for (let i = 0; i < contentLines.length; i++) {
          const origLine = current.lineMap[Math.min(endLine, contentBaseLine + i)] ?? panelStartOrig;
          outLines.push(contentLines[i]);
          outMap.push(origLine);
        }
        pushMetaLine("", outMap[outMap.length - 1] ?? panelStartOrig);
      }
      pushMetaLine(`</div>`, outMap[outMap.length - 1] ?? origEnd);
    });

    pushMetaLine(`</div>`, origEnd);
    pushMetaLine(`</div>`, origEnd);

    current = replaceTrackedSpan(current, fullStart, fullEnd, outLines.join("\n"), outMap);
  }

  return current;
}

function parseAssetImgArgs(rawArgs: string): {
  classes: string[];
  slug: string;
  title: string;
} | null {
  const tokens = tokenizeArgs(rawArgs);
  if (tokens.length === 0) return null;

  let slugIdx = 0;
  // If first token doesn't look like a file/path, look for a subsequent image-like token (Hexo class prefix support)
  if (!tokens[0].includes(".") && !tokens[0].includes("/")) {
    const foundIdx = tokens.findIndex(
      (t, i) => i > 0 && (IMAGE_EXT_RE.test(t) || t.includes("/"))
    );
    if (foundIdx !== -1) {
      slugIdx = foundIdx;
    }
  }

  const classes = tokens.slice(0, slugIdx).filter((t) => SAFE_CLASS_TOKEN_RE.test(t));
  const slug = tokens[slugIdx]?.trim() ?? "";
  if (!slug) return null;
  const title = tokens.slice(slugIdx + 1).join(" ").trim();
  return { classes, slug, title };
}

function parseHexoImgArgs(rawArgs: string): {
  classes: string[];
  src: string;
  width: string;
  height: string;
  title: string;
  alt: string;
} | null {
  const tokens = tokenizeArgs(rawArgs);
  if (tokens.length === 0) return null;

  const isUrlOrPath = (t: string) =>
    /^(?:https?:\/\/|\/\/|\/|\.{1,2}\/|data:|blob:)/i.test(t) ||
    IMAGE_EXT_RE.test(t) ||
    t.includes("/");

  let srcIdx = tokens.findIndex(isUrlOrPath);
  if (srcIdx === -1) {
    srcIdx = 0;
  }

  const classes = tokens.slice(0, srcIdx).filter((t) => SAFE_CLASS_TOKEN_RE.test(t));
  const src = tokens[srcIdx]?.trim() ?? "";
  if (!src) return null;

  let cursor = srcIdx + 1;
  let width = "";
  let height = "";

  if (cursor < tokens.length && DIMENSION_RE.test(tokens[cursor])) {
    width = tokens[cursor].replace(/px$/i, "");
    cursor++;
    if (cursor < tokens.length && DIMENSION_RE.test(tokens[cursor])) {
      height = tokens[cursor].replace(/px$/i, "");
      cursor++;
    }
  }

  const rest = tokens.slice(cursor);
  let title = "";
  let alt = "";
  if (rest.length === 2 && rawArgs.includes('"')) {
    title = rest[0];
    alt = rest[1];
  } else if (rest.length > 0) {
    title = rest.join(" ");
    alt = title;
  }

  return { classes, src, width, height, title, alt };
}

function renderInlineImageTag(params: {
  src: string;
  classes: string[];
  width?: string;
  height?: string;
  title?: string;
  alt?: string;
}): string {
  const { src, classes, width, height, title, alt } = params;
  // Reject unsafe schemes
  if (/^(?:javascript|vbscript):/i.test(src.trim())) {
    return escapeHtml(alt || title || src);
  }

  // If there are no extra classes/dimensions, emit standard Markdown image with angle brackets
  // so markdown-it's native image pipeline handles CJK/spaces & local asset resolution seamlessly.
  if (classes.length === 0 && !width && !height) {
    const safeAlt = (alt || title || "").replace(/[[\]]/g, "");
    const safeTitle = title ? ` "${title.replace(/"/g, '\\"')}"` : "";
    return `![${safeAlt}](<${src}>${safeTitle})`;
  }

  const attrs: string[] = [`src="${escapeHtml(src)}"`];
  if (classes.length > 0) {
    attrs.push(`class="${escapeHtml(classes.join(" "))}"`);
  }
  if (width) {
    attrs.push(`width="${escapeHtml(width)}"`);
  }
  if (height) {
    attrs.push(`height="${escapeHtml(height)}"`);
  }
  attrs.push(`alt="${escapeHtml(alt || title || "")}"`);
  if (title) {
    attrs.push(`title="${escapeHtml(title)}"`);
  }
  return `<img ${attrs.join(" ")} />`;
}

function extractYouTubeId(raw: string): string | null {
  const trimmed = stripMatchingQuotes(raw).trim();
  if (!trimmed) return null;
  if (YOUTUBE_ID_RE.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      const v = parsed.searchParams.get("v") ?? parsed.searchParams.get("list") ?? "";
      if (YOUTUBE_ID_RE.test(v)) return v;
      const segs = parsed.pathname.split("/").filter(Boolean);
      const last = segs[segs.length - 1] ?? "";
      return YOUTUBE_ID_RE.test(last) ? last : null;
    }
  } catch {
    return null;
  }
  return null;
}

function processInlineHexoTags(doc: TrackedDoc): TrackedDoc {
  let text = doc.text;

  // {% asset_img [class] slug [title] %}
  text = text.replace(/\{%\s*asset_img\s+([^%]+?)\s*%\}/gi, (full, rawArgs: string) => {
    const parsed = parseAssetImgArgs(rawArgs);
    if (!parsed) return full;
    return renderInlineImageTag({
      src: parsed.slug,
      classes: parsed.classes,
      title: parsed.title,
      alt: parsed.title || parsed.slug,
    });
  });

  // {% img [class] src [w] [h] [title] %}
  text = text.replace(/\{%\s*img\s+([^%]+?)\s*%\}/gi, (full, rawArgs: string) => {
    const parsed = parseHexoImgArgs(rawArgs);
    if (!parsed) return full;
    return renderInlineImageTag(parsed);
  });

  // {% link text url [external] [title] %}
  text = text.replace(/\{%\s*link\s+([^%]+?)\s*%\}/gi, (full, rawArgs: string) => {
    const tokens = tokenizeArgs(rawArgs);
    if (tokens.length === 0) return full;

    const urlIdx = tokens.findIndex((t) =>
      /^(?:https?:\/\/|\/\/|\/|\.{1,2}\/|#|mailto:|javascript:|vbscript:|data:)/i.test(t)
    );
    if (urlIdx === -1) return full;

    const label = tokens.slice(0, urlIdx).join(" ").trim();
    const url = tokens[urlIdx].trim();
    if (!isSafeLinkHref(url)) {
      return escapeHtml(label || url);
    }

    let restStart = urlIdx + 1;
    let external = /^https?:\/\//i.test(url);
    if (restStart < tokens.length) {
      const flag = tokens[restStart].toLowerCase();
      if (flag === "true" || flag === "false") {
        external = flag === "true";
        restStart++;
      }
    }
    const title = tokens.slice(restStart).join(" ").trim();

    const attrs = [`class="hexo-link"`, `href="${escapeHtml(url)}"`];
    if (external) {
      attrs.push(`target="_blank"`, `rel="noopener noreferrer"`);
    }
    if (title) {
      attrs.push(`title="${escapeHtml(title)}"`);
    }
    return `<a ${attrs.join(" ")}>${escapeHtml(label || url)}</a>`;
  });

  // {% iframe url [width] [height] %}
  text = text.replace(/\{%\s*iframe\s+([^%]+?)\s*%\}/gi, (full, rawArgs: string) => {
    const tokens = tokenizeArgs(rawArgs);
    if (tokens.length === 0) return full;

    const url = tokens[0].trim();
    if (!isSafeHttpUrl(url)) {
      return `<div class="hexo-iframe-blocked">Blocked unsafe iframe URL: ${escapeHtml(url)}</div>`;
    }

    const rawWidth = tokens[1]?.trim() ?? "100%";
    const rawHeight = tokens[2]?.trim() ?? "300";
    const width = DIMENSION_RE.test(rawWidth) ? rawWidth.replace(/px$/i, "") : "100%";
    const height = DIMENSION_RE.test(rawHeight) ? rawHeight.replace(/px$/i, "") : "300";

    return `<div class="hexo-iframe-wrapper"><iframe src="${escapeHtml(url)}" width="${escapeHtml(
      width
    )}" height="${escapeHtml(
      height
    )}" frameborder="0" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allowfullscreen></iframe></div>`;
  });

  // {% youtube video_id [type] [cookie] %}
  text = text.replace(/\{%\s*youtube\s+([^%]+?)\s*%\}/gi, (full, rawArgs: string) => {
    const tokens = tokenizeArgs(rawArgs);
    if (tokens.length === 0) return full;

    const videoId = extractYouTubeId(tokens[0]);
    if (!videoId) {
      return `<div class="hexo-youtube-invalid">Invalid YouTube ID: ${escapeHtml(tokens[0])}</div>`;
    }

    const type = tokens[1]?.toLowerCase() === "playlist" ? "playlist" : "video";
    const watchUrl =
      type === "playlist"
        ? `https://www.youtube.com/playlist?list=${encodeURIComponent(videoId)}`
        : `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

    return (
      `<div class="hexo-youtube-card" data-youtube-id="${escapeHtml(videoId)}">` +
      `<a class="hexo-youtube-link" href="${escapeHtml(
        watchUrl
      )}" target="_blank" rel="noopener noreferrer">` +
      `<span class="hexo-youtube-badge">YouTube</span>` +
      `<span class="hexo-youtube-id">${escapeHtml(videoId)}</span>` +
      `<span class="hexo-youtube-action">Open ↗</span>` +
      `</a></div>`
    );
  });

  return { text, lineMap: doc.lineMap };
}

/**
 * Internal preprocessor used by `renderer.ts`: protects `{% raw %}` blocks via
 * placeholders (restored after markdown-it) and returns the exact source line map.
 */
export function preprocessHexoTagsWithMeta(markdownBody: string): PreprocessedHexoResult {
  const rawBlocks = new Map<string, string>();
  const initialDoc = createTrackedDoc(markdownBody);

  // 1. Protect fenced code blocks and inline code spans
  const { doc: codeMaskedDoc, masks: codeMasks } = maskCodeSegments(initialDoc);

  // 2. Protect {% raw %}...{% endraw %}
  const { doc: rawProtectedDoc } = extractRawTags(codeMaskedDoc, rawBlocks, true);

  // 3. Process {% codeblock %} (and mask output so inner tags are never expanded)
  const hexoCodeblockMasks: MaskEntry[] = [];
  let working = processCodeblockTags(rawProtectedDoc, hexoCodeblockMasks, codeMasks);

  // 4. Process container tags (tabs -> note -> blockquote -> pullquote)
  working = processTabsTags(working);
  working = processNoteTags(working);
  working = processBlockquoteTags(working);
  working = processPullquoteTags(working);

  // 5. Process inline/leaf tags
  working = processInlineHexoTags(working);

  // 6. Restore masked codeblocks and original code segments (including inside rawBlocks)
  working = restoreMasks(working, hexoCodeblockMasks);
  working = restoreMasks(working, codeMasks);
  for (const [token, rawContent] of rawBlocks.entries()) {
    rawBlocks.set(token, restoreRawMaskText(rawContent, codeMasks));
  }

  return {
    markdown: working.text,
    rawBlocks,
    lineMap: working.lineMap,
  };
}

/**
 * Pure Hexo tag preprocessor suitable for standalone use or unit testing.
 * Strictly skips fenced code blocks and inline code spans, and preserves
 * `{% raw %}...{% endraw %}` content without expanding inner Hexo tags.
 */
export function preprocessHexoTags(markdownBody: string): string {
  const initialDoc = createTrackedDoc(markdownBody);

  // 1. Protect fenced code blocks and inline code spans
  const { doc: codeMaskedDoc, masks: codeMasks } = maskCodeSegments(initialDoc);

  // 2. Protect {% raw %}...{% endraw %} (restored verbatim at end)
  const rawBlocks = new Map<string, string>();
  const { doc: rawProtectedDoc, rawRestoreMasks } = extractRawTags(
    codeMaskedDoc,
    rawBlocks,
    false
  );

  // 3. Process {% codeblock %}
  const hexoCodeblockMasks: MaskEntry[] = [];
  let working = processCodeblockTags(rawProtectedDoc, hexoCodeblockMasks, codeMasks);

  // 4. Process container tags
  working = processTabsTags(working);
  working = processNoteTags(working);
  working = processBlockquoteTags(working);
  working = processPullquoteTags(working);

  // 5. Process inline/leaf tags
  working = processInlineHexoTags(working);

  // 6. Restore codeblocks, raw blocks, and original code segments
  working = restoreMasks(working, hexoCodeblockMasks);
  working = restoreMasks(working, rawRestoreMasks);
  working = restoreMasks(working, codeMasks);

  return working.text;
}

/**
 * Extracts local image paths declared via Hexo `{% asset_img %}` and `{% img %}` tags,
 * skipping fenced code blocks, inline code spans, and `{% raw %}` / `{% codeblock %}` blocks.
 */
export function extractHexoTagImageSrcs(markdownBody: string): string[] {
  const initialDoc = createTrackedDoc(markdownBody);
  const { doc: codeMaskedDoc, masks: codeMasks } = maskCodeSegments(initialDoc);
  const rawBlocks = new Map<string, string>();
  const { doc: rawProtectedDoc } = extractRawTags(codeMaskedDoc, rawBlocks, true);
  const hexoCodeblockMasks: MaskEntry[] = [];
  const activeText = processCodeblockTags(
    rawProtectedDoc,
    hexoCodeblockMasks,
    codeMasks
  ).text;

  const srcs = new Set<string>();
  const addIfLocal = (raw: string) => {
    const trimmed = raw.trim().replace(/^<|>$/g, "");
    if (!trimmed) return;
    if (/^(?:https?:|data:|blob:|asset:|javascript:|vbscript:|\/\/)/i.test(trimmed)) return;
    srcs.add(trimmed);
  };

  const assetImgRe = /\{%\s*asset_img\s+([^%]+?)\s*%\}/gi;
  let match: RegExpExecArray | null;
  while ((match = assetImgRe.exec(activeText)) !== null) {
    const parsed = parseAssetImgArgs(match[1]);
    if (parsed) addIfLocal(parsed.slug);
  }

  const hexoImgRe = /\{%\s*img\s+([^%]+?)\s*%\}/gi;
  while ((match = hexoImgRe.exec(activeText)) !== null) {
    const parsed = parseHexoImgArgs(match[1]);
    if (parsed) addIfLocal(parsed.src);
  }

  return Array.from(srcs);
}
