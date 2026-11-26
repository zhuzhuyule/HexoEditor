import { create } from "zustand";

import { parseMarkdownDocument } from "@/lib/frontmatter";
import { formatMessage, getMessages } from "@/lib/i18n";
import {
  replaceLocalImageInMarkdown,
  restoreRemoteImageInMarkdown,
} from "@/lib/markdown/imageRefs";
import * as api from "@/lib/tauri/api";
import * as aiApi from "@/lib/tauri/aiApi";
import * as hexoApi from "@/lib/tauri/hexoApi";
import type {
  HexoCliAction,
  HexoCliOutputEvent,
  HexoCliStatus,
  QuickOpenTarget,
} from "@/lib/tauri/hexoApi";
import * as imageBedApi from "@/lib/tauri/imageBedApi";
import type { ImageBedUploadBatchResult } from "@/lib/tauri/imageBedApi";
import { getFileName, isPathInsideDir } from "@/lib/utils";
import type {
  EditorTab,
  ExternalChangeEvent,
  HexoSiteConfig,
  HexoTerminalLogItem,
  Locale,
  PostFilterTab,
  PostSummary,
  PreviewSource,
  SavedSiteEntry,
  SidebarTab,
  TaxonomyCount,
  ToastItem,
  ViewMode,
  WelcomeRecentEntry,
} from "@/types";
import {
  DEFAULT_AI_SETTINGS,
  type AiApiPreset,
  type AiSettings,
  type DiscoveredAgent,
} from "@/types/ai";
import {
  clampEditorFontSize,
  clampEditorLineHeight,
  clampEditorZoomLevel,
  DEFAULT_EDITOR_PREFS,
  DEFAULT_IMAGE_BED_SETTINGS,
  normalizeEditorTabSize,
  type EditorPreferences,
  type ImageBedProvider,
  type ImageBedSettings,
} from "@/types/settings";

const MAX_RECENT_ENTRIES = 10;
const MAX_HEXO_LOGS = 500;

export const DEFAULT_SIDEBAR_WIDTH = 260;
export const MIN_SIDEBAR_WIDTH = 220;
export const MAX_SIDEBAR_WIDTH = 440;

