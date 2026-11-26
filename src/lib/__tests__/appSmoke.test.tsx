import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/useAppStore";

// Enable React 19 act() support & jsdom DOM measurement shims for CodeMirror 6 / panels
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
    ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
}
if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

describe("App workspace smoke test", () => {
  it("mounts welcome workbench, creates a scratch tab, and switches view modes without errors", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TooltipProvider>
          <App />
        </TooltipProvider>
      );
    });

    expect(container.textContent).toContain("HexoEditor");
    expect(container.textContent).toContain("添加 Hexo 站点");

    // Open a scratch tab and verify FrontMatter bar, editor, and preview mount cleanly
    await act(async () => {
      useAppStore.getState().createScratchTab();
    });

    expect(useAppStore.getState().tabs.length).toBe(1);
    expect(container.querySelector(".cm-editor")).not.toBeNull();
    expect(container.querySelector(".markdown-preview")).not.toBeNull();

    // Switch through all 4 view modes
    for (const mode of ["write", "read", "focus", "split"] as const) {
      await act(async () => {
        useAppStore.getState().setViewMode(mode);
      });
      expect(useAppStore.getState().viewMode).toBe(mode);
    }

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
