export type EditorFontFamily = "mono" | "sans" | "serif";

export type CodeHighlightTheme =
  | "github-light"
  | "atom-one-light"
  | "github-dark"
  | "atom-one-dark";

export type ExternalChangePolicy = "prompt" | "auto" | "ignore";

export type ImageBedProvider = "none" | "picgo" | "s3" | "oss" | "cos";

export type SettingsSectionId =
  | "general"
  | "editor"
  | "hexo"
  | "imagebed"
  | "about";

export interface EditorPreferences {
  fontFamily: EditorFontFamily;
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  zoomLevel: number;
  codeTheme: CodeHighlightTheme;
  externalChangePolicy: ExternalChangePolicy;
}

export interface ImageBedSettings {
  provider: ImageBedProvider;
  picgoUrl: string;
  picgoUploader: string;
  picgoConfigName: string;
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  customDomain: string;
  pathPrefix: string;
  keepLocalAfterUpload: boolean;
}

export interface ImageBedTestResult {
  ok: boolean;
  message: string;
}

export const EDITOR_FONT_SIZE_MIN = 12;
export const EDITOR_FONT_SIZE_MAX = 22;
export const EDITOR_LINE_HEIGHT_MIN = 1.4;
export const EDITOR_LINE_HEIGHT_MAX = 2.4;
export const EDITOR_ZOOM_MIN = 85;
export const EDITOR_ZOOM_MAX = 125;

export const EDITOR_FONT_STACKS: Record<EditorFontFamily, string> = {
  mono: "'JetBrains Mono', 'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'PingFang SC', 'Hiragino Sans GB', monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  serif:
    "'Charter', 'Georgia', 'Songti SC', 'Noto Serif SC', 'STSong', 'Times New Roman', serif",
};

export const DEFAULT_EDITOR_PREFS: EditorPreferences = {
  fontFamily: "mono",
  fontSize: 14,
  lineHeight: 1.8,
  tabSize: 2,
  zoomLevel: 100,
  codeTheme: "github-light",
  externalChangePolicy: "prompt",
};

export const DEFAULT_IMAGE_BED_SETTINGS: ImageBedSettings = {
  provider: "none",
  picgoUrl: "http://127.0.0.1:36677/upload",
  picgoUploader: "",
  picgoConfigName: "",
  endpoint: "",
  bucket: "",
  region: "",
  accessKeyId: "",
  secretAccessKey: "",
  customDomain: "",
  pathPrefix: "",
  keepLocalAfterUpload: true,
};

export function clampEditorFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EDITOR_PREFS.fontSize;
  return Math.min(
    EDITOR_FONT_SIZE_MAX,
    Math.max(EDITOR_FONT_SIZE_MIN, Math.round(value))
  );
}

export function clampEditorLineHeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EDITOR_PREFS.lineHeight;
  const clamped = Math.min(
    EDITOR_LINE_HEIGHT_MAX,
    Math.max(EDITOR_LINE_HEIGHT_MIN, value)
  );
  return Math.round(clamped * 100) / 100;
}

export function normalizeEditorTabSize(value: number): 2 | 4 {
  return value === 4 ? 4 : 2;
}

export function clampEditorZoomLevel(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EDITOR_PREFS.zoomLevel;
  return Math.min(
    EDITOR_ZOOM_MAX,
    Math.max(EDITOR_ZOOM_MIN, Math.round(value))
  );
}
