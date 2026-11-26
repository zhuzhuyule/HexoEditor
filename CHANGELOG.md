# Changelog

All notable changes to HexoEditor will be documented in this file.

## [2.0.0-beta.1] - 2026-11-26

### Highlights
- **Architecture Rewrite (V1 Electron -> V2 Tauri v2 + Rust)**: Rebuilt from the ground up on Tauri v2, Rust, React 19, Zustand, and CodeMirror 6, reducing macOS bundle size to ~17 MB with native file watching (`notify`) and multi-tab `EditorView` caching.
- **Hexo & Hugo Dual-Engine Support**: Added native Hugo site detection (`hugo.toml` / `config.*` / `config/_default/*`), YAML (`---`) and TOML (`+++`) Front-Matter parsing, Page Bundles (`<slug>/index.md`), and `hugo server -D` / build integration alongside full Hexo support (`_config.yml`, `post_asset_folder`, NexT theme tags, and `hexo s/g/d`).
- **Site-Aware AI & ACP Workbench**:
  - Cross-platform local Agent auto-discovery (`agy acp`, `opencode acp`, Gemini CLI, Goose, Claude Code, Codex CLI) and multi-account custom ACP profiles.
  - Standard API providers (OpenAI-Compatible, Anthropic, Ollama/LM Studio) with local-only key storage and log redaction.
  - `SiteContextSnapshot` injection, Front-Matter completion, inline selection Diff editing, terminal error AI diagnostics, and site-level `.hexoeditor/prompts/*.md` templates.
- **Image Workflow & Document Export**:
  - Clipboard MD5-deduplicated local paste, drag-and-drop import, preview image renaming, and site-wide unused image scanner/cleaner.
  - Multi-provider image bed uploads (PicGo/PicList, S3/R2/MinIO, Aliyun OSS, Tencent COS) with batch link replacement and remote undo.
  - Standalone offline HTML export (inlined Base64 images) and styled PDF print export.
- **UX & Performance Polish**:
  - Non-blocking preview rendering cache with skeleton loading, CJK-aligned Markdown table formatting, and line-anchored bidirectional scroll sync.
  - Fixed-pixel resizable sidebar, small/medium/large UI font sizing, and Overlay/system titlebar mode switching.
