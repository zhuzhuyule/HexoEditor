import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/editor/MarkdownEditor";
import { TooltipProvider } from "@/components/ui/tooltip";
import * as api from "@/lib/tauri/api";
import { useAppStore } from "@/stores/useAppStore";
import type { EditorTab, SavedImageResult } from "@/types";
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

function makeFileTab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: overrides.id ?? "tab-1",
    filePath: overrides.filePath !== undefined ? overrides.filePath : "/tmp/demo.md",
    title: overrides.title ?? "Demo",
    content: overrides.content ?? "# Hello\n\nLine 1\nLine 2\nLine 3\n",
    savedContent: overrides.savedContent ?? "# Hello\n\nLine 1\nLine 2\nLine 3\n",
    isDirty: overrides.isDirty ?? false,
    isDraft: overrides.isDraft ?? false,
    isStandalone: overrides.isStandalone ?? true,
    siteRoot: overrides.siteRoot ?? null,
    postAssetFolder: overrides.postAssetFolder ?? false,
    sourceDir: overrides.sourceDir ?? "source",
    modifiedMs: overrides.modifiedMs ?? Date.now(),
    externalChange: overrides.externalChange ?? null,
    cursorLine: overrides.cursorLine ?? 1,
    cursorCol: overrides.cursorCol ?? 1,
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

