export type Locale = "zh-CN" | "en-US";

export type SiteEngine = "hexo" | "hugo";

export type ViewMode = "write" | "split" | "read" | "focus";

export type PostFilterTab = "all" | "posts" | "drafts";

export type PreviewSource = "markdown" | "live";

export type SidebarTab = "posts" | "outline";

export interface WelcomeRecentEntry {
  path: string;
  title: string;
  kind: "file" | "site";
  openedAt: number;
}

export interface HexoTerminalLogItem {
  id: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
  timestamp: number;
}

export interface HexoSiteConfig {
  engine?: SiteEngine;
  rootPath: string;
  title: string;
  subtitle?: string | null;
  author?: string | null;
  language?: string | null;
  url?: string | null;
  root?: string;
  permalink?: string;
  sourceDir: string;
  postAssetFolder: boolean;
  defaultLayout: string;
  hasPostsDir: boolean;
  hasDraftsDir: boolean;
  hasScaffoldPost: boolean;
}

export interface PostSummary {
  filePath: string;
  fileName: string;
  slug: string;
  relativePath: string;
  title: string;
  date?: string | null;
  updated?: string | null;
  tags: string[];
  categories: string[];
  isDraft: boolean;
  hasAssetFolder: boolean;
  excerpt: string;
  modifiedMs: number;
}

export interface TaxonomyCount {
  name: string;
  count: number;
}

export interface SiteScanResult {
  config: HexoSiteConfig;
  posts: PostSummary[];
  allTags: TaxonomyCount[];
  allCategories: TaxonomyCount[];
}

export interface DocumentContent {
  filePath: string;
  content: string;
  modifiedMs: number;
}

export interface RenamePostResult {
  oldFilePath: string;
  newFilePath: string;
  newSlug: string;
  renamedAssetDirs: string[];
  updatedContent: string;
}

export interface SavedImageResult {
  absolutePath: string;
  markdownPath: string;
  fileName: string;
  md5: string;
  deduplicated: boolean;
}

export interface ResolvedImageResult {
  rawSrc: string;
  absolutePath: string | null;
  exists: boolean;
}

export interface RenameImageResult {
  oldAbsolutePath: string;
  newAbsolutePath: string;
  oldFileName: string;
  newFileName: string;
  updatedContent: string;
  replacements: number;
}

export interface ExternalChangeEvent {
  filePath: string;
  kind: "modify" | "create" | "remove" | string;
}

export interface SavedSiteEntry {
  rootPath: string;
  title: string;
  addedAt: number;
  engine?: SiteEngine;
}

export type SiteRecord = SavedSiteEntry;

export interface EditorTab {
  id: string;
  filePath: string | null;
  title: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
  isDraft: boolean;
  isStandalone: boolean;
  siteRoot: string | null;
  postAssetFolder: boolean;
  sourceDir: string;
  modifiedMs: number;
  externalChange: ExternalChangeEvent | null;
  cursorLine: number;
  cursorCol: number;
}

export interface FrontMatterData {
  title: string;
  date: string;
  updated: string;
  tags: string[];
  categories: string[];
  abbrlink: string;
  extra: Record<string, unknown>;
}

export interface ToastItem {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
}
