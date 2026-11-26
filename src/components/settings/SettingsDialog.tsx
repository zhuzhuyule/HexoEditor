import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  Cloud,
  Cpu,
  Eye,
  EyeOff,
  FileCode2,
  FolderOpen,
  Info,
  Loader2,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import * as React from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  formatArgsString,
  formatEnvText,
  parseArgsString,
  parseEnvText,
} from "@/lib/ai/profiles";
import * as aiApi from "@/lib/tauri/aiApi";
import { cn } from "@/lib/utils";
import type { Locale } from "@/types";
import {
  DEFAULT_AI_SETTINGS,
  type AcpProbeResult,
  type AiApiPreset,
  type AiConnectionResult,
  type AiSettings,
  type CustomAcpProfile,
  type DiscoveredAgent,
} from "@/types/ai";
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
  type TitleBarMode,
  type UiFontSize,
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

  // AI & ACP
  aiSettings?: AiSettings;
  onAiSettingsChange?: (patch: Partial<AiSettings>) => void;
  discoveredAgents?: DiscoveredAgent[];
  onRefreshAgents?: () => Promise<DiscoveredAgent[] | void>;
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
  aiSettings = DEFAULT_AI_SETTINGS,
  onAiSettingsChange,
  discoveredAgents = [],
  onRefreshAgents,
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
  const [showAiApiKey, setShowAiApiKey] = useState(false);
  const [refreshingAgents, setRefreshingAgents] = useState(false);
  const [probingAgentId, setProbingAgentId] = useState<string | null>(null);
  const [probeResults, setProbeResults] = useState<Record<string, AcpProbeResult>>({});
  const [testingAiConn, setTestingAiConn] = useState(false);
  const [aiConnResult, setAiConnResult] = useState<AiConnectionResult | null>(null);
  const [acpFormOpen, setAcpFormOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [acpFormName, setAcpFormName] = useState("");
  const [acpFormAccountLabel, setAcpFormAccountLabel] = useState("");
  const [acpFormProtocol, setAcpFormProtocol] = useState<"acp" | "cli">("acp");
  const [acpFormExecutable, setAcpFormExecutable] = useState("");
  const [acpFormArgsText, setAcpFormArgsText] = useState("");
  const [acpFormCwd, setAcpFormCwd] = useState("");
  const [acpFormEnvText, setAcpFormEnvText] = useState("");
  const [acpFormBaseAgentId, setAcpFormBaseAgentId] = useState<string | undefined>(
    undefined
  );

  const wasOpenRef = useRef(false);
  const testSeqRef = useRef(0);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setActiveSection(initialSection);
      setShowSecret(false);
      setShowAiApiKey(false);
      setTestResult(null);
      setAiConnResult(null);
      setRecentClearedNotice(false);
      setAcpFormOpen(false);
      setEditingProfileId(null);
    }
    wasOpenRef.current = open;
  }, [open, initialSection]);

  useEffect(() => {
    setAiConnResult(null);
  }, [aiSettings.apiPreset]);

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
      id: "ai",
      label: isEn ? "AI Assistant" : "AI 助手",
      icon: <Sparkles className="h-3.5 w-3.5" />,
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
      uiFontSize: DEFAULT_EDITOR_PREFS.uiFontSize,
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

  const handleRefreshAiAgents = async () => {
    if (!onRefreshAgents || refreshingAgents) return;
    setRefreshingAgents(true);
    try {
      await onRefreshAgents();
    } finally {
      setRefreshingAgents(false);
    }
  };

  const handleProbeAcpAgent = async (agent: DiscoveredAgent) => {
    setProbingAgentId(agent.id);
    try {
      const res = await aiApi.probeAcpAgent(agent.executable, agent.args);
      setProbeResults((prev) => ({ ...prev, [agent.id]: res }));
    } catch (err) {
      setProbeResults((prev) => ({
        ...prev,
        [agent.id]: {
          ok: false,
          protocolVersion: null,
          agentInfo: null,
          agentCapabilities: {},
          authMethods: [],
          message: err instanceof Error ? err.message : String(err),
          latencyMs: 0,
        },
      }));
    } finally {
      setProbingAgentId(null);
    }
  };

  const handleProbeCustomProfile = async (profile: CustomAcpProfile) => {
    const resultKey = `profile:${profile.id}`;
    setProbingAgentId(resultKey);
    try {
      const res = await aiApi.probeAcpAgent(
        profile.executable,
        profile.args,
        profile.env,
        profile.cwd ?? null
      );
      setProbeResults((prev) => ({ ...prev, [resultKey]: res }));
    } catch (err) {
      setProbeResults((prev) => ({
        ...prev,
        [resultKey]: {
          ok: false,
          protocolVersion: null,
          agentInfo: null,
          agentCapabilities: {},
          authMethods: [],
          message: err instanceof Error ? err.message : String(err),
          latencyMs: 0,
        },
      }));
    } finally {
      setProbingAgentId(null);
    }
  };

  const openNewCustomAcpForm = (preset?: {
    name?: string;
    accountLabel?: string;
    protocol?: "acp" | "cli";
    executable?: string;
    args?: string[];
    envText?: string;
    baseAgentId?: string;
  }) => {
    setEditingProfileId(null);
    setAcpFormName(preset?.name ?? "");
    setAcpFormAccountLabel(preset?.accountLabel ?? "");
    setAcpFormProtocol(preset?.protocol ?? "acp");
    setAcpFormExecutable(preset?.executable ?? "");
    setAcpFormArgsText(preset?.args ? formatArgsString(preset.args) : "");
    setAcpFormCwd("");
    setAcpFormEnvText(preset?.envText ?? "");
    setAcpFormBaseAgentId(preset?.baseAgentId);
    setAcpFormOpen(true);
  };

  const openEditCustomAcpForm = (profile: CustomAcpProfile) => {
    setEditingProfileId(profile.id);
    setAcpFormName(profile.name);
    setAcpFormAccountLabel(profile.accountLabel ?? "");
    setAcpFormProtocol(profile.protocol);
    setAcpFormExecutable(profile.executable);
    setAcpFormArgsText(formatArgsString(profile.args));
    setAcpFormCwd(profile.cwd ?? "");
    setAcpFormEnvText(formatEnvText(profile.env));
    setAcpFormBaseAgentId(profile.baseAgentId);
    setAcpFormOpen(true);
  };

  const handleSaveCustomAcpProfile = () => {
    const name = acpFormName.trim();
    const executable = acpFormExecutable.trim();
    if (!name || !executable) return;
    const existingProfiles = aiSettings.customAcpProfiles ?? [];
    const profileId =
      editingProfileId ||
      `acp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const nextProfile: CustomAcpProfile = {
      id: profileId,
      name,
      protocol: acpFormProtocol,
      executable,
      args: parseArgsString(acpFormArgsText),
      env: parseEnvText(acpFormEnvText),
      cwd: acpFormCwd.trim() || undefined,
      accountLabel: acpFormAccountLabel.trim() || undefined,
      baseAgentId: acpFormBaseAgentId,
      enabled: true,
    };
    const nextProfiles = editingProfileId
      ? existingProfiles.map((p) => (p.id === editingProfileId ? nextProfile : p))
      : [...existingProfiles, nextProfile];
    onAiSettingsChange?.({
      customAcpProfiles: nextProfiles,
      ...(editingProfileId ? {} : { selectedProviderKey: `profile:${profileId}` }),
    });
    setAcpFormOpen(false);
    setEditingProfileId(null);
  };

  const handleDeleteCustomAcpProfile = (profileId: string) => {
    const existingProfiles = aiSettings.customAcpProfiles ?? [];
    const nextProfiles = existingProfiles.filter((p) => p.id !== profileId);
    const wasSelected = aiSettings.selectedProviderKey === `profile:${profileId}`;
    const fallbackKey =
      discoveredAgents.length > 0 ? `agent:${discoveredAgents[0].id}` : "api";
    onAiSettingsChange?.({
      customAcpProfiles: nextProfiles,
      ...(wasSelected ? { selectedProviderKey: fallbackKey } : {}),
    });
    if (editingProfileId === profileId) {
      setAcpFormOpen(false);
      setEditingProfileId(null);
    }
  };

  const handleSelectAiPreset = (preset: AiApiPreset) => {
    const defaultUrls: Record<AiApiPreset, string> = {
      openai_compatible: "https://api.openai.com/v1",
      anthropic: "https://api.anthropic.com",
      ollama: "http://127.0.0.1:11434/v1",
    };
    const defaultModels: Record<AiApiPreset, string> = {
      openai_compatible: "gpt-4o-mini",
      anthropic: "claude-3-5-sonnet-latest",
      ollama: "llama3.1",
    };
    const isKnownDefaultUrl =
      !aiSettings.baseUrl.trim() ||
      Object.values(defaultUrls).includes(aiSettings.baseUrl.trim());
    const isKnownDefaultModel =
      !aiSettings.model.trim() ||
      Object.values(defaultModels).includes(aiSettings.model.trim());

    onAiSettingsChange?.({
      apiPreset: preset,
      ...(isKnownDefaultUrl ? { baseUrl: defaultUrls[preset] } : {}),
      ...(isKnownDefaultModel ? { model: defaultModels[preset] } : {}),
    });
  };

  const handleTestAiApi = async () => {
    setTestingAiConn(true);
    setAiConnResult(null);
    try {
      const res = await aiApi.testAiConnection({
        mode: aiSettings.apiPreset,
        executable: null,
        args: [],
        baseUrl: aiSettings.baseUrl.trim() || null,
        apiKey: aiSettings.apiKey.trim() || null,
        model: aiSettings.model.trim() || null,
      });
      setAiConnResult(res);
    } catch (err) {
      setAiConnResult({
        ok: false,
        provider: aiSettings.apiPreset,
        message: err instanceof Error ? err.message : String(err),
        latencyMs: 0,
      });
    } finally {
      setTestingAiConn(false);
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

                  <SettingRow
                    label={isEn ? "UI Font Size" : "界面字号"}
                    hint={
                      isEn
                        ? "Adjust interface font scale across sidebar, menus, and status bar"
                        : "统一调整侧边栏、菜单与底部工具栏的整体字号"
                    }
                  >
                    <SegmentedControl<UiFontSize>
                      ariaLabel={isEn ? "UI Font Size" : "界面字号"}
                      value={editorPrefs.uiFontSize ?? "md"}
                      onChange={(uiFontSize) =>
                        onEditorPrefsChange({ uiFontSize })
                      }
                      options={[
                        { value: "sm", label: isEn ? "Small" : "小" },
                        { value: "md", label: isEn ? "Medium" : "中" },
                        { value: "lg", label: isEn ? "Large" : "大" },
                      ]}
                    />
                  </SettingRow>

                  <Separator />

                  <SettingRow
                    label={isEn ? "Title Bar Mode" : "标题栏模式"}
                    hint={
                      isEn
                        ? "Blend tools into macOS title bar or use classic system title bar"
                        : "融合标题栏可将窗口控制与工具栏合二为一，也可切回系统原生标题栏"
                    }
                  >
                    <SegmentedControl<TitleBarMode>
                      ariaLabel={isEn ? "Title Bar Mode" : "标题栏模式"}
                      value={editorPrefs.titleBarMode ?? "overlay"}
                      onChange={(titleBarMode) =>
                        onEditorPrefsChange({ titleBarMode })
                      }
                      options={[
                        {
                          value: "overlay",
                          label: isEn
                            ? "Overlay (Draggable)"
                            : "融合标题栏（可拖拽）",
                        },
                        {
                          value: "system",
                          label: isEn ? "System Title Bar" : "系统标题栏",
                        },
                      ]}
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

              {/* 5. AI Assistant */}
              {activeSection === "ai" && (
                <div className="space-y-5">
                  {/* Local Agent Auto Discovery */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-zinc-800">
                          {isEn
                            ? "Local Agent Auto-Discovery"
                            : "本地 Agent 自动发现"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-400">
                          {isEn
                            ? "Detect local ACP agents (Antigravity, OpenCode, Gemini, Goose) & CLI bridges"
                            : "自动扫描本机已安装的 ACP Agent（如 Antigravity、OpenCode）与 CLI 工具"}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!onRefreshAgents || refreshingAgents}
                        onClick={() => void handleRefreshAiAgents()}
                      >
                        <RefreshCw
                          className={cn(
                            "h-3.5 w-3.5",
                            refreshingAgents && "animate-spin"
                          )}
                        />
                        {isEn ? "Refresh" : "刷新探测"}
                      </Button>
                    </div>

                    {discoveredAgents.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/70 px-3.5 py-3 text-xs leading-relaxed text-zinc-500">
                        {isEn
                          ? "No local ACP/CLI agents detected in PATH (~/.opencode/bin, ~/.local/bin, ~/.cargo/bin). Supported: agy, opencode, gemini, goose, claude, codex, cursor-agent."
                          : "暂未在常见路径（~/.opencode/bin、~/.local/bin、~/.cargo/bin）检测到本地 Agent。支持：agy、opencode、gemini、goose、claude、codex、cursor-agent。"}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {discoveredAgents.map((agent) => {
                          const isSelected =
                            aiSettings.selectedProviderKey ===
                            `agent:${agent.id}`;
                          const probe = probeResults[agent.id];
                          const capEntries = probe
                            ? Object.entries(probe.agentCapabilities ?? {}).filter(
                                ([, v]) => Boolean(v)
                              )
                            : [];
                          return (
                            <div
                              key={agent.id}
                              data-discovered-agent={agent.id}
                              className={cn(
                                "rounded-lg border p-3 transition-colors",
                                isSelected
                                  ? "border-zinc-900 bg-zinc-50/70"
                                  : "border-zinc-200 bg-white"
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Cpu className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                                    <span className="text-xs font-semibold text-zinc-900">
                                      {agent.label}
                                    </span>
                                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase text-zinc-600">
                                      {agent.protocol}
                                    </span>
                                    {agent.version && (
                                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700">
                                        {agent.version}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 truncate font-mono text-[10.5px] text-zinc-400">
                                    {agent.executable}
                                    {agent.args.length > 0
                                      ? ` ${agent.args.join(" ")}`
                                      : ""}
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1.5">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    title={
                                      isEn
                                        ? "Add another account/profile using this agent"
                                        : "基于此 Agent 添加多账号或独立配置"
                                    }
                                    onClick={() =>
                                      openNewCustomAcpForm({
                                        name: isEn
                                          ? `${agent.label} (Account 2)`
                                          : `${agent.label} - 账号 2`,
                                        accountLabel: isEn ? "Account 2" : "账号 2",
                                        protocol:
                                          agent.protocol === "cli" ? "cli" : "acp",
                                        executable: agent.executable,
                                        args: agent.args,
                                        envText:
                                          agent.id === "opencode"
                                            ? "XDG_CONFIG_HOME=~/.config/opencode-acc2"
                                            : "",
                                        baseAgentId: agent.id,
                                      })
                                    }
                                  >
                                    <UserPlus className="h-3 w-3" />
                                    {isEn ? "+ Account" : "+ 多账号"}
                                  </Button>
                                  {agent.protocol === "acp" && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="xs"
                                      disabled={probingAgentId === agent.id}
                                      onClick={() =>
                                        void handleProbeAcpAgent(agent)
                                      }
                                    >
                                      {probingAgentId === agent.id && (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      )}
                                      {isEn ? "Test ACP" : "ACP 握手测试"}
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant={isSelected ? "default" : "outline"}
                                    size="xs"
                                    onClick={() =>
                                      onAiSettingsChange?.({
                                        selectedProviderKey: `agent:${agent.id}`,
                                      })
                                    }
                                  >
                                    {isSelected
                                      ? isEn
                                        ? "Active"
                                        : "当前使用"
                                      : isEn
                                        ? "Use"
                                        : "启用"}
                                  </Button>
                                </div>
                              </div>

                              {probe && (
                                <div
                                  data-testid={`acp-probe-result-${agent.id}`}
                                  className={cn(
                                    "mt-2 rounded border px-2.5 py-1.5 text-[11px]",
                                    probe.ok
                                      ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
                                      : "border-red-200 bg-red-50/60 text-red-700"
                                  )}
                                >
                                  <div className="flex items-center gap-1.5 font-medium">
                                    {probe.ok ? (
                                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                                    ) : (
                                      <XCircle className="h-3 w-3 shrink-0" />
                                    )}
                                    <span>
                                      {probe.message} ({probe.latencyMs}ms)
                                    </span>
                                  </div>
                                  {probe.ok && capEntries.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {capEntries.map(([capKey]) => (
                                        <span
                                          key={capKey}
                                          className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] text-emerald-800 border border-emerald-200/70"
                                        >
                                          {capKey}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Custom ACP & Multi-Account Profiles (OMB-style) */}
                  <div className="space-y-3" data-testid="custom-acp-section">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-zinc-800">
                          {isEn
                            ? "Custom ACP & Multi-Account Profiles"
                            : "自定义 ACP 与多账号配置"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-400">
                          {isEn
                            ? "Add custom ACP agents or isolate multiple accounts via custom env & args"
                            : "支持自定义 ACP 命令或通过独立环境变量配置同一 Agent 的多个账号"}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="add-custom-acp-btn"
                        onClick={() => openNewCustomAcpForm()}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {isEn ? "Add ACP / Account" : "添加 ACP / 账号"}
                      </Button>
                    </div>

                    {acpFormOpen && (
                      <div
                        data-testid="custom-acp-form"
                        className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-zinc-800">
                            {editingProfileId
                              ? isEn
                                ? "Edit ACP Profile"
                                : "编辑 ACP / 账号配置"
                              : isEn
                                ? "New ACP Profile"
                                : "新建 ACP / 账号配置"}
                          </span>
                          {!editingProfileId && (
                            <div className="flex flex-wrap items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() =>
                                  openNewCustomAcpForm({
                                    name: isEn
                                      ? "OpenCode (Account 2)"
                                      : "OpenCode 多账号",
                                    accountLabel: isEn ? "Account 2" : "账号 2",
                                    protocol: "acp",
                                    executable: "opencode",
                                    args: ["acp"],
                                    envText:
                                      "XDG_CONFIG_HOME=~/.config/opencode-acc2",
                                    baseAgentId: "opencode",
                                  })
                                }
                              >
                                OpenCode 多账号
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() =>
                                  openNewCustomAcpForm({
                                    name: isEn
                                      ? "Antigravity (Account 2)"
                                      : "Antigravity 多账号",
                                    accountLabel: isEn ? "Work" : "工作号",
                                    protocol: "acp",
                                    executable: "agy",
                                    args: ["acp"],
                                    envText: "",
                                    baseAgentId: "antigravity",
                                  })
                                }
                              >
                                Antigravity 多账号
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() =>
                                  openNewCustomAcpForm({
                                    name: "Gemini CLI (ACP)",
                                    accountLabel: "",
                                    protocol: "acp",
                                    executable: "gemini",
                                    args: ["--experimental-acp"],
                                    envText: "GEMINI_API_KEY=",
                                    baseAgentId: "gemini",
                                  })
                                }
                              >
                                Gemini ACP
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="acp-profile-name"
                              className="mb-1 block text-[11px] font-medium text-zinc-700"
                            >
                              {isEn ? "Display Name" : "配置名称"} *
                            </label>
                            <Input
                              id="acp-profile-name"
                              value={acpFormName}
                              onChange={(e) => setAcpFormName(e.target.value)}
                              placeholder={
                                isEn ? "e.g. OpenCode Work" : "如：OpenCode 免费号 2"
                              }
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="acp-profile-account"
                              className="mb-1 block text-[11px] font-medium text-zinc-700"
                            >
                              {isEn ? "Account Label (optional)" : "账号标识（可选）"}
                            </label>
                            <Input
                              id="acp-profile-account"
                              value={acpFormAccountLabel}
                              onChange={(e) =>
                                setAcpFormAccountLabel(e.target.value)
                              }
                              placeholder={isEn ? "e.g. Work / Free-2" : "如：工作号 / 免费号 2"}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[120px_1fr]">
                          <div>
                            <span className="mb-1 block text-[11px] font-medium text-zinc-700">
                              {isEn ? "Protocol" : "协议模式"}
                            </span>
                            <SegmentedControl<"acp" | "cli">
                              ariaLabel={isEn ? "Profile Protocol" : "协议模式"}
                              value={acpFormProtocol}
                              onChange={setAcpFormProtocol}
                              options={[
                                { value: "acp", label: "ACP" },
                                { value: "cli", label: "CLI" },
                              ]}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="acp-profile-exe"
                              className="mb-1 block text-[11px] font-medium text-zinc-700"
                            >
                              {isEn ? "Executable Path / Command" : "可执行命令或路径"} *
                            </label>
                            <Input
                              id="acp-profile-exe"
                              value={acpFormExecutable}
                              onChange={(e) =>
                                setAcpFormExecutable(e.target.value)
                              }
                              placeholder="opencode / agy / /usr/local/bin/my-agent"
                              className="font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="acp-profile-args"
                              className="mb-1 block text-[11px] font-medium text-zinc-700"
                            >
                              {isEn ? "Arguments" : "启动参数"}
                            </label>
                            <Input
                              id="acp-profile-args"
                              value={acpFormArgsText}
                              onChange={(e) => setAcpFormArgsText(e.target.value)}
                              placeholder="acp --profile work"
                              className="font-mono"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="acp-profile-cwd"
                              className="mb-1 block text-[11px] font-medium text-zinc-700"
                            >
                              {isEn ? "Working Dir (optional)" : "工作目录（可选）"}
                            </label>
                            <Input
                              id="acp-profile-cwd"
                              value={acpFormCwd}
                              onChange={(e) => setAcpFormCwd(e.target.value)}
                              placeholder={
                                isEn ? "Defaults to active site root" : "留空默认当前站点根目录"
                              }
                              className="font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="acp-profile-env"
                            className="mb-1 block text-[11px] font-medium text-zinc-700"
                          >
                            {isEn
                              ? "Environment Variables (KEY=VALUE per line)"
                              : "环境变量（每行一个 KEY=VALUE，用于隔离多账号或注入密钥）"}
                          </label>
                          <textarea
                            id="acp-profile-env"
                            rows={3}
                            value={acpFormEnvText}
                            onChange={(e) => setAcpFormEnvText(e.target.value)}
                            placeholder={
                              "XDG_CONFIG_HOME=/Users/me/.config/opencode-acc2\nANTHROPIC_API_KEY=..."
                            }
                            className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              setAcpFormOpen(false);
                              setEditingProfileId(null);
                            }}
                          >
                            {isEn ? "Cancel" : "取消"}
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            disabled={
                              !acpFormName.trim() || !acpFormExecutable.trim()
                            }
                            onClick={handleSaveCustomAcpProfile}
                          >
                            {isEn ? "Save Profile" : "保存配置"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {(aiSettings.customAcpProfiles ?? []).length === 0 ? (
                      !acpFormOpen && (
                        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-[11px] text-zinc-400">
                          {isEn
                            ? "No custom ACP or multi-account profiles yet. Click \"+ Account\" above or \"Add ACP / Account\"."
                            : "暂无自定义 ACP 或多账号配置；可点击上方某 Agent 的「+ 多账号」或右侧「添加 ACP / 账号」。"}
                        </div>
                      )
                    ) : (
                      <div className="space-y-2">
                        {(aiSettings.customAcpProfiles ?? []).map((profile) => {
                          const profileKey = `profile:${profile.id}`;
                          const isSelected =
                            aiSettings.selectedProviderKey === profileKey;
                          const envCount = Object.keys(profile.env).length;
                          const probe = probeResults[profileKey];
                          return (
                            <div
                              key={profile.id}
                              data-custom-acp-profile={profile.id}
                              className={cn(
                                "rounded-lg border p-3 transition-colors",
                                isSelected
                                  ? "border-zinc-900 bg-zinc-50/70"
                                  : "border-zinc-200 bg-white"
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Cpu className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                                    <span className="text-xs font-semibold text-zinc-900">
                                      {profile.name}
                                    </span>
                                    {profile.accountLabel && (
                                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-200/60">
                                        {profile.accountLabel}
                                      </span>
                                    )}
                                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase text-zinc-600">
                                      {profile.protocol}
                                    </span>
                                    {envCount > 0 && (
                                      <span className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 border border-amber-200/60">
                                        {envCount} env
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 truncate font-mono text-[10.5px] text-zinc-400">
                                    {profile.executable}
                                    {profile.args.length > 0
                                      ? ` ${profile.args.join(" ")}`
                                      : ""}
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                  {profile.protocol === "acp" && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="xs"
                                      disabled={probingAgentId === profileKey}
                                      onClick={() =>
                                        void handleProbeCustomProfile(profile)
                                      }
                                    >
                                      {probingAgentId === profileKey && (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      )}
                                      {isEn ? "Test ACP" : "ACP 握手测试"}
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant={isSelected ? "default" : "outline"}
                                    size="xs"
                                    onClick={() =>
                                      onAiSettingsChange?.({
                                        selectedProviderKey: profileKey,
                                      })
                                    }
                                  >
                                    {isSelected
                                      ? isEn
                                        ? "Active"
                                        : "当前使用"
                                      : isEn
                                        ? "Use"
                                        : "启用"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="iconSm"
                                    title={isEn ? "Edit" : "编辑"}
                                    aria-label={isEn ? "Edit" : "编辑"}
                                    onClick={() =>
                                      openEditCustomAcpForm(profile)
                                    }
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="iconSm"
                                    title={isEn ? "Delete" : "删除"}
                                    aria-label={isEn ? "Delete" : "删除"}
                                    onClick={() =>
                                      handleDeleteCustomAcpProfile(profile.id)
                                    }
                                    className="text-zinc-400 hover:text-red-600"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>

                              {probe && (
                                <div
                                  className={cn(
                                    "mt-2 rounded border px-2.5 py-1.5 text-[11px]",
                                    probe.ok
                                      ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
                                      : "border-red-200 bg-red-50/60 text-red-700"
                                  )}
                                >
                                  <div className="flex items-center gap-1.5 font-medium">
                                    {probe.ok ? (
                                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                                    ) : (
                                      <XCircle className="h-3 w-3 shrink-0" />
                                    )}
                                    <span>
                                      {probe.message} ({probe.latencyMs}ms)
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Standard Model API Configuration */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-zinc-800">
                          {isEn ? "Standard Model API" : "标准模型 API 配置"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-400">
                          {isEn
                            ? "Direct streaming via OpenAI-compatible, Anthropic, or local Ollama"
                            : "直连 OpenAI 兼容接口（DeepSeek/OpenRouter/SiliconFlow）、Anthropic 或本地 Ollama"}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant={
                          aiSettings.selectedProviderKey === "api"
                            ? "default"
                            : "outline"
                        }
                        size="xs"
                        onClick={() =>
                          onAiSettingsChange?.({ selectedProviderKey: "api" })
                        }
                      >
                        {aiSettings.selectedProviderKey === "api"
                          ? isEn
                            ? "Active"
                            : "当前使用"
                          : isEn
                            ? "Use API"
                            : "切换为 API"}
                      </Button>
                    </div>

                    <SegmentedControl<AiApiPreset>
                      ariaLabel={isEn ? "API Provider Preset" : "API 协议预设"}
                      value={aiSettings.apiPreset}
                      onChange={handleSelectAiPreset}
                      options={[
                        {
                          value: "openai_compatible",
                          label: "OpenAI Compatible",
                        },
                        { value: "anthropic", label: "Anthropic" },
                        { value: "ollama", label: "Ollama" },
                      ]}
                    />

                    <div className="space-y-3 pt-1">
                      <FormField id="settings-ai-base-url" label="Base URL">
                        <Input
                          id="settings-ai-base-url"
                          value={aiSettings.baseUrl}
                          onChange={(e) =>
                            onAiSettingsChange?.({ baseUrl: e.target.value })
                          }
                          placeholder={
                            aiSettings.apiPreset === "anthropic"
                              ? "https://api.anthropic.com"
                              : aiSettings.apiPreset === "ollama"
                                ? "http://127.0.0.1:11434/v1"
                                : "https://api.openai.com/v1"
                          }
                          className="font-mono"
                        />
                      </FormField>

                      <FormField
                        id="settings-ai-api-key"
                        label="API Key"
                        required={aiSettings.apiPreset !== "ollama"}
                      >
                        <div className="relative">
                          <Input
                            id="settings-ai-api-key"
                            type={showAiApiKey ? "text" : "password"}
                            value={aiSettings.apiKey}
                            onChange={(e) =>
                              onAiSettingsChange?.({ apiKey: e.target.value })
                            }
                            placeholder={
                              aiSettings.apiPreset === "ollama"
                                ? isEn
                                  ? "Optional for local Ollama"
                                  : "本地 Ollama 可留空"
                                : "sk-••••••••••••"
                            }
                            className="pr-9 font-mono"
                          />
                          <button
                            type="button"
                            data-testid="toggle-ai-apikey-visibility"
                            aria-label={
                              showAiApiKey
                                ? isEn
                                  ? "Hide API key"
                                  : "隐藏 API Key"
                                : isEn
                                  ? "Show API key"
                                  : "显示 API Key"
                            }
                            onClick={() => setShowAiApiKey((prev) => !prev)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 cursor-pointer"
                          >
                            {showAiApiKey ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </FormField>

                      <FormField id="settings-ai-model" label="Model">
                        <Input
                          id="settings-ai-model"
                          value={aiSettings.model}
                          onChange={(e) =>
                            onAiSettingsChange?.({ model: e.target.value })
                          }
                          placeholder={
                            aiSettings.apiPreset === "anthropic"
                              ? "claude-3-5-sonnet-latest"
                              : aiSettings.apiPreset === "ollama"
                                ? "llama3.1"
                                : "gpt-4o-mini"
                          }
                          className="font-mono"
                        />
                      </FormField>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="min-w-0 flex-1">
                        {aiConnResult && (
                          <div
                            role="status"
                            data-testid="ai-test-result"
                            className={cn(
                              "inline-flex items-center gap-1.5 text-xs",
                              aiConnResult.ok
                                ? "text-emerald-700"
                                : "text-red-600"
                            )}
                          >
                            {aiConnResult.ok ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="truncate">
                              {aiConnResult.message}
                            </span>
                          </div>
                        )}
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={testingAiConn}
                        onClick={() => void handleTestAiApi()}
                      >
                        {testingAiConn && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        {testingAiConn
                          ? isEn
                            ? "Testing..."
                            : "测试中..."
                          : isEn
                            ? "Test Connection"
                            : "测试连接"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* 6. About & Shortcuts */}
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
