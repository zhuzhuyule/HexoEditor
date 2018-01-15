/*
 *  This file is part of Moeditor.
 *
 *  Copyright (c) 2016 Menci <huanghaorui301@gmail.com>
 *
 *  Moeditor is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Moeditor is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Moeditor. If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

window.app = require('electron').remote.app;
window.moeApp = app.moeApp;
window.w = moeApp.newWindow;
require('electron-titlebar');
const {clipboard} = require('electron');

let gSavedContent;

$(() => {
    const fs = require('fs');
    const path = require('path');
    const dialog = require('electron').remote.dialog;
    const YMAL = require('yamljs');

    const MoeditorPreview = require('./moe-preview');

    if (w.fileName !== '') {
        document.getElementsByTagName('title')[0].innerText = 'Moeditor - ' + path.basename(w.fileName);
    }
    document.querySelector('#editor textarea').innerText = w.content;

    function mkdirsSync(dirpath, mode) {
        if (!fs.existsSync(dirpath)) {
            var pathtmp;
            dirpath.split(path.sep).forEach(function (dirname) {
                if (pathtmp) {
                    pathtmp = path.join(pathtmp, dirname);
                }
                else {
                    pathtmp = dirname;
                }
                if (!fs.existsSync(pathtmp)) {
                    if (!fs.mkdirSync(pathtmp, mode)) {
                        return false;
                    }
                }
            });
        }
        return true;
    }

    var perNativeImage;
    var perImagepath;

    // 判断是否为Mac
    CodeMirror.commands.prastData = function (codeMirror) {
        let image = clipboard.readImage();
        if (!image.isEmpty() ) {
            if (perNativeImage == image.toDataURL()){
                codeMirror.replaceSelection(perImagepath, "end");
                return;
            }
            let rootPaht = '';
            if (!moeApp.defTheme && hexo.config.__basedir) {
                rootPaht = path.join(hexo.config.__basedir, 'source', 'images');
            } else if (moeApp.config.get('image-path')) {
                rootPaht = moeApp.config.get('image-path');
            } else {
                rootPaht = w.directory;
            }
            let imageTitle = codeMirror.getSelection();
            let imageName = imageTitle || require('moment')().format('YYYYMMDDhhmmssSSS');

            let count = 0;
            let currFileName = path.basename(w.fileName, path.extname(w.fileName)) || w.ID;
            let imagePath = path.join(rootPaht, currFileName, imageName + '.png');
            do {
                if (count > 0)
                    imagePath = path.join(rootPaht, currFileName, imageName + count + '.png');
                count += 1;
                if (count > 50) {
                    imagePath = path.join(rootPaht, currFileName, imageName + require('moment')().format('YYYYMMDDhhmmssSSS') + '.png');
                    break;
                }
            } while (fs.existsSync(imagePath));
            mkdirsSync(path.dirname(imagePath));
            fs.writeFileSync(imagePath, image.toPNG());
            perNativeImage = image.toDataURL();
            if (!moeApp.defTheme && hexo.config.__basedir)
                perImagepath = `![${imageTitle}](${'/images/' + path.relative(rootPaht, imagePath).replace(/\\+/g, '/')})`
            else
                perImagepath = `![${imageTitle}](${'/' + path.relative(rootPaht, imagePath).replace(/\\+/g, '/')})`
            codeMirror.replaceSelection(perImagepath, "end");
        } else {
            perNativeImage = '';
            perImagepath = '';
            codeMirror.replaceSelection(clipboard.readText())
        }
    };
    var editor = CodeMirror.fromTextArea(document.querySelector('#editor textarea'), {
        lineNumbers: false,
        mode: moeApp.config.get('math') ? 'gfm_math' : 'gfm',
        matchBrackets: true,
        theme: moeApp.config.get('editor-theme'),
        lineWrapping: true,
        extraKeys: {
            Esc: 'singleSelection',
            Enter: 'newlineAndIndentContinueMarkdownList',
            Home: 'goLineLeft',
            End: 'goLineRight',
            Tab: function (codeMirror) {
                codeMirror.indentSelection(parseInt(codeMirror.getOption("indentUnit")));
            },
            'Shift-Tab': 'indentLess',
            prastDataKey: 'prastData'
        },
        fixedGutter: false,
        tabSize: moeApp.config.get('tab-size'),
        indentUnit: moeApp.config.get('tab-size'),
        viewportMargin: Infinity,
        styleActiveLine: true,
        showCursorWhenSelecting: true
    });
    var prastDataKey = (process.platform === 'darwin' ? "Cmd" : "Ctrl") + "-V";
    editor.options.extraKeys[prastDataKey] = "prastData";


    editor.focus();

    const scroll = require('./moe-scroll');

    window.updatePreview = (force) => {
        MoeditorPreview(editor, force, () => {
            scroll();
        });
    };

    window.changeFileName = (force) => {
        if (!force && w.defName !== w.fileName) return;

        let title, fileNameNew;
        let filename = path.basename(w.fileName, path.extname(w.fileName));

        w.content.replace(/^---+([\w\W]+?)---+/, function () {
            title = YMAL.parse(arguments[1]).title;
            return '';
        });

        if (filename === title) {
            if (force)
                w.isSaved = true;
            return
        }

        try {
            filename = title.toString().replace(/[ \\\/:\*\?"<>\|]+/g, '-');
            let dir = path.dirname(w.fileName);
            let ext = path.extname(w.fileName);
            let count = -1;
            do {
                count++;
                fileNameNew = filename + (count > 0 ? count : '');
                fileNameNew = path.resolve(dir, fileNameNew + ext);
                if (w.fileName == fileNameNew || count > 50) {
                    return;
                }
            } while (fs.existsSync(fileNameNew))

            fs.renameSync(w.fileName, fileNameNew);
            w.fileName = fileNameNew;

            w.window.setRepresentedFilename(fileNameNew);
            document.getElementsByTagName('title')[0].innerText = 'Moeditor - ' + path.basename(fileNameNew);

            if (force) {
                fs.writeFile(w.fileName, w.content, (err) => {
                    if (err) {
                        w.changed = true;
                        w.window.setDocumentEdited(true);
                        return;
                    }
                    w.isSaved = true;
                    w.changed = false;
                    w.window.setDocumentEdited(false);
                    app.addRecentDocument(fileNameNew);
                    gSavedContent = w.content;
                });
            }
        } catch (e) {
            console.log(e);
        }
    }

    window.autoSave = () => {
        const option = moeApp.config.get('auto-save');
        if (option === 'auto' && w.content !== gSavedContent) {
            fs.writeFile(w.fileName, w.content, (err) => {
                if (err) {
                    w.changed = true;
                    w.window.setDocumentEdited(true);
                    return;
                }
                w.isSaved = true;
                w.changed = false;
                w.window.setDocumentEdited(false);
            });
        }
    }

    editor.on('change', (editor, obj) => {
        window.updatePreview(false)
    });

    editor.on('blur', () => {
        if (w.fileName === '') return;
        window.changeFileName(false);
        window.autoSave();
    });

    setTimeout(() => {
        window.updatePreview(true);
    }, 0);

    window.editor = editor;
    // workaround for the .button is still :hover after maximize window
    $('#cover-bottom .button-bottom').mouseover(function () {
        $(this).addClass('hover');
    }).mouseout(function () {
        $(this).removeClass('hover');
    }).click(function () {
        var s = $(this).data('action');
        if (s === 'menu') MoeditorSideMenu.open();
    });

    const s = require('electron').shell;

    const containerWrapper = document.getElementById('container-wrapper');
    document.addEventListener('keydown', (e) => {
        if ((process.platform === 'darwin' ? e.metaKey : e.ctrlKey) && e.keyCode == 65) {
            if (document.getElementById('editor').contains(e.target)) {
                return;
            } else if (containerWrapper.contains(e.target)) {
                let sel = window.getSelection();
                let rg = document.createRange();
                rg.selectNodeContents(containerWrapper);
                sel.removeAllRanges();
                sel.addRange(rg);
            }
            e.preventDefault();
        }
    });
    $("#container").on('click', 'a', function (e) {
        e.preventDefault();
        const href = this.getAttribute('href');
        if (href.startsWith('#')) {
            const e = containerWrapper.querySelector(href);
            if (e) containerWrapper.scrollTop = e.offsetTop - 50; // 50 is the height of the top cover
        } else {
            s.openExternal(this.href);
        }
    });

    const leftPanel = document.getElementById('left-panel');
    leftPanel.addEventListener('click', (e) => {
        if (e.target === leftPanel) editor.focus();
    });

    // if (moeApp.config.get('focus-mode') === true) document.getElementById('editor').classList.add('focus');
    // document.getElementById('button-bottom-focus').addEventListener('click', function() {
    //     document.getElementById('editor').classList.toggle('focus');
    //     moeApp.config.set('focus-mode', document.getElementById('editor').classList.contains('focus'));
    // });

    require('electron').ipcRenderer.on('set-title', (e, fileName) => {
        document.getElementsByTagName('title')[0].innerText = 'Moeditor - ' + path.basename(fileName);
    });

    require('./moe-settings');

    w.window.show();

    // $(".CodeMirror-vscrollbar").hover(
    //     function () {
    //         $(this).addClass('hoverScroll')
    //     },
    //     function () {
    //         $(this).removeClass('hoverScroll')
    //     }
    // );

    $("#main-container div").mousemove(function (e) {
        // $('.scrolling').removeClass('scrolling');
        if (e.clientX + 100 > this.offsetWidth + this.offsetLeft)
            $(this).find('.CodeMirror-vscrollbar').addClass('hoverScroll');
        else {
            $(this).find('.CodeMirror-vscrollbar').removeClass('hoverScroll');
        }
    })

    $("#main-container div").hover(
        function (e) {
        },
        function (e) {
            // $('.scrolling').removeClass('scrolling');
            $(this).find('.CodeMirror-vscrollbar').removeClass('hoverScroll');
        }
    )

    document.querySelectorAll('.CodeMirror-vscrollbar').forEach(
        function (item) {
            item.addEventListener("transitionend", function (e) {
                // if (e.propertyName == 'font-size'){
                $('.scrolling').removeClass('scrolling');
                // }
            });

            item.addEventListener("scroll", function (e) {
                if ($(this.parentElement).is(':hover'))
                    $(this).addClass('scrolling');
                if ($(this).css('font-size') == '14px') {
                    $('.scrolling').removeClass('scrolling');
                }
            })
        }
    );


    document.getElementById("container").addEventListener("click", function () {
        var script = document.getElementById('dynamicScript');
        if (!script) {
            var rightpanel = document.getElementById('right-panel');
            var scripts = rightpanel.getElementsByTagName('script');
            if (script) {
                rightpanel.removeChild(script);
            }
            script = document.createElement('script');
            script.id = 'dynamicScript';
            script.text = '';
            for (var i = 0, len = scripts.length; i < len; i++) {
                script.text += scripts[i].innerHTML;
            }
            rightpanel.appendChild(script);
        }
    }, true);


    window.addEventListener('resize', function () {
        $('#right-panel .CodeMirror-vscrollbar div').height(document.getElementById('container-wrapper').scrollHeight);
    })


    window.onfocus = (e) => {
        if (w.fileName === '') return;
        fs.readFile(w.fileName, (err, res) => {
            if (err) {
                w.changed = true;
                w.window.setDocumentEdited(true);
                return;
            }
            let s = res.toString();
            if (s !== w.fileContent) {
                const option = moeApp.config.get('auto-reload');
                let flag = false;
                if (option === 'auto') flag = true;
                else if (option === 'never') flag = false;
                else {
                    flag = dialog.showMessageBox(
                        w.window,
                        {
                            type: 'question',
                            buttons: [__("Yes"), __("No")],
                            title: __("Confirm"),
                            cancelId: -1,
                            message: __("File changed by another program, reload?")
                        }
                    ) === 0;
                }

                w.fileContent = w.content = s;

                if (!flag) {
                    w.changed = true;
                    w.window.setDocumentEdited(true);
                    return;
                }

                let pos = window.editor.getCursor();
                let editorScroll = document.querySelector('.CodeMirror-vscrollbar');
                let scrollpos = editorScroll.scrollTop;
                window.editor.setValue(s);
                window.editor.setCursor(pos);

                if (scrollpos > 0)
                    editorScroll.scrollTop = scrollpos;

                w.changed = false;
                w.window.setDocumentEdited(false);
                window.updatePreview(true);
            }
        });
    };
});
