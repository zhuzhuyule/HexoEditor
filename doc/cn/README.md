<div align="right">语言: <a title="英语" href="../../README.md">:us:</a>
:cn:
<a title="俄语" href="../../doc/ru/README.md">:ru:</a></div>

# <div align="center"><a title="Go to homepage" href="#"><img align="center" width="56" height="56" src="https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/icons/HexoEditor.svg?sanitize=true"></a>  HexoEditor</div>

[![Join the chat](https://badges.gitter.im/hexo-theme-tomotoes/Lobby.svg)](https://gitter.im/zhuzhuyule/Lobby)
[![license](https://img.shields.io/badge/license-GPL3.0-brightgreen.svg)](https://github.com/zhuzhuyule/HexoEditor/blob/master/LICENSE)
[![Download](https://img.shields.io/badge/download-page-blue.svg)](https://github.com/zhuzhuyule/HexoEditor/releases)
[![Conda](https://img.shields.io/conda/pn/conda-forge/python.svg)](https://github.com/zhuzhuyule/HexoEditor/releases)

这是一款为 Hexo 做了优化的 Markdown 编辑器。

使用 Electron 做框架

修改自 [Moeditor](https://github.com/Moeditor/Moeditor), 我只是为了让他更好的去为 Hexo 下的博客更好的去书写内容。

#### 如果你有好的建议，请留在 [这里](https://github.com/zhuzhuyule/HexoEditor/issues/2) 。
#### 如果你有时间，有兴趣，有精力，欢迎加入我们共同完善软件功能。

# QQ群:
- 群名：HexoEditor
- 群ID：602883087
- 验证：HexoEditor
- 建立日期：2017-12-29

# 功能
* HexoEditor 
  * 预览内容与 Hexo 生成页面内容高度相似
  * 支持 Hexo 原生 Tag/Filter/Renderer
  * 支持用户自定义 Tag/Filter/Renderer
  * 支持使用 Hexo 配置文件 `_config.yml`
    * 自动读取 highlight 设置
    * 自动读取主题下的 Tag/Filter/Renderer
  * --------- v1.1.8 (2017-12-29) ---------
  * 快速生成 **新Post** 到项目资源路径下
  * 快速修改文件名(在Hexo编辑模式中)
  * 功能快捷键支持
  * 编辑框行号显示/隐藏
  * 智能显示滚动条
  * 滚动条启用/取消同步滚动
* HexoEditor (继承 [Moeditor](https://github.com/Moeditor/Moeditor) 原有功能)
  * GitHub 风格 Markdown 显示
  * TeX math 表达式
  * UML 设计图
  * 编辑框代码高亮显示
  * 只读/只写/预览多模式切换
  * 用户自定义 字体，行高，字体大小
  * 用户自定义主题（文件名：main.csss）
  * 高亮代码块皮肤切换(由 [highlight.js](https://highlightjs.org/) 提供支持)
  * 自动重载文件
  * 本地化
  * ~~专注模式~~

# 截图

![HexoEditor Main](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/main.png)

![HexoEditor Write Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/side-menu.png)

![HexoEditor Write Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/settings.png)

![HexoEditor About](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/about.png)

# 动态截图
![HexoEditor tag](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-tag.gif)

![HexoEditor Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-mode.gif)

![HexoEditor New Post](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-newpost.gif)

![HexoEditor Hexo](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-hexo.gif)


# 计划要做的
- [ ] 添加目录
- [ ] 添加标题头设置(40%)
- [ ] 添加基本语法快捷键
- [ ] 添加历史文件树木
.....
- [ ] 快速部署
- [ ] 多标签编辑显示

# 安装
```bash
npm install
npm start
```

国内，如果想要提高下载速度，请使用 `cnpm` 来代替 `npm`，命令如下 。

```bash
npm install cnpm -g --registry=https://registry.npm.taobao.org
cnpm install
cnpm start
```
# 调试模式
这里有三种方法打开 [Chrome开发者工具](https://developer.chrome.com/devtools).

1. 启动命令行添加参数 `--debug` :
```bash
npm start -- --debug
```
2. 使用快捷键：  
Linux / Windows： `Ctrl` + `Shift` + `I`   
OS X / macOS   ： `Command` + `Option` + `I` 
3. 在 config 设置 `debug: true`。 配置文件在缓存中，路径：
```plain
windows: %USERPROFILE%\.config\configstore\HexoEditor.json
linux  : ~/.config/configstore/HexoEditor.json
mac    : ~/.config/configstore/HexoEditor.json( 待确认)
```

# 本地化
HexoEditor将自动识别系统语言并使用对应语言包。

你也可以通过设置手动设置语言包。

目前支持：简体中文，英语，法语，德语，西班牙语，俄语 和 不完整的葡萄牙语。

**帮助** 如果你可以帮助翻译，请修改 `app/moe-l10n.js`.

# 许可证
HexoEditor 使用许可证为 **GPL v3** 许可.

一些Node模块使用其他的免费许可证书。

`Raleway` 字体许可证书为 OFL(Open Font License)。

# 提示
1. 请修改插件 codemirror，文件路径 :

> ./node_modules/codemirror/lib/codemirror.js (line: `3104`)


> ./node_modules/codemirror/src/display/selection.js (line: `56`)

```js 
//var rightSide = Math.max(display.sizerWidth, displayWidth(cm) - display.sizer.offsetLeft) - padding.right;
var rightSide = display.lineDiv.offsetWidth - padding.right;
```

# 兼容性

* :triangular_flag_on_post: <a href="https://github.com/theme-next/hexo-theme-next" target="_blank">NexT theme</a>