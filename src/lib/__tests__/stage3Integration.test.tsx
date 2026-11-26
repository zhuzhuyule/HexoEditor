import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  replaceLocalImageInMarkdown,
  restoreRemoteImageInMarkdown,
} from "@/lib/markdown/imageRefs";
import * as api from "@/lib/tauri/api";
import * as imageBedApi from "@/lib/tauri/imageBedApi";
import { useAppStore } from "@/stores/useAppStore";
import type { EditorTab } from "@/types";
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
  const content =
    overrides.content ??
    "---\ntitle: Stage 3 Article\n---\n\n# 标题一\n\n![封面](<封面 图.png>)\n\n{% asset_img chart.png 架构图 %}\n";
  return {
    id: overrides.id ?? "tab-s3",
    filePath:
      overrides.filePath !== undefined
        ? overrides.filePath
        : "/blog/source/_posts/stage3.md",
    title: overrides.title ?? "Stage 3 Article",
    content,
    savedContent: overrides.savedContent ?? content,
    isDirty: overrides.isDirty ?? false,
    isDraft: overrides.isDraft ?? false,
    isStandalone: overrides.isStandalone ?? false,
    siteRoot: overrides.siteRoot !== undefined ? overrides.siteRoot : "/blog",
    postAssetFolder: overrides.postAssetFolder ?? true,
    sourceDir: overrides.sourceDir ?? "source",
    modifiedMs: overrides.modifiedMs ?? Date.now(),
    externalChange: overrides.externalChange ?? null,
    cursorLine: overrides.cursorLine ?? 5,
    cursorCol: overrides.cursorCol ?? 1,
  };
}

