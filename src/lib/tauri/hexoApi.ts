import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { isTauriRuntime } from "./api";

export const HEXO_CLI_OUTPUT_EVENT = "hexo-cli-output";
export const HEXO_CLI_STATUS_EVENT = "hexo-cli-status";

export type HexoCliAction =
  | "server"
  | "generate"
  | "deploy"
  | "generate_deploy"
  | "clean";

export type HexoCliStream = "stdout" | "stderr" | "system";

export interface HexoCliOutputEvent {
  stream: HexoCliStream;
  line: string;
  timestamp: number;
}

export interface HexoCliStatus {
  running: boolean;
  action: HexoCliAction | string | null;
  serverRunning: boolean;
  serverUrl: string | null;
  exitCode: number | null;
  message: string | null;
}

export interface KillPortResult {
  port: number;
  killedPids: number[];
  message: string;
}

export interface ThemeCssResult {
  themeName: string | null;
  cssDir: string;
  files: string[];
  cssContent: string;
}

export type QuickOpenTarget =
  | "post_dir"
  | "post_asset_dir"
  | "images_dir"
  | "site_root"
  | "site_url"
  | "blog_home"
  | "local_url"
  | "local_preview";

export interface QuickOpenResult {
  target: string;
  kind: "path" | "url";
  value: string;
  exists: boolean;
}

export interface ResolveQuickOpenParams {
  target: QuickOpenTarget;
  siteRoot?: string | null;
  docPath?: string | null;
  postAssetFolder?: boolean;
  sourceDir?: string | null;
}

const DEFAULT_CLI_STATUS: HexoCliStatus = {
  running: false,
  action: null,
  serverRunning: false,
  serverUrl: null,
  exitCode: null,
  message: null,
};

export async function runHexoCommand(
  siteRoot: string,
  action: HexoCliAction
): Promise<HexoCliStatus> {
  return invoke<HexoCliStatus>("run_hexo_command", { siteRoot, action });
}

export async function stopHexoCommand(): Promise<HexoCliStatus> {
  if (!isTauriRuntime()) return { ...DEFAULT_CLI_STATUS };
  return invoke<HexoCliStatus>("stop_hexo_command");
}

export async function killHexoPort(port: number): Promise<KillPortResult> {
  return invoke<KillPortResult>("kill_hexo_port", { port });
}

export async function getHexoCliStatus(): Promise<HexoCliStatus> {
  if (!isTauriRuntime()) return { ...DEFAULT_CLI_STATUS };
  return invoke<HexoCliStatus>("get_hexo_cli_status");
}

export async function loadSiteThemeCss(rootPath: string): Promise<ThemeCssResult> {
  return invoke<ThemeCssResult>("load_site_theme_css", { rootPath });
}

export async function readCustomCssFile(filePath: string): Promise<ThemeCssResult> {
  return invoke<ThemeCssResult>("read_custom_css_file", { filePath });
}

export async function pickCustomCssFile(
  title = "Select Custom CSS File"
): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await openDialog({
    title,
    multiple: false,
    filters: [{ name: "CSS Stylesheet", extensions: ["css"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function resolveQuickOpen(
  params: ResolveQuickOpenParams
): Promise<QuickOpenResult> {
  return invoke<QuickOpenResult>("resolve_quick_open", {
    target: params.target,
    siteRoot: params.siteRoot ?? null,
    docPath: params.docPath ?? null,
    postAssetFolder: params.postAssetFolder ?? false,
    sourceDir: params.sourceDir ?? null,
  });
}

export async function listenHexoCliOutput(
  handler: (event: HexoCliOutputEvent) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<HexoCliOutputEvent>(HEXO_CLI_OUTPUT_EVENT, (ev) => {
    handler(ev.payload);
  });
}

export async function listenHexoCliStatus(
  handler: (status: HexoCliStatus) => void
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => {};
  return listen<HexoCliStatus>(HEXO_CLI_STATUS_EVENT, (ev) => {
    handler(ev.payload);
  });
}
