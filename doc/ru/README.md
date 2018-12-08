<div align="right">Язык: <a title="Английский" href="../../README.md">:us:</a>
<a title="Китайский" href="../../doc/cn/README.md">:cn:</a>
:ru:</div>

# <div align="center"><a title="Перейти на сайт" href="#"><img align="center" width="56" height="56" src="https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/icons/HexoEditor.svg?sanitize=true"></a>  HexoEditor</div>

[![Join the chat](https://badges.gitter.im/hexo-theme-tomotoes/Lobby.svg)](https://gitter.im/zhuzhuyule/Lobby)
[![license](https://img.shields.io/badge/license-GPL3.0-brightgreen.svg)](https://github.com/zhuzhuyule/HexoEditor/blob/master/LICENSE)
[![Download](https://img.shields.io/badge/download-page-blue.svg)](https://github.com/zhuzhuyule/HexoEditor/releases)
[![Conda](https://img.shields.io/conda/pn/conda-forge/python.svg)](https://github.com/zhuzhuyule/HexoEditor/releases)

Маркдаун редактор для Hexo.

Построен с помощью Electron.

Наследник [Moeditor](https://github.com/Moeditor/Moeditor), который я переделал под Hexo!

#### Есть идеи? Вам [сюда](https://github.com/zhuzhuyule/HexoEditor/issues/2)
#### И если у Вас есть время, интерес и энергия, пожалуйста, присоединяйтесь к нам!

# Возможности
* HexoEditor
  * Предпросмотр поста как в браузере
  * Поддержка тэгов/фильтров/рендерингов
  * Поддержка конфигурации Hexo (`_config.yml`)
  * Быстрое создание поста из Hexo исходников
  * Быстрая смена имени файла (при редактировании поста)
  * Быстрое развертывание
  * Быстро выполните команду Hexo `hexo d`,`hexo g`,`hexo s`,`hexo clean`
  * Картинка автоматически преобразуется в формат Markdown
    * Поддержка перетаскивания изображений
    * Поддержка палитры в буфер обмена
  * Поддержка слоя с рисунком (загрузка одним нажатием)
    * поддержка [SM.MS](https://sm.ms) 
    * поддержка [QiNiu](https://portal.qiniu.com) 
    * поддержка [Tencent](https://console.cloud.tencent.com) 
  * Быстрый старт (обычно используемый каталог, обычно используемый адрес)
  * Полоса прокрутки Включение / выключение прокрутки
* HexoEditor (Наследник [Moeditor](https://github.com/Moeditor/Moeditor))
  * Поддержка стиля GitHub
  * Математические выражения TeX
  * Диаграммы UML
  * Подсветка кода в редакторе
  * Режим чтения/записи/предпросмотра
  * Пользовательские шрифты/высота линии
  * Пользовательские темы
  * Подсветка кода в темами ([highlight.js](https://highlightjs.org/))
  * Автоматическая перезагрузка текста
  * Поддержка локализации
  * Фокус-режим

# Скриншоты

![HexoEditor Main](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/main.png)

![HexoEditor side](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/side-menu.png)

![HexoEditor menu](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/menu.png)

![HexoEditor About](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/about.png)

# Gif-скриншоты
![HexoEditor settings](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-settings.gif)

![HexoEditor tag](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-tag.gif)

![HexoEditor Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-mode.gif)

![HexoEditor Upload Image](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-uploadImage.gif)

![HexoEditor New Post](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-newpost.gif)

![HexoEditor Hexo](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-hexo.gif)

# В планах
- [ ] Добавить Toc
- [x] Добавить настройку Hexo-заголовка (100%)
- [x] Добавить базовую подсветку ярлыков
- [ ] Добавить дерево изменений файлов
.....
- [x] Развертывание поста
- [ ] Добавить мульти-редактирование во вкладках

# Ярлыки
| кнопка                    | метод              | объяснение            |
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

* **подсказка**: В Mac OS, plase замените ключ `Ctrl` ключом` Cmd`.

# Компилирование
```c
//is use Windows:
npm config set prefix "C:/Program Files/nodejs/npm_global"
npm config set cache "C:/Program Files/nodejs/npm_cache" 

//if use Linux\Mac:
npm config set prefix "~/nodejs/npm_global"
npm config set cache "~/nodejs/npm_cache" 

//If In China China China, you can set mirror to speed up !
npm config set registry "https://registry.npm.taobao.org/"
npm config set electron_mirror "https://npm.taobao.org/mirrors/electron/"

git clone https://github.com/zhuzhuyule/HexoEditor.git
cd HexoEditor
npm install
npm start
```
This is [Detail Method](https://github.com/zhuzhuyule/HexoEditor/blob/master/doc/en/Building.md)
# Отладка
Открываем [Chromium Developer Tools](https://developer.chrome.com/devtools) и далее есть 3 способа:

1. Добавляем аргумент `--debug`:
```bash
npm start -- --debug
```
2. `Ctrl` + `Shift` + `I` в Linux / Windows или `Command` + `Option` + `I` в OS X / macOS для переключения `devtools` в окне.
3. Устанавливаем `debug` на `true` в конфиге. Файл конфигурации располагается в `~/.config/configstore/HexoEditor.json` (для всех систем).



# Локализация
HexoEditor будет автоматически распознавать Ваш системный язык и использовать локализацию.

Вы можете также установить язык вручную в окне Настроек.

Теперь приложение поддерживает Англиский, Французский, Немецкий, испанский и *незавершенный* Португальский.

**Помогите нам** если Вы можете добавить перевод. Пожалуйста, следуйте инструкциям в файле `app/moe-l10n.js`.

# Лицензия
HexoEditor распространяется под **GPL v3** лицензией.

Некоторые модули ноды лицензированы под другими лицензиями.

`Raleway` шрифт лицензирован под лицензией OFL.


# Примечания
1. Редактируем файл `codemirror.js`:

> ./node_modules/codemirror/lib/codemirror.js (линия: `3104`)


> ./node_modules/codemirror/src/display/selection.js (линия: `56`)

```js 
//var rightSide = Math.max(display.sizerWidth, displayWidth(cm) - display.sizer.offsetLeft) - padding.right;
var rightSide = display.lineDiv.offsetWidth - padding.right;
```

# Совместимость

* :triangular_flag_on_post: <a href="https://github.com/theme-next/hexo-theme-next" target="_blank">NexT theme</a>

# Hexo Справочный документ
- [Hexo](https://hexo.io)
- [EasyHexo](https://easyhexo.github.io/Easy-Hexo/)


# QQ группа:
- Name：HexoEditor
- QQID：602883087
- PASS：HexoEditor
- Data：2017-12-29
