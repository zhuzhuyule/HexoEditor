import {
  forwardRef,
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
}

interface MarkdownPreviewProps {
  content: string;
  docPath: string | null;
  siteRoot: string | null;
  sourceDir: string | null;
  imageVersion?: number;
  onScrollLine?: (line: number) => void;
  onClickLocalImage?: (image: SelectedLocalImage) => void;
  centered?: boolean;
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
    },
    ref
  ) {
    const locale = useAppStore((s) => s.locale);
    const messages = getMessages(locale);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const programmaticScrollUntilRef = useRef<number>(0);

    const parsed = useMemo(() => parseMarkdownDocument(content), [content]);
    const localSrcs = useMemo(
      () => extractLocalImageSrcs(parsed.body),
      [parsed.body]
    );
    const localSrcsKey = localSrcs.join("\0");

    const [imageMap, setImageMap] = useState<Record<string, LocalImageEntry>>({});

    // Batch resolve local images via Rust when docPath or image list changes
    useEffect(() => {
      let cancelled = false;
      if (localSrcs.length === 0) {
        setImageMap({});
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
          setImageMap(next);
        })
        .catch(() => {
          if (!cancelled) setImageMap({});
        });

      return () => {
        cancelled = true;
      };
    }, [docPath, siteRoot, sourceDir, localSrcsKey, imageVersion]);

    const renderedHtml = useMemo(
      () =>
        renderMarkdownToHtml(parsed.body, {
          bodyStartLine: parsed.bodyStartLine,
          imageMap,
        }),
      [parsed.body, parsed.bodyStartLine, imageMap]
    );

    // Async render Mermaid blocks after HTML updates
    useEffect(() => {
      const root = contentRef.current;
      if (!root) return;
      const blocks = Array.from(
        root.querySelectorAll<HTMLElement>(".mermaid-block[data-mermaid-source]")
      );
      if (blocks.length === 0) return;

      let cancelled = false;

      void (async () => {
        const mermaid = await getMermaid();
        if (cancelled) return;
        for (let i = 0; i < blocks.length; i++) {
          if (cancelled) return;
          const block = blocks[i];
          const encoded = block.getAttribute("data-mermaid-source") || "";
          const code = decodeURIComponent(encoded);
          const id = `mmd-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
          try {
            const { svg } = await mermaid.render(id, code);
            if (!cancelled) {
              block.innerHTML = svg;
              block.classList.add("mermaid-rendered");
            }
          } catch (err) {
            if (!cancelled) {
              const errMsg = err instanceof Error ? err.message : String(err);
              block.innerHTML = `<div class="mermaid-error">${messages.tabs.mermaidError}${errMsg
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")}</div>`;
            }
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [renderedHtml, messages.tabs.mermaidError]);

    useImperativeHandle(ref, () => ({
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
    }));

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

          <div
            ref={contentRef}
            onClick={handlePreviewClick}
            className="markdown-preview"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </article>
      </div>
    );
  }
);