function resetStage3Store() {
  useAppStore.setState({
    hydrated: true,
    locale: "zh-CN",
    sites: [],
    activeSiteRoot: "/blog",
    siteConfig: null,
    posts: [],
    allTags: [],
    allCategories: [],
    isScanning: false,
    sidebarOpen: true,
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

describe("Stage 3 workbench integration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetStage3Store();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("opens SettingsDialog via Cmd+, even when CodeMirror is focused, and live-updates typography & codeTheme without remounting EditorView", async () => {
    const tab = makeTab();
    useAppStore.setState({ tabs: [tab], activeTabId: tab.id });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    const appRoot = container.querySelector<HTMLElement>("[data-code-theme]")!;
    expect(appRoot.getAttribute("data-code-theme")).toBe("github-light");

    const editorEl = container.querySelector<HTMLElement>(".cm-editor")!;
    const initialView = EditorView.findFromDOM(editorEl)!;
    const cmContent = container.querySelector<HTMLElement>(".cm-content")!;
    cmContent.focus();

    // Open Settings via Cmd+,
    await act(async () => {
      cmContent.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: ",",
          code: "Comma",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(document.body.textContent).toContain("编辑与外观");

    // Live-update editorPrefs (typography + zoom + dark code theme)
    await act(async () => {
      useAppStore.getState().setEditorPrefs({
        fontFamily: "serif",
        fontSize: 22,
        lineHeight: 2.0,
        tabSize: 4,
        zoomLevel: 125,
        codeTheme: "github-dark",
      });
    });

    expect(appRoot.getAttribute("data-code-theme")).toBe("github-dark");
    expect(appRoot.getAttribute("data-zoom-level")).toBe("125");
    // 22px * 125% = 27.5px must not be clamped back down to 22px
    expect(
      container
        .querySelector("[data-effective-font-size]")
        ?.getAttribute("data-effective-font-size")
    ).toBe("27.5");
    // EditorView instance is preserved across typography reconfiguration
    expect(EditorView.findFromDOM(container.querySelector(".cm-editor")!)).toBe(
      initialView
    );
  });

  it("honors externalChangePolicy auto (silent reload clean, prompt dirty) and ignore", async () => {
    const readSpy = vi.spyOn(api, "readDocument").mockResolvedValue({
      filePath: "/blog/source/_posts/clean.md",
      content: "# Updated On Disk",
      modifiedMs: Date.now() + 1000,
    });

    const cleanTab = makeTab({
      id: "tab-clean",
      filePath: "/blog/source/_posts/clean.md",
      content: "# Original",
      savedContent: "# Original",
      isDirty: false,
    });
    const dirtyTab = makeTab({
      id: "tab-dirty",
      filePath: "/blog/source/_posts/dirty.md",
      content: "# Local Unsaved",
      savedContent: "# Original",
      isDirty: true,
    });

    // 1. Policy = "auto"
    useAppStore.setState({
      tabs: [cleanTab, dirtyTab],
      activeTabId: cleanTab.id,
      editorPrefs: { ...DEFAULT_EDITOR_PREFS, externalChangePolicy: "auto" },
    });

    await act(async () => {
      useAppStore.getState().handleExternalChange({
        filePath: "/blog/source/_posts/clean.md",
        kind: "modify",
      });
      await Promise.resolve();
    });

    expect(readSpy).toHaveBeenCalledWith("/blog/source/_posts/clean.md");
    const reloadedClean = useAppStore
      .getState()
      .tabs.find((t) => t.id === "tab-clean")!;
    expect(reloadedClean.content).toBe("# Updated On Disk");
    expect(reloadedClean.externalChange).toBeNull();

    // Dirty tab under "auto" falls back to banner so unsaved edits are never overwritten
    await act(async () => {
      useAppStore.getState().handleExternalChange({
        filePath: "/blog/source/_posts/dirty.md",
        kind: "modify",
      });
    });
    const flaggedDirty = useAppStore
      .getState()
      .tabs.find((t) => t.id === "tab-dirty")!;
    expect(flaggedDirty.externalChange).not.toBeNull();

    // 2. Policy = "ignore"
    useAppStore.setState({
      tabs: [
        makeTab({
          id: "tab-ignored",
          filePath: "/blog/source/_posts/ignored.md",
          isDirty: false,
        }),
      ],
      activeTabId: "tab-ignored",
      editorPrefs: { ...DEFAULT_EDITOR_PREFS, externalChangePolicy: "ignore" },
    });
    readSpy.mockClear();

    await act(async () => {
      useAppStore.getState().handleExternalChange({
        filePath: "/blog/source/_posts/ignored.md",
        kind: "modify",
      });
      await Promise.resolve();
    });

    expect(readSpy).not.toHaveBeenCalled();
    expect(
      useAppStore.getState().tabs.find((t) => t.id === "tab-ignored")!
        .externalChange
    ).toBeNull();
  });

  it("saves all modified file-backed tabs via saveAllTabs and Cmd+Alt+S while skipping unsaved scratch tabs", async () => {
    const writeSpy = vi.spyOn(api, "writeDocument").mockResolvedValue(999999);
    const saveAsSpy = vi
      .spyOn(api, "pickSaveMarkdownPath")
      .mockResolvedValue(null);

    const dirty1 = makeTab({
      id: "dirty-1",
      filePath: "/tmp/one.md",
      content: "one edited",
      savedContent: "one",
      isDirty: true,
      isStandalone: true,
      siteRoot: null,
    });
    const dirty2 = makeTab({
      id: "dirty-2",
      filePath: "/tmp/two.md",
      content: "two edited",
      savedContent: "two",
      isDirty: true,
      isStandalone: true,
      siteRoot: null,
    });
    const scratch = makeTab({
      id: "scratch-1",
      filePath: null,
      content: "unsaved scratch",
      savedContent: "",
      isDirty: true,
      isStandalone: true,
      siteRoot: null,
    });

    useAppStore.setState({
      tabs: [dirty1, dirty2, scratch],
      activeTabId: dirty1.id,
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          code: "KeyS",
          metaKey: true,
          altKey: true,
          bubbles: true,
        })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeSpy).toHaveBeenCalledTimes(2);
    expect(writeSpy).toHaveBeenCalledWith("/tmp/one.md", "one edited");
    expect(writeSpy).toHaveBeenCalledWith("/tmp/two.md", "two edited");
    expect(saveAsSpy).not.toHaveBeenCalled();
  });

  it("uploads local images to image bed, rewrites Markdown/Hexo refs, removes local files when configured, and rolls back cleanly on undo", async () => {
    const uploadSpy = vi
      .spyOn(imageBedApi, "uploadImagesToBed")
      .mockResolvedValue({
        provider: "s3",
        total: 2,
        succeeded: 2,
        failed: 0,
        items: [
          {
            localPath: "/blog/source/_posts/stage3/封面 图.png",
            remoteUrl: "https://cdn.example.com/posts/cover.png",
            remoteKey: "posts/cover.png",
            success: true,
            error: null,
          },
          {
            localPath: "/blog/source/_posts/stage3/chart.png",
            remoteUrl: "https://cdn.example.com/posts/chart.png",
            remoteKey: "posts/chart.png",
            success: true,
            error: null,
          },
        ],
      });

    const deleteLocalSpy = vi
      .spyOn(imageBedApi, "deleteLocalImages")
      .mockResolvedValue({
        deletedPaths: [
          "/blog/source/_posts/stage3/封面 图.png",
          "/blog/source/_posts/stage3/chart.png",
        ],
        skippedPaths: [],
        deletedCount: 2,
        freedBytes: 4096,
      });

    const deleteRemoteSpy = vi
      .spyOn(imageBedApi, "deleteRemoteImages")
      .mockResolvedValue({
        provider: "s3",
        supported: true,
        deletedKeys: ["posts/cover.png", "posts/chart.png"],
        failedKeys: [],
        message: "Deleted 2 objects",
      });

    const tab = makeTab();
    useAppStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      imageBed: {
        ...DEFAULT_IMAGE_BED_SETTINGS,
        provider: "s3",
        bucket: "my-blog",
        region: "us-east-1",
        accessKeyId: "AKIA",
        secretAccessKey: "SECRET",
        keepLocalAfterUpload: false,
      },
    });

    await act(async () => {
      await useAppStore.getState().uploadTabImagesToBed(tab.id, [
        {
          rawSrc: "封面 图.png",
          absolutePath: "/blog/source/_posts/stage3/封面 图.png",
        },
        {
          rawSrc: "chart.png",
          absolutePath: "/blog/source/_posts/stage3/chart.png",
        },
      ]);
    });

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(deleteLocalSpy).toHaveBeenCalledTimes(1);
    // Allowed dirs for Hexo post must NOT include the entire `_posts` directory
    const passedAllowedDirs = deleteLocalSpy.mock.calls[0][1];
    expect(passedAllowedDirs).not.toContain("/blog/source/_posts");
    expect(passedAllowedDirs).toContain("/blog/source/_posts/stage3");

    const afterUpload = useAppStore.getState().tabs[0].content;
    expect(afterUpload).toContain(
      "![封面](https://cdn.example.com/posts/cover.png)"
    );
    expect(afterUpload).toContain(
      "![架构图](https://cdn.example.com/posts/chart.png)"
    );
    expect(useAppStore.getState().lastUploadBatches[tab.id]?.records).toHaveLength(
      2
    );

    // Because local files were deleted (`localDeleted = true`), undo MUST NOT delete remote copies
    await act(async () => {
      await useAppStore
        .getState()
        .undoLastTabUpload(tab.id, { deleteRemote: true });
    });

    expect(deleteRemoteSpy).not.toHaveBeenCalled();
    const afterUndo = useAppStore.getState().tabs[0].content;
    expect(afterUndo).toContain("![封面](<封面 图.png>)");
    expect(afterUndo).toContain("![架构图](chart.png)");
    expect(useAppStore.getState().lastUploadBatches[tab.id]).toBeUndefined();

    // When keepLocalAfterUpload = true (local files preserved), undo with deleteRemote DOES delete remote keys
    useAppStore.setState({
      imageBed: {
        ...useAppStore.getState().imageBed,
        keepLocalAfterUpload: true,
      },
    });
    await act(async () => {
      await useAppStore.getState().uploadTabImagesToBed(tab.id, [
        {
          rawSrc: "封面 图.png",
          absolutePath: "/blog/source/_posts/stage3/封面 图.png",
        },
      ]);
    });
    await act(async () => {
      await useAppStore
        .getState()
        .undoLastTabUpload(tab.id, { deleteRemote: true });
    });
    expect(deleteRemoteSpy).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "s3" }),
      ["posts/cover.png"]
    );
  });

  it("handles imageRefs edge cases: class-prefixed asset_img, $ in replacement, and inline backtick lines", () => {
    const md = [
      "```inline``` text on one line",
      "{% asset_img center 封面.png 我的标题 %}",
      "{% img left /images/a.png 300 200 %}",
      "```md",
      "{% asset_img center 封面.png fenced %}",
      "```",
    ].join("\n");

    const r1 = replaceLocalImageInMarkdown(
      md,
      "封面.png",
      "https://cdn.example.com/cover.png"
    );
    expect(r1.replaced).toBe(1);
    expect(r1.content).toContain("![我的标题](https://cdn.example.com/cover.png)");
    expect(r1.content).toContain("{% asset_img center 封面.png fenced %}");

    const r2 = replaceLocalImageInMarkdown(
      r1.content,
      "/images/a.png",
      "https://cdn.example.com/$1_$&.png"
    );
    expect(r2.replaced).toBe(1);
    expect(r2.content).toContain("{% img left https://cdn.example.com/$1_$&.png 300 200 %}");

    const restored = restoreRemoteImageInMarkdown(
      r2.content,
      "https://cdn.example.com/$1_$&.png",
      "/images/price-$1.png"
    );
    expect(restored.restored).toBe(1);
    expect(restored.content).toContain("{% img left /images/price-$1.png 300 200 %}");
  });

  it("exports standalone HTML with inlined local Data URI images, triggers PDF print, and renders print-only fallback & .no-print chrome", async () => {
    const tab = makeTab({
      content:
        "---\ntitle: 导出测试\ndate: 2026-11-26\ncategories:\n  - 工程\n---\n\n# 章节\n\n![图](local.png)\n",
    });

    vi.spyOn(api, "resolveLocalImages").mockResolvedValue([
      {
        rawSrc: "local.png",
        absolutePath: "/blog/source/_posts/stage3/local.png",
        exists: true,
      },
    ]);
    const dataUriSpy = vi
      .spyOn(imageBedApi, "readLocalFileAsDataUri")
      .mockResolvedValue("data:image/png;base64,iVBORw0KGgo=");
    const pickHtmlSpy = vi
      .spyOn(api, "pickSaveHtmlPath")
      .mockResolvedValue("/tmp/export-test.html");
    const writeTextSpy = vi
      .spyOn(api, "writeTextFilePath")
      .mockResolvedValue(Date.now());
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    useAppStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      viewMode: "write",
      hexoCliStatus: {
        running: false,
        action: "generate",
        serverRunning: false,
        serverUrl: null,
        exitCode: 0,
        message: "Completed `hexo generate`.",
      },
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    // Verify shell chrome has .no-print & Write mode mounts .print-only-article fallback with resolved local image & metadata header
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector("header.no-print")).not.toBeNull();
    expect(container.querySelector("footer.no-print")).not.toBeNull();
    expect(container.querySelector("section.no-print")).not.toBeNull();
    const printFallback = container.querySelector(".print-only-article");
    expect(printFallback).not.toBeNull();
    expect(printFallback!.textContent).toContain("导出测试");
    expect(printFallback!.textContent).toContain("2026-11-26");
    expect(printFallback!.textContent).toContain("工程");
    expect(printFallback!.textContent).toContain("章节");
    expect(
      printFallback!.querySelector('img[data-local-image="true"]')
    ).not.toBeNull();

    // Verify Stage 2 review polish: localized HexoTerminalDrawer idle message & OutlinePanel aria-label
    await act(async () => {
      useAppStore.getState().setHexoCliStatus({
        running: false,
        action: "generate",
        serverRunning: false,
        serverUrl: null,
        exitCode: 0,
        message: "Completed `hexo generate`.",
      });
    });
    expect(container.textContent).toContain("已完成 hexo generate");
    await act(async () => {
      useAppStore.getState().setSidebarTab("outline");
    });
    expect(container.querySelector('nav[aria-label="文档大纲"]')).not.toBeNull();

    // Open CommandPalette to trigger Export HTML and Export PDF
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          code: "KeyK",
          metaKey: true,
          bubbles: true,
        })
      );
    });

    const exportHtmlOption = document.body.querySelector<HTMLButtonElement>(
      'button[data-command-id="doc:export-html"]'
    );
    expect(exportHtmlOption).not.toBeNull();
    await act(async () => {
      exportHtmlOption!.click();
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(dataUriSpy).toHaveBeenCalledWith(
      "/blog/source/_posts/stage3/local.png"
    );
    expect(pickHtmlSpy).toHaveBeenCalled();
    expect(writeTextSpy).toHaveBeenCalledWith(
      "/tmp/export-test.html",
      expect.stringContaining("data:image/png;base64,iVBORw0KGgo=")
    );

    // Trigger Export PDF via CommandPalette
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          code: "KeyK",
          metaKey: true,
          bubbles: true,
        })
      );
    });
    const exportPdfOption = document.body.querySelector<HTMLButtonElement>(
      'button[data-command-id="doc:export-pdf"]'
    );
    expect(exportPdfOption).not.toBeNull();
    await act(async () => {
      exportPdfOption!.click();
    });
    expect(printSpy).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("afterprint"));
  });

  it("renders a fixed-pixel resizable sidebar that updates on drag, clamps within bounds, and resets on double-click", async () => {
    const saveSpy = vi.spyOn(api, "saveSetting").mockResolvedValue(undefined);
    useAppStore.setState({
      sidebarOpen: true,
      sidebarWidth: 260,
      viewMode: "split",
      tabs: [],
      activeTabId: null,
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    const sidebarContainer = container.querySelector<HTMLElement>(
      '[data-testid="sidebar-container"]'
    );
    const resizeHandle = container.querySelector<HTMLElement>(
      '[data-testid="sidebar-resize-handle"]'
    );
    expect(sidebarContainer).not.toBeNull();
    expect(resizeHandle).not.toBeNull();
    expect(sidebarContainer!.style.width).toBe("260px");

    // Drag right by +60px -> 320px
    await act(async () => {
      resizeHandle!.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 260, bubbles: true })
      );
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 320, bubbles: true })
      );
    });
    expect(sidebarContainer!.style.width).toBe("320px");

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent("mouseup", { clientX: 320, bubbles: true })
      );
    });
    expect(useAppStore.getState().sidebarWidth).toBe(320);
    expect(saveSpy).toHaveBeenCalledWith("sidebarWidth", 320);

    // Drag beyond bounds (< 220 and > 440)
    await act(async () => {
      resizeHandle!.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 320, bubbles: true })
      );
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 50, bubbles: true })
      );
      window.dispatchEvent(
        new MouseEvent("mouseup", { clientX: 50, bubbles: true })
      );
    });
    expect(sidebarContainer!.style.width).toBe("220px");
    expect(useAppStore.getState().sidebarWidth).toBe(220);

    await act(async () => {
      resizeHandle!.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 220, bubbles: true })
      );
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 900, bubbles: true })
      );
      window.dispatchEvent(
        new MouseEvent("mouseup", { clientX: 900, bubbles: true })
      );
    });
    expect(sidebarContainer!.style.width).toBe("440px");
    expect(useAppStore.getState().sidebarWidth).toBe(440);

    // Double-click resets to 260px
    await act(async () => {
      resizeHandle!.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true })
      );
    });
    expect(sidebarContainer!.style.width).toBe("260px");
    expect(useAppStore.getState().sidebarWidth).toBe(260);
  });
});
