function safeDecode(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
}

function encodePathSegments(value: string): string {
  return value
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function normalizeCandidate(value: string): string {
  return value.trim().replace(/^<|>$/g, "").trim();
}

function stripLeadingDotSlash(value: string): string {
  return value.replace(/^\.\//, "");
}

function buildNormalizedVariantSet(rawSrc: string): Set<string> {
  const set = new Set<string>();
  const base = normalizeCandidate(rawSrc);
  if (!base) return set;

  const decoded = safeDecode(base);
  const candidates = [
    base,
    decoded,
    stripLeadingDotSlash(base),
    stripLeadingDotSlash(decoded),
    encodeURI(decoded),
    encodePathSegments(decoded),
    encodePathSegments(stripLeadingDotSlash(decoded)),
  ];

  for (const c of candidates) {
    if (c) set.add(c);
  }
  return set;
}

function matchesVariant(candidate: string, variantSet: Set<string>): boolean {
  const clean = normalizeCandidate(candidate);
  if (!clean) return false;
  if (variantSet.has(clean)) return true;
  if (variantSet.has(stripLeadingDotSlash(clean))) return true;
  const decoded = safeDecode(clean);
  if (variantSet.has(decoded)) return true;
  if (variantSet.has(stripLeadingDotSlash(decoded))) return true;
  return false;
}

function formatMarkdownTarget(url: string): string {
  const clean = url.trim();
  if (/[\s()]/.test(clean)) {
    return `<${clean}>`;
  }
  return clean;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitByFencedCodeBlocks(
  markdown: string
): Array<{ text: string; isCode: boolean }> {
  const lines = markdown.split("\n");
  const segments: Array<{ text: string; isCode: boolean }> = [];
  let buf: string[] = [];
  let inFence: { char: string; len: number } | null = null;

  const flush = (isCode: boolean) => {
    if (buf.length > 0) {
      segments.push({ text: buf.join("\n"), isCode });
      buf = [];
    }
  };

  for (const line of lines) {
    if (!inFence) {
      const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
      if (fenceMatch) {
        const marker = fenceMatch[1];
        const info = fenceMatch[2] ?? "";
        // CommonMark: info strings for backtick code fences cannot contain backticks (e.g. ```inline```)
        if (marker[0] === "`" && info.includes("`")) {
          buf.push(line);
          continue;
        }
        flush(false);
        inFence = { char: marker[0], len: marker.length };
        buf.push(line);
      } else {
        buf.push(line);
      }
    } else {
      buf.push(line);
      const closeRe = new RegExp(`^\\s{0,3}${inFence.char}{${inFence.len},}\\s*$`);
      if (closeRe.test(line)) {
        flush(true);
        inFence = null;
      }
    }
  }
  flush(Boolean(inFence));
  return segments;
}

function replaceInPlainMarkdownSegment(
  segment: string,
  variantSet: Set<string>,
  targetUrl: string
): { text: string; count: number } {
  let count = 0;
  const formattedTarget = formatMarkdownTarget(targetUrl);

  // 1. Standard Markdown images: ![alt](src "title") or ![alt](<src> "title")
  let text = segment.replace(
    /!\[([^\]]*)\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(\s+(?:"[^"]*"|'[^']*'))?\s*\)/g,
    (full, alt: string, angleSrc?: string, bareSrc?: string, titlePart = "") => {
      const src = angleSrc ?? bareSrc ?? "";
      if (!matchesVariant(src, variantSet)) return full;
      count++;
      return `![${alt}](${formattedTarget}${titlePart})`;
    }
  );

  // 2. Reference link definitions: [ref]: src
  text = text.replace(
    /^(\s*\[[^\]]+\]:\s*)(?:<([^>\n]+)>|(\S+))(.*)$/gm,
    (full, prefix: string, angleSrc?: string, bareSrc?: string, rest = "") => {
      const src = angleSrc ?? bareSrc ?? "";
      if (!matchesVariant(src, variantSet)) return full;
      count++;
      return `${prefix}${formattedTarget}${rest}`;
    }
  );

  // 3. HTML <img ... src="...">
  text = text.replace(
    /<img\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>/gi,
    (full, before: string, quote: string, src: string, after: string) => {
      if (!matchesVariant(src, variantSet)) return full;
      count++;
      return `<img${before}src=${quote}${targetUrl}${quote}${after}>`;
    }
  );

  // 4. Hexo {% asset_img [class...] slug [title] %}
  text = text.replace(
    /\{%\s*asset_img\s+([^%]+?)\s*%\}/gi,
    (full, rawArgs: string) => {
      const trimmed = rawArgs.trim();
      if (!trimmed) return full;

      // Match longest variant either at start or after optional CSS class prefix tokens
      const sortedVariants = Array.from(variantSet).sort((a, b) => b.length - a.length);
      for (const variant of sortedVariants) {
        const quotedRe = new RegExp(
          `^(?:(?:[a-zA-Z_-][\\w-]*\\s+)*)?["']${escapeRegExp(variant)}["'](?:\\s+(.*))?$`
        );
        const quotedMatch = trimmed.match(quotedRe);
        if (quotedMatch) {
          const title = (quotedMatch[1] ?? "").trim().replace(/^["']|["']$/g, "");
          count++;
          return `![${title}](${formattedTarget})`;
        }

        const bareRe = new RegExp(
          `^(?:(?:[a-zA-Z_-][\\w-]*\\s+)*)?${escapeRegExp(variant)}(?:\\s+(.*))?$`
        );
        const bareMatch = trimmed.match(bareRe);
        if (bareMatch) {
          const title = (bareMatch[1] ?? "").trim().replace(/^["']|["']$/g, "");
          count++;
          return `![${title}](${formattedTarget})`;
        }
      }
      return full;
    }
  );

  // 5. Hexo {% img [class...] /path/to/img [width] [height] [title] %}
  text = text.replace(
    /\{%\s*img\s+([^%]+?)\s*%\}/gi,
    (full, rawArgs: string) => {
      const sortedVariants = Array.from(variantSet).sort((a, b) => b.length - a.length);
      for (const variant of sortedVariants) {
        const re = new RegExp(
          `(^|\\s)(["']?)${escapeRegExp(variant)}\\2(?=\\s|$)`
        );
        if (re.test(rawArgs)) {
          count++;
          const replacedArgs = rawArgs.replace(
            re,
            (_match, leadingSpace: string) => `${leadingSpace}${targetUrl}`
          );
          return `{% img ${replacedArgs} %}`;
        }
      }
      return full;
    }
  );

  return { text, count };
}

/**
 * Replaces all non-code-block references to a local image `rawSrc` in Markdown
 * (including angle-bracketed, percent-encoded CJK, HTML `<img>`, and Hexo tags)
 * with `remoteUrl`.
 */
export function replaceLocalImageInMarkdown(
  markdown: string,
  rawSrc: string,
  remoteUrl: string
): { content: string; replaced: number } {
  const variantSet = buildNormalizedVariantSet(rawSrc);
  if (variantSet.size === 0 || !remoteUrl.trim()) {
    return { content: markdown, replaced: 0 };
  }

  let totalReplaced = 0;
  const segments = splitByFencedCodeBlocks(markdown);
  const rebuilt = segments.map((seg) => {
    if (seg.isCode) return seg.text;
    const { text, count } = replaceInPlainMarkdownSegment(
      seg.text,
      variantSet,
      remoteUrl.trim()
    );
    totalReplaced += count;
    return text;
  });

  return { content: rebuilt.join("\n"), replaced: totalReplaced };
}

/**
 * Restores a previously uploaded `remoteUrl` back to its original local `rawSrc`.
 */
export function restoreRemoteImageInMarkdown(
  markdown: string,
  remoteUrl: string,
  rawSrc: string
): { content: string; restored: number } {
  const variantSet = buildNormalizedVariantSet(remoteUrl);
  if (variantSet.size === 0 || !rawSrc.trim()) {
    return { content: markdown, restored: 0 };
  }

  let totalRestored = 0;
  const segments = splitByFencedCodeBlocks(markdown);
  const rebuilt = segments.map((seg) => {
    if (seg.isCode) return seg.text;
    const { text, count } = replaceInPlainMarkdownSegment(
      seg.text,
      variantSet,
      rawSrc.trim()
    );
    totalRestored += count;
    return text;
  });

  return { content: rebuilt.join("\n"), restored: totalRestored };
}
