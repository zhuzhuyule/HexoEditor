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

# QQ группа:
- Name：HexoEditor
- QQID：602883087
- PASS：HexoEditor
- Data：2017-12-29

# Возможности
* HexoEditor
  * Предпросмотр поста как в браузере
  * Поддержка тэгов/фильтров/рендерингов
  * Поддержка пользовательских тэгов
  * Поддержка конфигурации Hexo (`_config.yml`)
    * Подсветка синтаксиса (highlight)
    * Поддержка тэгов темы
  * --------- v1.1.8 (2017-12-29) ---------
  * Быстрое создание поста из Hexo исходников
  * Быстрая смена имени файла (при редактировании поста)
  * Поддержка ярлыков
  * Поддержка нумерации строк
  * Авто-Показ/Скрытие скроллинга
  * Поддержка совместной прокрутка
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
  * ~~Фокус-режим~~

# Скриншоты

![HexoEditor Main](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/main.png)

![HexoEditor Write Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/side-menu.png)

![HexoEditor Write Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/settings.png)

![HexoEditor About](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/about.png)

# Gif-скриншоты
![HexoEditor tag](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-tag.gif)

![HexoEditor Mode](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-mode.gif)

![HexoEditor New Post](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-newpost.gif)

![HexoEditor Hexo](https://raw.githubusercontent.com/zhuzhuyule/HexoEditor/master/screenshots/gif-hexo.gif)

# В планах
- [ ] Добавить Toc
- [ ] Добавить настройку Hexo-заголовка (40%)
- [ ] Добавить базовую подсветку ярлыков
- [ ] Добавить дерево изменений файлов
.....
- [ ] Развертывание поста
- [ ] Добавить мульти-редактирование во вкладках

# Компилирование
```bash
npm install
npm start
```

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