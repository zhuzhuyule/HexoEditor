import { create } from "zustand";

import { parseMarkdownDocument } from "@/lib/frontmatter";
import { formatMessage, getMessages } from "@/lib/i18n";
import * as api from "@/lib/tauri/api";
import { getFileName, isPathInsideDir } from "@/lib/utils";
import type {
  EditorTab,
  ExternalChangeEvent,
  HexoSiteConfig,
  Locale,
  PostFilterTab,
  PostSummary,
  SavedSiteEntry,
  TaxonomyCount,
  ToastItem,
  ViewMode,
} from "@/types";

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

  toasts: ToastItem[];

  // Actions
  hydrate: () => Promise<void>;
  setLocale: (locale: Locale) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setFilterTab: (tab: PostFilterTab) => void;
  setSearchQuery: (q: string) => void;
  setSelectedCategory: (cat: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  clearFilters: () => void;
  setViewMode: (mode: ViewMode) => void;
  exitFocusMode: () => void;
  setSyncScroll: (enabled: boolean) => void;
  setAutoSave: (enabled: boolean) => void;

  pushToast: (message: string, tone?: ToastItem["tone"]) => void;
  dismissToast: (id: string) => void;

  addSite: (rootPath: string) => Promise<void>;
  switchSite: (rootPath: string) => Promise<void>;
  removeSite: (rootPath: string) => Promise<void>;
  refreshActiveSite: () => Promise<void>;

  openPost: (post: PostSummary) => Promise<void>;
  openStandaloneFile: (filePath: string) => Promise<void>;
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
  closeTab: (tabId: string) => void;

  toggleDraftStatus: (post: Pick<PostSummary, "filePath"> & { siteRoot?: string | null }) => Promise<void>;
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

  toasts: [],

  hydrate: async () => {
    if (get().hydrated) return;
    const [locale, sites, activeSiteRoot, syncScroll, autoSave] = await Promise.all([
      api.loadSetting<Locale>("locale", "zh-CN"),
      api.loadSetting<SavedSiteEntry[]>("sites", []),
      api.loadSetting<string | null>("activeSiteRoot", null),
      api.loadSetting<boolean>("syncScroll", true),
      api.loadSetting<boolean>("autoSave", false),
    ]);

    set({
      hydrated: true,
      locale,
      sites,
      activeSiteRoot,
      syncScroll,
      autoSave,
    });

    const targetRoot = activeSiteRoot || sites[0]?.rootPath || null;
    if (targetRoot) {
      await get().switchSite(targetRoot);
    }
  },

  setLocale: (locale) => {
    set({ locale });
    void api.saveSetting("locale", locale);
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
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
        { rootPath: config.rootPath, title: config.title, addedAt: Date.now() },
        ...existing,
      ];
      set({ sites: updatedSites });
      void api.saveSetting("sites", updatedSites);
      await get().switchSite(config.rootPath);
      get().pushToast(formatMessage(msg.toast.siteAdded, { title: config.title }), "success");
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  switchSite: async (rootPath) => {
    for (const dir of watchedSiteDirs) {
      void api.unwatchPath(dir);
    }
    watchedSiteDirs = [];
    set({
      activeSiteRoot: rootPath,
      selectedCategory: null,
      selectedTag: null,
      searchQuery: "",
    });
    void api.saveSetting("activeSiteRoot", rootPath);
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
        await get().switchSite(remaining[0].rootPath);
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
      // Discard stale scan results if the user switched sites while scanning
      if (seq !== activeScanSeq || get().activeSiteRoot !== rootPath) {
        return;
      }
      const updatedSites = get().sites.map((s) =>
        s.rootPath === res.config.rootPath ? { ...s, title: res.config.title } : s
      );
      set((state) => ({
        sites: updatedSites,
        siteConfig: res.config,
        posts: res.posts,
        allTags: res.allTags,
        allCategories: res.allCategories,
        isScanning: false,
        // Keep open tabs belonging to this site in sync with site config changes
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

      // Watch _posts and _drafts directories for external edits
      const srcBase = `${res.config.rootPath}/${res.config.sourceDir}`;
      const postsDir = `${srcBase}/_posts`;
      const draftsDir = `${srcBase}/_drafts`;
      watchedSiteDirs = [postsDir, draftsDir];
      void api.watchPath(postsDir, true);
      void api.watchPath(draftsDir, true);
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
      return;
    }

    try {
      const doc = await api.readDocument(post.filePath);
      const cfg = get().siteConfig;
      const tab: EditorTab = {
        id: makeId("tab"),
        filePath: doc.filePath,
        title: post.title || getFileName(doc.filePath),
        content: doc.content,
        savedContent: doc.content,
        isDirty: false,
        isDraft: post.isDraft,
        isStandalone: false,
        siteRoot: get().activeSiteRoot,
        postAssetFolder: cfg?.postAssetFolder ?? false,
        sourceDir: cfg?.sourceDir ?? "source",
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
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }));
      void api.watchPath(doc.filePath, false);
    } catch (err) {
      get().pushToast(String(err), "error");
    }
  },

  openStandaloneFile: async (filePath) => {
    const existing = get().tabs.find((t) => t.filePath === filePath);
    if (existing) {
      get().setActiveTab(existing.id);
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

      const tab: EditorTab = {
        id: makeId("tab"),
        filePath: doc.filePath,
        title: deriveTabTitle(doc.filePath, doc.content, getFileName(doc.filePath)),
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
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }));
      void api.watchPath(doc.filePath, false);
    } catch (err) {
      get().pushToast(String(err), "error");
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
    const prevTabId = get().activeTabId;
    if (prevTabId && prevTabId !== activeTabId && get().autoSave) {
      const prevTab = get().tabs.find((t) => t.id === prevTabId);
      if (prevTab?.isDirty && prevTab.filePath) {
        void get().saveTab(prevTab.id, true);
      }
    }
    set({ activeTabId });
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

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                filePath: chosen,
                title: deriveTabTitle(chosen, t.content, getFileName(chosen)),
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

  closeTab: (tabId) => {
    const closing = get().tabs.find((t) => t.id === tabId);
    if (closing?.filePath) {
      void api.unwatchPath(closing.filePath);
    }
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return state;
      const nextTabs = state.tabs.filter((t) => t.id !== tabId);
      let nextActive = state.activeTabId;
      if (state.activeTabId === tabId) {
        const fallback = nextTabs[idx] || nextTabs[idx - 1] || null;
        nextActive = fallback ? fallback.id : null;
      }
      return { tabs: nextTabs, activeTabId: nextActive };
    });
  },

  toggleDraftStatus: async (post) => {
    const rootPath = post.siteRoot ?? get().activeSiteRoot;
    const msg = getMessages(get().locale);
    if (!rootPath) return;

    // If open & dirty, save first so move doesn't drop unsaved edits
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
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.filePath === post.filePath
            ? {
                ...t,
                filePath: updated.filePath,
                isDraft: updated.isDraft,
                modifiedMs: updated.modifiedMs,
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
    let matchedOpenTab = false;

    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (!tab.filePath) return tab;
        if (tab.filePath.replace(/\\/g, "/") === normalized) {
          matchedOpenTab = true;
          return { ...tab, externalChange: event };
        }
        return tab;
      }),
    }));

    const activeRoot = get().activeSiteRoot;
    if (activeRoot && isPathInsideDir(normalized, activeRoot) && !matchedOpenTab) {
      void get().refreshActiveSite();
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
