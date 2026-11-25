import { undo } from "@codemirror/commands";
import { getIndentUnit } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { act, createRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/editor/MarkdownEditor";
import {
  SettingsDialog,
  type SettingsDialogProps,
} from "@/components/settings/SettingsDialog";
import type { Locale } from "@/types";
import {
  DEFAULT_EDITOR_PREFS,
  DEFAULT_IMAGE_BED_SETTINGS,
  type EditorFontFamily,
  type EditorPreferences,
  type ImageBedSettings,
  type ImageBedTestResult,
  type SettingsSectionId,
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

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  );
  proto?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function getInjectedStylesText(): string {
  return Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
}

describe("SettingsDialog & live MarkdownEditor typography", () => {
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

  it("navigates across all 5 sections and triggers general, editor, and hexo callbacks", async () => {
    const onLocaleChange = vi.fn();
    const onAutoSaveChange = vi.fn();
    const onClearRecent = vi.fn();
    const onEditorPrefsChange = vi.fn();
    const onResetEditorPrefs = vi.fn();
    const onShowLineNumbersChange = vi.fn();
    const onShowToolbarChange = vi.fn();
    const onSyncScrollChange = vi.fn();
    const onEnableHexoTagsChange = vi.fn();
    const onLoadSiteThemeCss = vi.fn();
    const onImportCustomThemeCss = vi.fn();
    const onClearThemeCss = vi.fn();

    function SettingsHarness() {
      const [locale, setLocale] = useState<Locale>("zh-CN");
      const [autoSave, setAutoSave] = useState(true);
      const [editorPrefs, setEditorPrefs] =
        useState<EditorPreferences>(DEFAULT_EDITOR_PREFS);
      const [showLineNumbers, setShowLineNumbers] = useState(false);
      const [showToolbar, setShowToolbar] = useState(true);
      const [syncScroll, setSyncScroll] = useState(true);
      const [enableHexoTags, setEnableHexoTags] = useState(true);
      const [imageBed, setImageBed] = useState<ImageBedSettings>(
        DEFAULT_IMAGE_BED_SETTINGS
      );

      const props: SettingsDialogProps = {
        open: true,
        onOpenChange: () => {},
        locale,
        appVersion: "2.0.0-alpha.1",
        onLocaleChange: (next) => {
          onLocaleChange(next);
          setLocale(next);
        },
        autoSave,
        onAutoSaveChange: (next) => {
          onAutoSaveChange(next);
          setAutoSave(next);
        },
        recentCount: 3,
        onClearRecent,
        editorPrefs,
        onEditorPrefsChange: (patch) => {
          onEditorPrefsChange(patch);
          setEditorPrefs((prev) => ({ ...prev, ...patch }));
        },
        onResetEditorPrefs,
        showLineNumbers,
        onShowLineNumbersChange: (next) => {
          onShowLineNumbersChange(next);
          setShowLineNumbers(next);
        },
        showToolbar,
        onShowToolbarChange: (next) => {
          onShowToolbarChange(next);
          setShowToolbar(next);
        },
        syncScroll,
        onSyncScrollChange: (next) => {
          onSyncScrollChange(next);
          setSyncScroll(next);
        },
        enableHexoTags,
        onEnableHexoTagsChange: (next) => {
          onEnableHexoTagsChange(next);
          setEnableHexoTags(next);
        },
        themeCssLabel: "next/main.css",
        hasActiveSite: true,
        onLoadSiteThemeCss,
        onImportCustomThemeCss,
        onClearThemeCss,
        imageBed,
        onImageBedChange: (patch) =>
          setImageBed((prev) => ({ ...prev, ...patch })),
      };

      return <SettingsDialog {...props} />;
    }

    await act(async () => {
      root.render(<SettingsHarness />);
    });

    // 1. General section is default
    expect(
      document.body.querySelector('[data-settings-panel="general"]')
    ).not.toBeNull();

    // Switch language to English
    const enBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "English"
    );
    expect(enBtn).toBeDefined();
    await act(async () => {
      enBtn!.click();
    });
    expect(onLocaleChange).toHaveBeenCalledWith("en-US");
    expect(document.body.textContent).toContain("General");

    // Toggle Auto Save
    const autoSaveSwitch = document.body.querySelector<HTMLButtonElement>(
      'button[role="switch"][aria-label="Auto Save"]'
    );
    expect(autoSaveSwitch).not.toBeNull();
    await act(async () => {
      autoSaveSwitch!.click();
    });
    expect(onAutoSaveChange).toHaveBeenCalledWith(false);

    // Change External Change Policy to Auto Reload
    const autoReloadBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
    ).find((b) => b.textContent?.trim() === "Auto Reload");
    await act(async () => {
      autoReloadBtn!.click();
    });
    expect(onEditorPrefsChange).toHaveBeenCalledWith({
      externalChangePolicy: "auto",
    });

    // Clear recent history
    const clearRecentBtn = Array.from(
      document.body.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("Clear Recent"));
    await act(async () => {
      clearRecentBtn!.click();
    });
    expect(onClearRecent).toHaveBeenCalledTimes(1);

    // 2. Switch to Editor & Appearance
    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('[data-settings-nav="editor"]')!
        .click();
    });
    expect(
      document.body.querySelector('[data-settings-panel="editor"]')
    ).not.toBeNull();

    const serifBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
    ).find((b) => b.textContent?.trim() === "Serif");
    await act(async () => {
      serifBtn!.click();
    });
    expect(onEditorPrefsChange).toHaveBeenCalledWith({ fontFamily: "serif" });

    const fontSizeSlider = document.body.querySelector<HTMLInputElement>(
      'input[type="range"][aria-label="Font Size"]'
    );
    expect(fontSizeSlider).not.toBeNull();
    await act(async () => {
      setNativeInputValue(fontSizeSlider!, "18");
    });
    expect(onEditorPrefsChange).toHaveBeenCalledWith({ fontSize: 18 });

    const tab4Btn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
    ).find((b) => b.textContent?.trim() === "4 spaces");
    await act(async () => {
      tab4Btn!.click();
    });
    expect(onEditorPrefsChange).toHaveBeenCalledWith({ tabSize: 4 });

    const lineNumSwitch = document.body.querySelector<HTMLButtonElement>(
      'button[role="switch"][aria-label="Show Line Numbers"]'
    );
    await act(async () => {
      lineNumSwitch!.click();
    });
    expect(onShowLineNumbersChange).toHaveBeenCalledWith(true);

    const toolbarSwitch = document.body.querySelector<HTMLButtonElement>(
      'button[role="switch"][aria-label="Show Formatting Toolbar"]'
    );
    await act(async () => {
      toolbarSwitch!.click();
    });
    expect(onShowToolbarChange).toHaveBeenCalledWith(false);

    const syncScrollSwitch = document.body.querySelector<HTMLButtonElement>(
      'button[role="switch"][aria-label="Sync Scroll"]'
    );
    await act(async () => {
      syncScrollSwitch!.click();
    });
    expect(onSyncScrollChange).toHaveBeenCalledWith(false);

    const resetBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Reset Typography Defaults")
    );
    await act(async () => {
      resetBtn!.click();
    });
    expect(onResetEditorPrefs).toHaveBeenCalledTimes(1);

    // 3. Switch to Hexo & Preview
    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('[data-settings-nav="hexo"]')!
        .click();
    });
    expect(
      document.body.querySelector('[data-settings-panel="hexo"]')
    ).not.toBeNull();

    const hexoTagsSwitch = document.body.querySelector<HTMLButtonElement>(
      'button[role="switch"][aria-label="Hexo Tag Rendering"]'
    );
    await act(async () => {
      hexoTagsSwitch!.click();
    });
    expect(onEnableHexoTagsChange).toHaveBeenCalledWith(false);

    const darkCodeBtn = document.body.querySelector<HTMLButtonElement>(
      '[data-code-theme="atom-one-dark"]'
    );
    await act(async () => {
      darkCodeBtn!.click();
    });
    expect(onEditorPrefsChange).toHaveBeenCalledWith({
      codeTheme: "atom-one-dark",
    });

    const loadSiteCssBtn = Array.from(
      document.body.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("Load Site public/css"));
    const importCssBtn = Array.from(
      document.body.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("Import Local CSS"));
    const clearCssBtn = Array.from(
      document.body.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("Clear CSS"));

    await act(async () => {
      loadSiteCssBtn!.click();
      importCssBtn!.click();
      clearCssBtn!.click();
    });
    expect(onLoadSiteThemeCss).toHaveBeenCalledTimes(1);
    expect(onImportCustomThemeCss).toHaveBeenCalledTimes(1);
    expect(onClearThemeCss).toHaveBeenCalledTimes(1);

    // 4. Switch to About & Shortcuts
    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('[data-settings-nav="about"]')!
        .click();
    });
    expect(
      document.body.querySelector('[data-settings-panel="about"]')
    ).not.toBeNull();
    expect(document.body.textContent).toContain("v2.0.0-alpha.1");
    expect(document.body.textContent).toContain("Cmd+K");
    expect(document.body.textContent).toContain("Cmd+Alt+S");
    expect(document.body.textContent).toContain("Cmd+Option+1/2/3/4");
  });

  it("conditionally renders Image Bed fields, toggles secret visibility, and displays async test connection feedback", async () => {
    let resolveTest!: (res: ImageBedTestResult) => void;
    const onTestImageBedConnection = vi.fn(
      () =>
        new Promise<ImageBedTestResult>((resolve) => {
          resolveTest = resolve;
        })
    );
    const onImageBedChange = vi.fn();

    function ImageBedHarness({
      initialSection = "imagebed",
    }: {
      initialSection?: SettingsSectionId;
    }) {
      const [imageBed, setImageBed] = useState<ImageBedSettings>(
        DEFAULT_IMAGE_BED_SETTINGS
      );

      return (
        <SettingsDialog
          open
          onOpenChange={() => {}}
          locale="zh-CN"
          initialSection={initialSection}
          onLocaleChange={() => {}}
          autoSave
          onAutoSaveChange={() => {}}
          editorPrefs={DEFAULT_EDITOR_PREFS}
          onEditorPrefsChange={() => {}}
          showLineNumbers={false}
          onShowLineNumbersChange={() => {}}
          showToolbar
          onShowToolbarChange={() => {}}
          syncScroll
          onSyncScrollChange={() => {}}
          enableHexoTags
          onEnableHexoTagsChange={() => {}}
          imageBed={imageBed}
          onImageBedChange={(patch) => {
            onImageBedChange(patch);
            setImageBed((prev) => ({ ...prev, ...patch }));
          }}
          onTestImageBedConnection={onTestImageBedConnection}
        />
      );
    }

    await act(async () => {
      root.render(<ImageBedHarness />);
    });

    // Starts on imagebed with "none" provider -> no remote forms or test button
    expect(
      document.body.querySelector('[data-settings-panel="imagebed"]')
    ).not.toBeNull();
    expect(document.body.querySelector('[data-imagebed-form="picgo"]')).toBeNull();
    expect(document.body.querySelector('[data-imagebed-form="object"]')).toBeNull();

    // Switch to PicGo -> shows PicGo fields, hides object storage fields
    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('[data-imagebed-provider="picgo"]')!
        .click();
    });
    expect(onImageBedChange).toHaveBeenCalledWith({ provider: "picgo" });
    expect(
      document.body.querySelector('[data-imagebed-form="picgo"]')
    ).not.toBeNull();
    expect(document.body.querySelector("#settings-picgo-url")).not.toBeNull();
    expect(document.body.querySelector('[data-imagebed-form="object"]')).toBeNull();

    // Switch to S3 -> hides PicGo fields, shows object storage fields
    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('[data-imagebed-provider="s3"]')!
        .click();
    });
    expect(document.body.querySelector('[data-imagebed-form="picgo"]')).toBeNull();
    expect(
      document.body.querySelector('[data-imagebed-form="object"]')
    ).not.toBeNull();

    // Secret key input defaults to password and toggles via eye button
    const secretInput =
      document.body.querySelector<HTMLInputElement>("#settings-bed-sk");
    expect(secretInput).not.toBeNull();
    expect(secretInput!.type).toBe("password");

    const toggleEyeBtn = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="toggle-secret-visibility"]'
    );
    expect(toggleEyeBtn).not.toBeNull();
    await act(async () => {
      toggleEyeBtn!.click();
    });
    expect(secretInput!.type).toBe("text");

    await act(async () => {
      toggleEyeBtn!.click();
    });
    expect(secretInput!.type).toBe("password");

    // Also verify OSS and COS show object storage fields
    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('[data-imagebed-provider="oss"]')!
        .click();
    });
    expect(
      document.body.querySelector<HTMLInputElement>("#settings-bed-endpoint")!
        .placeholder
    ).toContain("aliyuncs.com");

    await act(async () => {
      document.body
        .querySelector<HTMLButtonElement>('[data-imagebed-provider="cos"]')!
        .click();
    });
    expect(
      document.body.querySelector<HTMLInputElement>("#settings-bed-endpoint")!
        .placeholder
    ).toContain("myqcloud.com");

    // Toggle keepLocalAfterUpload
    const keepLocalSwitch = document.body.querySelector<HTMLButtonElement>(
      'button[role="switch"][aria-label="上传后保留本地文件"]'
    );
    expect(keepLocalSwitch).not.toBeNull();
    await act(async () => {
      keepLocalSwitch!.click();
    });
    expect(onImageBedChange).toHaveBeenCalledWith({
      keepLocalAfterUpload: false,
    });

    // Test connection async flow: pending -> success
    const testBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("测试连接")
    );
    expect(testBtn).toBeDefined();

    await act(async () => {
      testBtn!.click();
    });
    expect(onTestImageBedConnection).toHaveBeenCalledTimes(1);
    expect(testBtn!.disabled).toBe(true);
    expect(testBtn!.textContent).toContain("测试中");

    await act(async () => {
      resolveTest({ ok: true, message: "连接正常 (12ms)" });
    });
    expect(testBtn!.disabled).toBe(false);
    const statusEl = document.body.querySelector(
      '[data-testid="imagebed-test-result"]'
    );
    expect(statusEl).not.toBeNull();
    expect(statusEl!.textContent).toContain("连接正常 (12ms)");

    // Test connection failure rejection path
    onTestImageBedConnection.mockRejectedValueOnce(new Error("403 Forbidden"));
    await act(async () => {
      testBtn!.click();
    });
    expect(
      document.body.querySelector('[data-testid="imagebed-test-result"]')
        ?.textContent
    ).toContain("403 Forbidden");
  });

  it("hot-swaps MarkdownEditor fontSize, lineHeight, tabSize, and fontFamily via Compartment without recreating EditorView or losing undo stack", async () => {
    const editorRef = createRef<MarkdownEditorHandle>();

    function EditorHarness({
      fontFamily,
      fontSize,
      lineHeight,
      tabSize,
    }: {
      fontFamily: EditorFontFamily;
      fontSize: number;
      lineHeight: number;
      tabSize: number;
    }) {
      const [val, setVal] = useState("# Live Typography\n\nInitial line");
      return (
        <MarkdownEditor
          ref={editorRef}
          value={val}
          onChange={setVal}
          fontFamily={fontFamily}
          fontSize={fontSize}
          lineHeight={lineHeight}
          tabSize={tabSize}
        />
      );
    }

    await act(async () => {
      root.render(
        <EditorHarness
          fontFamily="mono"
          fontSize={14}
          lineHeight={1.8}
          tabSize={2}
        />
      );
    });

    const initialEditorEl = container.querySelector<HTMLElement>(".cm-editor");
    expect(initialEditorEl).not.toBeNull();
    const initialView = EditorView.findFromDOM(initialEditorEl!);
    expect(initialView).not.toBeNull();
    expect(initialView!.state.tabSize).toBe(2);
    expect(getIndentUnit(initialView!.state)).toBe(2);

    // Mutate document, selection, and scrollTop to verify state preservation
    await act(async () => {
      initialView!.dispatch({
        changes: {
          from: initialView!.state.doc.length,
          insert: "\nKEEP_UNDO_HISTORY_MARKER",
        },
        selection: { anchor: 8 },
      });
    });
    initialView!.scrollDOM.scrollTop = 128;
    expect(initialView!.state.doc.toString()).toContain(
      "KEEP_UNDO_HISTORY_MARKER"
    );

    // Hot-swap all four typography & tab settings
    await act(async () => {
      root.render(
        <EditorHarness
          fontFamily="serif"
          fontSize={19}
          lineHeight={2.2}
          tabSize={4}
        />
      );
    });

    const afterEditorEl = container.querySelector<HTMLElement>(".cm-editor");
    const afterView = EditorView.findFromDOM(afterEditorEl!);

    // Same EditorView & DOM node (never destroyed or recreated)
    expect(afterEditorEl).toBe(initialEditorEl);
    expect(afterView).toBe(initialView);
    expect(editorRef.current?.getView()).toBe(initialView);

    // Updated CodeMirror tabSize & indentUnit facets
    expect(afterView!.state.tabSize).toBe(4);
    expect(getIndentUnit(afterView!.state)).toBe(4);

    // Updated CodeMirror theme styles injected
    const stylesText = getInjectedStylesText();
    expect(stylesText).toContain("font-size: 19px");
    expect(stylesText).toContain("line-height: 2.2");
    expect(stylesText).toContain("Georgia");

    // Preserved content, cursor, scrollTop, and undo history
    expect(afterView!.state.doc.toString()).toContain("KEEP_UNDO_HISTORY_MARKER");
    expect(afterView!.state.selection.main.anchor).toBe(8);
    expect(afterView!.scrollDOM.scrollTop).toBe(128);

    let undone = false;
    await act(async () => {
      undone = undo(afterView!);
    });
    expect(undone).toBe(true);
    expect(afterView!.state.doc.toString()).not.toContain(
      "KEEP_UNDO_HISTORY_MARKER"
    );
  });
});
