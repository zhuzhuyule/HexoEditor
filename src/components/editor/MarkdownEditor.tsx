import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import {
  HighlightStyle,
  bracketMatching,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import {
  createMarkdownKeymap,
  formatTablesInEditor,
  insertTextAtCursor,
} from "@/lib/markdown/commands";
import {
  convertHtmlToMarkdown,
  shouldConvertHtmlPaste,
} from "@/lib/markdown/htmlToMarkdown";
import * as api from "@/lib/tauri/api";

export interface MarkdownEditorHandle {
  getView: () => EditorView | null;
  scrollToSourceLine: (line: number) => void;
  insertText: (text: string) => void;
  formatTables: () => number;
  focus: () => void;
}

export interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  onCursorChange?: (line: number, col: number) => void;
  onScrollLine?: (line: number, ratio: number) => void;
  onPasteImageBytes?: (
    bytes: number[],
    extension: string | null,
    preferredName: string | null,
    appendNewline?: boolean
  ) => Promise<boolean | void>;
  onRequestInsertImage?: () => void;
  onFormatTablesTriggered?: () => void;
  onHtmlConverted?: () => void;
  placeholder?: string;
  focusMode?: boolean;
  showLineNumbers?: boolean;
}

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.35em", fontWeight: "700", color: "#18181b" },
  { tag: tags.heading2, fontSize: "1.2em", fontWeight: "700", color: "#18181b" },
  { tag: tags.heading3, fontSize: "1.08em", fontWeight: "600", color: "#27272a" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "600", color: "#3f3f46" },
  { tag: tags.strong, fontWeight: "700", color: "#18181b" },
  { tag: tags.emphasis, fontStyle: "italic", color: "#27272a" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "#71717a" },
  { tag: tags.link, color: "#2563eb", textDecoration: "underline" },
  { tag: tags.url, color: "#3b82f6" },
  { tag: tags.quote, color: "#52525b", fontStyle: "italic" },
  { tag: tags.monospace, color: "#b91c1c", backgroundColor: "#f4f4f5", borderRadius: "3px" },
  { tag: tags.propertyName, color: "#0369a1" },
  { tag: tags.string, color: "#15803d" },
  { tag: tags.number, color: "#b45309" },
  { tag: tags.keyword, color: "#7c3aed" },
  { tag: tags.comment, color: "#a1a1aa" },
  { tag: tags.meta, color: "#71717a" },
  { tag: tags.processingInstruction, color: "#a1a1aa" },
]);

const minimalistLightTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "#F8F8F9",
    color: "#18181b",
    fontSize: "14px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily:
      "'JetBrains Mono', 'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'PingFang SC', 'Hiragino Sans GB', monospace",
    lineHeight: "1.82",
    padding: "24px 0 40vh 0",
  },
  ".cm-content": {
    padding: "0 36px",
    caretColor: "#18181b",
  },
  ".cm-gutters": {
    backgroundColor: "#F8F8F9",
    color: "#c4c4cc",
    border: "none",
    paddingLeft: "10px",
    paddingRight: "6px",
    userSelect: "none",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "#71717a",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(15, 23, 42, 0.028)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "#e4e4e7 !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "#dbeafe !important",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor": {
    borderLeftColor: "#18181b",
    borderLeftWidth: "1.5px",
  },
});

