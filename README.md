<div align="right">Language: :us:
<a title="Chinese" href="doc/cn/README.md">:cn:</a>
<a title="Russian" href="doc/ru/README.md">:ru:</a></div>

# <div align="center"><a title="Go to homepage" href="#"><img align="center" width="56" height="56" src="https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/icons/HexoEditor.svg?sanitize=true"></a>  HexoEditor</div>

[![Join the chat](https://badges.gitter.im/hexo-theme-tomotoes/Lobby.svg)](https://gitter.im/zhuzhuyule/Lobby)
[![license](https://img.shields.io/badge/license-GPL3.0-brightgreen.svg)](https://github.com/zhuzhuyule/HexoEditor/blob/master/LICENSE)
[![Download](https://img.shields.io/badge/download-page-blue.svg)](https://github.com/zhuzhuyule/HexoEditor/releases)
[![Conda](https://img.shields.io/conda/pn/conda-forge/python.svg)](https://github.com/zhuzhuyule/HexoEditor/releases)

This is markdown editor for Hexo.

Built with Electron.

Inherit [Moeditor](https://github.com/Moeditor/Moeditor), I want to fix it appropriate to Hexo Blog!

#### if you have good ideas, please comment [Here](https://github.com/zhuzhuyule/HexoEditor/issues/2)
#### if you have time, and interest, and energy, welcome join us !

# QQ Group:
- Name：HexoEditor        
- QQID：602883087   
- PASS：HexoEditor           
- Data：2017-12-29  

# Features
* HexoEditor 
  * Hexo Post Preview same as in Browser
  * Hexo Tag/Filter/Renderer support
  * Custom tag support
  * Use Hexo `_config.yml` support
    * highlight setting
    * theme tag support
  * --------- v1.1.8 (2017-12-29) ---------
  * Quick New Post in hexo source 
  * Quick Modify File Name (In Hexo Post Edit)  
  * Shortcut Support
  * Editor Line number Show/Hide
  * Auto Show/Hide Scroll
  * Scorll Together/None
* HexoEditor (Inherit [Moeditor](https://github.com/Moeditor/Moeditor))
  * GitHub Flavored Markdown
  * TeX math expressions
  * UML diagrams
  * Code highlight in editor
  * Read/Write/Preview mode
  * Custom font / line height / font size
  * Custom themes
  * Code highlight themes (powered by [highlight.js](https://highlightjs.org/))
  * Auto reload
  * Localization
  * ~~Focus mode~~

# Screenshots

![HexoEditor Main](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/main.png)

![HexoEditor Write Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/side-menu.png)

![HexoEditor Write Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/settings.png)

![HexoEditor About](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/about.png)

# Gif Screenshots
![HexoEditor tag](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-tag.gif)

![HexoEditor Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-mode.gif)

![HexoEditor New Post](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-newpost.gif)

![HexoEditor Hexo](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-hexo.gif)

# Plan To Do
- [ ] Add Toc
- [ ] Add Hexo Title Header setting (40%)
- [ ] Add base highlight ShortCut
- [ ] Add history files tree
.....
- [ ] Deploy Post
- [ ] Add multi-editing in tabs

# Building
```bash
npm install
npm start
```

In China, you may want to replace npm with cnpm for a faster download speed.

```bash
npm install cnpm -g --registry=https://registry.npm.taobao.org
cnpm install
cnpm start
```
# Debugging
There's three ways to open the [Chromium Developer Tools](https://developer.chrome.com/devtools).

1. Add `--debug` to the command line args:
```bash
npm start -- --debug
```
2. `Ctrl` + `Shift` + `I` in Linux / Windows or `Command` + `Option` + `I` in OS X / macOS to toggle devtools for a window.
3. Set `debug` to `true` in the config. The config file is stored in `~/.config/configstore/HexoEditor.json` (for every system).



# Localization
HexoEditor will auto detect your system language and use the localization.

You can set language manually in the Settings window.

Now the app supports English, Chinese, French, German, Spanish and *incomplete* Portuguese.

**Help us** if you can translate this app. Please follow the guide in `app/moe-l10n.js`.

# License
HexoEditor itself is licensed under the **GPL v3** license.

Some node modules are licensed under other free software license.

The `Raleway` font is licensed under the OFL open font license.


# Tips
1. modify codemirror file :

> ./node_modules/codemirror/lib/codemirror.js (line: `3104`)


> ./node_modules/codemirror/src/display/selection.js (line: `56`)

```js 
//var rightSide = Math.max(display.sizerWidth, displayWidth(cm) - display.sizer.offsetLeft) - padding.right;
var rightSide = display.lineDiv.offsetWidth - padding.right;
```

# Compatibility

* :triangular_flag_on_post: <a href="https://github.com/theme-next/hexo-theme-next" target="_blank">NexT theme</a>