import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { act, createRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InlineAiPopover } from "@/components/ai/InlineAiPopover";
import {
  MarkdownEditor,
  type EditorSelectionChange,
  type MarkdownEditorHandle,
} from "@/components/editor/MarkdownEditor";
import {
  HexoTerminalDrawer,
  type HexoTerminalLogEntry,
  type HexoTerminalStatus,
} from "@/components/terminal/HexoTerminalDrawer";
import {
  computeLineDiff,
  computeLineDiffWithStats,
  summarizeLineDiff,
} from "@/lib/ai/diff";
import * as aiApi from "@/lib/tauri/aiApi";
import {
  DEFAULT_AI_SETTINGS,
  type AiStreamEvent,
  type DiscoveredAgent,
  type SiteContextSnapshot,
} from "@/types/ai";

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

const SAMPLE_SITE_CTX: SiteContextSnapshot = {
  engine: "hexo",
  siteTitle: "Zac Blog",
  language: "zh-CN",
  permalink: ":year/:month/:day/:title/",
  postAssetFolder: true,
  theme: "next",
  markdownConfig: {
    breaks: false,
    mathEnabled: true,
    mermaidEnabled: true,
  },
  enabledThemeTags: ["blockquote", "codeblock", "asset_img", "note"],
  existingCategories: ["Engineering"],
  existingTags: ["Rust", "Tauri"],
  activeDoc: {
    relativePath: "source/_posts/inline-ai.md",
    localImages: [],
  },
};

const SAMPLE_AGENTS: DiscoveredAgent[] = [
  {
    id: "opencode",
    label: "OpenCode (ACP)",
    executable: "/usr/local/bin/opencode",
    args: ["acp"],
    protocol: "acp",
    version: "2.2.5",
  },
];

