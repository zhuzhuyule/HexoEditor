# HexoEditor V2

基于 **Tauri v2 + Rust + React 19 + CodeMirror 6** 重新打造的原生轻量级 Hexo Markdown 桌面写作工作台。

> 历史版本（V1 Electron 实现）完整保留在 `master` 分支作为归档，当前 `v2` 分支为全新架构实现。

## 阶段 1 已实现能力（核心写作工作台 MVP）

- **多站点与文档工作流**
  - 支持添加、切换多个 Hexo 站点，自动解析 `_config.yml`（含 `source_dir`、`post_asset_folder` 等配置）。
  - 兼容直接打开、保存任意本地 Markdown 文件，无 Hexo 站点也可独立写作。
  - Rust 后端基于 `walkdir` + `serde_yaml` 高效扫描 `source/_posts` 与 `source/_drafts`，聚合全站分类与标签。
  - 左侧可折叠管理栏：搜索、全部/文章/草稿切换、按分类与标签筛选、草稿与正式文章互转（同步迁移同名图片目录）、基于 `scaffolds/post.md` / `scaffolds/draft.md` 新建文章。
  - 多标签页编辑：脏状态提示、关闭前保存确认、保存/另存为、可选防抖自动保存、基于 `notify` 的外部文件变更检测与重载提示（内置自写抑制避免误报）。
- **核心编辑与实时预览**
  - CodeMirror 6 源码编辑（Markdown + YAML Front-Matter 语法高亮），内置常用 Markdown 快捷键、工具栏、表格生成器、CJK 对齐表格格式化与智能回车续行。
  - 顶部可折叠 Front-Matter 属性条，与 YAML 源码双向同步，支持全站分类/标签自动补全及标题变更联动重命名 `.md` 文件、同名图片目录与正文相对路径。
  - 实时分栏预览：`markdown-it` + KaTeX 数学公式 + Mermaid 图表 + Highlight.js 代码高亮 + DOMPurify 安全净化 + 本地相对图片解析（兼容 `post_asset_folder` 与 `source/images/<文章名>`，通过 Tauri Asset Protocol 渲染）。
  - 四种视图模式：纯写作 / 分栏预览 / 纯阅读 / 专注模式；基于源码行号锚点的双向同步滚动；CJK + 英文精准字数与预计阅读时长统计。
- **本地图片管理**
  - 剪贴板粘贴图片自动落盘（MD5 去重）并插入 Markdown 语法。
  - 拖拽本地图片入库、粘贴网页 HTML 自动转为 Markdown（`turndown` + GFM）。
  - 点击预览区本地图片快速重命名并同步更新正文引用路径。

## 开发与验证

```bash
# 安装前端依赖
pnpm install

# TypeScript 类型检查
pnpm typecheck

# 前端单元测试 (Vitest)
pnpm test

# 前端生产构建
pnpm build

# Rust 后端检查与单元测试
cd src-tauri && cargo test

# Tauri 开发模式 / 完整桌面端打包构建
pnpm tauri dev
pnpm tauri build
```
