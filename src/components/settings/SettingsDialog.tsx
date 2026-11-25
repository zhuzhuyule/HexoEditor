import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  FileCode2,
  FolderOpen,
  Info,
  Loader2,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Type,
  X,
  XCircle,
} from "lucide-react";
import * as React from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";
import {
  DEFAULT_EDITOR_PREFS,
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
  EDITOR_LINE_HEIGHT_MAX,
  EDITOR_LINE_HEIGHT_MIN,
  EDITOR_ZOOM_MAX,
  EDITOR_ZOOM_MIN,
  type CodeHighlightTheme,
  type EditorFontFamily,
  type EditorPreferences,
  type ExternalChangePolicy,
  type ImageBedProvider,
  type ImageBedSettings,
  type ImageBedTestResult,
  type SettingsSectionId,
} from "@/types/settings";

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  initialSection?: SettingsSectionId;
  appVersion?: string;

  // General
  onLocaleChange: (locale: Locale) => void;
  autoSave: boolean;
  onAutoSaveChange: (enabled: boolean) => void;
  recentCount?: number;
  onClearRecent?: () => void;

  // Editor & Appearance
  editorPrefs: EditorPreferences;
  onEditorPrefsChange: (patch: Partial<EditorPreferences>) => void;
  onResetEditorPrefs?: () => void;
  showLineNumbers: boolean;
  onShowLineNumbersChange: (show: boolean) => void;
  showToolbar: boolean;
  onShowToolbarChange: (show: boolean) => void;
  syncScroll: boolean;
  onSyncScrollChange: (enabled: boolean) => void;

  // Hexo & Preview
  enableHexoTags: boolean;
  onEnableHexoTagsChange: (enabled: boolean) => void;
  themeCssLabel?: string | null;
  hasActiveSite?: boolean;
  onLoadSiteThemeCss?: () => void | Promise<void>;
  onImportCustomThemeCss?: () => void | Promise<void>;
  onClearThemeCss?: () => void;

  // Image Bed
  imageBed: ImageBedSettings;
  onImageBedChange: (patch: Partial<ImageBedSettings>) => void;
  onTestImageBedConnection?: (
    settings: ImageBedSettings
  ) => Promise<ImageBedTestResult>;
}

const CODE_THEME_PRESETS: ReadonlyArray<{
  id: CodeHighlightTheme;
  label: string;
  bg: string;
  fg: string;
  accent: string;
  isDark: boolean;
}> = [
  {
    id: "github-light",
    label: "GitHub Light",
    bg: "#f6f8fa",
    fg: "#24292f",
    accent: "#0969da",
    isDark: false,
  },
  {
    id: "atom-one-light",
    label: "Atom One Light",
    bg: "#fafafa",
    fg: "#383a42",
    accent: "#4078f2",
    isDark: false,
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    bg: "#0d1117",
    fg: "#e6edf3",
    accent: "#58a6ff",
    isDark: true,
  },
  {
    id: "atom-one-dark",
    label: "Atom One Dark",
    bg: "#282c34",
    fg: "#abb2bf",
    accent: "#61afef",
    isDark: true,
  },
];

interface ShortcutEntry {
  keys: string;
  zh: string;
  en: string;
}

