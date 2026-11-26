import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import type { SelectedLocalImage } from "@/components/preview/ImageRenameDialog";
import { parseMarkdownDocument } from "@/lib/frontmatter";
import { getMessages } from "@/lib/i18n";
import {
  extractLocalImageSrcs,
  renderMarkdownToHtml,
  type LocalImageEntry,
} from "@/lib/markdown/renderer";
import * as api from "@/lib/tauri/api";
import { useAppStore } from "@/stores/useAppStore";

export interface MarkdownPreviewHandle {
  scrollToSourceLine: (line: number, fallbackRatio: number) => void;
  scrollToHeadingId: (id: string) => void;
  getRenderedHtml: () => string;
}

export interface MarkdownPreviewProps {
  content: string;
  docPath: string | null;
  siteRoot: string | null;
  sourceDir: string | null;
  imageVersion?: number;
  onScrollLine?: (line: number) => void;
  onClickLocalImage?: (image: SelectedLocalImage) => void;
  centered?: boolean;
  /** Optional site or custom Hexo theme CSS; safely scoped to `.markdown-preview-scoped` */
  themeCss?: string | null;
  /** Whether to preprocess Hexo tag plugins (default: true) */
  enableHexoTags?: boolean;
  /** Preview typography zoom percentage (85-125, default: 100) */
  zoomLevel?: number;
  /** Stable document key for non-blocking render isolation & cache alignment */
  docKey?: string;
}

const EMPTY_IMAGE_MAP: Record<string, LocalImageEntry> = {};

function lruGet<V>(cache: Map<string, V>, key: string): V | undefined {
  const value = cache.get(key);
  if (value !== undefined) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

function lruSet<V>(
  cache: Map<string, V>,
  key: string,
  value: V,
  maxSize: number
): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= maxSize) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  cache.set(key, value);
}

const scopedThemeCssCache = new Map<string, string>();
const localImageCache = new Map<string, Record<string, LocalImageEntry>>();
const renderedHtmlCache = new Map<string, string>();
const mermaidSvgCache = new Map<string, string>();

const CONDITIONAL_AT_RULES = new Set([
  "@media",
  "@supports",
  "@layer",
  "@container",
]);

const PRESERVED_AT_RULES = new Set([
  "@keyframes",
  "@-webkit-keyframes",
  "@-moz-keyframes",
  "@font-face",
]);

