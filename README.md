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

# Features
* HexoEditor 
  * Hexo Post Preview same as in Browser
  * Hexo Tag/Filter/Renderer support
  * Use Hexo `_config.yml` support
  * Quick New Post in hexo source 
  * Quick Modify File Name (In Hexo Post Edit)  
  * Quick Deploy Post
  * Quick Hexo Command `hexo d`,`hexo g`,`hexo s`,`hexo clean`
  * Auto Change Image to Markdown 
    * Support Drag Image
    * Support Paste Clipboard Image
  * Support Image Cloud (One Step Upload)
    * Support [SM.MS](https://sm.ms) 
    * Support [QiNiu](https://portal.qiniu.com) 
    * Support [Tencent](https://console.cloud.tencent.com) 
  * Quick Start (Common Directory, Common URL)
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
  * Focus mode

# Screenshots

![HexoEditor Main](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/main.png)

![HexoEditor side](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/side-menu.png)

![HexoEditor menu](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/menu.png)

![HexoEditor About](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/about.png)

# Gif Screenshots
![HexoEditor settings](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-settings.gif)

![HexoEditor tag](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-tag.gif)

![HexoEditor Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-mode.gif)

![HexoEditor Upload Image](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-uploadImage.gif)

![HexoEditor New Post](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-newpost.gif)

![HexoEditor Hexo](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-hexo.gif)

# Plan To Do
- [ ] Add Toc
- [x] Add Hexo Title Header setting (100%)
- [x] Add Editor ShortCut
- [ ] Add history files tree
.....
- [x] Deploy Post
- [ ] Add multi-editing in tabs

# ShortCut
| Key                    | Method              | explanation            |
| :--------------------: | :------------------ | :-------------- |
| `Tab`                  | tabAdd              | add indentation        |
| `Shift` - `Tab`        | tabSubtract         | reduce indentation        |
| `Ctrl` - `B`           | toggleBlod          | toggle blod        |
| `Ctrl` - `I`           | toggleItalic        | toggle italic        |
| `Ctrl` - `D`           | toggleDelete        | delete current line        |
| `Ctrl` - <code>\`</code>         | toggleComment       | toggle comment        |
| `Ctrl` - `L`           | toggleUnOrderedList | toggle unordered list    |
| `Ctrl` - `Alt` - `L`   | toggleOrderedList   | toggle ordered list    |
| `Ctrl` - `]`           | toggleHeader        | downgrade title        |
| `Ctrl` - `[`           | toggleUnHeader      | upgrade title        |
| `Ctrl` - `=`           | toggleBlockquote    | add blockquote        |
| `Ctrl` - ` - `         | toggleUnBlockquote  | reduce blockquote        |
| `Ctrl` - `U`           | drawLink            | add hyperlink    |
| `Ctrl` - `Alt` - `U`   | drawImageLink       | add image       |
| `Ctrl` - `T`           | drawTable(row col)  | add table(row column) |
| `Ctrl` - `V`           | pasteOriginContent  | paste origin content       |
| `Shift` - `Ctrl` - `V` | pasteContent        | auto paste content      |
| `Alt` - `F`            | formatTables        | format tables      |
| `Ctrl` - `N`            |         | new md document      |
| `Ctrl` - `H`            |         | new hexo document      |
| `Ctrl` - `O`            |         | open md document      |
| `Ctrl` - `S`            |         | save md document      |
| `Shift` - `Ctrl` - `S`            |         | save as      |
| `Alt` - `Ctrl` - `S`            |         | open settings      |
| `Ctrl` - `W`            |         | toggle write mode      |
| `Ctrl` - `P`            |         | toggle preview mode       |
| `Ctrl` - `R`            |         | toggle read mode       |

* **tip**: In mac OS, plase replace `Ctrl` key with `Cmd` key.

# Building
```c
//if use Windows:
npm config set prefix "C:/Program Files/nodejs/npm_global"
npm config set cache "C:/Program Files/nodejs/npm_cache" 

//if use Linux\Mac:
npm config set prefix "~/nodejs/npm_global"
npm config set cache "~/nodejs/npm_cache" 

//If In China, China, China, you can set mirror to speed up !
npm config set registry "https://registry.npm.taobao.org/"
npm config set electron_mirror "https://npm.taobao.org/mirrors/electron/"

git clone https://github.com/zhuzhuyule/HexoEditor.git
cd HexoEditor
npm install
npm start
```
This is [Detail Method](https://github.com/zhuzhuyule/HexoEditor/blob/master/doc/en/Building.md)

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

# Hexo Help
- [Hexo](https://hexo.io)
- [EasyHexo](https://easyhexo.github.io/Easy-Hexo/)

# QQ Group:
- Name：HexoEditor        
- QQID：602883087   
- PASS：HexoEditor           
- Data：2017-12-29  