describe("Phase 4B: Line diff, MarkdownEditor range replace, InlineAiPopover & Terminal AI Diagnose", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it("computes accurate line diffs and summary stats without external deps", () => {
    expect(computeLineDiff("", "")).toEqual([]);
    expect(summarizeLineDiff([])).toEqual({
      addedLines: 0,
      removedLines: 0,
      equalLines: 0,
    });

    const identical = computeLineDiffWithStats("line 1\nline 2", "line 1\nline 2");
    expect(identical.hunks).toEqual([
      { type: "equal", text: "line 1" },
      { type: "equal", text: "line 2" },
    ]);
    expect(identical.stats).toEqual({
      addedLines: 0,
      removedLines: 0,
      equalLines: 2,
    });

    const mixed = computeLineDiffWithStats(
      "alpha\r\nbeta\r\ngamma\r\ndelta",
      "alpha\nbeta updated\ngamma\nepsilon\ndelta"
    );
    expect(mixed.hunks).toEqual([
      { type: "equal", text: "alpha" },
      { type: "removed", text: "beta" },
      { type: "added", text: "beta updated" },
      { type: "equal", text: "gamma" },
      { type: "added", text: "epsilon" },
      { type: "equal", text: "delta" },
    ]);
    expect(mixed.stats).toEqual({
      addedLines: 2,
      removedLines: 1,
      equalLines: 3,
    });

    const pureAdd = computeLineDiffWithStats("", "new 1\nnew 2");
    expect(pureAdd.stats).toEqual({ addedLines: 2, removedLines: 0, equalLines: 0 });

    const pureRemove = computeLineDiffWithStats("old 1\nold 2", "");
    expect(pureRemove.stats).toEqual({ addedLines: 0, removedLines: 2, equalLines: 0 });
  });

  it("emits MarkdownEditor onSelectionChange safely in jsdom and supports single-transaction undoable replaceRange", async () => {
    const editorRef = createRef<MarkdownEditorHandle>();
    const selectionEvents: EditorSelectionChange[] = [];

    function Harness() {
      const [val, setVal] = useState("Hello world!\nSecond line.");
      return (
        <MarkdownEditor
          ref={editorRef}
          value={val}
          onChange={setVal}
          onSelectionChange={(sel) => selectionEvents.push(sel)}
        />
      );
    }

    await act(async () => {
      root.render(<Harness />);
    });

    const view = editorRef.current?.getView();
    expect(view).not.toBeNull();

    // First make an ordinary edit so we verify replaceRange is an isolated undo step
    await act(async () => {
      view!.dispatch({
        changes: { from: view!.state.doc.length, insert: "\nTail" },
      });
    });

    // Select "world" (indices 6..11), forcing coordsAtPos to throw to prove jsdom resilience
    vi.spyOn(view!, "coordsAtPos").mockImplementation(() => {
      throw new Error("jsdom layout unavailable");
    });

    await act(async () => {
      view!.dispatch({
        selection: { anchor: 6, head: 11 },
      });
    });

    const lastSel = selectionEvents[selectionEvents.length - 1];
    expect(lastSel).toEqual({
      text: "world",
      from: 6,
      to: 11,
      rect: null,
    });

    // Apply replaceRange -> updates document cleanly
    let replaced = false;
    await act(async () => {
      replaced = editorRef.current!.replaceRange(6, 11, "HexoEditor");
    });
    expect(replaced).toBe(true);
    expect(view!.state.doc.toString()).toBe("Hello HexoEditor!\nSecond line.\nTail");
    expect(EditorView.findFromDOM(container.querySelector(".cm-editor")!)).toBe(view);

    // Single Cmd+Z / undo reverts only the AI replacement, keeping earlier edit
    await act(async () => {
      expect(undo(view!)).toBe(true);
    });
    expect(view!.state.doc.toString()).toBe("Hello world!\nSecond line.\nTail");
  });

  it("streams InlineAiPopover quick & custom actions, renders red/green diff, confirms replace, copies, retries, and closes on Esc", async () => {
    let streamListener: ((ev: AiStreamEvent) => void) | null = null;
    vi.spyOn(aiApi, "buildSiteAiContext").mockResolvedValue(SAMPLE_SITE_CTX);
    vi.spyOn(aiApi, "listenAiStream").mockImplementation(async (fn) => {
      streamListener = fn;
      return () => {
        streamListener = null;
      };
    });
    const runSpy = vi
      .spyOn(aiApi, "aiRunPrompt")
      .mockImplementation(async (req) => req.requestId ?? "inline-req-1");
    const cancelSpy = vi.spyOn(aiApi, "aiCancelPrompt").mockResolvedValue(true);

    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      configurable: true,
    });

    const onOpenChange = vi.fn();
    const onApplyReplace = vi.fn();

    // Render anchored near bottom-right edge to verify viewport clamping & light theme
    await act(async () => {
      root.render(
        <InlineAiPopover
          open={true}
          onOpenChange={onOpenChange}
          locale="zh-CN"
          aiSettings={{ ...DEFAULT_AI_SETTINGS, selectedProviderKey: "agent:opencode" }}
          discoveredAgents={SAMPLE_AGENTS}
          activeSiteRoot="/blog"
          siteContext={SAMPLE_SITE_CTX}
          documentContent={"# Demo\n\n旧段落第一行\n旧段落第二行"}
          selectionText={"旧段落第一行\n旧段落第二行"}
          selectionRect={{ top: 700, left: 950, bottom: 720 }}
          onApplyReplace={onApplyReplace}
        />
      );
    });

    const popover = container.querySelector<HTMLElement>('[data-testid="inline-ai-popover"]')!;
    expect(popover).not.toBeNull();
    expect(popover.className).toContain("bg-white");
    expect(parseInt(popover.style.left, 10)).toBeLessThanOrEqual(window.innerWidth - 460);

    // Click "精简" quick action
    const conciseBtn = container.querySelector<HTMLButtonElement>(
      '[data-inline-ai-action="concise"]'
    )!;
    await act(async () => {
      conciseBtn.click();
    });
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy.mock.calls[0][0].prompt).toContain("精简");
    const req1 = await runSpy.mock.results[0].value;

    // Stream delta + done
    await act(async () => {
      streamListener?.({
        requestId: req1,
        kind: "delta",
        text: "旧段落第一行\n",
        done: false,
      });
      streamListener?.({
        requestId: req1,
        kind: "delta",
        text: "精简后的第二行",
        done: false,
      });
      streamListener?.({
        requestId: req1,
        kind: "done",
        text: "",
        done: true,
      });
    });

    const diffEl = container.querySelector('[data-testid="inline-ai-diff"]')!;
    expect(diffEl).not.toBeNull();
    const removedHunks = diffEl.querySelectorAll('[data-diff-type="removed"]');
    const addedHunks = diffEl.querySelectorAll('[data-diff-type="added"]');
    expect(removedHunks.length).toBe(1);
    expect(removedHunks[0].textContent).toContain("旧段落第二行");
    expect(addedHunks.length).toBe(1);
    expect(addedHunks[0].textContent).toContain("精简后的第二行");

    // Copy button copies outputText
    const copyBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("复制")
    )!;
    await act(async () => {
      copyBtn.click();
    });
    expect(writeTextSpy).toHaveBeenCalledWith("旧段落第一行\n精简后的第二行");

    // Retry re-runs last action
    const retryBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("重试")
    )!;
    await act(async () => {
      retryBtn.click();
    });
    expect(runSpy).toHaveBeenCalledTimes(2);
    const req2 = await runSpy.mock.results[1].value;

    // Submit custom instruction via Enter while req2 is running -> cancels req2 and starts req3
    const customInput = container.querySelector<HTMLInputElement>("input[type='text']")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(customInput, "改成学术口吻");
      customInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      customInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    expect(cancelSpy).toHaveBeenCalledWith(req2);
    expect(runSpy).toHaveBeenCalledTimes(3);
    expect(runSpy.mock.calls[2][0].prompt).toContain("改成学术口吻");
    const req3 = await runSpy.mock.results[2].value;

    await act(async () => {
      streamListener?.({
        requestId: req3,
        kind: "delta",
        text: "学术化改写结果",
        done: false,
      });
      streamListener?.({
        requestId: req3,
        kind: "done",
        text: "",
        done: true,
      });
    });

    // Confirm Replace applies outputText and closes popover
    const confirmBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("应用替换")
    )!;
    await act(async () => {
      confirmBtn.click();
    });
    expect(onApplyReplace).toHaveBeenCalledWith("学术化改写结果");
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Re-render without selectionRect -> centered near top-center, and Esc closes
    onOpenChange.mockClear();
    await act(async () => {
      root.render(
        <InlineAiPopover
          open={true}
          onOpenChange={onOpenChange}
          locale="en-US"
          aiSettings={DEFAULT_AI_SETTINGS}
          discoveredAgents={[]}
          documentContent="Doc"
          selectionText=""
          selectionRect={null}
          onApplyReplace={onApplyReplace}
        />
      );
    });

    const centeredPopover = container.querySelector<HTMLElement>(
      '[data-testid="inline-ai-popover"]'
    )!;
    expect(centeredPopover.style.top).toBe("72px");
    expect(centeredPopover.textContent).toContain("Insert at cursor");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows AI 诊断 button on HexoTerminalDrawer only when onAiDiagnose is provided and an error occurred", async () => {
    const onAiDiagnose = vi.fn();
    const baseProps = {
      open: false,
      onOpenChange: vi.fn(),
      onRunAction: vi.fn(),
      onStop: vi.fn(),
      onKillPort: vi.fn(),
      onClearLogs: vi.fn(),
    };

    const okStatus: HexoTerminalStatus = {
      running: false,
      action: "generate",
      serverRunning: false,
      serverUrl: null,
      exitCode: 0,
    };
    const okLogs: HexoTerminalLogEntry[] = [
      { id: "1", stream: "stdout", line: "INFO Generated 10 files", timestamp: 1700000000000 },
    ];

    // 1. No errors -> button hidden
    await act(async () => {
      root.render(
        <HexoTerminalDrawer
          {...baseProps}
          status={okStatus}
          logs={okLogs}
          onAiDiagnose={onAiDiagnose}
        />
      );
    });
    expect(container.querySelector('[data-testid="terminal-ai-diagnose"]')).toBeNull();

    // 2. Non-zero exitCode -> button visible and clickable
    await act(async () => {
      root.render(
        <HexoTerminalDrawer
          {...baseProps}
          status={{ ...okStatus, exitCode: 1 }}
          logs={okLogs}
          onAiDiagnose={onAiDiagnose}
        />
      );
    });
    const diagBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="terminal-ai-diagnose"]'
    )!;
    expect(diagBtn).not.toBeNull();
    expect(diagBtn.textContent).toContain("AI 诊断");

    await act(async () => {
      diagBtn.click();
    });
    expect(onAiDiagnose).toHaveBeenCalledTimes(1);

    // 3. stderr log with exitCode null (e.g., server failure) -> button visible in en-US
    const errLogs: HexoTerminalLogEntry[] = [
      { id: "2", stream: "stderr", line: "FATAL Port 4000 in use", timestamp: 1700000001000 },
    ];
    await act(async () => {
      root.render(
        <HexoTerminalDrawer
          {...baseProps}
          locale="en-US"
          status={{ ...okStatus, exitCode: null }}
          logs={errLogs}
          onAiDiagnose={onAiDiagnose}
        />
      );
    });
    const enDiagBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="terminal-ai-diagnose"]'
    )!;
    expect(enDiagBtn).not.toBeNull();
    expect(enDiagBtn.textContent).toContain("AI Diagnose");
  });
});