function stripCssComments(css: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < css.length) {
    const ch = css[i];
    if (quote) {
      out += ch;
      if (ch === "\\" && i + 1 < css.length) {
        out += css[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function splitTopLevelSelectors(selectorList: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;

  for (let i = 0; i < selectorList.length; i++) {
    const ch = selectorList[i];
    if (quote) {
      current += ch;
      if (ch === "\\" && i + 1 < selectorList.length) {
        current += selectorList[i + 1];
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);

    if (ch === "," && parenDepth === 0 && bracketDepth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function prefixSingleSelector(selector: string, scope: string): string {
  const trimmed = selector.trim();
  if (!trimmed) return "";
  if (trimmed === scope || trimmed.startsWith(`${scope} `) || trimmed.startsWith(`${scope}:`) || trimmed.startsWith(`${scope}.`)) {
    return trimmed;
  }

  // Rewrite root/document selectors (`html`, `body`, `:root`) to target the scoped preview root
  const rootMapped = trimmed.replace(
    /^(?::root|html|body)(?:[.#][a-zA-Z0-9_-]+)*(?:\s+(?:body)(?:[.#][a-zA-Z0-9_-]+)*)?(?=\s|>|\+|~|:|$)/i,
    scope
  );
  if (rootMapped !== trimmed) {
    return rootMapped;
  }

  return `${scope} ${trimmed}`;
}

function sanitizeDeclarations(declarations: string): string {
  return declarations
    .replace(/expression\s*\([^)]*\)/gi, "none")
    .replace(
      /url\s*\(\s*['"]?\s*(?:(?:javascript|vbscript)\s*:|data\s*:\s*text\/html\b)[^)]*\)/gi,
      "none"
    )
    .replace(/behavior\s*:[^;]+;?/gi, "")
    .replace(/-moz-binding\s*:[^;]+;?/gi, "");
}

function scopeCssBlock(css: string, scope: string): string {
  const out: string[] = [];
  let i = 0;
  const len = css.length;

  while (i < len) {
    while (i < len && /\s/.test(css[i])) i++;
    if (i >= len) break;

    // Collect prelude until `{` or `;`
    let preludeStart = i;
    let quote: string | null = null;
    let parenDepth = 0;
    while (i < len) {
      const ch = css[i];
      if (quote) {
        if (ch === "\\" && i + 1 < len) {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i++;
        continue;
      }
      if (ch === "(") parenDepth++;
      else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
      else if (parenDepth === 0 && (ch === "{" || ch === ";")) break;
      i++;
    }

    const prelude = css.slice(preludeStart, i).trim();
    if (i >= len) break;

    if (css[i] === ";") {
      // Drop standalone at-rules like @import, @charset, @namespace
      i++;
      continue;
    }

    // Consume balanced `{ ... }` block
    i++; // skip '{'
    const bodyStart = i;
    let depth = 1;
    quote = null;
    while (i < len && depth > 0) {
      const ch = css[i];
      if (quote) {
        if (ch === "\\" && i + 1 < len) {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i++;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }

    const body = css.slice(bodyStart, depth === 0 ? i - 1 : i);
    if (!prelude) continue;

    if (prelude.startsWith("@")) {
      const atName = prelude.split(/[\s(]/)[0]?.toLowerCase() ?? "";
      if (CONDITIONAL_AT_RULES.has(atName)) {
        const scopedInner = scopeCssBlock(body, scope);
        if (scopedInner.trim()) {
          out.push(`${prelude} {\n${scopedInner}\n}`);
        }
      } else if (PRESERVED_AT_RULES.has(atName)) {
        out.push(`${prelude} {${sanitizeDeclarations(body)}}`);
      }
      // Drop unsupported/unsafe at-rules (@page, @import, etc.)
      continue;
    }

    const selectors = splitTopLevelSelectors(prelude)
      .map((s) => prefixSingleSelector(s, scope))
      .filter(Boolean);
    if (selectors.length === 0) continue;

    const cleanBody = sanitizeDeclarations(body).trim();
    if (!cleanBody) continue;
    out.push(`${selectors.join(", ")} { ${cleanBody} }`);
  }

  return out.join("\n");
}

/**
 * Safely scopes arbitrary Hexo theme/custom CSS into `.markdown-preview-scoped`
 * so theme typography never leaks into the application shell UI.
 */
export function scopePreviewThemeCss(
  rawCss: string | null | undefined,
  scope = ".markdown-preview-scoped"
): string {
  if (!rawCss || !rawCss.trim()) return "";
  const cacheKey = `${scope}\0${rawCss}`;
  const cached = lruGet(scopedThemeCssCache, cacheKey);
  if (cached !== undefined) return cached;
  // Prevent breaking out of `<style>` tags (including whitespace variants like `</ style>`)
  const safeInput = rawCss.replace(/<\/\s*style/gi, "");
  const withoutComments = stripCssComments(safeInput);
  const result = scopeCssBlock(withoutComments, scope);
  lruSet(scopedThemeCssCache, cacheKey, result, 10);
  return result;
}

let mermaidModulePromise: Promise<typeof import("mermaid")["default"]> | null = null;
async function getMermaid() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((mod) => {
      const m = mod.default;
      m.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "strict",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
      });
      return m;
    });
  }
  return mermaidModulePromise;
}

export const MarkdownPreview = forwardRef<MarkdownPreviewHandle, MarkdownPreviewProps>(
  function MarkdownPreview(
    {
      content,
      docPath,
      siteRoot,
      sourceDir,
      imageVersion = 0,
      onScrollLine,
      onClickLocalImage,
      centered = false,
      themeCss = null,
      enableHexoTags = true,
      zoomLevel = 100,
      docKey,
    },
    ref
  ) {
    const locale = useAppStore((s) => s.locale);
    const messages = getMessages(locale);
    const isEn = locale === "en-US";
    const effectiveDocKey = docKey ?? docPath ?? "__inline__";

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const programmaticScrollUntilRef = useRef<number>(0);
    const prevDocKeyRef = useRef<string>(effectiveDocKey);

    const parsed = useMemo(() => parseMarkdownDocument(content), [content]);
    const localSrcs = useMemo(
      () => extractLocalImageSrcs(parsed.body, { enableHexoTags }),
      [parsed.body, enableHexoTags]
    );
    const localSrcsKey = localSrcs.join("\0");
    const imageCacheKey = `${docPath ?? ""}\0${siteRoot ?? ""}\0${sourceDir ?? ""}\0${imageVersion}\0${localSrcsKey}`;

    const scopedThemeCss = useMemo(
      () => scopePreviewThemeCss(themeCss, ".markdown-preview-scoped"),
      [themeCss]
    );

    const cachedImageMap = useMemo(() => {
      if (localSrcs.length === 0) return EMPTY_IMAGE_MAP;
      return lruGet(localImageCache, imageCacheKey) ?? EMPTY_IMAGE_MAP;
    }, [localSrcs.length, imageCacheKey]);

    const [resolvedImageState, setResolvedImageState] = useState<{
      cacheKey: string;
      map: Record<string, LocalImageEntry>;
    } | null>(null);

    const activeImageMap =
      localSrcs.length === 0
        ? EMPTY_IMAGE_MAP
        : resolvedImageState?.cacheKey === imageCacheKey
        ? resolvedImageState.map
        : cachedImageMap;

    // Reset preview scroll position when switching between documents
    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    }, [effectiveDocKey]);

    // Batch resolve local images via Rust when docPath or image list changes (non-blocking & cached)
    useEffect(() => {
      let cancelled = false;
      if (localSrcs.length === 0) {
        return;
      }
      if (lruGet(localImageCache, imageCacheKey)) {
        return;
      }

      void api
        .resolveLocalImages({
          docPath,
          siteRoot,
          sourceDir,
          srcs: localSrcs,
        })
        .then((results) => {
          if (cancelled) return;
          const next: Record<string, LocalImageEntry> = {};
          for (const item of results) {
            if (item.exists && item.absolutePath) {
              const baseUrl = api.toAssetUrl(item.absolutePath);
              const cacheBusted =
                imageVersion > 0
                  ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}v=${imageVersion}`
                  : baseUrl;
              next[item.rawSrc] = {
                assetUrl: cacheBusted,
                absolutePath: item.absolutePath,
              };
            }
          }
          lruSet(localImageCache, imageCacheKey, next, 60);
          setResolvedImageState({ cacheKey: imageCacheKey, map: next });
        })
        .catch(() => {
          if (!cancelled) {
            setResolvedImageState({
              cacheKey: imageCacheKey,
              map: EMPTY_IMAGE_MAP,
            });
          }
        });

      return () => {
        cancelled = true;
      };
    }, [docPath, siteRoot, sourceDir, localSrcsKey, imageVersion, imageCacheKey]);

    const imageMapSig = useMemo(() => {
      const keys = Object.keys(activeImageMap);
      if (keys.length === 0) return "";
      keys.sort();
      return keys.map((k) => `${k}=${activeImageMap[k].assetUrl}`).join("\0");
    }, [activeImageMap]);

    const renderKey = `${enableHexoTags ? 1 : 0}\0${parsed.bodyStartLine}\0${imageMapSig}\0${parsed.body}`;
    const cachedHtml = lruGet(renderedHtmlCache, renderKey);
    const isFastInlineRender =
      cachedHtml !== undefined ||
      (parsed.body.length <= 2500 && !/```|~~~|\$\$/.test(parsed.body));

    const fastHtml = useMemo(() => {
      if (cachedHtml !== undefined) return cachedHtml;
      if (!isFastInlineRender) return null;
      const html = renderMarkdownToHtml(parsed.body, {
        bodyStartLine: parsed.bodyStartLine,
        imageMap: activeImageMap,
        enableHexoTags,
      });
      lruSet(renderedHtmlCache, renderKey, html, 40);
      return html;
    }, [
      cachedHtml,
      isFastInlineRender,
      parsed.body,
      parsed.bodyStartLine,
      activeImageMap,
      enableHexoTags,
      renderKey,
    ]);

    const [asyncRenderState, setAsyncRenderState] = useState<{
      docKey: string;
      renderKey: string;
      html: string;
    } | null>(null);

    // Offload uncached heavy Markdown/KaTeX/Highlight rendering asynchronously so tab switching never freezes
    useEffect(() => {
      const docSwitched = prevDocKeyRef.current !== effectiveDocKey;
      prevDocKeyRef.current = effectiveDocKey;

      if (fastHtml !== null) {
        return;
      }

      let cancelled = false;
      let rafId: number | null = null;
      let timerId: ReturnType<typeof setTimeout> | null = null;

      const runRender = () => {
        if (cancelled) return;
        const html = renderMarkdownToHtml(parsed.body, {
          bodyStartLine: parsed.bodyStartLine,
          imageMap: activeImageMap,
          enableHexoTags,
        });
        lruSet(renderedHtmlCache, renderKey, html, 40);
        if (!cancelled) {
          setAsyncRenderState({ docKey: effectiveDocKey, renderKey, html });
        }
      };

      const delay = docSwitched ? 0 : 80;
      if (typeof requestAnimationFrame === "function" && docSwitched) {
        rafId = requestAnimationFrame(() => {
          timerId = setTimeout(runRender, 0);
        });
      } else {
        timerId = setTimeout(runRender, delay);
      }

      return () => {
        cancelled = true;
        if (rafId !== null && typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(rafId);
        }
        if (timerId !== null) {
          clearTimeout(timerId);
        }
      };
    }, [
      effectiveDocKey,
      fastHtml,
      parsed.body,
      parsed.bodyStartLine,
      activeImageMap,
      enableHexoTags,
      renderKey,
    ]);

    const displayedHtml =
      fastHtml !== null
        ? fastHtml
        : asyncRenderState?.docKey === effectiveDocKey
        ? asyncRenderState.html
        : null;

    // Async render Mermaid blocks after HTML updates (cached SVGs apply synchronously with zero flicker)
    useEffect(() => {
      if (displayedHtml === null) return;
      const root = contentRef.current;
      if (!root) return;
      const blocks = Array.from(
        root.querySelectorAll<HTMLElement>(".mermaid-block[data-mermaid-source]")
      );
      if (blocks.length === 0) return;

      const pendingBlocks: { block: HTMLElement; code: string; index: number }[] = [];
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const encoded = block.getAttribute("data-mermaid-source") || "";
        let code = encoded;
        try {
          code = decodeURIComponent(encoded);
        } catch {
          // keep raw fallback
        }
        const cachedSvg = lruGet(mermaidSvgCache, code);
        if (cachedSvg !== undefined) {
          block.innerHTML = cachedSvg;
          block.classList.add("mermaid-rendered");
        } else {
          pendingBlocks.push({ block, code, index: i });
        }
      }

      if (pendingBlocks.length === 0) return;

      let cancelled = false;
      const timerId = setTimeout(() => {
        if (cancelled) return;
        void (async () => {
          const mermaid = await getMermaid();
          if (cancelled) return;
          for (const item of pendingBlocks) {
            if (cancelled) return;
            const id = `mmd-${Date.now()}-${item.index}-${Math.random()
              .toString(36)
              .slice(2, 6)}`;
            try {
              const { svg } = await mermaid.render(id, item.code);
              lruSet(mermaidSvgCache, item.code, svg, 60);
              if (!cancelled) {
                item.block.innerHTML = svg;
                item.block.classList.add("mermaid-rendered");
              }
            } catch (err) {
              if (!cancelled) {
                const errMsg = err instanceof Error ? err.message : String(err);
                item.block.innerHTML = `<div class="mermaid-error">${messages.tabs.mermaidError}${errMsg
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")}</div>`;
              }
            }
          }
        })();
      }, 0);

      return () => {
        cancelled = true;
        clearTimeout(timerId);
      };
    }, [displayedHtml, messages.tabs.mermaidError]);

    const scrollToHeadingId = useCallback((id: string) => {
      const scroller = scrollRef.current;
      const container = contentRef.current;
      if (!scroller || !container || !id) return;

      const targetEl = Array.from(
        container.querySelectorAll<HTMLElement>("[id]")
      ).find((el) => el.id === id);
      if (!targetEl) return;

      programmaticScrollUntilRef.current = performance.now() + 260;
      const scrollerRect = scroller.getBoundingClientRect();
      const targetTop =
        targetEl.getBoundingClientRect().top - scrollerRect.top + scroller.scrollTop;
      scroller.scrollTop = Math.max(0, targetTop - 16);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        scrollToSourceLine: (targetLine: number, fallbackRatio: number) => {
          const scroller = scrollRef.current;
          const container = contentRef.current;
          if (!scroller || !container) return;

          const nodes = Array.from(
            container.querySelectorAll<HTMLElement>("[data-source-line]")
          );
          programmaticScrollUntilRef.current = performance.now() + 260;

          if (nodes.length === 0) {
            const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            scroller.scrollTop = maxScroll * fallbackRatio;
            return;
          }

          const scrollerRect = scroller.getBoundingClientRect();
          const anchors = nodes
            .map((el) => ({
              line: Number(el.getAttribute("data-source-line")),
              top: el.getBoundingClientRect().top - scrollerRect.top + scroller.scrollTop,
            }))
            .filter((a) => !Number.isNaN(a.line))
            .sort((a, b) => a.line - b.line);

          if (anchors.length === 0) return;

          if (targetLine <= anchors[0].line) {
            scroller.scrollTop = 0;
            return;
          }
          const last = anchors[anchors.length - 1];
          if (targetLine >= last.line) {
            scroller.scrollTop = Math.max(0, last.top - 16);
            return;
          }

          let prev = anchors[0];
          let next = last;
          for (let i = 0; i < anchors.length; i++) {
            if (anchors[i].line <= targetLine) {
              prev = anchors[i];
            } else {
              next = anchors[i];
              break;
            }
          }

          const span = Math.max(1, next.line - prev.line);
          const t = Math.min(1, Math.max(0, (targetLine - prev.line) / span));
          const targetTop = prev.top + (next.top - prev.top) * t;
          scroller.scrollTop = Math.max(0, targetTop - 16);
        },
        scrollToHeadingId,
        getRenderedHtml: () => {
          if (displayedHtml !== null) {
            return contentRef.current?.innerHTML ?? displayedHtml;
          }
          return renderMarkdownToHtml(parsed.body, {
            bodyStartLine: parsed.bodyStartLine,
            imageMap: activeImageMap,
            enableHexoTags,
          });
        },
      }),
      [
        displayedHtml,
        scrollToHeadingId,
        parsed.body,
        parsed.bodyStartLine,
        activeImageMap,
        enableHexoTags,
      ]
    );

    const handleScroll = () => {
      if (!onScrollLine) return;
      if (performance.now() < programmaticScrollUntilRef.current) return;
      const scroller = scrollRef.current;
      const container = contentRef.current;
      if (!scroller || !container) return;

      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>("[data-source-line]")
      );
      if (nodes.length === 0) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const thresholdTop = scrollerRect.top + 20;
      let matchedLine = Number(nodes[0].getAttribute("data-source-line")) || 1;
      for (const node of nodes) {
        if (node.getBoundingClientRect().top <= thresholdTop) {
          const ln = Number(node.getAttribute("data-source-line"));
          if (!Number.isNaN(ln)) matchedLine = ln;
        } else {
          break;
        }
      }
      onScrollLine(matchedLine);
    };

    const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Interactive Hexo {% tabs %} switching
      const tabBtn = target.closest<HTMLElement>("[data-hexo-tabs] [data-tab-index]");
      if (tabBtn) {
        e.preventDefault();
        const tabsRoot = tabBtn.closest<HTMLElement>("[data-hexo-tabs]");
        const targetIndex = tabBtn.getAttribute("data-tab-index");
        if (tabsRoot && targetIndex !== null) {
          const buttons = tabsRoot.querySelectorAll<HTMLElement>("[data-tab-index]");
          buttons.forEach((btn) => {
            if (btn.closest("[data-hexo-tabs]") !== tabsRoot) return;
            const isSelected = btn.getAttribute("data-tab-index") === targetIndex;
            btn.classList.toggle("active", isSelected);
            btn.classList.toggle("is-active", isSelected);
            btn.setAttribute("aria-selected", String(isSelected));
          });

          const panels = tabsRoot.querySelectorAll<HTMLElement>("[data-tab-panel]");
          panels.forEach((panel) => {
            if (panel.closest("[data-hexo-tabs]") !== tabsRoot) return;
            const isSelected = panel.getAttribute("data-tab-panel") === targetIndex;
            panel.classList.toggle("active", isSelected);
            panel.classList.toggle("is-active", isSelected);
            if (isSelected) {
              panel.removeAttribute("hidden");
            } else {
              panel.setAttribute("hidden", "");
            }
          });
        }
        return;
      }

      const img = target.closest<HTMLImageElement>('img[data-local-image="true"]');
      if (img && onClickLocalImage) {
        e.preventDefault();
        const absolutePath = img.getAttribute("data-local-abs-path");
        const rawSrc = img.getAttribute("data-raw-src") || "";
        if (absolutePath) {
          onClickLocalImage({
            absolutePath,
            assetUrl: img.src,
            rawSrc,
          });
        }
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (anchor) {
        const href = anchor.getAttribute("href") || "";
        if (href.startsWith("#") && href.length > 1) {
          e.preventDefault();
          try {
            scrollToHeadingId(decodeURIComponent(href.slice(1)));
          } catch {
            scrollToHeadingId(href.slice(1));
          }
          return;
        }
        if (/^https?:\/\//i.test(href)) {
          e.preventDefault();
          void api.openExternalUrl(href);
        }
      }
    };

    return (
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full w-full overflow-y-auto bg-white"
      >
        {scopedThemeCss && (
          <style data-hexo-theme-css="true">{scopedThemeCss}</style>
        )}
        <article
          className={`px-8 py-6 pb-[35vh] ${
            centered ? "mx-auto max-w-3xl" : "mx-auto max-w-[780px]"
          }`}
        >
          {parsed.hasFrontMatter && parsed.data.title && (
            <header className="mb-6 border-b border-zinc-100 pb-4">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                {parsed.data.title}
              </h1>
              {(parsed.data.date || parsed.data.categories.length > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  {parsed.data.date && (
                    <span className="font-mono">{parsed.data.date}</span>
                  )}
                  {parsed.data.categories.map((c) => (
                    <span
                      key={c}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </header>
          )}

          {displayedHtml === null ? (
            <div
              data-testid="preview-skeleton"
              className="space-y-4 py-2 select-none"
              aria-busy="true"
            >
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-zinc-300 animate-pulse" />
                <span>{isEn ? "Rendering preview..." : "正在渲染预览..."}</span>
              </div>
              <div className="space-y-2.5">
                <div className="h-4 w-3/4 rounded bg-zinc-100 animate-pulse" />
                <div className="h-3.5 w-full rounded bg-zinc-100/80 animate-pulse" />
                <div className="h-3.5 w-11/12 rounded bg-zinc-100/80 animate-pulse" />
                <div className="h-3.5 w-2/3 rounded bg-zinc-100/80 animate-pulse" />
              </div>
              <div className="h-28 w-full rounded-md border border-zinc-100 bg-zinc-50 animate-pulse" />
              <div className="space-y-2">
                <div className="h-3.5 w-full rounded bg-zinc-100/80 animate-pulse" />
                <div className="h-3.5 w-5/6 rounded bg-zinc-100/80 animate-pulse" />
              </div>
            </div>
          ) : (
            <div
              ref={contentRef}
              onClick={handlePreviewClick}
              style={
                zoomLevel !== 100
                  ? { fontSize: `${Math.round(15 * (zoomLevel / 100) * 10) / 10}px` }
                  : undefined
              }
              className="markdown-preview markdown-preview-scoped"
              dangerouslySetInnerHTML={{ __html: displayedHtml }}
            />
          )}
        </article>
      </div>
    );
  }
);
