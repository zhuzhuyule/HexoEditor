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
window.hexoWindow = moeApp.hexoWindow;
window.clipboard = require('electron').clipboard;
window.fs = require('fs');
window.path = require('path');
window.url = require('url');
global.log4js = window.log4js = moeApp.getLog4js();
global.log = window.log = log4js.getLogger('Front');

$(() => {
    console.log("%cHexoEditor%c\n\
  by zhuzhuyule\n\
  A markdown editor for hexo.\n\n\
  Copyright © 2018-2018\n\
  https://github.com/zhuzhuyule/HexoEditor\n","font-size:68px;color:#3b3e43","font-size:12px;color:rgba(0,0,0,0.38);");
    const dialog = require('electron').remote.dialog;
    const YMAL = require('yamljs');

    const MoeditorPreview = require('./moe-preview');

    if (hexoWindow.fileName !== '') {
        document.getElementsByTagName('title')[0].innerText = 'HexoEditor - ' + path.basename(hexoWindow.fileName);
    }
    document.querySelector('#editor textarea').innerText = hexoWindow.content;

    window.editor = require('./CodeMirror/editor');

    const scroll = require('./moe-scroll');
    window.updatePreview = (force) => {
        MoeditorPreview(editor, force, () => {
            scroll();
        });
    };

    let debounceTimeout = 0;
    let debounceStartTime = 0;
    window.debounce = (func, wait, mustRun) => {
        clearTimeout(debounceTimeout);
        let curTime = new Date();
        if (curTime - debounceStartTime >= mustRun) {
            func();
            debounceTimeout = 0;
            debounceStartTime = curTime;
        } else {
            debounceTimeout = setTimeout(() => {
                func();
                debounceTimeout = 0;
                debounceStartTime = curTime
            }, wait);
        }
    };

    editor.on('change', () => {
        debounce(() => {
            window.updatePreview(false)
        }, 150, 500);
    });

    editor.on('blur', () => {
        if (hexoWindow.fileName === '') return;
        window.changeFileName(false);
        window.autoSave();
    });

    setTimeout(() => {
        window.updatePreview(true);
    }, 0);

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

    const containerWrapper = document.getElementById('preview');
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

    if (moeApp.config.get('focus-mode') === true) document.getElementById('editor').classList.add('focus');
    document.getElementById('button-bottom-focus').addEventListener('click', function () {
        document.getElementById('editor').classList.toggle('focus');
        moeApp.config.set('focus-mode', document.getElementById('editor').classList.contains('focus'));
    });

    require('electron').ipcRenderer.on('set-title', (e, fileName) => {
        document.getElementsByTagName('title')[0].innerText = 'HexoEditor - ' + path.basename(fileName);
    });

    //加载填图功能
    const ImgManager = require('./hexo-image');
    window.imgManager = new ImgManager(hexo.filename)

    //加载设置
    require('./moe-settings');

    hexoWindow.window.show();

    //Mac 下应该做的改变
    if(process.platform == 'darwin'){
        document.querySelectorAll('#side-menu li[title],#cover-bottom-right>div[exdata]').forEach(
            function (item) {
                let value = item.getAttribute('title');
                if (/^Ctrl(.*)$/.test(value)) {
                    value = value.replace(/^Ctrl(.*)$/,'Cmd$1');
                    item.setAttribute('title',value);
                }

                if(item.hasAttribute('exdata')){
                    value = item.getAttribute('title');
                    if (/\(Ctrl\+/.test(value)) {
                        value = value.replace(/\(Ctrl\+/,'(Cmd+');
                        item.setAttribute('title',value);
                    }
                }
            }
        )
    }


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
            $(this).find('.CodeMirror-vscrollbar').removeClass('hoverScroll');
        }
    )

    document.querySelectorAll('.CodeMirror-vscrollbar').forEach(
        function (item) {
            item.addEventListener("transitionend", function (e) {
                $('.scrolling').removeClass('scrolling');
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



     window.changeFileName = (force) => {
        if (!force && hexoWindow.defName !== hexoWindow.fileName)
            return;

        let title, nameNew;
        let nameOld = path.basename(hexoWindow.fileName, path.extname(hexoWindow.fileName));

        hexoWindow.content.replace(/^---+([\w\W]+?)---+/, function () {
            title = YMAL.parse(arguments[1]).title;
            return '';
        });

        try {
            nameNew = title.toString().replace(/[ \\\/:\*\?"<>\|]+/g, '-');
            if (nameNew !== nameOld){
                let dir = path.dirname(hexoWindow.fileName);
                let ext = path.extname(hexoWindow.fileName);
                let count = -1,fileNameNew,imgPathNew,tmpName;
                do {
                    count++;
                    tmpName = nameNew + (count > 0 ? count : '');
                    if (tmpName == nameOld)
                        return;
                    fileNameNew = path.resolve(dir, tmpName + ext);
                    imgPathNew = path.join(imgManager.imgBaseDir,tmpName);
                    if (count > 50) {
                        return;
                    }
                } while (fs.existsSync(fileNameNew)||fs.existsSync(imgPathNew))
                nameNew = tmpName;
                fs.renameSync(hexoWindow.fileName, fileNameNew);
                hexoWindow.fileName = fileNameNew;
                hexoWindow.changed = true;
                hexoWindow.window.setRepresentedFilename(fileNameNew);
                document.getElementsByTagName('title')[0].innerText = 'HexoEditor - ' + nameNew + ext;

                //修改文章中的Image链接
                let imgPathOld = path.join(imgManager.imgBaseDir,nameOld).replace(/\\/g,'/');
                if (fs.existsSync(imgPathOld)) {
                    let content = editor.getValue();
                    imgPathNew = imgPathNew.replace(/\\/g,'/');
                    fs.rename(imgPathOld, imgPathNew, err => {
                        if (err) log.error(err);
                        fs.stat(imgPathNew, (err, stats) => {
                            if (err) console.error(err);
                            let relativePathOld = imgManager.relativePath(imgPathOld);
                            let relativePathNew = imgManager.relativePath(imgPathNew);
                            content = content.replace(new RegExp('\\]\\(' + relativePathOld + '\/', 'g'), '](' + relativePathNew + '/');
                            editor.setValue(content)
                            imgManager.renameDirPath(nameNew);
                        })
                    })
                } else {
                    // TODO-ly 解决图片路径不对的问题
                    if(nameNew !== imgManager.postName)
                        imgManager.renameDirPath(nameNew);
                }
            }
            if (force) {
                const MoeditorAction = require('electron').remote.require('./moe-action');
                MoeditorAction.save(hexoWindow.window);
            }
        } catch (e) {
            console.log(e);
        }
    }

    window.autoSave = () => {
        const option = moeApp.config.get('auto-save');
        if (option === 'auto' && hexoWindow.content !== hexoWindow.fileContent) {
            const MoeditorAction = require('electron').remote.require('./moe-action');
            MoeditorAction.save(hexoWindow.window);
        }
    }

    let renameForm = document.querySelector('#renameForm');
    window.renameImage = (relativePath) => {
        renameForm.setAttribute('path', relativePath);
        renameForm.querySelector('input').setAttribute('placeholder', path.basename(relativePath))
        renameForm.querySelector('input').value = '';
        renameForm.classList.add('show');
    }

    document.querySelector('#renameForm .button-check').addEventListener("click", e => {
        let relativePath = renameForm.getAttribute('path');
        let absolutePath = imgManager.resolvePath(relativePath);
        if (fs.existsSync(absolutePath)) {
            let newName = renameForm.querySelector('input').value;
            const ext = path.extname(relativePath);
            if (ext !== path.extname(newName))
                newName += ext;

            const newAbsolutePath = path.join(path.dirname(absolutePath), newName).replace(/\\/g, '/');
            const newRelativePath = imgManager.relativePath(newAbsolutePath);

            if (fs.existsSync(newAbsolutePath)) {
                window.popMessageShell(e, {
                    content: 'FileExist',
                    type: 'danger',
                    autoHide: true
                })
                renameForm.querySelector('input').select();
            } else {
                //重名文件名
                fs.renameSync(absolutePath, newAbsolutePath);
                //替换原内容
                let reg = new RegExp('(!\\[[^\\[\\]]*\\]\\()' + relativePath.replace(/\\/g, '/') + '\\)', 'g')
                hexoWindow.content = editor.getValue().replace(reg, '$1' + newRelativePath + ')');
                editor.setValue(hexoWindow.content);
                hexoWindow.changed = false;
                //更新字典
                imgManager.renameImage(path.basename(relativePath),newName);
                //更新结果提示
                renameForm.classList.remove('show');
                window.popMessageShell(e, {
                    content: __('Operation Finished'),
                    type: 'success',
                    btnTip: 'check',
                    autoHide: true
                });
            }
        }
    })

    document.querySelector('#renameForm .button-close').addEventListener("click", e => {
        renameForm.classList.remove('show');
    })

    document.getElementById("container").addEventListener("click", e => {
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
    document.getElementById("editor").addEventListener("click", e => {
        // TODO-ly 判断按下的按键
        if ( (process.platform === 'darwin' ? e.metaKey : e.ctrlKey)  ) {
            $('span.cm-string.cm-url').unbind('click').click(e => {
                if ( (process.platform === 'darwin' ? e.metaKey : e.ctrlKey) ) {
                    e.stopPropagation();
                    // e.defaultPrevented();
                    const innerLink = e.target.innerText.replace(/^\((.*)\)$/, '$1');
                    if (innerLink.startsWith('http://') || innerLink.startsWith('https://'))
                        require('electron').shell.openItem(innerLink);
                    else
                        renameImage(innerLink)
                }
            })
        }
    }, true)

    window.addEventListener('resize', e => {
        $('#right-panel .CodeMirror-vscrollbar div').height(document.getElementById('preview').scrollHeight);
    })

    let editordiv = document.querySelector('#editor');
    editordiv.addEventListener('keydown', (e) => {
        if (e.ctrlKey) {
            editordiv.classList.add('ctrl')
        }
    })
    editordiv.addEventListener('keyup', (e) => {
        if (!e.ctrlKey) {
            editordiv.classList.remove('ctrl')
        }
    })
    function bindDrag(element) {
        element.ondragover = () => {
            return false;
        }
        element.ondragleave = element.ondragend = () => {
            return false;
        }
        element.ondrop = (e) => {
            e.stopPropagation()
            e.preventDefault()
            for (let f of e.dataTransfer.files) {
                replaceImgSelection(editor, (editor.getSelection() || ''),imgManager.getImageOfFile(f));
            }
            return false;
        }
    }
    bindDrag(document);
    bindDrag(editordiv);

    window.onfocus = (e) => {
        if (hexoWindow.fileName === '' || !fs.existsSync(hexoWindow.fileName))
            return;
        fs.readFile(hexoWindow.fileName,"utf8", (err, res) => {
            if (err) {
                hexoWindow.changed = true;
                hexoWindow.window.setDocumentEdited(true);
                return;
            }
            let content = res.toString();
            if (content !== hexoWindow.fileContent) {
                let flag = false;
                const option = moeApp.config.get('auto-reload');
                if (option === 'auto') flag = true;
                else if (option === 'never') flag = false;
                else {
                    flag = dialog.showMessageBox(
                        hexoWindow.window,
                        {
                            type: 'question',
                            buttons: [__("Yes"), __("No")],
                            title: __("Confirm"),
                            cancelId: -1,
                            message: __("File changed by another program, reload?")
                        }
                    ) === 0;
                }

                if (!flag) {
                    hexoWindow.changed = true;
                    hexoWindow.fileContent = content;
                    hexoWindow.window.setDocumentEdited(true);
                    return;
                }
                hexoWindow.fileContent = hexoWindow.content = content;

                let pos = window.editor.getCursor();
                let editorScroll = document.querySelector('.CodeMirror-vscrollbar');
                let scrollpos = editorScroll.scrollTop;
                window.editor.setValue(content);
                window.editor.setCursor(pos);

                if (scrollpos > 0)
                    editorScroll.scrollTop = scrollpos;

                hexoWindow.changed = false;
                hexoWindow.window.setDocumentEdited(false);
                window.updatePreview(true);
            }
        });
    };
});
