/**
 * Clean extension contracts reserved for Phase 2 and Phase 3.
 * Stage 1 defines these module boundaries without prematurely shipping incomplete UI.
 */

export type HexoCommandName = "generate" | "server" | "deploy" | "clean" | "new";

export interface HexoCommandHandle {
  pid: number;
  command: HexoCommandName;
  cancel: () => Promise<void>;
}

/** Phase 2: Hexo CLI runner & bottom terminal drawer contract */
export interface HexoCliRunner {
  run(
    siteRoot: string,
    command: HexoCommandName,
    args?: string[],
    onOutput?: (chunk: string, stream: "stdout" | "stderr") => void
  ): Promise<HexoCommandHandle>;
}

/** Phase 2: Custom Hexo tag plugin (e.g. {% note %}, {% tabs %}, {% asset_img %}) */
export interface HexoTagPlugin {
  name: string;
  render(args: string[], body?: string): string;
}

export interface HexoTagPluginRegistry {
  register(plugin: HexoTagPlugin): void;
  getAll(): HexoTagPlugin[];
}

/** Phase 2: Live Hexo theme CSS bridge (`hexo s` synchronization) */
export interface ThemeCssBridge {
  extractThemeCss(siteRoot: string, serverUrl?: string): Promise<string>;
}

/** Phase 3: Cloud image uploader (PicGo / OpenDAL) */
export interface ImageUploadProvider {
  id: string;
  name: string;
  upload(localFilePath: string): Promise<{ url: string }>;
}

/** Phase 3: Document exporter (HTML / PDF) */
export interface DocumentExporter {
  format: "html" | "pdf";
  exportDocument(markdown: string, outputPath: string, options?: Record<string, unknown>): Promise<void>;
}
