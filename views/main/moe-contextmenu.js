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

'use strict'


document.addEventListener('DOMContentLoaded', () => {
    const remote = require('electron').remote;
    const {Menu, MenuItem} = remote;

    const editor = document.getElementById('editor'), containerWrapper = document.getElementById('preview');
    let shellServer = moeApp.getShellServer();
    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (editor.contains(e.target) || containerWrapper.contains(e.target)) {
            const inEditor = editor.contains(e.target);
            // label: (moeApp.config.get('image-web-type')=='qiniu')? __('UploadToQiNiu'):((moeApp.config.get('image-web-type')=='cos')?__('UploadToCOS'):__('UploadToSMMS')),
            //     enabled: moeApp.config.get('image-web-type')&&!imgManager.isUploading,
            //     click(item, w) {
            //     !imgManager.uploadLocalSrc();
            // }
            let imageType = moeApp.config.get('image-web-type');
            let imageMenuLable = '';
            let imageMenuEnable = true;
            if ( imageType=='qiniu') {
                imageMenuLable =  __('UploadToQiNiu');
                imageMenuEnable = !moeApp.getUploadServer().isLoading() && !!moeApp.config.get('image-qiniu-url')
            }else
            if ( imageType=='cos') {
                imageMenuLable = __('UploadToCOS');
                imageMenuEnable = !moeApp.getUploadServer().isLoading() && !!moeApp.config.get('image-cos-url')
            }else {
                imageMenuLable = __('UploadToSMMS');
                imageMenuEnable = !moeApp.getUploadServer().isLoading()
            }

            const template = [
                {
                    label: __('Undo'),
                    enabled: window.editor.doc.historySize().undo !== 0,
                    click(item, w) {
                        window.editor.undo();
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: __('Cut'),
                    enabled: inEditor && window.editor.doc.somethingSelected(),
                    role: inEditor && window.editor.doc.somethingSelected() ? 'cut' : ''
                },
                {
                    label: __('Copy'),
                    enabled: inEditor ? window.editor.doc.somethingSelected() : (document.getSelection().type === 'Range'),
                    role: (inEditor ? window.editor.doc.somethingSelected() : (document.getSelection().type === 'Range')) ? 'copy' : ''
                },
                {
                    label: __('Paste'),
                    enabled: inEditor && (require('electron').clipboard.readText().length !== 0 ||
                        !clipboard.readImage().isEmpty()),
                    click(item, w) {
                        window.editor.execCommand('pasteContent')
                    }
                },
                {
                    label: __('Delete'),
                    enabled: inEditor && window.editor.doc.somethingSelected(),
                    click(item, w) {
                        hexoWindow.window.webContents.sendInputEvent({type: 'keyDown', modifiers: [], keyCode: 'Delete'});
                        hexoWindow.window.webContents.sendInputEvent({type: 'keyUp', modifiers: [], keyCode: 'Delete'});
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: __('Select All'),
                    click(item, w) {
                        if (inEditor) {
                            window.editor.execCommand('selectAll');
                        } else {
                            let sel = window.getSelection();
                            let rg = document.createRange();
                            rg.selectNodeContents(containerWrapper);
                            sel.removeAllRanges();
                            sel.addRange(rg);
                        }
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: __('Show Number'),
                    type: 'checkbox',
                    checked: window.editor.getOption('lineNumbers'),
                    click(item, w) {
                        let editor = document.querySelector('#editor');
                        if (item.checked) {
                            editor.classList.add('gutter');
                        } else {
                            editor.classList.remove('gutter')
                        }
                        window.editor.setOption('lineNumbers', item.checked);
                        window.editor.refresh();
                    }
                },
                {
                    label: __('Scroll Sync'),
                    type: 'checkbox',
                    checked: window.scrollTogether,
                    click(item, w) {
                        window.scrollTogether = !window.scrollTogether;
                    }
                },
                {
                    type: 'separator',
                },
                {
                    label: imageMenuLable,
                    enabled: imageMenuEnable,
                    click(item, w) {
                        imgManager.uploadLocalSrc();
                    }
                },
                {
                    label: __('UndoUpload'),
                    visible: imgManager.hasUploadFile(),
                    click(item, w) {
                        imgManager.abortUploading();
                    }
                },
                {
                    label: __('Quick Open'),
                    submenu: [
                        {
                            label: __('OpenPathPost'),
                            enabled: !!hexoWindow.fileName ,
                            click(item, w) {
                                const shell = require('electron').shell;
                                shell.showItemInFolder(hexoWindow.fileName)
                            }
                        },
                        {
                            label: __('OpenPathPostSrc'),
                            enabled: !!(imgManager && imgManager.imgBaseDir),
                            click(item, w) {
                                const shell = require('electron').shell;
                                let dir = path.join(imgManager.imgPathDir);
                                if (fs.existsSync(dir))
                                    shell.showItemInFolder(path.join(dir, '*'));
                                else
                                    shell.showItemInFolder(dir);
                            }
                        },
                        {
                            label: __('OpenPathSrcCenter'),
                            enabled: !!(imgManager && imgManager.imgBaseDir),
                            click(item, w) {
                                const shell = require('electron').shell;
                                shell.showItemInFolder(path.join(imgManager.imgBaseDir, '*'))
                            }
                        },
                        {
                            label: __('OpenPathHEXO'),
                            enabled: moeApp.useHexo,
                            click(item, w) {
                                const shell = require('electron').shell
                                shell.showItemInFolder(path.join(hexo.config.__basedir, '*'))
                            }
                        },
                        {
                            type: 'separator',
                        },
                        {
                            label: __('WebIndex'),
                            enabled: moeApp.useHexo && (!!hexo.config.url),
                            click(item, w) {
                                const shell = require('electron').shell;
                                let weburl = hexo.config.url;
                                weburl = (weburl.startsWith('http://') || weburl.startsWith('https://') ? weburl : 'http://' + weburl);
                                weburl = url.parse(weburl);
                                weburl.path = hexo.config.root || '/';
                                shell.openExternal(weburl.href);
                            }
                        },
                        {
                            label: __('WebLocalIndex'),
                            enabled: moeApp.useHexo && (shellServer.shellProcess != null),
                            click(item, w) {
                                const shell = require('electron').shell;
                                let weburl = url.parse('http://localhost:4000');
                                weburl.hostname = moeApp.hexo.config.server.ip || 'localhost';
                                weburl.port = moeApp.hexo.config.server.port || 4000;
                                shell.openExternal(weburl.href);
                            }
                        },
                        {
                            label: __('WebQiNiuSource'),
                            click(item, w) {
                                const shell = require('electron').shell;
                                shell.openExternal(`https://portal.qiniu.com/bucket/${moeApp.config.get('image-qiniu-bucket')}/resource`)
                            }
                        },
                        {
                            label: __('WebCOSSource'),
                            click(item, w) {
                                const shell = require('electron').shell;
                                let bucketObj = moeApp.config.get('image-cos-bucket');
                                bucketObj = (bucketObj||"|").split('|');
                                shell.openExternal(`https://console.cloud.tencent.com/cos5/bucket/setting?type=filelist&bucketName=${bucketObj[0]}&path=&region=${bucketObj[1]}`)
                            }
                        },
                        {
                            label: __('WebSMMS'),
                            click(item, w) {
                                const shell = require('electron').shell;
                                shell.openExternal(`https://sm.ms/`)
                            }
                        }
                    ]
                },
                {
                    type: moeApp.useHexo ? 'separator' : 'normal',
                    visible: moeApp.useHexo,
                },
                {
                    label: "Hexo",
                    visible: moeApp.useHexo,
                    enabled: !shellServer.processRunning(),
                    click(item, w) {
                        const shell = require('electron').shell
                        shell.showItemInFolder(path.join(hexo.config.__basedir, '*'))
                    },
                    submenu: [
                        {
                            label: __('File Rename'),
                            click(item, w) {
                                window.changeFileName(true);
                            }
                        },
                        {
                            label: __('HEXOQuickPublish'),
                            click(item, w) {
                                shellServer.generalAndDeploy();
                            }
                        },
                        {
                            type: 'separator'
                        },
                        {
                            label: __('HEXOServer'),
                            click(item, w) {
                                shellServer.server();
                            }
                        },
                        {
                            label: __('HEXOClean'),
                            click(item, w) {
                                shellServer.clean();
                            }
                        },
                        {
                            label: __('HEXOGenerate'),
                            click(item, w) {
                                shellServer.general();
                            }
                        },
                        {
                            label: __('HEXODeploy'),
                            click(item, w) {
                                shellServer.deploy();
                            }
                        },
                        {
                            label: __('HEXOKillPort'),
                            click(item, w) {
                                shellServer.stopServerForce();
                            }
                        }
                    ]
                }
            ];
            Menu.buildFromTemplate(template).popup(remote.getCurrentWindow());
        }
    });
});
