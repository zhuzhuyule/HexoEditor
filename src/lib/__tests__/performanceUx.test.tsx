import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import { LiveSitePreview } from "@/components/preview/LiveSitePreview";
import { MarkdownPreview } from "@/components/preview/MarkdownPreview";
import { TooltipProvider } from "@/components/ui/tooltip";
import * as api from "@/lib/tauri/api";
import { useAppStore } from "@/stores/useAppStore";
import type { EditorTab, PostSummary } from "@/types";
import {
  DEFAULT_EDITOR_PREFS,
  DEFAULT_IMAGE_BED_SETTINGS,
} from "@/types/settings";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    }) as unknown as DOMRectList;
}
if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

function makeTab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: overrides.id ?? "tab-1",
    filePath:
      overrides.filePath !== undefined ? overrides.filePath : "/blog/source/_posts/a.md",
    title: overrides.title ?? "Doc A",
    content: overrides.content ?? "# Doc A\n\nBody A\n",
    savedContent: overrides.savedContent ?? "# Doc A\n\nBody A\n",
    isDirty: overrides.isDirty ?? false,
    isLoading: overrides.isLoading ?? false,
    isDraft: overrides.isDraft ?? false,
    isStandalone: overrides.isStandalone ?? false,
    siteRoot: overrides.siteRoot !== undefined ? overrides.siteRoot : "/blog",
    postAssetFolder: overrides.postAssetFolder ?? true,
    sourceDir: overrides.sourceDir ?? "source",
    modifiedMs: overrides.modifiedMs ?? 1700000000000,
    externalChange: overrides.externalChange ?? null,
    cursorLine: overrides.cursorLine ?? 1,
    cursorCol: overrides.cursorCol ?? 1,
  };
}

function makePost(overrides: Partial<PostSummary> = {}): PostSummary {
  return {
    filePath: overrides.filePath ?? "/blog/source/_posts/post.md",
    fileName: overrides.fileName ?? "post.md",
    slug: overrides.slug ?? "post",
    relativePath: overrides.relativePath ?? "source/_posts/post.md",
    title: overrides.title ?? "Post Title",
    date: overrides.date ?? "2026-11-26 10:00:00",
    updated: null,
    tags: overrides.tags ?? [],
    categories: overrides.categories ?? [],
    isDraft: overrides.isDraft ?? false,
    hasAssetFolder: overrides.hasAssetFolder ?? false,
    excerpt: overrides.excerpt ?? "",
    modifiedMs: overrides.modifiedMs ?? 1700000000000,
  };
}

function resetStore() {
  useAppStore.setState({
    hydrated: true,
    locale: "zh-CN",
    sites: [],
    activeSiteRoot: null,
    siteConfig: null,
    posts: [],
    allTags: [],
    allCategories: [],
    isScanning: false,
    sidebarOpen: true,
    sidebarWidth: 260,
    sidebarTab: "posts",
    filterTab: "all",
    searchQuery: "",
    selectedCategory: null,
    selectedTag: null,
    tabs: [],
    activeTabId: null,
    viewMode: "split",
    previousViewMode: "split",
    syncScroll: true,
    autoSave: false,
    showToolbar: false,
    showLineNumbers: false,
    recentEntries: [],
    enableHexoTags: true,
    themeCss: null,
    themeCssLabel: null,
    previewSource: "markdown",
    hexoCliStatus: {
      running: false,
      action: null,
      serverRunning: false,
      serverUrl: null,
      exitCode: null,
      message: null,
    },
    hexoLogs: [],
    terminalOpen: false,
    editorPrefs: { ...DEFAULT_EDITOR_PREFS },
    imageBed: { ...DEFAULT_IMAGE_BED_SETTINGS },
    lastUploadBatches: {},
    toasts: [],
  });
}