const SHORTCUT_ITEMS: ReadonlyArray<ShortcutEntry> = [
  { keys: "Cmd+K", zh: "打开全局命令面板", en: "Open Command Palette" },
  { keys: "Cmd+,", zh: "打开设置中心", en: "Open Settings" },
  { keys: "Cmd+S", zh: "保存当前文档", en: "Save Current Document" },
  { keys: "Cmd+Shift+S", zh: "另存为", en: "Save As" },
  { keys: "Cmd+Alt+S", zh: "保存全部已修改文档", en: "Save All Modified Documents" },
  { keys: "Cmd+W", zh: "关闭当前标签页", en: "Close Active Tab" },
  {
    keys: "Cmd+Option+1/2/3/4",
    zh: "切换写作 / 分栏 / 阅读 / 专注模式",
    en: "Switch Write / Split / Read / Focus Mode",
  },
  { keys: "Cmd+\\", zh: "展开 / 收起侧边栏", en: "Toggle Sidebar" },
  { keys: "Cmd+N", zh: "新建文章或临时草稿", en: "New Post or Scratch Note" },
  { keys: "Cmd+O", zh: "打开本地 Markdown 文件", en: "Open Local Markdown File" },
  { keys: "Cmd+Shift+I", zh: "插入本地图片", en: "Insert Local Image" },
  { keys: "Cmd+Shift+F", zh: "格式化 Markdown 表格", en: "Format Markdown Table" },
  { keys: "Cmd+Shift+K", zh: "插入代码块", en: "Insert Code Block" },
  { keys: "Esc", zh: "退出专注模式 / 关闭弹窗", en: "Exit Focus Mode / Close Dialog" },
];

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-xs font-medium text-zinc-800">{label}</div>
        {hint && (
          <div className="mt-0.5 text-[11px] leading-snug text-zinc-400">
            {hint}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer select-none",
              active
                ? "bg-white text-zinc-900 shadow-xs"
                : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function FormField({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[136px_minmax(0,1fr)] items-center gap-3">
      <label
        htmlFor={id}
        className="text-xs font-medium text-zinc-700 select-none"
      >
        {label}
        {required && <span className="ml-0.5 text-zinc-400">*</span>}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  locale,
  initialSection = "general",
  appVersion = "2.0.0-alpha.1",
  onLocaleChange,
  autoSave,
  onAutoSaveChange,
  recentCount,
  onClearRecent,
  editorPrefs,
  onEditorPrefsChange,
  onResetEditorPrefs,
  showLineNumbers,
  onShowLineNumbersChange,
  showToolbar,
  onShowToolbarChange,
  syncScroll,
  onSyncScrollChange,
  enableHexoTags,
  onEnableHexoTagsChange,
  themeCssLabel,
  hasActiveSite = true,
  onLoadSiteThemeCss,
  onImportCustomThemeCss,
  onClearThemeCss,
  imageBed,
  onImageBedChange,
  onTestImageBedConnection,
}: SettingsDialogProps) {
  const isEn = locale === "en-US";
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>(initialSection);
  const [showSecret, setShowSecret] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<ImageBedTestResult | null>(null);
  const [recentClearedNotice, setRecentClearedNotice] = useState(false);
  const [cssBusyAction, setCssBusyAction] = useState<"site" | "custom" | null>(
    null
  );

  const wasOpenRef = useRef(false);
  const testSeqRef = useRef(0);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setActiveSection(initialSection);
      setShowSecret(false);
      setTestResult(null);
      setRecentClearedNotice(false);
    }
    wasOpenRef.current = open;
  }, [open, initialSection]);

  useEffect(() => {
    testSeqRef.current += 1;
    setIsTestingConnection(false);
    setTestResult(null);
  }, [imageBed.provider]);

  const navItems: ReadonlyArray<{
    id: SettingsSectionId;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "general",
      label: isEn ? "General" : "通用",
      icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
    },
    {
      id: "editor",
      label: isEn ? "Editor & Appearance" : "编辑与外观",
      icon: <Type className="h-3.5 w-3.5" />,
    },
    {
      id: "hexo",
      label: isEn ? "Hexo & Preview" : "Hexo 与预览",
      icon: <Palette className="h-3.5 w-3.5" />,
    },
    {
      id: "imagebed",
      label: isEn ? "Image Bed" : "图床配置",
      icon: <Cloud className="h-3.5 w-3.5" />,
    },
    {
      id: "about",
      label: isEn ? "About & Shortcuts" : "关于与快捷键",
      icon: <Info className="h-3.5 w-3.5" />,
    },
  ];

  const handleResetTypography = () => {
    if (onResetEditorPrefs) {
      onResetEditorPrefs();
      return;
    }
    onEditorPrefsChange({
      fontFamily: DEFAULT_EDITOR_PREFS.fontFamily,
      fontSize: DEFAULT_EDITOR_PREFS.fontSize,
      lineHeight: DEFAULT_EDITOR_PREFS.lineHeight,
      tabSize: DEFAULT_EDITOR_PREFS.tabSize,
      zoomLevel: DEFAULT_EDITOR_PREFS.zoomLevel,
    });
  };

  const handleClearRecent = () => {
    onClearRecent?.();
    setRecentClearedNotice(true);
  };

  const handleLoadSiteCss = async () => {
    if (!onLoadSiteThemeCss) return;
    setCssBusyAction("site");
    try {
      await onLoadSiteThemeCss();
    } finally {
      setCssBusyAction(null);
    }
  };

  const handleImportCustomCss = async () => {
    if (!onImportCustomThemeCss) return;
    setCssBusyAction("custom");
    try {
      await onImportCustomThemeCss();
    } finally {
      setCssBusyAction(null);
    }
  };

  const handleTestConnection = async () => {
    if (!onTestImageBedConnection || imageBed.provider === "none") return;
    const seq = ++testSeqRef.current;
    setIsTestingConnection(true);
    setTestResult(null);
    try {
      const result = await onTestImageBedConnection(imageBed);
      if (seq !== testSeqRef.current) return;
      setTestResult(result);
    } catch (err) {
      if (seq !== testSeqRef.current) return;
      const message =
        err instanceof Error
          ? err.message
          : isEn
            ? "Connection test failed"
            : "连接测试失败";
      setTestResult({ ok: false, message });
    } finally {
      if (seq === testSeqRef.current) {
        setIsTestingConnection(false);
      }
    }
  };

  const isObjectStorage =
    imageBed.provider === "s3" ||
    imageBed.provider === "oss" ||
    imageBed.provider === "cos";

  const endpointPlaceholder =
    imageBed.provider === "oss"
      ? "https://oss-cn-hangzhou.aliyuncs.com"
      : imageBed.provider === "cos"
        ? "https://cos.ap-shanghai.myqcloud.com"
        : "https://<account>.r2.cloudflarestorage.com";

  const regionPlaceholder =
    imageBed.provider === "oss"
      ? "oss-cn-hangzhou"
      : imageBed.provider === "cos"
        ? "ap-shanghai"
        : "auto / us-east-1";

  const activeNav = navItems.find((item) => item.id === activeSection);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-900/20 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex h-[min(84vh,580px)] w-[min(92vw,760px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-zinc-200/90 bg-white text-zinc-900 shadow-2xl focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            {isEn ? "Settings" : "设置中心"}
          </DialogPrimitive.Title>

          {/* Left Navigation Rail */}
          <aside className="flex w-[188px] shrink-0 flex-col border-r border-zinc-200/80 bg-zinc-50/80 p-3">
            <div className="px-2 pb-3 pt-0.5 text-xs font-semibold tracking-tight text-zinc-900 select-none">
              {isEn ? "Settings" : "设置"}
            </div>
            <nav
              aria-label={isEn ? "Settings sections" : "设置分类"}
              className="flex flex-col gap-0.5"
            >
              {navItems.map((item) => {
                const active = item.id === activeSection;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-settings-nav={item.id}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setActiveSection(item.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors cursor-pointer select-none",
                      active
                        ? "bg-zinc-200/75 text-zinc-950"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0",
                        active ? "text-zinc-900" : "text-zinc-400"
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Right Single-Scroll Content Pane */}
          <div className="flex min-w-0 flex-1 flex-col bg-white">
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-100 px-6">
              <h2 className="text-sm font-semibold text-zinc-900">
                {activeNav?.label}
              </h2>
              <DialogPrimitive.Close
                aria-label={isEn ? "Close settings" : "关闭设置"}
                className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </header>

            <div
              data-settings-panel={activeSection}
              className="flex-1 overflow-y-auto px-6 py-4"
            >
              {/* 1. General */}
              {activeSection === "general" && (
                <div className="space-y-1">
                  <SettingRow
                    label={isEn ? "Interface Language" : "界面语言"}
                    hint={
                      isEn
                        ? "Switch menus, dialogs, and status labels"
                        : "切换工作台界面与弹窗语言"
                    }
                  >
                    <SegmentedControl<Locale>
                      ariaLabel={isEn ? "Interface Language" : "界面语言"}
                      value={locale}
                      onChange={onLocaleChange}
                      options={[
                        { value: "zh-CN", label: "简体中文" },
                        { value: "en-US", label: "English" },
                      ]}
                    />
                  </SettingRow>

                  <Separator />

                  <SettingRow
                    label={isEn ? "Auto Save" : "自动保存"}
                    hint={
                      isEn
                        ? "Automatically persist changes after a short pause"
                        : "编辑停顿后自动写入磁盘，减少手动保存"
                    }
                  >
                    <Switch
                      aria-label={isEn ? "Auto Save" : "自动保存"}
                      checked={autoSave}
                      onCheckedChange={onAutoSaveChange}
                    />
                  </SettingRow>

                  <Separator />

                  <SettingRow
                    label={isEn ? "External File Changes" : "外部修改策略"}
                    hint={
                      isEn
                        ? "Behavior when an open file is modified outside the app"
                        : "检测到文件在外部被修改时的默认处理方式"
                    }
                  >
                    <SegmentedControl<ExternalChangePolicy>
                      ariaLabel={
                        isEn ? "External File Changes" : "外部修改策略"
                      }
                      value={editorPrefs.externalChangePolicy}
                      onChange={(externalChangePolicy) =>
                        onEditorPrefsChange({ externalChangePolicy })
                      }
                      options={[
                        { value: "prompt", label: isEn ? "Prompt" : "提示" },
                        { value: "auto", label: isEn ? "Auto Reload" : "自动重载" },
                        { value: "ignore", label: isEn ? "Ignore" : "忽略" },
                      ]}
                    />
                  </SettingRow>

                  <Separator />

                  <SettingRow
                    label={isEn ? "Recent History" : "最近打开记录"}
                    hint={
                      recentClearedNotice
                        ? isEn
                          ? "Recent history cleared"
                          : "已清空最近打开记录"
                        : typeof recentCount === "number"
                          ? isEn
                            ? `${recentCount} saved item(s) on welcome screen`
                            : `当前保存了 ${recentCount} 条最近记录`
                          : isEn
                            ? "Remove recent sites and files from welcome screen"
                            : "清除欢迎页展示的最近站点与文档列表"
                    }
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!onClearRecent || recentCount === 0}
                      onClick={handleClearRecent}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {isEn ? "Clear Recent" : "清空记录"}
                    </Button>
                  </SettingRow>
                </div>
              )}

              {/* 2. Editor & Appearance */}
              {activeSection === "editor" && (
                <div className="space-y-1">
                  <SettingRow
                    label={isEn ? "Editor Font" : "编辑器字体"}
                    hint={
                      isEn
                        ? "Applied live to the Markdown editor"
                        : "实时切换源码编辑区字体族"
                    }
                  >
                    <SegmentedControl<EditorFontFamily>
                      ariaLabel={isEn ? "Editor Font" : "编辑器字体"}
                      value={editorPrefs.fontFamily}
                      onChange={(fontFamily) =>
                        onEditorPrefsChange({ fontFamily })
                      }
                      options={[
                        { value: "mono", label: isEn ? "Mono" : "等宽" },
                        { value: "sans", label: isEn ? "Sans" : "无衬线" },
                        { value: "serif", label: isEn ? "Serif" : "衬线" },
                      ]}
                    />
                  </SettingRow>

                  <Separator />

                  <SettingRow
                    label={isEn ? "Font Size" : "字号"}
                    hint={`${EDITOR_FONT_SIZE_MIN}–${EDITOR_FONT_SIZE_MAX}px`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        aria-label={isEn ? "Font Size" : "字号"}
                        min={EDITOR_FONT_SIZE_MIN}
                        max={EDITOR_FONT_SIZE_MAX}
                        step={1}
                        value={editorPrefs.fontSize}
                        onChange={(e) =>
                          onEditorPrefsChange({
                            fontSize: Number(e.target.value),
                          })
                        }
                        className="h-1.5 w-36 accent-zinc-900 cursor-pointer"
                      />
                      <span className="w-11 text-right font-mono text-xs text-zinc-700 tabular-nums">
                        {editorPrefs.fontSize}px
                      </span>
                    </div>
                  </SettingRow>

                  <Separator />

                  <SettingRow
                    label={isEn ? "Line Height" : "行高"}
                    hint={`${EDITOR_LINE_HEIGHT_MIN.toFixed(1)}–${EDITOR_LINE_HEIGHT_MAX.toFixed(1)}`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        aria-label={isEn ? "Line Height" : "行高"}
                        min={EDITOR_LINE_HEIGHT_MIN}
                        max={EDITOR_LINE_HEIGHT_MAX}
                        step={0.1}
                        value={editorPrefs.lineHeight}
                        onChange={(e) =>
                          onEditorPrefsChange({
                            lineHeight: Number(e.target.value),
                          })
                        }
                        className="h-1.5 w-36 accent-zinc-900 cursor-pointer"
                      />
                      <span className="w-11 text-right font-mono text-xs text-zinc-700 tabular-nums">
                        {editorPrefs.lineHeight.toFixed(1)}
                      </span>
                    </div>
                  </SettingRow>

                  <Separator />

                  <SettingRow
                    label={isEn ? "Tab Width" : "制表符宽度"}
                    hint={
                      isEn
                        ? "Spaces used for indentation and Tab key"
                        : "代码与列表缩进宽度"
                    }
                  >
                    <SegmentedControl<"2" | "4">
                      ariaLabel={isEn ? "Tab Width" : "制表符宽度"}
                      value={editorPrefs.tabSize === 4 ? "4" : "2"}
                      onChange={(val) =>
                        onEditorPrefsChange({ tabSize: Number(val) })
                      }
                      options={[
                        { value: "2", label: isEn ? "2 spaces" : "2 空格" },
                        { value: "4", label: isEn ? "4 spaces" : "4 空格" },
                      ]}
                    />
                  </SettingRow>

                  <Separator />

                  <SettingRow
                    label={isEn ? "Interface Zoom" : "界面缩放"}
                    hint={`${EDITOR_ZOOM_MIN}%–${EDITOR_ZOOM_MAX}%`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        aria-label={isEn ? "Interface Zoom" : "界面缩放"}
                        min={EDITOR_ZOOM_MIN}
                        max={EDITOR_ZOOM_MAX}
                        step={5}
                        value={editorPrefs.zoomLevel}
                        onChange={(e) =>
                          onEditorPrefsChange({
                            zoomLevel: Number(e.target.value),
                          })
                        }
                        className="h-1.5 w-36 accent-zinc-900 cursor-pointer"
                      />
                      <span className="w-11 text-right font-mono text-xs text-zinc-700 tabular-nums">
                        {editorPrefs.zoomLevel}%
                      </span>
                    </div>
                  </SettingRow>

                  <Separator />

                  <SettingRow label={isEn ? "Show Line Numbers" : "默认显示行号"}>
                    <Switch
                      aria-label={isEn ? "Show Line Numbers" : "默认显示行号"}
                      checked={showLineNumbers}
                      onCheckedChange={onShowLineNumbersChange}
                    />
                  </SettingRow>

                  <SettingRow
                    label={isEn ? "Show Formatting Toolbar" : "默认显示工具栏"}
                  >
                    <Switch
                      aria-label={
                        isEn ? "Show Formatting Toolbar" : "默认显示工具栏"
                      }
                      checked={showToolbar}
                      onCheckedChange={onShowToolbarChange}
                    />
                  </SettingRow>

                  <SettingRow label={isEn ? "Sync Scroll" : "同步滚动"}>
                    <Switch
                      aria-label={isEn ? "Sync Scroll" : "同步滚动"}
                      checked={syncScroll}
                      onCheckedChange={onSyncScrollChange}
                    />
                  </SettingRow>

                  <Separator />

                  <div className="flex justify-end pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResetTypography}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {isEn ? "Reset Typography Defaults" : "重置默认排版"}
                    </Button>
                  </div>
                </div>
              )}

              {/* 3. Hexo & Preview */}
              {activeSection === "hexo" && (
                <div className="space-y-4">
                  <SettingRow
                    label={isEn ? "Hexo Tag Rendering" : "Hexo 标签渲染"}
                    hint={
                      isEn
                        ? "Render note, quote, codeblock, and asset_img tags in preview"
                        : "在预览区解析 note、blockquote、codeblock、asset_img 等 Hexo 标签"
                    }
                  >
                    <Switch
                      aria-label={isEn ? "Hexo Tag Rendering" : "Hexo 标签渲染"}
                      checked={enableHexoTags}
                      onCheckedChange={onEnableHexoTagsChange}
                    />
                  </SettingRow>

                  <Separator />

                  <div className="space-y-2.5">
                    <div>
                      <div className="text-xs font-medium text-zinc-800">
                        {isEn ? "Code Highlight Theme" : "代码块高亮主题"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400">
                        {isEn
                          ? "Choose a syntax highlighting preset for preview code blocks"
                          : "选择预览区代码块语法高亮配色预设"}
                      </div>
                    </div>

                    <div
                      role="radiogroup"
                      aria-label={
                        isEn ? "Code Highlight Theme" : "代码块高亮主题"
                      }
                      className="grid grid-cols-2 gap-2.5"
                    >
                      {CODE_THEME_PRESETS.map((preset) => {
                        const selected = editorPrefs.codeTheme === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            data-code-theme={preset.id}
                            onClick={() =>
                              onEditorPrefsChange({ codeTheme: preset.id })
                            }
                            className={cn(
                              "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer",
                              selected
                                ? "border-zinc-900 bg-zinc-50"
                                : "border-zinc-200 bg-white hover:border-zinc-300"
                            )}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-zinc-900">
                                {preset.label}
                              </div>
                              <div className="mt-0.5 text-[10.5px] text-zinc-400">
                                {preset.isDark
                                  ? isEn
                                    ? "Dark"
                                    : "深色"
                                  : isEn
                                    ? "Light"
                                    : "浅色"}
                              </div>
                            </div>
                            <span
                              className="flex h-6 w-10 shrink-0 items-center justify-center gap-1 rounded border border-zinc-200/80"
                              style={{ backgroundColor: preset.bg }}
                            >
                              <span
                                className="h-1.5 w-3 rounded-full"
                                style={{ backgroundColor: preset.fg }}
                              />
                              <span
                                className="h-1.5 w-2 rounded-full"
                                style={{ backgroundColor: preset.accent }}
                              />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium text-zinc-800">
                          {isEn ? "Preview Theme CSS" : "主题 CSS 样式"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {themeCssLabel
                            ? isEn
                              ? `Active: ${themeCssLabel}`
                              : `当前已加载：${themeCssLabel}`
                            : isEn
                              ? "Default minimalist preview style"
                              : "当前使用默认极简样式"}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-medium",
                          themeCssLabel
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-zinc-100 text-zinc-500"
                        )}
                      >
                        {themeCssLabel
                          ? isEn
                            ? "Custom"
                            : "已启用"
                          : isEn
                            ? "Default"
                            : "默认"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          !onLoadSiteThemeCss ||
                          !hasActiveSite ||
                          cssBusyAction !== null
                        }
                        onClick={() => void handleLoadSiteCss()}
                      >
                        {cssBusyAction === "site" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileCode2 className="h-3.5 w-3.5" />
                        )}
                        {isEn
                          ? "Load Site public/css"
                          : "拉取站点 public/css"}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          !onImportCustomThemeCss || cssBusyAction !== null
                        }
                        onClick={() => void handleImportCustomCss()}
                      >
                        {cssBusyAction === "custom" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FolderOpen className="h-3.5 w-3.5" />
                        )}
                        {isEn ? "Import Local CSS" : "导入本地 CSS"}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!onClearThemeCss || !themeCssLabel}
                        onClick={onClearThemeCss}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isEn ? "Clear CSS" : "清除主题 CSS"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Image Bed */}
              {activeSection === "imagebed" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-zinc-800">
                      {isEn ? "Image Upload Mode" : "图床模式"}
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={isEn ? "Image Upload Mode" : "图床模式"}
                      className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
                    >
                      {(
                        [
                          {
                            id: "none",
                            zh: "仅本地存储",
                            en: "Local Only",
                          },
                          {
                            id: "picgo",
                            zh: "PicGo / PicList HTTP",
                            en: "PicGo / PicList HTTP",
                          },
                          {
                            id: "s3",
                            zh: "兼容 S3 (R2 / MinIO / AWS)",
                            en: "S3 Compatible (R2 / MinIO / AWS)",
                          },
                          {
                            id: "oss",
                            zh: "阿里云 OSS",
                            en: "Alibaba Cloud OSS",
                          },
                          {
                            id: "cos",
                            zh: "腾讯云 COS",
                            en: "Tencent Cloud COS",
                          },
                        ] as ReadonlyArray<{
                          id: ImageBedProvider;
                          zh: string;
                          en: string;
                        }>
                      ).map((mode) => {
                        const active = imageBed.provider === mode.id;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            data-imagebed-provider={mode.id}
                            onClick={() =>
                              onImageBedChange({ provider: mode.id })
                            }
                            className={cn(
                              "flex items-center justify-between rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer",
                              active
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                            )}
                          >
                            <span className="truncate">
                              {isEn ? mode.en : mode.zh}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  {imageBed.provider === "none" && (
                    <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/70 px-3.5 py-3 text-xs leading-relaxed text-zinc-500">
                      {isEn
                        ? "Images pasted or dropped into the editor are saved directly to your Hexo local asset directory without remote upload."
                        : "粘贴或拖拽的图片仅保存在 Hexo 本地资源目录（post_asset_folder 或 source/images），不会上传至远端图床。"}
                    </div>
                  )}

                  {imageBed.provider === "picgo" && (
                    <div className="space-y-3" data-imagebed-form="picgo">
                      <FormField
                        id="settings-picgo-url"
                        label={isEn ? "HTTP Endpoint" : "上传接口地址"}
                        required
                      >
                        <Input
                          id="settings-picgo-url"
                          value={imageBed.picgoUrl}
                          onChange={(e) =>
                            onImageBedChange({ picgoUrl: e.target.value })
                          }
                          placeholder="http://127.0.0.1:36677/upload"
                          className="font-mono"
                        />
                      </FormField>

                      <FormField
                        id="settings-picgo-uploader"
                        label={isEn ? "Uploader (Opt.)" : "指定图床（可选）"}
                      >
                        <Input
                          id="settings-picgo-uploader"
                          value={imageBed.picgoUploader}
                          onChange={(e) =>
                            onImageBedChange({ picgoUploader: e.target.value })
                          }
                          placeholder="e.g. github / smms / qiniu"
                          className="font-mono"
                        />
                      </FormField>

                      <FormField
                        id="settings-picgo-config"
                        label={isEn ? "Config Name" : "配置名称（可选）"}
                      >
                        <Input
                          id="settings-picgo-config"
                          value={imageBed.picgoConfigName}
                          onChange={(e) =>
                            onImageBedChange({
                              picgoConfigName: e.target.value,
                            })
                          }
                          placeholder={
                            isEn ? "PicList configName" : "PicList 专用配置名"
                          }
                          className="font-mono"
                        />
                      </FormField>
                    </div>
                  )}

                  {isObjectStorage && (
                    <div className="space-y-3" data-imagebed-form="object">
                      <FormField
                        id="settings-bed-endpoint"
                        label="Endpoint"
                        required
                      >
                        <Input
                          id="settings-bed-endpoint"
                          value={imageBed.endpoint}
                          onChange={(e) =>
                            onImageBedChange({ endpoint: e.target.value })
                          }
                          placeholder={endpointPlaceholder}
                          className="font-mono"
                        />
                      </FormField>

                      <FormField
                        id="settings-bed-bucket"
                        label="Bucket"
                        required
                      >
                        <Input
                          id="settings-bed-bucket"
                          value={imageBed.bucket}
                          onChange={(e) =>
                            onImageBedChange({ bucket: e.target.value })
                          }
                          placeholder="my-blog-assets"
                          className="font-mono"
                        />
                      </FormField>

                      <FormField id="settings-bed-region" label="Region">
                        <Input
                          id="settings-bed-region"
                          value={imageBed.region}
                          onChange={(e) =>
                            onImageBedChange({ region: e.target.value })
                          }
                          placeholder={regionPlaceholder}
                          className="font-mono"
                        />
                      </FormField>

                      <FormField
                        id="settings-bed-ak"
                        label="Access Key ID"
                        required
                      >
                        <Input
                          id="settings-bed-ak"
                          value={imageBed.accessKeyId}
                          onChange={(e) =>
                            onImageBedChange({ accessKeyId: e.target.value })
                          }
                          placeholder="AKIA..."
                          className="font-mono"
                        />
                      </FormField>

                      <FormField
                        id="settings-bed-sk"
                        label="Secret Access Key"
                        required
                      >
                        <div className="relative">
                          <Input
                            id="settings-bed-sk"
                            type={showSecret ? "text" : "password"}
                            value={imageBed.secretAccessKey}
                            onChange={(e) =>
                              onImageBedChange({
                                secretAccessKey: e.target.value,
                              })
                            }
                            placeholder="••••••••••••"
                            className="pr-9 font-mono"
                          />
                          <button
                            type="button"
                            data-testid="toggle-secret-visibility"
                            aria-label={
                              showSecret
                                ? isEn
                                  ? "Hide secret key"
                                  : "隐藏密钥"
                                : isEn
                                  ? "Show secret key"
                                  : "显示密钥"
                            }
                            onClick={() => setShowSecret((prev) => !prev)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 cursor-pointer"
                          >
                            {showSecret ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </FormField>

                      <FormField
                        id="settings-bed-domain"
                        label={isEn ? "Custom Domain" : "自定义域名"}
                      >
                        <Input
                          id="settings-bed-domain"
                          value={imageBed.customDomain}
                          onChange={(e) =>
                            onImageBedChange({ customDomain: e.target.value })
                          }
                          placeholder="https://cdn.example.com"
                          className="font-mono"
                        />
                      </FormField>

                      <FormField
                        id="settings-bed-prefix"
                        label={isEn ? "Path Prefix" : "存储路径前缀"}
                      >
                        <Input
                          id="settings-bed-prefix"
                          value={imageBed.pathPrefix}
                          onChange={(e) =>
                            onImageBedChange({ pathPrefix: e.target.value })
                          }
                          placeholder="blog/images/"
                          className="font-mono"
                        />
                      </FormField>
                    </div>
                  )}

                  {imageBed.provider !== "none" && (
                    <>
                      <Separator />

                      <SettingRow
                        label={
                          isEn
                            ? "Keep Local Copy After Upload"
                            : "上传后保留本地文件"
                        }
                        hint={
                          isEn
                            ? "Keep original local image alongside remote URL"
                            : "上传成功后仍保留本地资源副本，便于离线回溯"
                        }
                      >
                        <Switch
                          aria-label={
                            isEn
                              ? "Keep Local Copy After Upload"
                              : "上传后保留本地文件"
                          }
                          checked={imageBed.keepLocalAfterUpload}
                          onCheckedChange={(keepLocalAfterUpload) =>
                            onImageBedChange({ keepLocalAfterUpload })
                          }
                        />
                      </SettingRow>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="min-w-0 flex-1">
                          {testResult && (
                            <div
                              role="status"
                              data-testid="imagebed-test-result"
                              className={cn(
                                "inline-flex items-center gap-1.5 text-xs",
                                testResult.ok
                                  ? "text-emerald-700"
                                  : "text-red-600"
                              )}
                            >
                              {testResult.ok ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span className="truncate">
                                {testResult.message}
                              </span>
                            </div>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            !onTestImageBedConnection || isTestingConnection
                          }
                          onClick={() => void handleTestConnection()}
                        >
                          {isTestingConnection && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          )}
                          {isTestingConnection
                            ? isEn
                              ? "Testing..."
                              : "测试中..."
                            : isEn
                              ? "Test Connection"
                              : "测试连接"}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 5. About & Shortcuts */}
              {activeSection === "about" && (
                <div className="space-y-5">
                  <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/70 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-zinc-900">
                        HexoEditor V2
                      </span>
                      <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] text-zinc-600 border border-zinc-200/80">
                        v{appVersion}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                      {isEn
                        ? "Native lightweight Hexo Markdown desktop workbench powered by Tauri v2, Rust, React 19, and CodeMirror 6."
                        : "基于 Tauri v2 + Rust 与 React 19 / CodeMirror 6 构建的原生轻量级 Hexo Markdown 写作工作台。"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-800">
                      {isEn ? "Keyboard Shortcuts" : "常用快捷键"}
                    </div>
                    <div className="overflow-hidden rounded-lg border border-zinc-200/80">
                      <table className="w-full border-collapse text-xs">
                        <tbody>
                          {SHORTCUT_ITEMS.map((item) => (
                            <tr
                              key={item.keys}
                              className="border-b border-zinc-100 last:border-b-0"
                            >
                              <td className="px-3 py-2 text-zinc-700">
                                {isEn ? item.en : item.zh}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <kbd className="inline-block rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">
                                  {item.keys}
                                </kbd>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
