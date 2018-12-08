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

# 功能
* HexoEditor 
  * 预览内容与 Hexo 生成页面内容高度相似
  * 支持 Hexo 原生 Tag/Filter/Renderer
  * 支持使用 Hexo 配置文件 `_config.yml`
  * 快速生成 **新Post** 到项目资源路径下
  * 快速修改文件名(在Hexo编辑模式中)
  * 快速部署
  * 快速执行Hexo命令 `hexo d`,`hexo g`,`hexo s`,`hexo clean`
  * 图片自动转换为Markdown格式
    * 支持拖拽图片
    * 支持剪贴板粘贴
  * 图床支持(一键上传)
    * 支持 [SM.MS](https://sm.ms) 
    * 支持 [QiNiu](https://portal.qiniu.com) 
    * 支持 [Tencent](https://console.cloud.tencent.com) 
  * 快速启动（常用目录，常用地址）
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
  * 专注模式

# 截图

![HexoEditor Main](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/main.png)

![HexoEditor side](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/side-menu.png)

![HexoEditor menu](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/menu.png)

![HexoEditor About](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/about.png)

# 动态截图
![HexoEditor settings](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-settings.gif)

![HexoEditor tag](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-tag.gif)

![HexoEditor Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-mode.gif)

![HexoEditor Upload Image](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-uploadImage.gif)

![HexoEditor New Post](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-newpost.gif)

![HexoEditor Hexo](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-hexo.gif)


# 计划要做的
- [ ] 添加目录
- [x] 添加标题头设置(100%)
- [x] 添加基本语法快捷键
- [ ] 添加历史文件树木
.....
- [x] 快速部署
- [ ] 多标签编辑显示

# 快捷键
| 按键                    | 方法              | 说明            |
| :--------------------: | :------------------ | :-------------- |
| `Tab`                  | tabAdd              | 添加缩进        |
| `Shift` - `Tab`        | tabSubtract         | 减少缩进        |
| `Ctrl` - `B`           | toggleBlod          | 切换粗体        |
| `Ctrl` - `I`           | toggleItalic        | 切换斜体        |
| `Ctrl` - `D`           | toggleDelete        | 删除当前行       |
| `Ctrl` - <code>\`</code>         | toggleComment       | 切换注解        |
| `Ctrl` - `L`           | toggleUnOrderedList | 切换无序列表    |
| `Ctrl` - `Alt` - `L`   | toggleOrderedList   | 切换有序列表    |
| `Ctrl` - `]`           | toggleHeader        | 降级标题        |
| `Ctrl` - `[`           | toggleUnHeader      | 升级标题        |
| `Ctrl` - `=`           | toggleBlockquote    | 增加引用        |
| `Ctrl` - ` - `         | toggleUnBlockquote  | 减少引用        |
| `Ctrl` - `U`           | drawLink            | 添加超级链接    |
| `Ctrl` - `Alt` - `U`   | drawImageLink       | 添加图片       |
| `Ctrl` - `T`           | drawTable(row col)  | 添加表格(行 列) |
| `Ctrl` - `V`           | pasteOriginContent  |源内容粘贴       |
| `Shift` - `Ctrl` - `V` | pasteContent        |  智能粘贴      |
| `Alt` - `F`            | formatTables        | 格式化表格      |
| `Ctrl` - `N`            |         | 新建md文档      |
| `Ctrl` - `H`            |         | 新建Hexo文档      |
| `Ctrl` - `O`            |         | 打开md文件      |
| `Ctrl` - `S`            |         | 保存文档      |
| `Shift` - `Ctrl` - `S`            |         | 另存为      |
| `Alt` - `Ctrl` - `S`            |         | 打开设置      |
| `Ctrl` - `W`            |         | 切换写作模式      |
| `Ctrl` - `P`            |         | 切换预览模式      |
| `Ctrl` - `R`            |         | 切换阅读模式      |

* **提示**: 在 Mac OS下, 请使用 `Cmd` 来代替 `Ctrl` .

# 安装
```c
//如果使用 Windows:
npm config set prefix "C:/Program Files/nodejs/npm_global"
npm config set cache "C:/Program Files/nodejs/npm_cache" 

//如果使用 Linux\Mac:
npm config set prefix "~/nodejs/npm_global"
npm config set cache "~/nodejs/npm_cache" 

//在中国，中国，中国，你应该设置淘宝镜像来加速下载。
npm config set registry "https://registry.npm.taobao.org/"
npm config set electron_mirror "https://npm.taobao.org/mirrors/electron/"

git clone https://github.com/zhuzhuyule/HexoEditor.git
cd HexoEditor
npm install
npm start
```
这里是 [详细安装方式](https://github.com/zhuzhuyule/HexoEditor/blob/master/doc/en/Building.md)

国内，如果想要提高下载速度，请使用 `cnpm` 来代替 `npm`，命令如下 。

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

# Hexo帮助文档
- [Hexo](https://hexo.io)
- [EasyHexo](https://easyhexo.github.io/Easy-Hexo/)

# QQ群:
- 群名：HexoEditor
- 群ID：602883087
- 验证：HexoEditor
- 建立日期：2017-12-29