export function clampSidebarWidth(width: number): number {
  if (typeof width !== "number" || !Number.isFinite(width)) {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

const INITIAL_HEXO_STATUS: HexoCliStatus = {
  running: false,
  action: null,
  serverRunning: false,
  serverUrl: null,
  exitCode: null,
  message: null,
};

export interface UploadedReplacementRecord {
  rawSrc: string;
  localPath: string;
  remoteUrl: string;
  remoteKey: string | null;
  localDeleted: boolean;
}

export interface StoredUploadBatch {
  tabId: string;
  timestamp: number;
  provider: ImageBedProvider;
  canDeleteRemote: boolean;
  records: UploadedReplacementRecord[];
}

export interface UploadTabImageInput {
  rawSrc: string;
  absolutePath: string;
}

interface AppState {
  hydrated: boolean;
  locale: Locale;
  sites: SavedSiteEntry[];
  activeSiteRoot: string | null;
  siteConfig: HexoSiteConfig | null;
  posts: PostSummary[];
  allTags: TaxonomyCount[];
  allCategories: TaxonomyCount[];
  isScanning: boolean;

  sidebarOpen: boolean;
  sidebarWidth: number;
  sidebarTab: SidebarTab;
  filterTab: PostFilterTab;
  searchQuery: string;
  selectedCategory: string | null;
  selectedTag: string | null;

  tabs: EditorTab[];
  activeTabId: string | null;

  viewMode: ViewMode;
  previousViewMode: ViewMode;
  syncScroll: boolean;
  autoSave: boolean;

  // Stage 2 persisted preferences & workbench state
  showToolbar: boolean;
  showLineNumbers: boolean;
  recentEntries: WelcomeRecentEntry[];
  enableHexoTags: boolean;
  themeCss: string | null;
  themeCssLabel: string | null;
  previewSource: PreviewSource;

  // Stage 2 Hexo CLI runtime state
  hexoCliStatus: HexoCliStatus;
  hexoLogs: HexoTerminalLogItem[];
  terminalOpen: boolean;

  // Stage 3 persisted preferences & image bed upload undo state
  editorPrefs: EditorPreferences;
  imageBed: ImageBedSettings;
  lastUploadBatches: Record<string, StoredUploadBatch>;

  // Phase 4A AI / ACP state
  aiSettings: AiSettings;
  discoveredAgents: DiscoveredAgent[];

  toasts: ToastItem[];

  // Actions
  hydrate: () => Promise<void>;
  setLocale: (locale: Locale) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setFilterTab: (tab: PostFilterTab) => void;
  setSearchQuery: (q: string) => void;
  setSelectedCategory: (cat: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  clearFilters: () => void;
  setViewMode: (mode: ViewMode) => void;
  exitFocusMode: () => void;
  setSyncScroll: (enabled: boolean) => void;
  setAutoSave: (enabled: boolean) => void;

  setShowToolbar: (show: boolean) => void;
  toggleToolbar: () => void;
  setShowLineNumbers: (show: boolean) => void;
  toggleLineNumbers: () => void;
  setEnableHexoTags: (enabled: boolean) => void;
  setPreviewSource: (source: PreviewSource) => void;
  recordRecentEntry: (entry: Omit<WelcomeRecentEntry, "openedAt">) => void;
  clearRecentEntries: () => void;

  setEditorPrefs: (patch: Partial<EditorPreferences>) => void;
  resetEditorPrefs: () => void;
  setImageBed: (patch: Partial<ImageBedSettings>) => void;
  setAiSettings: (patch: Partial<AiSettings>) => void;
  discoverAgents: () => Promise<DiscoveredAgent[]>;

  uploadTabImagesToBed: (
    tabId: string,
    items: UploadTabImageInput[]
  ) => Promise<ImageBedUploadBatchResult | null>;
  undoLastTabUpload: (
    tabId: string,
    options: { deleteRemote: boolean }
  ) => Promise<void>;

  loadSiteThemeCssAction: () => Promise<void>;
  importCustomThemeCssAction: () => Promise<void>;
  clearThemeCssAction: () => void;

  setTerminalOpen: (open: boolean) => void;
  setHexoCliStatus: (status: HexoCliStatus) => void;
  appendHexoLog: (event: HexoCliOutputEvent) => void;
  clearHexoLogs: () => void;
  runHexoAction: (action: HexoCliAction) => Promise<void>;
  stopHexoAction: () => Promise<void>;
  killHexoPort: (port?: number) => Promise<void>;
  openQuickOpenTarget: (target: QuickOpenTarget) => Promise<void>;

  pushToast: (message: string, tone?: ToastItem["tone"]) => void;
  dismissToast: (id: string) => void;

  addSite: (rootPath: string) => Promise<void>;
  switchSite: (rootPath: string, options?: { recordRecent?: boolean }) => Promise<void>;
  removeSite: (rootPath: string) => Promise<void>;
  refreshActiveSite: () => Promise<void>;

  openPost: (post: PostSummary) => Promise<void>;
  openStandaloneFile: (
    filePath: string,
    options?: { silent?: boolean }
  ) => Promise<void>;
  createScratchTab: () => void;
  createNewPost: (params: {
    title: string;
    isDraft: boolean;
    tags: string[];
    categories: string[];
  }) => Promise<void>;

  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  updateTabCursor: (tabId: string, line: number, col: number) => void;
  saveTab: (tabId: string, silent?: boolean) => Promise<boolean>;
  saveTabAs: (tabId: string) => Promise<boolean>;
  saveAllTabs: () => Promise<number>;
  closeTab: (tabId: string) => void;

  toggleDraftStatus: (
    post: Pick<PostSummary, "filePath"> & { siteRoot?: string | null }
  ) => Promise<void>;
  deletePostItem: (filePath: string, deleteAssetFolder: boolean) => Promise<void>;
  renameTabPostWithAssets: (tabId: string, newTitleOrSlug: string) => Promise<void>;

  handleExternalChange: (event: ExternalChangeEvent) => void;
  reloadTabFromDisk: (tabId: string) => Promise<void>;
  dismissExternalChange: (tabId: string) => void;
}

interface InFlightSave {
  filePath: string;
  content: string;
  promise: Promise<boolean>;
}

let activeScanSeq = 0;
let openPostSeq = 0;
let watcherRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let watchedSiteDirs: string[] = [];
const inFlightSaves = new Map<string, InFlightSave>();

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveTabTitle(filePath: string | null, content: string, fallback: string): string {
  const parsed = parseMarkdownDocument(content);
  if (parsed.hasFrontMatter && parsed.data.title.trim()) {
    return parsed.data.title.trim();
  }
  if (filePath) {
    return getFileName(filePath);
  }
  return fallback;
}

function extractPortFromUrl(url: string | null): number | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.port) {
      const n = Number(parsed.port);
      if (Number.isInteger(n) && n > 0 && n <= 65535) return n;
    }
    return parsed.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

function sanitizeEditorPrefs(
  raw: Partial<EditorPreferences> | null | undefined,
  base: EditorPreferences = DEFAULT_EDITOR_PREFS
): EditorPreferences {
  const merged = { ...base, ...(raw ?? {}) };
  return {
    fontFamily:
      merged.fontFamily === "sans" || merged.fontFamily === "serif"
        ? merged.fontFamily
        : "mono",
    fontSize: clampEditorFontSize(merged.fontSize),
    lineHeight: clampEditorLineHeight(merged.lineHeight),
    tabSize: normalizeEditorTabSize(merged.tabSize),
    zoomLevel: clampEditorZoomLevel(merged.zoomLevel),
    codeTheme:
      merged.codeTheme === "atom-one-light" ||
      merged.codeTheme === "github-dark" ||
      merged.codeTheme === "atom-one-dark"
        ? merged.codeTheme
        : "github-light",
    externalChangePolicy:
      merged.externalChangePolicy === "auto" ||
      merged.externalChangePolicy === "ignore"
        ? merged.externalChangePolicy
        : "prompt",
    titleBarMode: merged.titleBarMode === "system" ? "system" : "overlay",
    uiFontSize:
      merged.uiFontSize === "sm" || merged.uiFontSize === "lg"
        ? merged.uiFontSize
        : "md",
  };
}

function sanitizeCustomAcpProfiles(raw: unknown): NonNullable<AiSettings["customAcpProfiles"]> {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<AiSettings["customAcpProfiles"]> = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    const executable = typeof obj.executable === "string" ? obj.executable.trim() : "";
    if (!id || !name || !executable || seenIds.has(id)) continue;
    seenIds.add(id);

    const protocol = obj.protocol === "cli" ? "cli" : "acp";
    const args = Array.isArray(obj.args)
      ? obj.args.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
      : [];
    const env: Record<string, string> = {};
    if (obj.env && typeof obj.env === "object" && !Array.isArray(obj.env)) {
      for (const [k, v] of Object.entries(obj.env as Record<string, unknown>)) {
        const key = k.trim();
        if (key && typeof v === "string") {
          env[key] = v;
        }
      }
    }
    out.push({
      id,
      name,
      protocol,
      executable,
      args,
      env,
      cwd: typeof obj.cwd === "string" && obj.cwd.trim() ? obj.cwd.trim() : undefined,
      accountLabel:
        typeof obj.accountLabel === "string" && obj.accountLabel.trim()
          ? obj.accountLabel.trim()
          : undefined,
      baseAgentId:
        typeof obj.baseAgentId === "string" && obj.baseAgentId.trim()
          ? obj.baseAgentId.trim()
          : undefined,
      enabled: typeof obj.enabled === "boolean" ? obj.enabled : true,
    });
  }
  return out;
}

function sanitizeAiSettings(
  raw: Partial<AiSettings> | null | undefined,
  base: AiSettings = DEFAULT_AI_SETTINGS
): AiSettings {
  const merged = { ...base, ...(raw ?? {}) };
  const validPresets: AiApiPreset[] = ["openai_compatible", "anthropic", "ollama"];
  const apiPreset: AiApiPreset = validPresets.includes(merged.apiPreset)
    ? merged.apiPreset
    : "openai_compatible";
  return {
    selectedProviderKey:
      typeof merged.selectedProviderKey === "string" &&
      merged.selectedProviderKey.trim()
        ? merged.selectedProviderKey
        : DEFAULT_AI_SETTINGS.selectedProviderKey,
    apiPreset,
    baseUrl:
      typeof merged.baseUrl === "string"
        ? merged.baseUrl
        : DEFAULT_AI_SETTINGS.baseUrl,
    apiKey: typeof merged.apiKey === "string" ? merged.apiKey : "",
    model:
      typeof merged.model === "string" ? merged.model : DEFAULT_AI_SETTINGS.model,
    customAcpProfiles: sanitizeCustomAcpProfiles(merged.customAcpProfiles),
  };
}

function sanitizeImageBedSettings(
  raw: Partial<ImageBedSettings> | null | undefined,
  base: ImageBedSettings = DEFAULT_IMAGE_BED_SETTINGS
): ImageBedSettings {
  const merged = { ...base, ...(raw ?? {}) };
  const validProviders: ImageBedProvider[] = ["none", "picgo", "s3", "oss", "cos"];
  const provider: ImageBedProvider = validProviders.includes(merged.provider)
    ? merged.provider
    : "none";
  return {
    provider,
    picgoUrl:
      typeof merged.picgoUrl === "string"
        ? merged.picgoUrl
        : DEFAULT_IMAGE_BED_SETTINGS.picgoUrl,
    picgoUploader: typeof merged.picgoUploader === "string" ? merged.picgoUploader : "",
    picgoConfigName:
      typeof merged.picgoConfigName === "string" ? merged.picgoConfigName : "",
    endpoint: typeof merged.endpoint === "string" ? merged.endpoint : "",
    bucket: typeof merged.bucket === "string" ? merged.bucket : "",
    region: typeof merged.region === "string" ? merged.region : "",
    accessKeyId: typeof merged.accessKeyId === "string" ? merged.accessKeyId : "",
    secretAccessKey:
      typeof merged.secretAccessKey === "string" ? merged.secretAccessKey : "",
    customDomain: typeof merged.customDomain === "string" ? merged.customDomain : "",
    pathPrefix: typeof merged.pathPrefix === "string" ? merged.pathPrefix : "",
    keepLocalAfterUpload:
      typeof merged.keepLocalAfterUpload === "boolean"
        ? merged.keepLocalAfterUpload
        : true,
  };
}

function buildAllowedAssetDirsForTab(tab: EditorTab): string[] {
  const dirs = new Set<string>();
  if (tab.filePath) {
    const normalized = tab.filePath.replace(/\\/g, "/");
    const lastSlash = normalized.lastIndexOf("/");
    const parentDir = lastSlash > 0 ? normalized.slice(0, lastSlash) : "";
    const fileName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
    const stem = fileName.replace(/\.(md|markdown|mdx)$/i, "");
    const isPageBundle = /^index\.(md|markdown|mdx)$/i.test(fileName);

    // Never whitelist the entire `_posts` / parent directory for regular files to prevent cross-post deletion.
    // For Hugo Page Bundles (`<slug>/index.md`), `parentDir` IS the single post's bundle directory.
    if (parentDir && isPageBundle && tab.siteRoot) {
      dirs.add(parentDir);
    } else if (parentDir && stem) {
      dirs.add(`${parentDir}/${stem}`);
    }
    if (tab.siteRoot) {
      const cleanRoot = tab.siteRoot.replace(/\\/g, "/").replace(/\/+$/, "");
      const cleanSource = (tab.sourceDir || "source").replace(/^\/+|\/+$/g, "");
      dirs.add(`${cleanRoot}/${cleanSource}/images`);
      if (stem) {
        dirs.add(`${cleanRoot}/${cleanSource}/images/${stem}`);
      }
    } else if (parentDir) {
      dirs.add(`${parentDir}/assets`);
    }
  }
  return Array.from(dirs);
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  locale: "zh-CN",
  sites: [],
  activeSiteRoot: null,
  siteConfig: null,
  posts: [],
  allTags: [],
  allCategories: [],
  isScanning: false,

  sidebarOpen: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
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

  hexoCliStatus: { ...INITIAL_HEXO_STATUS },
  hexoLogs: [],
  terminalOpen: false,

  editorPrefs: { ...DEFAULT_EDITOR_PREFS },
  imageBed: { ...DEFAULT_IMAGE_BED_SETTINGS },
  lastUploadBatches: {},

  aiSettings: { ...DEFAULT_AI_SETTINGS },
  discoveredAgents: [],

  toasts: [],

  hydrate: async () => {
    if (get().hydrated) return;
    const [
      locale,
      sites,
      activeSiteRoot,
      syncScroll,
      autoSave,
      showToolbar,
      showLineNumbers,
      recentEntries,
      enableHexoTags,
      themeCss,
      themeCssLabel,
      rawEditorPrefs,
      rawImageBed,
      rawAiSettings,
      rawSidebarWidth,
      lastActiveFilePath,
    ] = await Promise.all([
      api.loadSetting<Locale>("locale", "zh-CN"),
      api.loadSetting<SavedSiteEntry[]>("sites", []),
      api.loadSetting<string | null>("activeSiteRoot", null),
      api.loadSetting<boolean>("syncScroll", true),
      api.loadSetting<boolean>("autoSave", false),
      api.loadSetting<boolean>("showToolbar", false),
      api.loadSetting<boolean>("showLineNumbers", false),
      api.loadSetting<WelcomeRecentEntry[]>("recentEntries", []),
      api.loadSetting<boolean>("enableHexoTags", true),
      api.loadSetting<string | null>("themeCss", null),
      api.loadSetting<string | null>("themeCssLabel", null),
      api.loadSetting<Partial<EditorPreferences> | null>("editorPrefs", null),
      api.loadSetting<Partial<ImageBedSettings> | null>("imageBed", null),
      api.loadSetting<Partial<AiSettings> | null>("aiSettings", null),
      api.loadSetting<number>("sidebarWidth", DEFAULT_SIDEBAR_WIDTH),
      api.loadSetting<string | null>("lastActiveFilePath", null),
    ]);

    const sanitizedRecents = Array.isArray(recentEntries)
      ? recentEntries.slice(0, MAX_RECENT_ENTRIES)
      : [];
    const sanitizedPrefs = sanitizeEditorPrefs(rawEditorPrefs);
    const sanitizedAi = sanitizeAiSettings(rawAiSettings ?? rawEditorPrefs?.ai);
    const sanitizedSidebarWidth = clampSidebarWidth(rawSidebarWidth);

    set({
      hydrated: true,
      locale,
      sites,
      activeSiteRoot,
      syncScroll,
      autoSave,
      showToolbar,
      showLineNumbers,
      recentEntries: sanitizedRecents,
      enableHexoTags,
      themeCss,
      themeCssLabel,
      editorPrefs: sanitizedPrefs,
      imageBed: sanitizeImageBedSettings(rawImageBed),
      aiSettings: sanitizedAi,
      sidebarWidth: sanitizedSidebarWidth,
    });

    if (api.isTauriRuntime()) {
      setTimeout(() => {
        void get().discoverAgents();
      }, 2500);
    }

    const targetRoot = activeSiteRoot || sites[0]?.rootPath || null;
    if (targetRoot) {
      await get().switchSite(targetRoot, { recordRecent: false });
    }

    if (
      typeof lastActiveFilePath === "string" &&
      lastActiveFilePath.trim() &&
      get().tabs.length === 0
    ) {
      const matchedPost = get().posts.find(
        (p) => p.filePath === lastActiveFilePath
      );
      if (matchedPost) {
        await get().openPost(matchedPost);
      } else {
        await get().openStandaloneFile(lastActiveFilePath, { silent: true });
      }
    }
  },

  setLocale: (locale) => {
    set({ locale });
    void api.saveSetting("locale", locale);
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarWidth: (width) => {
    const clamped = clampSidebarWidth(width);
    set({ sidebarWidth: clamped });
    void api.saveSetting("sidebarWidth", clamped);
  },
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setFilterTab: (filterTab) => set({ filterTab }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  clearFilters: () =>
    set({
      filterTab: "all",
      searchQuery: "",
      selectedCategory: null,
      selectedTag: null,
    }),

  setViewMode: (mode) =>
    set((state) => ({
      previousViewMode: state.viewMode !== "focus" ? state.viewMode : state.previousViewMode,
      viewMode: mode,
    })),

  exitFocusMode: () =>
    set((state) => ({
      viewMode: state.previousViewMode === "focus" ? "split" : state.previousViewMode,
    })),

  setSyncScroll: (syncScroll) => {
    set({ syncScroll });
    void api.saveSetting("syncScroll", syncScroll);
  },

  setAutoSave: (autoSave) => {
    set({ autoSave });
    void api.saveSetting("autoSave", autoSave);
  },

  setShowToolbar: (showToolbar) => {
    set({ showToolbar });
    void api.saveSetting("showToolbar", showToolbar);
  },

  toggleToolbar: () => {
    const next = !get().showToolbar;
    get().setShowToolbar(next);
  },

  setShowLineNumbers: (showLineNumbers) => {
    set({ showLineNumbers });
    void api.saveSetting("showLineNumbers", showLineNumbers);
  },

  toggleLineNumbers: () => {
    const next = !get().showLineNumbers;
    get().setShowLineNumbers(next);
  },

  setEnableHexoTags: (enableHexoTags) => {
    set({ enableHexoTags });
    void api.saveSetting("enableHexoTags", enableHexoTags);
  },

  setPreviewSource: (previewSource) => set({ previewSource }),

  recordRecentEntry: (entry) => {
    const trimmedPath = entry.path.trim();
    if (!trimmedPath) return;
    const nextItem: WelcomeRecentEntry = {
      path: trimmedPath,
      title: entry.title.trim() || getFileName(trimmedPath),
      kind: entry.kind,
      openedAt: Date.now(),
    };
    const filtered = get().recentEntries.filter(
      (item) => !(item.kind === nextItem.kind && item.path === nextItem.path)
    );
    const updated = [nextItem, ...filtered].slice(0, MAX_RECENT_ENTRIES);
    set({ recentEntries: updated });
    void api.saveSetting("recentEntries", updated);
  },

  clearRecentEntries: () => {
    const msg = getMessages(get().locale);
    set({ recentEntries: [] });
    void api.saveSetting("recentEntries", []);
    get().pushToast(msg.toast.recentCleared, "info");
  },

  setEditorPrefs: (patch) => {
    const next = sanitizeEditorPrefs(patch, get().editorPrefs);
    set({ editorPrefs: next });
    void api.saveSetting("editorPrefs", next);
  },

  resetEditorPrefs: () => {
    const msg = getMessages(get().locale);
    const next = { ...DEFAULT_EDITOR_PREFS };
    set({ editorPrefs: next });
    void api.saveSetting("editorPrefs", next);
    get().pushToast(msg.toast.prefsReset, "info");
  },

  setImageBed: (patch) => {
    const next = sanitizeImageBedSettings(patch, get().imageBed);
    set({ imageBed: next });
    void api.saveSetting("imageBed", next);
  },

  setAiSettings: (patch) => {
    const next = sanitizeAiSettings(patch, get().aiSettings ?? DEFAULT_AI_SETTINGS);
    set({ aiSettings: next });
    void api.saveSetting("aiSettings", next);
  },

  discoverAgents: async () => {
    try {
      const agents = await aiApi.discoverLocalAgents();
      set((state) => {
        const currentKey = (state.aiSettings ?? DEFAULT_AI_SETTINGS).selectedProviderKey;
        const shouldAutoSelect =
          currentKey === "api" &&
          !(state.aiSettings?.apiKey ?? "").trim() &&
          agents.length > 0;
        if (shouldAutoSelect) {
          const preferred =
            agents.find((a) => a.protocol === "acp") ?? agents[0];
          const nextSettings = sanitizeAiSettings(
            { selectedProviderKey: `agent:${preferred.id}` },
            state.aiSettings ?? DEFAULT_AI_SETTINGS
          );
          void api.saveSetting("aiSettings", nextSettings);
          return { discoveredAgents: agents, aiSettings: nextSettings };
        }
        return { discoveredAgents: agents };
      });
      return agents;
    } catch {
      return [];
    }
  },

  uploadTabImagesToBed: async (tabId, items) => {
    const state = get();
    const msg = getMessages(state.locale);
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab || items.length === 0) return null;

    const imageBed = state.imageBed;
    if (imageBed.provider === "none") {
      get().pushToast(msg.imageBed.notConfigured, "info");
      return null;
    }

    const uniquePaths = Array.from(new Set(items.map((item) => item.absolutePath)));
    try {
      const batchResult = await imageBedApi.uploadImagesToBed(imageBed, uniquePaths);
      const byPath = new Map(
        batchResult.items.map((entry) => [entry.localPath, entry])
      );

      const latestTab = get().tabs.find((t) => t.id === tabId);
      if (!latestTab) return batchResult;

      let nextContent = latestTab.content;
      const records: UploadedReplacementRecord[] = [];
      const succeededLocalPathsToDelete: string[] = [];

      for (const item of items) {
        const res = byPath.get(item.absolutePath);
        if (!res || !res.success || !res.remoteUrl) continue;
        const { content: replacedContent, replaced } = replaceLocalImageInMarkdown(
          nextContent,
          item.rawSrc,
          res.remoteUrl
        );
        if (replaced > 0) {
          nextContent = replacedContent;
          records.push({
            rawSrc: item.rawSrc,
            localPath: item.absolutePath,
            remoteUrl: res.remoteUrl,
            remoteKey: res.remoteKey ?? null,
            localDeleted: false,
          });
          if (!imageBed.keepLocalAfterUpload) {
            succeededLocalPathsToDelete.push(item.absolutePath);
          }
        }
      }

      if (nextContent !== latestTab.content) {
        get().updateTabContent(tabId, nextContent);
      }

      if (!imageBed.keepLocalAfterUpload && succeededLocalPathsToDelete.length > 0) {
        const allowedDirs = buildAllowedAssetDirsForTab(latestTab);
        if (allowedDirs.length > 0) {
          try {
            const delRes = await imageBedApi.deleteLocalImages(
              Array.from(new Set(succeededLocalPathsToDelete)),
              allowedDirs
            );
            const deletedSet = new Set(delRes.deletedPaths);
            for (const rec of records) {
              if (deletedSet.has(rec.localPath)) {
                rec.localDeleted = true;
              }
            }
          } catch (err) {
            get().pushToast(String(err), "error");
          }
        }
      }

      if (records.length > 0) {
        const remoteKeys = records.filter((r) => Boolean(r.remoteKey));
        const canDeleteRemote =
          imageBed.provider !== "picgo" && remoteKeys.length > 0;
        const batch: StoredUploadBatch = {
          tabId,
          timestamp: Date.now(),
          provider: imageBed.provider,
          canDeleteRemote,
          records,
        };
        set((s) => ({
          lastUploadBatches: {
            ...s.lastUploadBatches,
            [tabId]: batch,
          },
        }));
      }

      if (batchResult.succeeded > 0 && batchResult.failed === 0) {
        get().pushToast(
          formatMessage(msg.imageBed.uploadSuccess, {
            succeeded: batchResult.succeeded,
          }),
          "success"
        );
      } else if (batchResult.succeeded > 0) {
        get().pushToast(
          formatMessage(msg.imageBed.uploadPartial, {
            succeeded: batchResult.succeeded,
            failed: batchResult.failed,
          }),
          "info"
        );
      } else {
        get().pushToast(msg.imageBed.uploadNone, "error");
      }

      return batchResult;
    } catch (err) {
      get().pushToast(String(err), "error");
      return null;
    }
  },

  undoLastTabUpload: async (tabId, { deleteRemote }) => {
    const state = get();
    const msg = getMessages(state.locale);
    const batch = state.lastUploadBatches[tabId];
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!batch || !tab) return;

    let nextContent = tab.content;
    let totalRestored = 0;
    for (const rec of batch.records) {
      const { content: restoredContent, restored } = restoreRemoteImageInMarkdown(
        nextContent,
        rec.remoteUrl,
        rec.rawSrc
      );
      nextContent = restoredContent;
      totalRestored += restored;
    }

    if (nextContent !== tab.content) {
      get().updateTabContent(tabId, nextContent);
    }

    let remoteDeletedCount = 0;
    const skippedRemoteDueToLocalDelete = batch.records.some(
      (r) => r.localDeleted
    );
    if (deleteRemote && batch.canDeleteRemote) {
      // Never delete remote objects whose local source files were already deleted (prevents permanent double loss)
      const keys = Array.from(
        new Set(
          batch.records
            .filter((r) => !r.localDeleted)
            .map((r) => r.remoteKey)
            .filter((k): k is string => Boolean(k))
        )
      );
      if (keys.length > 0) {
        try {
          const delRes = await imageBedApi.deleteRemoteImages(
            get().imageBed,
            keys
          );
          remoteDeletedCount = delRes.deletedKeys.length;
        } catch (err) {
          get().pushToast(String(err), "error");
        }
      }
    }

    set((s) => {
      const next = { ...s.lastUploadBatches };
      delete next[tabId];
      return { lastUploadBatches: next };
    });

    if (skippedRemoteDueToLocalDelete) {
      get().pushToast(msg.imageBed.undoKeptRemoteForDeletedLocal, "info");
    } else if (deleteRemote && remoteDeletedCount > 0) {
      get().pushToast(
        formatMessage(msg.imageBed.undoWithRemote, {
          count: totalRestored,
          remote: remoteDeletedCount,
        }),
        "success"
      );
    } else {
      get().pushToast(
        formatMessage(msg.imageBed.undoSuccess, { count: totalRestored }),
        "success"
      );
    }
  },

  loadSiteThemeCssAction: async () => {
    const rootPath = get().activeSiteRoot;
    const msg = getMessages(get().locale);
    if (!rootPath) {
      get().pushToast(msg.toast.needSiteForHexo, "info");
      return;
    }
    try {
      const res = await hexoApi.loadSiteThemeCss(rootPath);
      const label = res.themeName
        ? `${res.themeName} (${res.files.length} CSS)`
        : `public/css (${res.files.length} CSS)`;
      set({ themeCss: res.cssContent, themeCssLabel: label });
      void api.saveSetting("themeCss", res.cssContent);
      void api.saveSetting("themeCssLabel", label);
      get().pushToast(formatMessage(msg.toast.themeCssLoaded, { label }), "success");
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  importCustomThemeCssAction: async () => {
    const msg = getMessages(get().locale);
    try {
      const picked = await hexoApi.pickCustomCssFile(msg.preview.pickCustomCss);
      if (!picked) return;
      const res = await hexoApi.readCustomCssFile(picked);
      const label = res.files[0] || getFileName(picked);
      set({ themeCss: res.cssContent, themeCssLabel: label });
      void api.saveSetting("themeCss", res.cssContent);
      void api.saveSetting("themeCssLabel", label);
      get().pushToast(formatMessage(msg.toast.themeCssLoaded, { label }), "success");
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  clearThemeCssAction: () => {
    const msg = getMessages(get().locale);
    set({ themeCss: null, themeCssLabel: null });
    void api.saveSetting("themeCss", null);
    void api.saveSetting("themeCssLabel", null);
    get().pushToast(msg.toast.themeCssCleared, "info");
  },

  setTerminalOpen: (terminalOpen) => set({ terminalOpen }),

  setHexoCliStatus: (hexoCliStatus) => set({ hexoCliStatus }),

  appendHexoLog: (event) => {
    const entry: HexoTerminalLogItem = {
      id: makeId("log"),
      stream: event.stream,
      line: event.line,
      timestamp: event.timestamp || Date.now(),
    };
    set((state) => ({
      hexoLogs: [...state.hexoLogs.slice(-(MAX_HEXO_LOGS - 1)), entry],
    }));
  },

  clearHexoLogs: () => set({ hexoLogs: [] }),

  runHexoAction: async (action) => {
    const rootPath = get().activeSiteRoot;
    const msg = getMessages(get().locale);
    if (!rootPath) {
      get().pushToast(msg.toast.needSiteForHexo, "info");
      return;
    }
    set({ terminalOpen: true });
    try {
      const status = await hexoApi.runHexoCommand(rootPath, action);
      set({ hexoCliStatus: status });
    } catch (err) {
      const errText = String(err);
      get().appendHexoLog({
        stream: "stderr",
        line: errText,
        timestamp: Date.now(),
      });
      get().pushToast(errText, "error");
    }
  },

  stopHexoAction: async () => {
    const msg = getMessages(get().locale);
    try {
      const status = await hexoApi.stopHexoCommand();
      set({ hexoCliStatus: status });
      get().pushToast(msg.toast.hexoStopped, "info");
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  killHexoPort: async (port) => {
    const msg = getMessages(get().locale);
    let resolvedPort =
      port ?? extractPortFromUrl(get().hexoCliStatus.serverUrl);
    if (resolvedPort === null) {
      const rootPath = get().activeSiteRoot;
      if (rootPath) {
        try {
          const resolved = await hexoApi.resolveQuickOpen({
            target: "local_preview",
            siteRoot: rootPath,
          });
          resolvedPort = extractPortFromUrl(resolved.value);
        } catch {
          // Fall back to Hexo default port 4000
        }
      }
    }
    const targetPort =
      resolvedPort ?? (get().siteConfig?.engine === "hugo" ? 1313 : 4000);
    set({ terminalOpen: true });
    try {
      const res = await hexoApi.killHexoPort(targetPort);
      // In Tauri runtime, Rust `kill_port` already emits the system log via HEXO_CLI_OUTPUT_EVENT
      if (!api.isTauriRuntime()) {
        get().appendHexoLog({
          stream: "system",
          line: res.message,
          timestamp: Date.now(),
        });
      }
      if (res.killedPids.length > 0) {
        get().pushToast(
          formatMessage(msg.toast.portKilled, {
            port: res.port,
            count: res.killedPids.length,
          }),
          "success"
        );
      } else {
        get().pushToast(
          formatMessage(msg.toast.portNotInUse, { port: res.port }),
          "info"
        );
      }
    } catch (err) {
      const errText = String(err);
      get().appendHexoLog({
        stream: "stderr",
        line: errText,
        timestamp: Date.now(),
      });
      get().pushToast(errText, "error");
    }
  },

  openQuickOpenTarget: async (target) => {
    const state = get();
    const msg = getMessages(state.locale);
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;

    if (
      (target === "local_preview" || target === "local_url") &&
      state.hexoCliStatus.serverRunning &&
      state.hexoCliStatus.serverUrl
    ) {
      await api.openExternalUrl(state.hexoCliStatus.serverUrl);
      return;
    }

    try {
      const resolved = await hexoApi.resolveQuickOpen({
        target,
        siteRoot: state.activeSiteRoot,
        docPath: activeTab?.filePath ?? null,
        postAssetFolder:
          activeTab?.postAssetFolder ?? state.siteConfig?.postAssetFolder ?? false,
        sourceDir: activeTab?.sourceDir ?? state.siteConfig?.sourceDir ?? "source",
      });

      if (resolved.kind === "url") {
        await api.openExternalUrl(resolved.value);
      } else if (!resolved.exists) {
        get().pushToast(
          formatMessage(msg.quickOpen.targetMissing, { value: resolved.value }),
          "info"
        );
      } else {
        await api.revealInFileManager(resolved.value);
      }
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  pushToast: (message, tone = "info") => {
    const id = makeId("toast");
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, 3200);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  addSite: async (rootPath) => {
    const msg = getMessages(get().locale);
    try {
      const config = await api.inspectHexoSite(rootPath);
      const existing = get().sites.filter((s) => s.rootPath !== config.rootPath);
      const updatedSites: SavedSiteEntry[] = [
        {
          rootPath: config.rootPath,
          title: config.title,
          addedAt: Date.now(),
          engine: config.engine ?? "hexo",
        },
        ...existing,
      ];
      set({ sites: updatedSites });
      void api.saveSetting("sites", updatedSites);
      await get().switchSite(config.rootPath, { recordRecent: true });
      get().pushToast(formatMessage(msg.toast.siteAdded, { title: config.title }), "success");
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  switchSite: async (rootPath, options = { recordRecent: true }) => {
    for (const dir of watchedSiteDirs) {
      void api.unwatchPath(dir);
    }
    watchedSiteDirs = [];
    const matchedSite = get().sites.find((s) => s.rootPath === rootPath);
    set({
      activeSiteRoot: rootPath,
      selectedCategory: null,
      selectedTag: null,
      searchQuery: "",
    });
    void api.saveSetting("activeSiteRoot", rootPath);
    if (options.recordRecent !== false) {
      get().recordRecentEntry({
        kind: "site",
        path: rootPath,
        title: matchedSite?.title || getFileName(rootPath),
      });
    }
    await get().refreshActiveSite();
  },

  removeSite: async (rootPath) => {
    const remaining = get().sites.filter((s) => s.rootPath !== rootPath);
    set({ sites: remaining });
    void api.saveSetting("sites", remaining);
    if (get().activeSiteRoot === rootPath) {
      for (const dir of watchedSiteDirs) {
        void api.unwatchPath(dir);
      }
      watchedSiteDirs = [];
      if (remaining[0]) {
        await get().switchSite(remaining[0].rootPath, { recordRecent: false });
      } else {
        set({
          activeSiteRoot: null,
          siteConfig: null,
          posts: [],
          allTags: [],
          allCategories: [],
        });
        void api.saveSetting("activeSiteRoot", null);
      }
    }
  },

  refreshActiveSite: async () => {
    const rootPath = get().activeSiteRoot;
    if (!rootPath) return;
    const seq = ++activeScanSeq;
    set({ isScanning: true });
    try {
      const res = await api.scanHexoSite(rootPath);
      if (seq !== activeScanSeq || get().activeSiteRoot !== rootPath) {
        return;
      }
      const updatedSites = get().sites.map((s) =>
        s.rootPath === res.config.rootPath
          ? {
              ...s,
              title: res.config.title,
              engine: res.config.engine ?? s.engine ?? "hexo",
            }
          : s
      );
      const updatedRecents = get().recentEntries.map((r) =>
        r.kind === "site" && r.path === res.config.rootPath
          ? { ...r, title: res.config.title }
          : r
      );
      set((state) => ({
        sites: updatedSites,
        recentEntries: updatedRecents,
        siteConfig: res.config,
        posts: res.posts,
        allTags: res.allTags,
        allCategories: res.allCategories,
        isScanning: false,
        tabs: state.tabs.map((t) =>
          t.siteRoot === res.config.rootPath
            ? {
                ...t,
                postAssetFolder: res.config.postAssetFolder,
                sourceDir: res.config.sourceDir,
              }
            : t
        ),
      }));
      void api.saveSetting("sites", updatedSites);
      void api.saveSetting("recentEntries", updatedRecents);

      if (res.config.engine === "hugo") {
        const contentDir = `${res.config.rootPath}/${res.config.sourceDir || "content"}`;
        watchedSiteDirs = [contentDir];
        void api.watchPath(contentDir, true);
      } else {
        const srcBase = `${res.config.rootPath}/${res.config.sourceDir}`;
        const postsDir = `${srcBase}/_posts`;
        const draftsDir = `${srcBase}/_drafts`;
        watchedSiteDirs = [postsDir, draftsDir];
        void api.watchPath(postsDir, true);
        void api.watchPath(draftsDir, true);
      }
    } catch (err) {
      if (seq !== activeScanSeq) return;
      set({ isScanning: false });
      get().pushToast(String(err), "error");
    }
  },

  openPost: async (post) => {
    const existing = get().tabs.find((t) => t.filePath === post.filePath);
    if (existing) {
      get().setActiveTab(existing.id);
      get().recordRecentEntry({
        kind: "file",
        path: post.filePath,
        title: post.title || existing.title,
      });
      return;
    }

    const prevTabId = get().activeTabId;
    if (prevTabId && get().autoSave) {
      const prevTab = get().tabs.find((t) => t.id === prevTabId);
      if (prevTab?.isDirty && prevTab.filePath) {
        void get().saveTab(prevTab.id, true);
      }
    }

    const cfg = get().siteConfig;
    const placeholderId = makeId("tab");
    const placeholderTitle = post.title || getFileName(post.filePath);
    const placeholderTab: EditorTab = {
      id: placeholderId,
      filePath: post.filePath,
      title: placeholderTitle,
      content: "",
      savedContent: "",
      isDirty: false,
      isLoading: true,
      isDraft: post.isDraft,
      isStandalone: false,
      siteRoot: get().activeSiteRoot,
      postAssetFolder: cfg?.postAssetFolder ?? false,
      sourceDir: cfg?.sourceDir ?? "source",
      modifiedMs: post.modifiedMs,
      externalChange: null,
      cursorLine: 1,
      cursorCol: 1,
    };

    const seq = ++openPostSeq;
    set((s) => ({
      tabs: [...s.tabs, placeholderTab],
      activeTabId: placeholderId,
    }));
    void api.saveSetting("lastActiveFilePath", post.filePath);

    try {
      const doc = await api.readDocument(post.filePath);
      const tabTitle = post.title || getFileName(doc.filePath);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === placeholderId
            ? {
                ...t,
                filePath: doc.filePath,
                title: tabTitle,
                content: doc.content,
                savedContent: doc.content,
                modifiedMs: doc.modifiedMs,
                isLoading: false,
              }
            : t
        ),
      }));
      if (seq === openPostSeq && get().activeTabId !== placeholderId) {
        const stillExists = get().tabs.some((t) => t.id === placeholderId);
        if (stillExists) {
          set({ activeTabId: placeholderId });
        }
      }
      get().recordRecentEntry({
        kind: "file",
        path: doc.filePath,
        title: tabTitle,
      });
      void api.watchPath(doc.filePath, false);
    } catch (err) {
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === placeholderId);
        const nextTabs = s.tabs.filter((t) => t.id !== placeholderId);
        let nextActive = s.activeTabId;
        if (s.activeTabId === placeholderId) {
          const fallback = nextTabs[idx] || nextTabs[idx - 1] || null;
          nextActive = fallback ? fallback.id : null;
        }
        return { tabs: nextTabs, activeTabId: nextActive };
      });
      get().pushToast(String(err), "error");
    }
  },

  openStandaloneFile: async (filePath, options) => {
    const existing = get().tabs.find((t) => t.filePath === filePath);
    if (existing) {
      get().setActiveTab(existing.id);
      get().recordRecentEntry({
        kind: "file",
        path: filePath,
        title: existing.title,
      });
      return;
    }

    try {
      const doc = await api.readDocument(filePath);
      const activeSiteRoot = get().activeSiteRoot;
      const cfg = get().siteConfig;
      const matchingPost = get().posts.find((p) => p.filePath === doc.filePath);
      const isInsideActiveSite = Boolean(
        activeSiteRoot && isPathInsideDir(doc.filePath, activeSiteRoot)
      );
      const isDraft =
        matchingPost?.isDraft ??
        Boolean(
          isInsideActiveSite &&
            activeSiteRoot &&
            isPathInsideDir(
              doc.filePath,
              `${activeSiteRoot}/${cfg?.sourceDir ?? "source"}/_drafts`
            )
        );

      const tabTitle = deriveTabTitle(
        doc.filePath,
        doc.content,
        getFileName(doc.filePath)
      );
      const tab: EditorTab = {
        id: makeId("tab"),
        filePath: doc.filePath,
        title: tabTitle,
        content: doc.content,
        savedContent: doc.content,
        isDirty: false,
        isDraft,
        isStandalone: !isInsideActiveSite,
        siteRoot: isInsideActiveSite ? activeSiteRoot : null,
        postAssetFolder: isInsideActiveSite ? (cfg?.postAssetFolder ?? false) : false,
        sourceDir: isInsideActiveSite ? (cfg?.sourceDir ?? "source") : "source",
        modifiedMs: doc.modifiedMs,
        externalChange: null,
        cursorLine: 1,
        cursorCol: 1,
      };
      const prevTabId = get().activeTabId;
      if (prevTabId && get().autoSave) {
        const prevTab = get().tabs.find((t) => t.id === prevTabId);
        if (prevTab?.isDirty && prevTab.filePath) {
          void get().saveTab(prevTab.id, true);
        }
      }
      openPostSeq++;
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }));
      void api.saveSetting("lastActiveFilePath", doc.filePath);
      get().recordRecentEntry({
        kind: "file",
        path: doc.filePath,
        title: tabTitle,
      });
      void api.watchPath(doc.filePath, false);
    } catch (err) {
      if (!options?.silent) {
        get().pushToast(String(err), "error");
      }
    }
  },

  createScratchTab: () => {
    const prevTabId = get().activeTabId;
    if (prevTabId && get().autoSave) {
      const prevTab = get().tabs.find((t) => t.id === prevTabId);
      if (prevTab?.isDirty && prevTab.filePath) {
        void get().saveTab(prevTab.id, true);
      }
    }
    const msg = getMessages(get().locale);
    const initial = msg.tabs.scratchInitial;
    const tab: EditorTab = {
      id: makeId("tab"),
      filePath: null,
      title: msg.tabs.untitled,
      content: initial,
      savedContent: "",
      isDirty: true,
      isDraft: false,
      isStandalone: true,
      siteRoot: null,
      postAssetFolder: false,
      sourceDir: "source",
      modifiedMs: Date.now(),
      externalChange: null,
      cursorLine: 3,
      cursorCol: 1,
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
    }));
  },

  createNewPost: async ({ title, isDraft, tags, categories }) => {
    const rootPath = get().activeSiteRoot;
    const msg = getMessages(get().locale);
    if (!rootPath) return;
    try {
      const created = await api.createHexoPost({
        rootPath,
        title: title.trim() || "Untitled",
        isDraft,
        tags,
        categories,
      });
      await get().refreshActiveSite();
      await get().openPost(created);
      get().pushToast(
        formatMessage(msg.toast.postCreated, { title: created.title }),
        "success"
      );
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  setActiveTab: (activeTabId) => {
    openPostSeq++;
    const prevTabId = get().activeTabId;
    if (prevTabId && prevTabId !== activeTabId && get().autoSave) {
      const prevTab = get().tabs.find((t) => t.id === prevTabId);
      if (prevTab?.isDirty && prevTab.filePath) {
        void get().saveTab(prevTab.id, true);
      }
    }
    const nextTab = get().tabs.find((t) => t.id === activeTabId) ?? null;
    set({ activeTabId });
    void api.saveSetting("lastActiveFilePath", nextTab?.filePath ?? null);
  },

  updateTabContent: (tabId, content) => {
    const msg = getMessages(get().locale);
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        const nextTitle = deriveTabTitle(tab.filePath, content, msg.tabs.untitled);
        return {
          ...tab,
          content,
          title: nextTitle,
          isDirty: content !== tab.savedContent,
        };
      }),
    }));
  },

  updateTabCursor: (tabId, cursorLine, cursorCol) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, cursorLine, cursorCol } : tab
      ),
    }));
  },

  saveTab: async (tabId, silent = false) => {
    while (true) {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!tab) return false;
      if (!tab.filePath) {
        return get().saveTabAs(tabId);
      }

      const existing = inFlightSaves.get(tabId);
      if (existing) {
        if (existing.filePath === tab.filePath && existing.content === tab.content) {
          const ok = await existing.promise;
          if (ok && !silent) {
            get().pushToast(getMessages(get().locale).toast.saved, "success");
          }
          return ok;
        }
        await existing.promise.catch(() => false);
        continue;
      }

      if (silent && !tab.isDirty) {
        return true;
      }

      const filePath = tab.filePath;
      const contentToSave = tab.content;
      const isStandalone = tab.isStandalone;
      const siteRoot = tab.siteRoot;
      const msg = getMessages(get().locale);

      const writePromise = (async (): Promise<boolean> => {
        try {
          const modifiedMs = await api.writeDocument(filePath, contentToSave);
          set((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    savedContent: contentToSave,
                    isDirty: t.content !== contentToSave,
                    modifiedMs,
                    externalChange: null,
                  }
                : t
            ),
          }));
          if (!isStandalone && siteRoot === get().activeSiteRoot) {
            void get().refreshActiveSite();
          }
          if (!silent) {
            get().pushToast(msg.toast.saved, "success");
          }
          return true;
        } catch (err) {
          get().pushToast(String(err), "error");
          return false;
        }
      })();

      const entry: InFlightSave = {
        filePath,
        content: contentToSave,
        promise: writePromise,
      };
      inFlightSaves.set(tabId, entry);

      try {
        return await writePromise;
      } finally {
        if (inFlightSaves.get(tabId) === entry) {
          inFlightSaves.delete(tabId);
        }
      }
    }
  },

  saveTabAs: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    const msg = getMessages(get().locale);
    const chosen = await api.pickSaveMarkdownPath(
      tab.filePath || `${tab.title.replace(/\.md$/i, "")}.md`
    );
    if (!chosen) return false;

    const latestTab = get().tabs.find((t) => t.id === tabId);
    if (!latestTab) return false;
    const contentToSave = latestTab.content;

    try {
      const modifiedMs = await api.writeDocument(chosen, contentToSave);
      const activeSiteRoot = get().activeSiteRoot;
      const cfg = get().siteConfig;
      const isInsideActiveSite = Boolean(
        activeSiteRoot && isPathInsideDir(chosen, activeSiteRoot)
      );
      const isDraft = Boolean(
        isInsideActiveSite &&
          activeSiteRoot &&
          isPathInsideDir(
            chosen,
            `${activeSiteRoot}/${cfg?.sourceDir ?? "source"}/_drafts`
          )
      );
      const nextTitle = deriveTabTitle(chosen, latestTab.content, getFileName(chosen));

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                filePath: chosen,
                title: nextTitle,
                savedContent: contentToSave,
                isDirty: t.content !== contentToSave,
                isStandalone: !isInsideActiveSite,
                siteRoot: isInsideActiveSite ? activeSiteRoot : null,
                isDraft,
                postAssetFolder: isInsideActiveSite ? (cfg?.postAssetFolder ?? false) : false,
                sourceDir: isInsideActiveSite ? (cfg?.sourceDir ?? "source") : "source",
                modifiedMs,
                externalChange: null,
              }
            : t
        ),
      }));
      get().recordRecentEntry({
        kind: "file",
        path: chosen,
        title: nextTitle,
      });
      if (tab.filePath && tab.filePath !== chosen) {
        void api.unwatchPath(tab.filePath);
      }
      void api.watchPath(chosen, false);
      if (isInsideActiveSite) {
        void get().refreshActiveSite();
      }
      get().pushToast(msg.toast.saved, "success");
      return true;
    } catch (err) {
      get().pushToast(String(err), "error");
      return false;
    }
  },

  saveAllTabs: async () => {
    const msg = getMessages(get().locale);
    const allTabs = get().tabs;
    const dirtyFileTabs = allTabs.filter((t) => t.isDirty && Boolean(t.filePath));
    const dirtyScratchTabs = allTabs.filter((t) => t.isDirty && !t.filePath);
    if (dirtyFileTabs.length === 0) {
      if (dirtyScratchTabs.length > 0) {
        get().pushToast(
          formatMessage(msg.toast.onlyScratchTabsDirty, {
            count: dirtyScratchTabs.length,
          }),
          "info"
        );
      } else {
        get().pushToast(msg.toast.noDirtyTabs, "info");
      }
      return 0;
    }
    let savedCount = 0;
    for (const tab of dirtyFileTabs) {
      const ok = await get().saveTab(tab.id, true);
      if (ok) savedCount++;
    }
    if (savedCount > 0) {
      get().pushToast(
        formatMessage(msg.toast.savedAll, { count: savedCount }),
        "success"
      );
    }
    if (dirtyScratchTabs.length > 0) {
      get().pushToast(
        formatMessage(msg.toast.onlyScratchTabsDirty, {
          count: dirtyScratchTabs.length,
        }),
        "info"
      );
    }
    return savedCount;
  },

  closeTab: (tabId) => {
    const closing = get().tabs.find((t) => t.id === tabId);
    if (closing?.filePath) {
      void api.unwatchPath(closing.filePath);
    }
    let nextActiveFilePath: string | null | undefined;
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return state;
      const nextTabs = state.tabs.filter((t) => t.id !== tabId);
      let nextActive = state.activeTabId;
      if (state.activeTabId === tabId) {
        const fallback = nextTabs[idx] || nextTabs[idx - 1] || null;
        nextActive = fallback ? fallback.id : null;
        nextActiveFilePath = fallback?.filePath ?? null;
      }
      const nextBatches = { ...state.lastUploadBatches };
      delete nextBatches[tabId];
      return { tabs: nextTabs, activeTabId: nextActive, lastUploadBatches: nextBatches };
    });
    if (nextActiveFilePath !== undefined) {
      void api.saveSetting("lastActiveFilePath", nextActiveFilePath);
    }
  },

  toggleDraftStatus: async (post) => {
    const rootPath = post.siteRoot ?? get().activeSiteRoot;
    const msg = getMessages(get().locale);
    if (!rootPath) return;

    const openTab = get().tabs.find((t) => t.filePath === post.filePath);
    if (openTab?.isDirty) {
      const saved = await get().saveTab(openTab.id, true);
      if (!saved) return;
    }

    try {
      const updated = await api.togglePostDraft(rootPath, post.filePath);
      void api.unwatchPath(post.filePath);
      if (openTab) {
        void api.watchPath(updated.filePath, false);
      }
      // For Hugo, toggling draft updates front-matter in-place at the same filePath.
      const refreshedContent =
        openTab && updated.filePath === post.filePath
          ? await api.readDocument(updated.filePath).then((d) => d.content).catch(() => null)
          : null;
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.filePath === post.filePath
            ? {
                ...t,
                filePath: updated.filePath,
                isDraft: updated.isDraft,
                modifiedMs: updated.modifiedMs,
                ...(refreshedContent !== null
                  ? { content: refreshedContent, savedContent: refreshedContent, isDirty: false }
                  : {}),
                externalChange: null,
              }
            : t
        ),
      }));
      if (rootPath === get().activeSiteRoot) {
        await get().refreshActiveSite();
      }
      get().pushToast(
        updated.isDraft ? msg.toast.movedToDrafts : msg.toast.movedToPosts,
        "success"
      );
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  deletePostItem: async (filePath, deleteAssetFolder) => {
    try {
      await api.deletePost(filePath, deleteAssetFolder);
      const openTab = get().tabs.find((t) => t.filePath === filePath);
      if (openTab) {
        get().closeTab(openTab.id);
      }
      await get().refreshActiveSite();
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  renameTabPostWithAssets: async (tabId, newTitleOrSlug) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    const msg = getMessages(get().locale);
    if (!tab || !tab.filePath) return;

    try {
      const res = await api.renamePostWithAssets({
        siteRoot: tab.siteRoot,
        oldFilePath: tab.filePath,
        newTitleOrSlug,
        currentContent: tab.content,
      });

      if (res.oldFilePath !== res.newFilePath) {
        void api.unwatchPath(res.oldFilePath);
      }
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                filePath: res.newFilePath,
                title: deriveTabTitle(res.newFilePath, res.updatedContent, msg.tabs.untitled),
                content: res.updatedContent,
                savedContent: res.updatedContent,
                isDirty: false,
                externalChange: null,
              }
            : t
        ),
      }));
      void api.watchPath(res.newFilePath, false);
      if (tab.siteRoot && tab.siteRoot === get().activeSiteRoot) {
        await get().refreshActiveSite();
      }
      get().pushToast(
        formatMessage(msg.toast.renamedPost, { slug: res.newSlug }),
        "success"
      );
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  handleExternalChange: (event) => {
    const normalized = event.filePath.replace(/\\/g, "/");
    const policy = get().editorPrefs.externalChangePolicy;
    let matchedOpenTab = false;
    const autoReloadTabIds: string[] = [];

    if (policy === "ignore") {
      matchedOpenTab = get().tabs.some(
        (tab) => tab.filePath && tab.filePath.replace(/\\/g, "/") === normalized
      );
    } else {
      set((state) => ({
        tabs: state.tabs.map((tab) => {
          if (!tab.filePath) return tab;
          if (tab.filePath.replace(/\\/g, "/") === normalized) {
            matchedOpenTab = true;
            if (policy === "auto" && !tab.isDirty) {
              autoReloadTabIds.push(tab.id);
              return tab;
            }
            return { ...tab, externalChange: event };
          }
          return tab;
        }),
      }));
    }

    for (const tabId of autoReloadTabIds) {
      void get().reloadTabFromDisk(tabId);
    }

    const activeRoot = get().activeSiteRoot;
    if (activeRoot && isPathInsideDir(normalized, activeRoot) && !matchedOpenTab) {
      if (watcherRefreshTimer !== null) {
        clearTimeout(watcherRefreshTimer);
      }
      watcherRefreshTimer = setTimeout(() => {
        watcherRefreshTimer = null;
        if (get().activeSiteRoot === activeRoot) {
          void get().refreshActiveSite();
        }
      }, 350);
    }
  },

  reloadTabFromDisk: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab?.filePath) return;
    const msg = getMessages(get().locale);
    try {
      const doc = await api.readDocument(tab.filePath);
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                content: doc.content,
                savedContent: doc.content,
                title: deriveTabTitle(doc.filePath, doc.content, msg.tabs.untitled),
                isDirty: false,
                modifiedMs: doc.modifiedMs,
                externalChange: null,
              }
            : t
        ),
      }));
      if (tab.siteRoot === get().activeSiteRoot) {
        void get().refreshActiveSite();
      }
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  dismissExternalChange: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, externalChange: null } : t
      ),
    }));
  },
}));