describe("Workbench state preservation, auto-save, shortcuts, and multi-image drop", () => {
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

  it("preserves MarkdownEditor instance, undo history, cursor position, and scrollTop across view mode switches", async () => {
    const tab = makeFileTab({ id: "tab-preserve" });
    useAppStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
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

    // Perform an edit, place cursor at a known offset, and set scrollTop
    const insertText = "KEEP_UNDO_HISTORY";
    await act(async () => {
      initialView!.dispatch({
        changes: { from: initialView!.state.doc.length, insert: insertText },
        selection: { anchor: 5 },
      });
    });
    initialView!.scrollDOM.scrollTop = 128;

    expect(initialView!.state.doc.toString()).toContain(insertText);
    expect(initialView!.state.selection.main.head).toBe(5);

    // Cycle through split -> write -> focus -> read -> split -> write
    for (const mode of ["write", "focus", "read", "split", "write"] as const) {
      await act(async () => {
        useAppStore.getState().setViewMode(mode);
      });
      const currentEditorEl = container.querySelector<HTMLElement>(".cm-editor");
      expect(currentEditorEl).toBe(initialEditorEl);
      expect(EditorView.findFromDOM(currentEditorEl!)).toBe(initialView);
    }

    // Verify cursor, scrollTop, and CodeMirror undo history survived all transitions
    expect(initialView!.state.selection.main.head).toBe(5);
    expect(initialView!.scrollDOM.scrollTop).toBe(128);

    await act(async () => {
      const undone = undo(initialView!);
      expect(undone).toBe(true);
    });
    expect(initialView!.state.doc.toString()).not.toContain(insertText);
  });

  it("flushes auto-save immediately on setActiveTab and window blur without waiting for 1.5s debounce", async () => {
    vi.useFakeTimers();
    const writeSpy = vi.spyOn(api, "writeDocument").mockResolvedValue(999999);
    const saveAsSpy = vi.spyOn(api, "pickSaveMarkdownPath").mockResolvedValue(null);

    const tabA = makeFileTab({
      id: "tab-a",
      filePath: "/tmp/a.md",
      content: "edited A",
      savedContent: "orig A",
      isDirty: true,
    });
    const tabB = makeFileTab({
      id: "tab-b",
      filePath: "/tmp/b.md",
      content: "orig B",
      savedContent: "orig B",
      isDirty: false,
    });
    const scratchTab = makeFileTab({
      id: "tab-scratch",
      filePath: null,
      content: "unsaved scratch",
      savedContent: "",
      isDirty: true,
    });

    useAppStore.setState({
      autoSave: true,
      tabs: [tabA, tabB, scratchTab],
      activeTabId: tabA.id,
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    // 1. Switch tab before 1500ms debounce expires -> immediately saves tabA
    await act(async () => {
      useAppStore.getState().setActiveTab(tabB.id);
      await Promise.resolve();
    });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith("/tmp/a.md", "edited A");

    // Advancing past 1500ms should not trigger a duplicate save for tabA
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(writeSpy).toHaveBeenCalledTimes(1);

    // 2. Edit tabB, then trigger window blur before 1500ms -> immediately saves tabB
    await act(async () => {
      useAppStore.getState().updateTabContent(tabB.id, "edited B");
    });
    expect(writeSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await Promise.resolve();
    });
    expect(writeSpy).toHaveBeenCalledTimes(2);
    expect(writeSpy).toHaveBeenLastCalledWith("/tmp/b.md", "edited B");

    // Debounce timer should have been cleared on blur (no duplicate write)
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(writeSpy).toHaveBeenCalledTimes(2);

    // 3. Scratch tab (filePath: null) must NEVER open save-as dialog on tab switch or blur
    await act(async () => {
      useAppStore.getState().setActiveTab(scratchTab.id);
      window.dispatchEvent(new Event("blur"));
      useAppStore.getState().setActiveTab(tabA.id);
      await Promise.resolve();
    });
    expect(saveAsSpy).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledTimes(2);
  });

  it("handles Cmd/Ctrl+W close tab (with dirty confirm) and Cmd/Ctrl+Shift+1/2/3/4 view mode shortcuts", async () => {
    const cleanTab = makeFileTab({
      id: "tab-clean",
      title: "CleanTab",
      isDirty: false,
    });
    const dirtyTab = makeFileTab({
      id: "tab-dirty",
      title: "DirtyTab",
      content: "changed",
      savedContent: "orig",
      isDirty: true,
    });

    useAppStore.setState({
      tabs: [cleanTab, dirtyTab],
      activeTabId: cleanTab.id,
      viewMode: "split",
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    // View mode shortcuts (including shifted symbol keys as emitted on macOS/US keyboards)
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Digit1",
          key: "!",
          metaKey: true,
          shiftKey: true,
        })
      );
    });
    expect(useAppStore.getState().viewMode).toBe("write");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Digit3",
          key: "#",
          ctrlKey: true,
          shiftKey: true,
        })
      );
    });
    expect(useAppStore.getState().viewMode).toBe("read");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Digit4",
          key: "$",
          metaKey: true,
          shiftKey: true,
        })
      );
    });
    expect(useAppStore.getState().viewMode).toBe("focus");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Digit2",
          key: "@",
          metaKey: true,
          shiftKey: true,
        })
      );
    });
    expect(useAppStore.getState().viewMode).toBe("split");

    // Cmd+W on clean tab closes it immediately and activates dirtyTab
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "w", metaKey: true })
      );
    });
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(["tab-dirty"]);
    expect(useAppStore.getState().activeTabId).toBe("tab-dirty");

    // Ctrl+W on dirty tab keeps tab open and shows unsaved confirmation dialog
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "w", ctrlKey: true })
      );
    });
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(["tab-dirty"]);
    expect(document.body.textContent).toContain("未保存的更改");
    expect(document.body.textContent).toContain("DirtyTab");
  });

  it("inserts multiple DOM-dropped images sequentially in exact order with newline separation", async () => {
    const editorRef = createRef<MarkdownEditorHandle>();
    const events: string[] = [];

    const makeDropFile = (name: string, type: string, bytes: number[]) =>
      ({
        name,
        type,
        arrayBuffer: async () => new Uint8Array(bytes).buffer,
      }) as unknown as File;

    // Deliberately make earlier images resolve slower than later images
    const delays: Record<string, number> = {
      first: 35,
      second: 10,
      third: 1,
    };

    const onPasteImageBytes = vi.fn(
      async (
        _bytes: number[],
        ext: string | null,
        preferred: string | null,
        appendNewline?: boolean
      ) => {
        const key = preferred ?? "img";
        events.push(`start:${key}`);
        await new Promise((resolve) => setTimeout(resolve, delays[key] ?? 0));
        const snippet = `![](${key}.${ext ?? "png"})`;
        editorRef.current?.insertText(appendNewline ? `${snippet}\n` : snippet);
        events.push(`end:${key}`);
      }
    );

    await act(async () => {
      root.render(
        <MarkdownEditor
          ref={editorRef}
          value=""
          onChange={() => {}}
          onPasteImageBytes={onPasteImageBytes}
        />
      );
    });

    const view = editorRef.current?.getView();
    expect(view).not.toBeNull();

    const dropFiles = [
      makeDropFile("first.png", "image/png", [1]),
      makeDropFile("second.jpg", "image/jpeg", [2]),
      makeDropFile("third.webp", "image/webp", [3]),
    ];

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: { files: dropFiles },
    });

    await act(async () => {
      view!.contentDOM.dispatchEvent(dropEvent);
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    expect(dropEvent.defaultPrevented).toBe(true);
    expect(onPasteImageBytes).toHaveBeenCalledTimes(3);
    expect(events).toEqual([
      "start:first",
      "end:first",
      "start:second",
      "end:second",
      "start:third",
      "end:third",
    ]);
    expect(view!.state.doc.toString()).toBe(
      "![](first.png)\n![](second.jpg)\n![](third.webp)"
    );
  });

  it("deduplicates concurrent identical auto-saves and serializes overlapping edits per tab", async () => {
    const resolvers: Array<(ms: number) => void> = [];
    const writeCalls: Array<{ path: string; content: string }> = [];
    vi.spyOn(api, "writeDocument").mockImplementation((path, content) => {
      writeCalls.push({ path, content });
      return new Promise<number>((resolve) => {
        resolvers.push(resolve);
      });
    });

    const tabA = makeFileTab({
      id: "tab-race-a",
      filePath: "/tmp/race-a.md",
      content: "v1",
      savedContent: "v0",
      isDirty: true,
    });
    const tabB = makeFileTab({
      id: "tab-race-b",
      filePath: "/tmp/race-b.md",
      content: "b",
      savedContent: "b",
      isDirty: false,
    });

    useAppStore.setState({
      autoSave: true,
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    // Trigger blur (starts v1 write) then immediately switch tab before v1 resolves
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      useAppStore.getState().setActiveTab(tabB.id);
      await Promise.resolve();
    });

    // Identical in-flight save must be deduplicated to a single disk write
    expect(writeCalls).toEqual([{ path: "/tmp/race-a.md", content: "v1" }]);

    // Now edit tabA to v2 while v1 is still in flight and request another save
    let secondSavePromise: Promise<boolean> | undefined;
    await act(async () => {
      useAppStore.getState().updateTabContent(tabA.id, "v2");
      secondSavePromise = useAppStore.getState().saveTab(tabA.id, true);
      await Promise.resolve();
    });

    // v2 must wait for v1 to settle instead of racing out of order
    expect(writeCalls).toHaveLength(1);

    await act(async () => {
      resolvers[0](1001);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeCalls).toEqual([
      { path: "/tmp/race-a.md", content: "v1" },
      { path: "/tmp/race-a.md", content: "v2" },
    ]);

    await act(async () => {
      resolvers[1](1002);
      const ok = await secondSavePromise;
      expect(ok).toBe(true);
    });

    const finalTabA = useAppStore.getState().tabs.find((t) => t.id === tabA.id)!;
    expect(finalTabA.savedContent).toBe("v2");
    expect(finalTabA.isDirty).toBe(false);
  });

  it("handles native menu-close-tab events and keeps focus mode active when Esc closes a confirm modal", async () => {
    let triggerMenuClose: (() => void) | null = null;
    vi.spyOn(api, "listenMenuCloseTab").mockImplementation(async (handler) => {
      triggerMenuClose = handler;
      return () => {
        triggerMenuClose = null;
      };
    });

    const dirtyTab = makeFileTab({
      id: "tab-focus-dirty",
      title: "FocusDirty",
      content: "modified",
      savedContent: "original",
      isDirty: true,
    });
    const cleanTab = makeFileTab({
      id: "tab-focus-clean",
      title: "FocusClean",
      isDirty: false,
    });

    useAppStore.setState({
      tabs: [cleanTab, dirtyTab],
      activeTabId: cleanTab.id,
      viewMode: "focus",
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
      await Promise.resolve();
    });

    expect(triggerMenuClose).not.toBeNull();

    // Native menu Cmd+W closes clean tab and activates dirty tab
    await act(async () => {
      triggerMenuClose!();
    });
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(["tab-focus-dirty"]);
    expect(useAppStore.getState().activeTabId).toBe("tab-focus-dirty");

    // Native menu Cmd+W on dirty tab opens confirm dialog instead of closing immediately
    await act(async () => {
      triggerMenuClose!();
    });
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(["tab-focus-dirty"]);
    expect(document.body.textContent).toContain("FocusDirty");

    // Pressing Escape while confirm dialog is open must NOT exit focus mode
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(useAppStore.getState().viewMode).toBe("focus");
  });

  it("aborts pending DOM image drop insertion if the user switches tabs mid-save", async () => {
    let resolveSave!: (res: SavedImageResult) => void;
    const saveSpy = vi.spyOn(api, "saveImageBytes").mockImplementation(
      () =>
        new Promise<SavedImageResult>((resolve) => {
          resolveSave = resolve;
        })
    );

    const tabA = makeFileTab({
      id: "tab-drop-a",
      filePath: "/tmp/a.md",
      content: "Doc A",
      savedContent: "Doc A",
    });
    const tabB = makeFileTab({
      id: "tab-drop-b",
      filePath: "/tmp/b.md",
      content: "Doc B",
      savedContent: "Doc B",
    });

    useAppStore.setState({
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
      viewMode: "write",
    });

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    const editorContent = container.querySelector<HTMLElement>(".cm-content")!;
    const dropFiles = [
      {
        name: ".png",
        type: "image/png",
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      } as unknown as File,
      {
        name: "second.png",
        type: "image/png",
        arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
      } as unknown as File,
    ];
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: { files: dropFiles },
    });

    await act(async () => {
      editorContent.dispatchEvent(dropEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    // Dot-only filename normalizes preferredName to null rather than ""
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ preferredName: null })
    );

    // User switches to tabB before first image save resolves
    await act(async () => {
      useAppStore.getState().setActiveTab(tabB.id);
    });

    await act(async () => {
      resolveSave({
        markdownPath: "a/img1.png",
        absolutePath: "/tmp/a/img1.png",
        fileName: "img1.png",
        md5: "abc123",
        deduplicated: false,
      });
      await new Promise((r) => setTimeout(r, 20));
    });

    // Second image must never start and tabB must stay untouched
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const latestTabB = useAppStore.getState().tabs.find((t) => t.id === tabB.id)!;
    expect(latestTabB.content).toBe("Doc B");
  });
});