function inferExtensionFromMime(mime: string, fallbackName?: string): string {
  if (fallbackName && fallbackName.includes(".")) {
    const ext = fallbackName.split(".").pop()?.toLowerCase();
    if (ext) return ext;
  }
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/avif": "avif",
  };
  return map[mime.toLowerCase()] || "png";
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      value,
      onChange,
      onCursorChange,
      onScrollLine,
      onPasteImageBytes,
      onRequestInsertImage,
      onFormatTablesTriggered,
      onHtmlConverted,
      placeholder = "开始写作...",
      focusMode = false,
      showLineNumbers = false,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const lineNumbersCompartmentRef = useRef<Compartment>(new Compartment());
    const initialShowLineNumbersRef = useRef(showLineNumbers);
    const programmaticScrollUntilRef = useRef<number>(0);

    // Latest callbacks stored in refs to avoid re-instantiating CodeMirror
    const callbacksRef = useRef({
      onChange,
      onCursorChange,
      onScrollLine,
      onPasteImageBytes,
      onRequestInsertImage,
      onFormatTablesTriggered,
      onHtmlConverted,
    });
    callbacksRef.current = {
      onChange,
      onCursorChange,
      onScrollLine,
      onPasteImageBytes,
      onRequestInsertImage,
      onFormatTablesTriggered,
      onHtmlConverted,
    };

    useImperativeHandle(ref, () => ({
      getView: () => viewRef.current,
      scrollToSourceLine: (line: number) => {
        const view = viewRef.current;
        if (!view) return;
        const clamped = Math.max(1, Math.min(view.state.doc.lines, Math.round(line)));
        const lineInfo = view.state.doc.line(clamped);
        const block = view.lineBlockAt(lineInfo.from);
        programmaticScrollUntilRef.current = performance.now() + 260;
        view.scrollDOM.scrollTop = Math.max(0, block.top - 12);
      },
      insertText: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        view.focus();
        insertTextAtCursor(view, text);
      },
      formatTables: () => {
        const view = viewRef.current;
        if (!view) return 0;
        return formatTablesInEditor(view);
      },
      focus: () => {
        viewRef.current?.focus();
      },
    }));

    useEffect(() => {
      const parent = containerRef.current;
      if (!parent) return;
      let disposed = false;

      const mdKeymap = createMarkdownKeymap({
        onInsertImage: () => callbacksRef.current.onRequestInsertImage?.(),
        onFormatTable: () => callbacksRef.current.onFormatTablesTriggered?.(),
      });

      const domHandlers = EditorView.domEventHandlers({
        paste(event, view) {
          const dt = event.clipboardData;
          if (!dt) return false;

          // 1. Check clipboard image items or files
          const items = Array.from(dt.items || []);
          const imageItem = items.find((item) => item.type.startsWith("image/"));
          const imageFile =
            imageItem?.getAsFile() ||
            Array.from(dt.files || []).find(
              (f) =>
                f.type.startsWith("image/") ||
                /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(f.name)
            ) ||
            null;

          if (imageFile && callbacksRef.current.onPasteImageBytes) {
            event.preventDefault();
            void imageFile.arrayBuffer().then((buf) => {
              if (disposed) return;
              const ext = inferExtensionFromMime(imageFile.type, imageFile.name);
              const preferred =
                imageFile.name && !/^image\./i.test(imageFile.name)
                  ? imageFile.name.replace(/\.[^.]+$/, "") || null
                  : null;
              void callbacksRef.current.onPasteImageBytes?.(
                Array.from(new Uint8Array(buf)),
                ext,
                preferred
              );
            });
            return true;
          }

          // 2. Check rich HTML paste -> Markdown conversion
          const html = dt.getData("text/html");
          const plain = dt.getData("text/plain");
          if (html && shouldConvertHtmlPaste(html, plain)) {
            const md = convertHtmlToMarkdown(html);
            if (md) {
              event.preventDefault();
              insertTextAtCursor(view, md);
              callbacksRef.current.onHtmlConverted?.();
              return true;
            }
          }

          // 3. Tauri native clipboard image fallback when WebKit clipboardData has no text/image
          if (!plain && !html && api.isTauriRuntime() && callbacksRef.current.onPasteImageBytes) {
            event.preventDefault();
            void api.readClipboardImagePngBytes().then((pngBytes) => {
              if (disposed) return;
              if (pngBytes && pngBytes.length > 0) {
                void callbacksRef.current.onPasteImageBytes?.(pngBytes, "png", null);
              }
            });
            return true;
          }

          return false;
        },
        drop(event) {
          const files = Array.from(event.dataTransfer?.files || []);
          const imageFiles = files.filter(
            (f) =>
              f.type.startsWith("image/") ||
              /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(f.name)
          );
          if (imageFiles.length > 0 && callbacksRef.current.onPasteImageBytes) {
            event.preventDefault();
            void (async () => {
              for (let i = 0; i < imageFiles.length; i++) {
                if (disposed) break;
                const file = imageFiles[i];
                try {
                  const buf = await file.arrayBuffer();
                  if (disposed) break;
                  const ext = inferExtensionFromMime(file.type, file.name);
                  const preferred = file.name
                    ? file.name.replace(/\.[^.]+$/, "") || null
                    : null;
                  const shouldContinue =
                    await callbacksRef.current.onPasteImageBytes?.(
                      Array.from(new Uint8Array(buf)),
                      ext,
                      preferred,
                      i < imageFiles.length - 1
                    );
                  if (shouldContinue === false) break;
                } catch {
                  // Continue processing remaining dropped images
                }
              }
            })();
            return true;
          }
          return false;
        },
      });

      const state = EditorState.create({
        doc: value,
        extensions: [
          lineNumbersCompartmentRef.current.of(
            initialShowLineNumbersRef.current ? lineNumbers() : []
          ),
          history(),
          drawSelection(),
          bracketMatching(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          yamlFrontmatter({
            content: markdown({
              base: markdownLanguage,
              codeLanguages: languages,
            }),
          }),
          syntaxHighlighting(lightHighlightStyle),
          minimalistLightTheme,
          cmPlaceholder(placeholder),
          keymap.of([
            ...mdKeymap,
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          domHandlers,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              callbacksRef.current.onChange(update.state.doc.toString());
            }
            if (update.selectionSet || update.docChanged) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              callbacksRef.current.onCursorChange?.(
                line.number,
                head - line.from + 1
              );
            }
          }),
        ],
      });

      const view = new EditorView({ state, parent });
      viewRef.current = view;

      const handleScroll = () => {
        if (performance.now() < programmaticScrollUntilRef.current) return;
        const scroller = view.scrollDOM;
        const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
        const ratio = Math.min(1, Math.max(0, scroller.scrollTop / maxScroll));
        const block = view.lineBlockAtHeight(scroller.scrollTop + 12);
        const lineNum = view.state.doc.lineAt(block.from).number;
        callbacksRef.current.onScrollLine?.(lineNum, ratio);
      };

      view.scrollDOM.addEventListener("scroll", handleScroll, { passive: true });

      return () => {
        disposed = true;
        view.scrollDOM.removeEventListener("scroll", handleScroll);
        view.destroy();
        viewRef.current = null;
      };
      // Re-mount only when placeholder changes (tab switch uses React key={tab.id})
    }, [placeholder]);

    // Dynamically toggle line numbers via Compartment without recreating EditorView
    useEffect(() => {
      initialShowLineNumbersRef.current = showLineNumbers;
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: lineNumbersCompartmentRef.current.reconfigure(
          showLineNumbers ? lineNumbers() : []
        ),
      });
    }, [showLineNumbers]);

    // Sync external value updates (e.g., Front-Matter bar edits, disk reload, image rename)
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === value) return;
      const anchor = Math.min(view.state.selection.main.anchor, value.length);
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        selection: { anchor },
      });
    }, [value]);

    return (
      <div className="h-full w-full overflow-hidden bg-[#F8F8F9]">
        <div
          ref={containerRef}
          className={`h-full w-full ${focusMode ? "mx-auto max-w-3xl" : ""}`}
        />
      </div>
    );
  }
);