describe("Performance & responsive UX guarantees", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetStore();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("reuses the single CodeMirror EditorView instance across tab switches and preserves per-tab undo stack and scroll position", async () => {
    const tabA = makeTab({ id: "tab-a", filePath: "/blog/source/_posts/a.md", title: "A", content: "# A\nLine 1\n" });
    const tabB = makeTab({ id: "tab-b", filePath: "/blog/source/_posts/b.md", title: "B", content: "# B\nBody B\n" });

    useAppStore.setState({
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
      viewMode: "split",
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    const initialEditorEl = container.querySelector<HTMLElement>(".cm-editor");
    expect(initialEditorEl).not.toBeNull();
    const initialView = EditorView.findFromDOM(initialEditorEl!);
    expect(initialView).not.toBeNull();

    // Edit tab A and set a custom scroll offset
    await act(async () => {
      initialView!.dispatch({
        changes: { from: initialView!.state.doc.length, insert: "\nTAB_A_EDIT" },
      });
    });
    initialView!.scrollDOM.scrollTop = 96;

    // Switch to tab B -> same EditorView instance, now showing B
    await act(async () => {
      useAppStore.getState().setActiveTab(tabB.id);
    });
    expect(container.querySelector(".cm-editor")).toBe(initialEditorEl);
    expect(EditorView.findFromDOM(container.querySelector(".cm-editor")!)).toBe(initialView);
    expect(initialView!.state.doc.toString()).toContain("Body B");

    // Switch back to tab A -> exact same EditorView, scrollTop & undo stack preserved
    await act(async () => {
      useAppStore.getState().setActiveTab(tabA.id);
    });
    expect(container.querySelector(".cm-editor")).toBe(initialEditorEl);
    expect(initialView!.scrollDOM.scrollTop).toBe(96);
    expect(initialView!.state.doc.toString()).toContain("TAB_A_EDIT");

    await act(async () => {
      expect(undo(initialView!)).toBe(true);
    });
    expect(initialView!.state.doc.toString()).not.toContain("TAB_A_EDIT");
  });

  it("performs optimistic instant post switch with loading skeleton and ignores stale post activation on rapid switching", async () => {
    let resolveA!: (v: { filePath: string; content: string; modifiedMs: number }) => void;
    let resolveB!: (v: { filePath: string; content: string; modifiedMs: number }) => void;

    vi.spyOn(api, "readDocument").mockImplementation((filePath) => {
      if (filePath.endsWith("/a.md")) {
        return new Promise((r) => {
          resolveA = r;
        });
      }
      return new Promise((r) => {
        resolveB = r;
      });
    });

    const initialTab = makeTab({
      id: "tab-old",
      filePath: "/blog/source/_posts/old.md",
      title: "Old Article",
      content: "# Old Article\nOLD_UNIQUE_TEXT\n",
    });
    const postA = makePost({ filePath: "/blog/source/_posts/a.md", title: "Post A" });
    const postB = makePost({ filePath: "/blog/source/_posts/b.md", title: "Post B" });

    useAppStore.setState({
      activeSiteRoot: "/blog",
      posts: [postA, postB],
      tabs: [initialTab],
      activeTabId: initialTab.id,
      viewMode: "split",
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    // Click Post A -> immediately shows loading skeleton for Post A and never shows Old Article
    let pA!: Promise<void>;
    await act(async () => {
      pA = useAppStore.getState().openPost(postA);
    });
    const activeAfterClickA = useAppStore
      .getState()
      .tabs.find((t) => t.id === useAppStore.getState().activeTabId);
    expect(activeAfterClickA?.filePath).toBe("/blog/source/_posts/a.md");
    expect(activeAfterClickA?.isLoading).toBe(true);
    expect(container.querySelector('[data-testid="doc-loading-skeleton"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="doc-loading-skeleton"]')?.textContent).toContain("Post A");

    // Rapidly click Post B before Post A finishes
    let pB!: Promise<void>;
    await act(async () => {
      pB = useAppStore.getState().openPost(postB);
    });
    expect(
      useAppStore.getState().tabs.find((t) => t.id === useAppStore.getState().activeTabId)?.filePath
    ).toBe("/blog/source/_posts/b.md");

    // Resolve Post B first, then stale Post A
    await act(async () => {
      resolveB({
        filePath: "/blog/source/_posts/b.md",
        content: "---\ntitle: Post B\n---\n\nBODY_B_READY",
        modifiedMs: 200,
      });
      await pB;
    });

    await act(async () => {
      resolveA({
        filePath: "/blog/source/_posts/a.md",
        content: "---\ntitle: Post A\n---\n\nBODY_A_LATE",
        modifiedMs: 100,
      });
      await pA;
    });

    // Active tab must remain Post B (not hijacked by late-resolving Post A)
    const finalActive = useAppStore
      .getState()
      .tabs.find((t) => t.id === useAppStore.getState().activeTabId);
    expect(finalActive?.filePath).toBe("/blog/source/_posts/b.md");
    expect(finalActive?.isLoading).toBe(false);
    expect(finalActive?.content).toContain("BODY_B_READY");
    expect(container.querySelector('[data-testid="doc-loading-skeleton"]')).toBeNull();
  });

  it("clears previous document HTML immediately when switching to an uncached heavy preview, shows skeleton, and serves cached render instantaneously on return", async () => {
    vi.useFakeTimers();
    const docA = [
      "---",
      "title: Cached Heavy Doc A",
      "---",
      "",
      "```ts",
      "const docA = 1;",
      "```",
      "",
      "UNIQUE_DOC_A_BODY",
    ].join("\n");
    const docB = [
      "---",
      "title: Heavy Doc B",
      "---",
      "",
      "```ts",
      "const docB = 2;",
      "```",
      "",
      "UNIQUE_DOC_B_BODY",
    ].join("\n");

    await act(async () => {
      root.render(
        React.createElement(MarkdownPreview, {
          docKey: "doc-a",
          content: docA,
          docPath: "/blog/a.md",
          siteRoot: "/blog",
          sourceDir: "source",
        })
      );
    });

    // Advance async render timer for Doc A
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(container.textContent).toContain("UNIQUE_DOC_A_BODY");

    // Switch immediately to uncached heavy Doc B -> Doc A's HTML must disappear immediately and show skeleton
    await act(async () => {
      root.render(
        React.createElement(MarkdownPreview, {
          docKey: "doc-b",
          content: docB,
          docPath: "/blog/b.md",
          siteRoot: "/blog",
          sourceDir: "source",
        })
      );
    });

    expect(container.textContent).not.toContain("UNIQUE_DOC_A_BODY");
    expect(container.querySelector('[data-testid="preview-skeleton"]')).not.toBeNull();

    // Finish Doc B async render
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(container.querySelector('[data-testid="preview-skeleton"]')).toBeNull();
    expect(container.textContent).toContain("UNIQUE_DOC_B_BODY");

    // Switch back to Doc A -> hits LRU cache synchronously (0ms, no skeleton)
    await act(async () => {
      root.render(
        React.createElement(MarkdownPreview, {
          docKey: "doc-a",
          content: docA,
          docPath: "/blog/a.md",
          siteRoot: "/blog",
          sourceDir: "source",
        })
      );
    });
    expect(container.querySelector('[data-testid="preview-skeleton"]')).toBeNull();
    expect(container.textContent).toContain("UNIQUE_DOC_A_BODY");
  });

  it("displays loading overlay on LiveSitePreview when post URL changes and clears it on iframe load", async () => {
    await act(async () => {
      root.render(
        React.createElement(LiveSitePreview, {
          serverUrl: "http://localhost:4000",
          serverRunning: true,
          currentPostUrl: "http://localhost:4000/2026/11/26/post-1/",
          locale: "zh-CN",
        })
      );
    });

    expect(container.querySelector('[data-testid="live-preview-loading"]')).not.toBeNull();
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();

    await act(async () => {
      iframe!.dispatchEvent(new Event("load"));
    });
    expect(container.querySelector('[data-testid="live-preview-loading"]')).toBeNull();

    // Navigate to another post -> loading indicator returns immediately
    await act(async () => {
      root.render(
        React.createElement(LiveSitePreview, {
          serverUrl: "http://localhost:4000",
          serverRunning: true,
          currentPostUrl: "http://localhost:4000/2026/11/26/post-2/",
          locale: "zh-CN",
        })
      );
    });
    expect(container.querySelector('[data-testid="live-preview-loading"]')).not.toBeNull();
  });

  it("restores lastActiveFilePath on hydrate() when present and shows WelcomePane when absent", async () => {
    const post = makePost({
      filePath: "/blog/source/_posts/restored.md",
      title: "Restored Post",
    });

    vi.spyOn(api, "loadSetting").mockImplementation(async (key, fallback) => {
      if (key === "activeSiteRoot") return "/blog" as never;
      if (key === "sites") {
        return [{ rootPath: "/blog", title: "Demo Blog", addedAt: 1, engine: "hexo" }] as never;
      }
      if (key === "lastActiveFilePath") {
        return "/blog/source/_posts/restored.md" as never;
      }
      return fallback as never;
    });

    vi.spyOn(api, "scanHexoSite").mockResolvedValue({
      config: {
        engine: "hexo",
        rootPath: "/blog",
        title: "Demo Blog",
        sourceDir: "source",
        postAssetFolder: true,
        defaultLayout: "post",
        hasPostsDir: true,
        hasDraftsDir: true,
        hasScaffoldPost: true,
      },
      posts: [post],
      allTags: [],
      allCategories: [],
    });

    vi.spyOn(api, "readDocument").mockResolvedValue({
      filePath: post.filePath,
      content: "---\ntitle: Restored Post\n---\n\nHello restored",
      modifiedMs: 123,
    });

    useAppStore.setState({ hydrated: false, tabs: [], activeTabId: null });
    await act(async () => {
      await useAppStore.getState().hydrate();
    });

    expect(useAppStore.getState().tabs).toHaveLength(1);
    expect(useAppStore.getState().tabs[0].filePath).toBe(post.filePath);
    expect(useAppStore.getState().activeTabId).toBe(useAppStore.getState().tabs[0].id);

    // Absent lastActiveFilePath -> leaves tabs empty so WelcomePane renders
    vi.restoreAllMocks();
    vi.spyOn(api, "loadSetting").mockImplementation(async (_key, fallback) => fallback as never);
    useAppStore.setState({ hydrated: false, tabs: [], activeTabId: null, activeSiteRoot: null });
    await act(async () => {
      await useAppStore.getState().hydrate();
    });
    expect(useAppStore.getState().tabs).toHaveLength(0);
    expect(useAppStore.getState().activeTabId).toBeNull();
  });
});
