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

require('electron-titlebar');
window.app = require('electron').remote.app;
window.moeApp = app.moeApp;
window.w = moeApp.newWindow;
window.imgRelativePathToID = {};
window.imgIDToRelativePath = {};
window.imgRelativeToAbsolute = {};
window.clipboard = require('electron').clipboard;

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
        },
        fixedGutter: false,
        tabSize: moeApp.config.get('tab-size'),
        indentUnit: moeApp.config.get('tab-size'),
        viewportMargin: Infinity,
        styleActiveLine: true,
        showCursorWhenSelecting: true
    });

    editor.focus();

    window.mkdirsSync = (dirpath, mode) => {
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

    window.md5 = (text) => {
        return require('crypto').createHash('md5').update(text).digest('hex');
    };
    window.imgRootPath = (extendPath) => {
        let rootPaht = '';
        if (!moeApp.defTheme && hexo.config.__basedir) {
            rootPaht = path.join(hexo.config.__basedir, 'source', extendPath || '');
        } else if (moeApp.config.get('image-path')) {
            rootPaht = moeApp.config.get('image-path');
        } else {
            rootPaht = w.directory;
        }
        return rootPaht;
    }

    function replaceImgSelection(codeMirror, title, relativePath, imageID, absolutePath) {
        if (!relativePath) {
            if (!moeApp.defTheme && hexo.config.__basedir)
                relativePath = '/' + path.relative(imgRootPath(), absolutePath).replace(/\\+/g, '/')
            else
                relativePath = '/' + path.relative(imgRootPath(), absolutePath).replace(/\\+/g, '/')
            if (!imageID) {
                imageID = imgRelativePathToID[absolutePath] || md5(absolutePath);
            }
            imgIDToRelativePath[imageID] = relativePath;
            imgRelativeToAbsolute[imageID] = absolutePath;
            imgRelativePathToID[relativePath] = imageID;
        }
        codeMirror.replaceSelection(`![${title}](${relativePath})`);
    }

    window.pasteData = (codeMirror) => {
        if (!codeMirror)
            codeMirror = editor;
        let image = clipboard.readImage();
        if (!image.isEmpty()) {
            image = image.toPNG();
            let imageTitle = codeMirror.getSelection();
            let imageID = md5(image);
            let relativePath = imgIDToRelativePath[imageID];
            if (relativePath) {
                replaceImgSelection(codeMirror, imageTitle, relativePath);
                return;
            }
            let rootPaht = imgRootPath('images');
            let imageName = imageTitle || require('moment')().format('YYYYMMDDhhmmssSSS');

            let count = 0;
            let currFileName = path.basename(w.fileName, path.extname(w.fileName)) || w.ID;
            let imageAbsolutePath = path.join(rootPaht, currFileName, imageName + '.png');
            do {
                if (count > 0)
                    imageAbsolutePath = path.join(rootPaht, currFileName, imageName + count + '.png');
                count += 1;
                if (count > 50) {
                    imageAbsolutePath = path.join(rootPaht, currFileName, imageName + require('moment')().format('YYYYMMDDhhmmssSSS') + '.png');
                    break;
                }
            } while (fs.existsSync(imageAbsolutePath));
            mkdirsSync(path.dirname(imageAbsolutePath));
            fs.writeFileSync(imageAbsolutePath, image);
            replaceImgSelection(codeMirror, imageTitle, '', imageID, imageAbsolutePath);
        } else {
            codeMirror.replaceSelection(clipboard.readText())
        }
    };

    var prastDataKey = (process.platform === 'darwin' ? "Cmd" : "Ctrl") + "-V";
    editor.options.extraKeys[prastDataKey] = pasteData;

    const holder = document.getElementById('editor')
    holder.ondragover = () => {
        return false;
    }
    holder.ondragleave = holder.ondragend = () => {
        return false;
    }
    holder.ondrop = (e) => {
        e.stopPropagation()
        e.preventDefault()
        for (let f of e.dataTransfer.files) {
            replaceImgSelection(editor, (editor.getSelection() || ''), '', '', f.path);
        }
        return false;
    }

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

    let renameForm = document.querySelector('#renameForm');
    window.renameImage = (relativePath) => {
        renameForm.setAttribute('path', relativePath);
        renameForm.querySelector('input').setAttribute('placeholder', path.basename(relativePath))
        renameForm.querySelector('input').value = '';
        renameForm.classList.add('show');
    }

    document.querySelector('#renameForm .button-check').addEventListener("click", e => {
        let rootPaht = window.imgRootPath();
        let relativePath = renameForm.getAttribute('path');
        let absolutePath = path.join(rootPaht, relativePath);
        if (fs.existsSync(absolutePath)) {
            let newName = renameForm.querySelector('input').value;
            const ext = path.extname(relativePath);
            if (ext !== path.extname(newName))
                newName += ext;

            const newAbsolutePath = path.join(path.dirname(absolutePath), newName).replace(/\\/g, '/');
            const newRelativePath = path.normalize('/' + path.relative(rootPaht, newAbsolutePath)).replace(/\\/g, '/');

            let content;
            if (fs.existsSync(newAbsolutePath)) {
                window.popMessageShell(e, {
                    content: 'FileExist',
                    type: 'danger',
                    autoHide: true
                })
                renameForm.querySelector('input').select();
            } else {
                fs.renameSync(absolutePath, newAbsolutePath);
                let oldImgID = imgRelativePathToID[relativePath];
                imgIDToRelativePath[oldImgID] = newRelativePath;
                imgRelativePathToID[newRelativePath] = oldImgID;
                imgRelativeToAbsolute[newRelativePath] = newAbsolutePath;
                delete imgRelativePathToID[relativePath];
                delete imgRelativeToAbsolute[relativePath];
                delete imgIDToRelativePath[oldImgID];

                let reg = new RegExp('(!\\[[^\\[\\]]*\\]\\()' + relativePath.replace(/\\/g, '\\\\') + '\\)', 'g')
                editor.setValue(editor.getValue().replace(reg, '$1' + newRelativePath + ')'));
                renameForm.classList.remove('show');
                window.popMessageShell(e, {
                    content: __('Operation Finished'),
                    type: 'success',
                    btnTip: 'check',
                    autoHide: true
                })
            }


        }
    })

    document.querySelector('#renameForm .button-close').addEventListener("click", e => {
        renameForm.classList.remove('show');
    })

    document.getElementById("container").addEventListener("click", e=> {
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
        if (e.ctrlKey) {
            $('[localImg]').unbind('click').click(e => {
                if (e.ctrlKey) {
                    renameImage(e.target.id)
                }
            })
        }
    }, true);
    document.getElementById("editor").addEventListener("click", e=> {
        if (e.ctrlKey) {
            $('span.cm-string.cm-url').unbind('click').click(e => {
                if (e.ctrlKey) {
                    const innerLink = e.target.innerText.replace(/^\((.*)\)$/, '$1');
                    if (innerLink.startsWith('http://') || innerLink.startsWith('https://'))
                        require('electron').shell.openItem(innerLink);
                    else
                        renameImage(innerLink)
                }
            })
        }
    }, true)

    window.addEventListener('resize', e=>{
        $('#right-panel .CodeMirror-vscrollbar div').height(document.getElementById('container-wrapper').scrollHeight);
    })

    let editordiv = document.querySelector('#editor');
    editordiv.addEventListener('keydown',(e)=>{
        if(e.ctrlKey){
            editordiv.classList.add('ctrl')
        }
    })
    editordiv.addEventListener('keyup',(e)=>{
        if(!e.ctrlKey){
           editordiv.classList.remove('ctrl')
        }
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
