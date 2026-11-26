import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { act, createRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CommandPalette,
  type CommandPaletteItem,
} from "@/components/command/CommandPalette";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/editor/MarkdownEditor";
import {
  WelcomePane,
  type WelcomeRecentEntry,
} from "@/components/layout/WelcomePane";
import { QuickOpenMenu } from "@/components/quickopen/QuickOpenMenu";
import {
  OutlinePanel,
  type OutlineItem,
} from "@/components/sidebar/OutlinePanel";
import { Sidebar } from "@/components/sidebar/Sidebar";
import {
  HexoTerminalDrawer,
  type HexoTerminalLogEntry,
  type HexoTerminalStatus,
} from "@/components/terminal/HexoTerminalDrawer";
import { useAppStore } from "@/stores/useAppStore";

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

describe("Stage 2 minimalist UI & workbench components", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useAppStore.setState({ locale: "zh-CN", sites: [], tabs: [], activeTabId: null });
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

  it("toggles MarkdownEditor line numbers dynamically via Compartment without losing content, scroll, or undo history", async () => {
    const editorRef = createRef<MarkdownEditorHandle>();

    function EditorHarness({ showLineNumbers }: { showLineNumbers?: boolean }) {
      const [val, setVal] = useState("# Title\n\nFirst paragraph\nSecond line");
      return (
        <MarkdownEditor
          ref={editorRef}
          value={val}
          onChange={setVal}
          showLineNumbers={showLineNumbers}
        />
      );
    }

    // Default showLineNumbers is false
    await act(async () => {
      root.render(<EditorHarness />);
    });

    const initialEditorEl = container.querySelector<HTMLElement>(".cm-editor");
    expect(initialEditorEl).not.toBeNull();
    const initialView = EditorView.findFromDOM(initialEditorEl!);
    expect(initialView).not.toBeNull();
    expect(container.querySelector(".cm-lineNumbers")).toBeNull();

    // Edit content, move selection, set scrollTop
    await act(async () => {
      initialView!.dispatch({
        changes: {
          from: initialView!.state.doc.length,
          insert: "\nKEEP_ME_FOR_UNDO",
        },
        selection: { anchor: 6 },
      });
    });
    initialView!.scrollDOM.scrollTop = 96;
    expect(initialView!.state.doc.toString()).toContain("KEEP_ME_FOR_UNDO");

    // Toggle line numbers ON
    await act(async () => {
      root.render(<EditorHarness showLineNumbers={true} />);
    });

    const afterOnEl = container.querySelector<HTMLElement>(".cm-editor");
    expect(afterOnEl).toBe(initialEditorEl);
    expect(EditorView.findFromDOM(afterOnEl!)).toBe(initialView);
    expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(initialView!.state.doc.toString()).toContain("KEEP_ME_FOR_UNDO");
    expect(initialView!.state.selection.main.head).toBe(6);
    expect(initialView!.scrollDOM.scrollTop).toBe(96);

    // Toggle line numbers OFF again
    await act(async () => {
      root.render(<EditorHarness showLineNumbers={false} />);
    });

    expect(container.querySelector(".cm-lineNumbers")).toBeNull();
    expect(EditorView.findFromDOM(container.querySelector(".cm-editor")!)).toBe(
      initialView
    );
    expect(initialView!.scrollDOM.scrollTop).toBe(96);

    // Undo stack must still work after toggling line numbers
    await act(async () => {
      const undone = undo(initialView!);
      expect(undone).toBe(true);
    });
    expect(initialView!.state.doc.toString()).not.toContain("KEEP_ME_FOR_UNDO");
  });

  it("renders OutlinePanel hierarchy, highlights active heading by line, and invokes onSelectLine on click", async () => {
    const items: OutlineItem[] = [
      { id: "intro", level: 1, text: "Introduction", line: 3 },
      { id: "setup", level: 2, text: "Setup Guide", line: 12 },
      { id: "details", level: 3, text: "Deep Details", line: 28 },
    ];
    const onSelectLine = vi.fn();

    await act(async () => {
      root.render(
        <OutlinePanel
          items={items}
          activeLine={18}
          onSelectLine={onSelectLine}
          emptyText="暂无大纲"
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute("aria-current")).toBeNull();
    expect(buttons[1].getAttribute("aria-current")).toBe("location");
    expect(buttons[2].getAttribute("aria-current")).toBeNull();

    // Indentation grows strictly with heading level
    const p0 = parseInt(buttons[0].style.paddingLeft, 10);
    const p1 = parseInt(buttons[1].style.paddingLeft, 10);
    const p2 = parseInt(buttons[2].style.paddingLeft, 10);
    expect(p1).toBeGreaterThan(p0);
    expect(p2).toBeGreaterThan(p1);

    await act(async () => {
      buttons[2].click();
    });
    expect(onSelectLine).toHaveBeenCalledWith(28, "details");

    // Empty state
    await act(async () => {
      root.render(
        <OutlinePanel
          items={[]}
          activeLine={1}
          onSelectLine={onSelectLine}
          emptyText="当前文档暂无标题"
        />
      );
    });
    expect(container.textContent).toContain("当前文档暂无标题");
  });

  it("filters CommandPalette items fuzzily and executes highlighted command via ArrowDown + Enter", async () => {
    const onOpenPost = vi.fn();
    const onDeploy = vi.fn();
    const onToggleFocus = vi.fn();
    const onOpenChange = vi.fn();

    const items: CommandPaletteItem[] = [
      {
        id: "post-1",
        label: "Hexo 写作指南",
        group: "文章跳转",
        keywords: ["guide", "hexo"],
        onSelect: onOpenPost,
      },
      {
        id: "hexo-deploy",
        label: "一键部署 (hexo g -d)",
        group: "Hexo 命令",
        keywords: ["deploy", "hgd"],
        onSelect: onDeploy,
      },
      {
        id: "view-focus",
        label: "切换专注模式",
        group: "视图",
        keywords: ["focus"],
        onSelect: onToggleFocus,
      },
    ];

    await act(async () => {
      root.render(
        <CommandPalette
          open={true}
          onOpenChange={onOpenChange}
          items={items}
        />
      );
    });

    const input = document.body.querySelector<HTMLInputElement>(
      'input[type="text"]'
    );
    expect(input).not.toBeNull();

    const initialOptions = document.body.querySelectorAll('[role="option"]');
    expect(initialOptions).toHaveLength(3);

    // Filter with fuzzy query matching two items ("hexo")
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(input, "hexo");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const filteredOptions = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')
    );
    expect(filteredOptions).toHaveLength(2);
    expect(filteredOptions[0].getAttribute("aria-selected")).toBe("true");

    // ArrowDown selects second option, Enter executes it and closes palette
    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });

    const updatedOptions = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')
    );
    expect(updatedOptions[1].getAttribute("aria-selected")).toBe("true");

    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDeploy).toHaveBeenCalledTimes(1);
    expect(onOpenPost).not.toHaveBeenCalled();

    // Escape closes palette
    onOpenChange.mockClear();
    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("preserves user search query in CommandPalette when items array updates while open", async () => {
    const onOpenChange = vi.fn();
    const baseItems: CommandPaletteItem[] = [
      { id: "a", label: "启动预览", group: "Hexo", onSelect: vi.fn() },
      { id: "b", label: "保存当前文档", group: "文档", onSelect: vi.fn() },
    ];

    await act(async () => {
      root.render(
        <CommandPalette open={true} onOpenChange={onOpenChange} items={baseItems} />
      );
    });

    const input = document.body.querySelector<HTMLInputElement>("input[type='text']")!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    await act(async () => {
      setter.call(input, "预览");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe("预览");

    // Re-render with a fresh items array reference (e.g. triggered by background log updates)
    const updatedItems: CommandPaletteItem[] = [
      ...baseItems,
      { id: "c", label: "新增命令", group: "Hexo", onSelect: vi.fn() },
    ];
    await act(async () => {
      root.render(
        <CommandPalette open={true} onOpenChange={onOpenChange} items={updatedItems} />
      );
    });

    expect(input.value).toBe("预览");
    const visibleOptions = document.body.querySelectorAll('[role="option"]');
    expect(visibleOptions).toHaveLength(1);
    expect(visibleOptions[0].textContent).toContain("启动预览");

    // Closing and reopening should reset query cleanly
    await act(async () => {
      root.render(
        <CommandPalette open={false} onOpenChange={onOpenChange} items={updatedItems} />
      );
    });
    await act(async () => {
      root.render(
        <CommandPalette open={true} onOpenChange={onOpenChange} items={updatedItems} />
      );
    });
    const reopenedInput =
      document.body.querySelector<HTMLInputElement>("input[type='text']")!;
    expect(reopenedInput.value).toBe("");
  });

  it("renders HexoTerminalDrawer status, colored log streams, and fires all action callbacks", async () => {
    const onOpenChange = vi.fn();
    const onRunAction = vi.fn();
    const onStop = vi.fn();
    const onKillPort = vi.fn();
    const onClearLogs = vi.fn();
    const onOpenServerUrl = vi.fn();

    const idleStatus: HexoTerminalStatus = {
      running: false,
      action: null,
      serverRunning: false,
      serverUrl: null,
    };

    const logs: HexoTerminalLogEntry[] = [
      { id: "1", stream: "system", line: "$ hexo g -d", timestamp: 1700000000000 },
      { id: "2", stream: "stdout", line: "INFO  Files loaded in 120 ms", timestamp: 1700000001000 },
      { id: "3", stream: "stderr", line: "ERROR Deploy failed", timestamp: 1700000002000 },
    ];

    // Expanded with logs
    await act(async () => {
      root.render(
        <HexoTerminalDrawer
          status={idleStatus}
          logs={logs}
          open={true}
          onOpenChange={onOpenChange}
          onRunAction={onRunAction}
          onStop={onStop}
          onKillPort={onKillPort}
          onClearLogs={onClearLogs}
          onOpenServerUrl={onOpenServerUrl}
        />
      );
    });

    const logPanel = container.querySelector('[role="log"]');
    expect(logPanel).not.toBeNull();
    expect(logPanel!.querySelector('[data-stream="system"]')?.textContent).toContain("$ hexo g -d");
    expect(logPanel!.querySelector('[data-stream="stdout"]')?.textContent).toContain("Files loaded");
    expect(logPanel!.querySelector('[data-stream="stderr"]')?.textContent).toContain("Deploy failed");

    const clickByTitle = async (title: string) => {
      const btn = container.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
      expect(btn).not.toBeNull();
      await act(async () => {
        btn!.click();
      });
    };

    await clickByTitle("启动预览 (hexo s)");
    await clickByTitle("生成 (g)");
    await clickByTitle("一键部署 (g -d)");
    await clickByTitle("部署 (d)");
    await clickByTitle("清理 (clean)");
    await clickByTitle("释放端口");
    await clickByTitle("清空日志");
    await clickByTitle("收起日志");

    expect(onRunAction.mock.calls.map((c) => c[0])).toEqual([
      "server",
      "generate",
      "generate_deploy",
      "deploy",
      "clean",
    ]);
    expect(onKillPort).toHaveBeenCalledTimes(1);
    expect(onClearLogs).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Collapsed while server is running shows URL and stop preview button
    await act(async () => {
      root.render(
        <HexoTerminalDrawer
          status={{
            running: true,
            action: "server",
            serverRunning: true,
            serverUrl: "http://localhost:4000",
          }}
          logs={logs}
          open={false}
          onOpenChange={onOpenChange}
          onRunAction={onRunAction}
          onStop={onStop}
          onKillPort={onKillPort}
          onClearLogs={onClearLogs}
          onOpenServerUrl={onOpenServerUrl}
        />
      );
    });

    expect(container.querySelector('[role="log"]')).toBeNull();
    expect(container.textContent).toContain("本地服务运行中 http://localhost:4000");

    await clickByTitle("停止预览");
    expect(onStop).toHaveBeenCalledTimes(1);

    await clickByTitle("http://localhost:4000");
    expect(onOpenServerUrl).toHaveBeenCalledWith("http://localhost:4000");
  });

  it("renders WelcomePane 4 quick entries and recent opened entries with click handlers", async () => {
    const onRequestNewPost = vi.fn();
    const onOpenRecent = vi.fn();
    const now = Date.now();
    const recentEntries: WelcomeRecentEntry[] = [
      {
        path: "/Users/demo/blog",
        title: "My Hexo Blog",
        kind: "site",
        openedAt: now - 3 * 60 * 1000,
      },
      {
        path: "/Users/demo/blog/source/_posts/hello.md",
        title: "Hello Hexo V2",
        kind: "file",
        openedAt: now - 2 * 60 * 60 * 1000,
      },
    ];

    await act(async () => {
      root.render(
        <WelcomePane
          recentEntries={recentEntries}
          onOpenRecent={onOpenRecent}
          onRequestNewPost={onRequestNewPost}
        />
      );
    });

    expect(container.textContent).toContain("新建文章");
    expect(container.textContent).toContain("打开本地文件");
    expect(container.textContent).toContain("添加 Hexo 站点");
    expect(container.textContent).toContain("新建临时草稿");
    expect(container.textContent).toContain("My Hexo Blog");
    expect(container.textContent).toContain("/Users/demo/blog/source/_posts/hello.md");

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    const newPostBtn = buttons.find((b) => b.textContent?.includes("新建文章"));
    expect(newPostBtn).toBeDefined();
    await act(async () => {
      newPostBtn!.click();
    });
    expect(onRequestNewPost).toHaveBeenCalledTimes(1);

    const recentFileBtn = buttons.find((b) =>
      b.textContent?.includes("Hello Hexo V2")
    );
    expect(recentFileBtn).toBeDefined();
    await act(async () => {
      recentFileBtn!.click();
    });
    expect(onOpenRecent).toHaveBeenCalledWith(recentEntries[1]);
  });

  it("renders QuickOpenMenu items with availability states and invokes onSelectTarget", async () => {
    const onSelectTarget = vi.fn();

    await act(async () => {
      root.render(
        <QuickOpenMenu
          availability={{
            postDir: true,
            postAssetDir: false,
            imagesDir: true,
            siteRoot: true,
            blogHome: false,
            localPreview: true,
          }}
          onSelectTarget={onSelectTarget}
        />
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>("button");
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain("快捷打开");

    // Open Radix dropdown menu via pointerdown / keyboard Enter
    await act(async () => {
      trigger!.focus();
      trigger!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });

    const menuItems = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
    expect(menuItems).toHaveLength(6);

    const postAssetItem = menuItems.find((el) =>
      el.textContent?.includes("本文图片目录")
    );
    const blogHomeItem = menuItems.find((el) =>
      el.textContent?.includes("博客线上主页")
    );
    const localPreviewItem = menuItems.find((el) =>
      el.textContent?.includes("本地预览主页")
    );

    expect(postAssetItem?.getAttribute("data-disabled")).not.toBeNull();
    expect(blogHomeItem?.getAttribute("data-disabled")).not.toBeNull();
    expect(localPreviewItem?.getAttribute("data-disabled")).toBeNull();

    await act(async () => {
      localPreviewItem!.click();
    });
    expect(onSelectTarget).toHaveBeenCalledWith("local_preview");
  });

  it("renders draft badge and date with nowrap and shrink-0 in narrow sidebar post items", async () => {
    useAppStore.setState({
      locale: "zh-CN",
      activeSiteRoot: "/demo-site",
      sidebarTab: "posts",
      filterTab: "all",
      searchQuery: "",
      selectedCategory: null,
      selectedTag: null,
      siteConfig: {
        rootPath: "/demo-site",
        title: "Demo",
        sourceDir: "source",
        postAssetFolder: true,
        defaultLayout: "post",
        hasPostsDir: true,
        hasDraftsDir: true,
        hasScaffoldPost: true,
      },
      posts: [
        {
          title: "V2 发版说明草稿",
          fileName: "V2-发版草稿.md",
          filePath: "/demo-site/source/_drafts/V2-发版草稿.md",
          relativePath: "_drafts/V2-发版草稿.md",
          slug: "V2-发版草稿",
          date: "2026-11-26 10:30:00",
          updated: "",
          tags: ["HexoEditor", "V2"],
          categories: ["发布"],
          isDraft: true,
          hasAssetFolder: false,
          excerpt: "",
          modifiedMs: Date.now(),
        },
      ],
      allTags: [],
      allCategories: [],
      tabs: [],
      activeTabId: null,
    });

    await act(async () => {
      root.render(<Sidebar onRequestNewPost={vi.fn()} />);
    });

    const titleRow = container.querySelector<HTMLElement>(
      '[title="V2 发版说明草稿"]'
    );
    expect(titleRow).not.toBeNull();

    const draftBadge = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent?.trim() === "草稿"
    );
    expect(draftBadge).toBeDefined();
    expect(draftBadge!.className).toContain("whitespace-nowrap");
    expect(draftBadge!.className).toContain("shrink-0");

    const dateSpan = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent?.trim() === "2026-11-26"
    );
    expect(dateSpan).toBeDefined();
    expect(dateSpan!.className).toContain("whitespace-nowrap");
    expect(dateSpan!.className).toContain("shrink-0");
  });

  it("renders Hugo labels in HexoTerminalDrawer and Hugo engine badge in Sidebar", async () => {
    const idleStatus: HexoTerminalStatus = {
      running: false,
      action: null,
      serverRunning: false,
      serverUrl: null,
    };

    await act(async () => {
      root.render(
        <HexoTerminalDrawer
          status={idleStatus}
          logs={[]}
          open={true}
          onOpenChange={vi.fn()}
          onRunAction={vi.fn()}
          onStop={vi.fn()}
          onKillPort={vi.fn()}
          onClearLogs={vi.fn()}
          engine="hugo"
        />
      );
    });

    expect(container.textContent).toContain("Hugo 终端");
    expect(container.querySelector('button[title="启动预览 (hugo server -D)"]')).not.toBeNull();
    expect(container.querySelector('button[title="构建 (hugo)"]')).not.toBeNull();
    expect(container.querySelector('button[title="部署 (hugo deploy)"]')).not.toBeNull();
    expect(container.querySelector('button[title="清理 (clean)"]')).not.toBeNull();
    expect(container.textContent).toContain("暂无 Hugo 命令输出日志");

    useAppStore.setState({
      activeSiteRoot: "/hugo-site",
      sites: [{ rootPath: "/hugo-site", title: "Zac Hugo", addedAt: 1, engine: "hugo" }],
      siteConfig: {
        engine: "hugo",
        rootPath: "/hugo-site",
        title: "Zac Hugo",
        sourceDir: "content",
        postAssetFolder: true,
        defaultLayout: "post",
        hasPostsDir: true,
        hasDraftsDir: false,
        hasScaffoldPost: false,
      },
      posts: [],
      allTags: [],
      allCategories: [],
      tabs: [],
      activeTabId: null,
    });

    await act(async () => {
      root.render(<Sidebar onRequestNewPost={vi.fn()} />);
    });

    const engineBadge = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent?.trim() === "Hugo"
    );
    expect(engineBadge).toBeDefined();
  });
});
