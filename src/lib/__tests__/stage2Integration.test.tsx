import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import * as api from "@/lib/tauri/api";
import * as hexoApi from "@/lib/tauri/hexoApi";
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
  return {
    id: overrides.id ?? "tab-s2",
    filePath: overrides.filePath !== undefined ? overrides.filePath : "/blog/source/_posts/hello.md",
    title: overrides.title ?? "Hello Stage 2",
    content:
      overrides.content ??
      "---\ntitle: Hello Stage 2\n---\n\n# 第一章 引言\n\n正文内容\n\n## 第二节 架构设计\n\n细节说明\n",
    savedContent:
      overrides.savedContent ??
      "---\ntitle: Hello Stage 2\n---\n\n# 第一章 引言\n\n正文内容\n\n## 第二节 架构设计\n\n细节说明\n",
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

function resetStage2Store() {
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

describe("Stage 2 workbench integration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetStage2Store();
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

  it("hides formatting toolbar and line numbers by default, and toggles both cleanly without destroying editor undo history", async () => {
    const tab = makeTab();
    useAppStore.setState({ tabs: [tab], activeTabId: tab.id });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    // Toolbar is hidden by default (Bold button not mounted)
    expect(useAppStore.getState().showToolbar).toBe(false);
    expect(container.querySelector('button[title="加粗 (⌘B)"]')).toBeNull();

    // Line numbers are hidden by default
    expect(useAppStore.getState().showLineNumbers).toBe(false);
    expect(container.querySelector(".cm-lineNumbers")).toBeNull();

    const editorEl = container.querySelector<HTMLElement>(".cm-editor")!;
    const view = EditorView.findFromDOM(editorEl)!;
    await act(async () => {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: "\n追加一段" },
      });
    });

    // Toggle toolbar & line numbers on via TabBar icon buttons
    const toolbarToggleBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="显示/隐藏格式工具栏"]'
    );
    const lineNumToggleBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="显示/隐藏编辑器行号"]'
    );
    expect(toolbarToggleBtn).not.toBeNull();
    expect(lineNumToggleBtn).not.toBeNull();

    await act(async () => {
      toolbarToggleBtn!.click();
      lineNumToggleBtn!.click();
    });

    expect(useAppStore.getState().showToolbar).toBe(true);
    expect(container.querySelector('button[title="加粗 (⌘B)"]')).not.toBeNull();
    expect(container.querySelector('button[title="链接 (⌘⇧L)"]')).not.toBeNull();

    expect(useAppStore.getState().showLineNumbers).toBe(true);
    expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();

    // EditorView instance and undo stack survive toggling line numbers
    expect(EditorView.findFromDOM(container.querySelector(".cm-editor")!)).toBe(view);
    await act(async () => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).not.toContain("追加一段");
  });

  it("opens CommandPalette on Cmd/Ctrl+K even when focus is inside CodeMirror editor, and supports Cmd+Option+1/2/3/4", async () => {
    const tab = makeTab();
    useAppStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      activeSiteRoot: "/blog",
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    const cmContent = container.querySelector<HTMLElement>(".cm-content")!;
    cmContent.focus();

    // Dispatch Cmd+K directly on CodeMirror contentDOM
    await act(async () => {
      cmContent.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          code: "KeyK",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    });

    const paletteInput = document.body.querySelector<HTMLInputElement>(
      'input[placeholder*="输入命令"]'
    );
    expect(paletteInput).not.toBeNull();

    // Close CommandPalette via Cmd+K toggle
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          code: "KeyK",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(
      document.body.querySelector('input[placeholder*="输入命令"]')
    ).toBeNull();

    // Verify Cmd+Option+1/2/3/4 view mode switching (macOS screenshot-safe)
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Digit3",
          key: "£",
          metaKey: true,
          altKey: true,
        })
      );
    });
    expect(useAppStore.getState().viewMode).toBe("read");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Digit4",
          key: "¢",
          metaKey: true,
          altKey: true,
        })
      );
    });
    expect(useAppStore.getState().viewMode).toBe("focus");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Digit2",
          key: "™",
          metaKey: true,
          altKey: true,
        })
      );
    });
    expect(useAppStore.getState().viewMode).toBe("split");
  });

  it("switches sidebar to Outline tab, renders headings, and syncs live preview toggle", async () => {
    const tab = makeTab();
    useAppStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      activeSiteRoot: "/blog",
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    const outlineTabBtn = container.querySelector<HTMLButtonElement>(
      'button[data-sidebar-tab="outline"]'
    );
    expect(outlineTabBtn).not.toBeNull();

    await act(async () => {
      outlineTabBtn!.click();
    });

    expect(useAppStore.getState().sidebarTab).toBe("outline");
    expect(container.textContent).toContain("第一章 引言");
    expect(container.textContent).toContain("第二节 架构设计");

    // Clicking an outline entry should execute without error
    const headingBtn = container.querySelector<HTMLButtonElement>(
      'button[data-outline-line]'
    );
    expect(headingBtn).not.toBeNull();
    await act(async () => {
      headingBtn!.click();
    });

    // Switch preview source to Live Site Preview via TabBar icon
    const livePreviewBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="真机预览 (Hexo Server)"]'
    );
    expect(livePreviewBtn).not.toBeNull();
    await act(async () => {
      livePreviewBtn!.click();
    });

    expect(useAppStore.getState().previewSource).toBe("live");
    expect(container.textContent).toContain("Hexo 本地真机预览未启动");
  });

  it("renders WelcomePane recent entries and opens clicked file or site directly", async () => {
    const readDocSpy = vi.spyOn(api, "readDocument").mockResolvedValue({
      filePath: "/notes/recent-note.md",
      content: "# Recent Note\n\nBody",
      modifiedMs: Date.now(),
    });

    useAppStore.setState({
      recentEntries: [
        {
          kind: "file",
          path: "/notes/recent-note.md",
          title: "Recent Note",
          openedAt: Date.now() - 30_000,
        },
        {
          kind: "site",
          path: "/my-hexo-blog",
          title: "My Hexo Blog",
          openedAt: Date.now() - 120_000,
        },
      ],
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    expect(container.textContent).toContain("最近打开");
    expect(container.textContent).toContain("Recent Note");
    expect(container.textContent).toContain("My Hexo Blog");

    const buttons = Array.from(container.querySelectorAll("button"));
    const recentFileBtn = buttons.find((b) =>
      b.textContent?.includes("Recent Note")
    );
    expect(recentFileBtn).toBeDefined();

    await act(async () => {
      recentFileBtn!.click();
      await Promise.resolve();
    });

    expect(readDocSpy).toHaveBeenCalledWith("/notes/recent-note.md");
    expect(useAppStore.getState().tabs).toHaveLength(1);
    expect(useAppStore.getState().tabs[0].filePath).toBe("/notes/recent-note.md");
  });

  it("auto-expands HexoTerminalDrawer on runHexoAction and caps streaming logs at 500", async () => {
    const runSpy = vi.spyOn(hexoApi, "runHexoCommand").mockResolvedValue({
      running: true,
      action: "generate",
      serverRunning: false,
      serverUrl: null,
      exitCode: null,
      message: "Running hexo g...",
    });

    useAppStore.setState({ activeSiteRoot: "/blog" });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    expect(useAppStore.getState().terminalOpen).toBe(false);

    await act(async () => {
      await useAppStore.getState().runHexoAction("generate");
    });

    expect(runSpy).toHaveBeenCalledWith("/blog", "generate");
    expect(useAppStore.getState().terminalOpen).toBe(true);
    expect(container.querySelector('[role="log"]')).not.toBeNull();

    // Append 520 log entries and confirm cap at 500
    await act(async () => {
      for (let i = 0; i < 520; i++) {
        useAppStore.getState().appendHexoLog({
          stream: "stdout",
          line: `line-${i}`,
          timestamp: Date.now() + i,
        });
      }
    });

    const logs = useAppStore.getState().hexoLogs;
    expect(logs).toHaveLength(500);
    expect(logs[0].line).toBe("line-20");
    expect(logs[499].line).toBe("line-519");
  });

  it("resolves custom site server port in killHexoPort when serverUrl is absent and avoids duplicate logs in Tauri runtime", async () => {
    const resolveSpy = vi.spyOn(hexoApi, "resolveQuickOpen").mockResolvedValue({
      target: "local_url",
      kind: "url",
      value: "http://127.0.0.1:4321/blog/",
      exists: true,
    });
    const killSpy = vi.spyOn(hexoApi, "killHexoPort").mockResolvedValue({
      port: 4321,
      killedPids: [9876],
      message: "Released port 4321 (terminated PID: 9876).",
    });

    useAppStore.setState({
      activeSiteRoot: "/blog",
      hexoCliStatus: {
        running: false,
        action: null,
        serverRunning: false,
        serverUrl: null,
        exitCode: null,
        message: null,
      },
      hexoLogs: [],
    });

    // Simulate Tauri runtime: Rust side emits the system log, so frontend must not double-append
    vi.spyOn(api, "isTauriRuntime").mockReturnValue(true);
    await act(async () => {
      await useAppStore.getState().killHexoPort();
    });

    expect(resolveSpy).toHaveBeenCalledWith({
      target: "local_preview",
      siteRoot: "/blog",
    });
    expect(killSpy).toHaveBeenCalledWith(4321);
    expect(useAppStore.getState().hexoLogs).toHaveLength(0);

    // Non-Tauri browser fallback still appends local system log
    vi.spyOn(api, "isTauriRuntime").mockReturnValue(false);
    await act(async () => {
      await useAppStore.getState().killHexoPort();
    });
    expect(useAppStore.getState().hexoLogs).toHaveLength(1);
    expect(useAppStore.getState().hexoLogs[0].line).toContain("4321");
  });

  it("auto-opens exact active post permalink in browser when user starts hexo server and allows manual re-open from drawer", async () => {
    const tab = makeTab({
      filePath: "/blog/source/_posts/测试文章.md",
      content: "---\ntitle: 测试文章\ndate: 2026-11-26 10:30:00\n---\n\n正文",
      siteRoot: "/blog",
    });
    useAppStore.setState({
      activeSiteRoot: "/blog",
      siteConfig: {
        rootPath: "/blog",
        title: "Demo",
        sourceDir: "source",
        postAssetFolder: true,
        defaultLayout: "post",
        hasPostsDir: true,
        hasDraftsDir: true,
        hasScaffoldPost: true,
        permalink: ":year/:month/:day/:title/",
        root: "/",
      },
      tabs: [tab],
      activeTabId: tab.id,
    });

    const openUrlSpy = vi.spyOn(api, "openExternalUrl").mockResolvedValue();
    vi.spyOn(hexoApi, "runHexoCommand").mockResolvedValue({
      running: true,
      action: "server",
      serverRunning: false,
      serverUrl: null,
      exitCode: null,
      message: "Starting hexo server...",
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    // Click "启动预览 (hexo s)" in bottom drawer
    const startBtn = container.querySelector<HTMLButtonElement>(
      'button[title="启动预览 (hexo s)"]'
    );
    expect(startBtn).not.toBeNull();
    await act(async () => {
      startBtn!.click();
    });
    expect(openUrlSpy).not.toHaveBeenCalled();

    // Server finishes booting and reports serverUrl
    await act(async () => {
      useAppStore.getState().setHexoCliStatus({
        running: true,
        action: "server",
        serverRunning: true,
        serverUrl: "http://localhost:4000/",
        exitCode: null,
        message: null,
      });
    });

    const expectedPostUrl =
      "http://localhost:4000/2026/11/26/%E6%B5%8B%E8%AF%95%E6%96%87%E7%AB%A0/";
    expect(openUrlSpy).toHaveBeenCalledTimes(1);
    expect(openUrlSpy).toHaveBeenCalledWith(expectedPostUrl);

    // Clicking the drawer link button opens the exact active post URL again
    const openPageBtn = container.querySelector<HTMLButtonElement>(
      'button[title="http://localhost:4000/2026/11/26/测试文章/"]'
    );
    expect(openPageBtn).not.toBeNull();
    await act(async () => {
      openPageBtn!.click();
    });
    expect(openUrlSpy).toHaveBeenCalledTimes(2);
    expect(openUrlSpy).toHaveBeenLastCalledWith(expectedPostUrl);
  });
});
