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

let shellServer = moeApp.shellServer;

document.addEventListener('DOMContentLoaded', () => {
    const remote = require('electron').remote;
    const {Menu, MenuItem} = remote;

    const editor = document.getElementById('editor'), containerWrapper = document.getElementById('preview');

    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (editor.contains(e.target) || containerWrapper.contains(e.target)) {
            const inEditor = editor.contains(e.target);
            const template = [
                {
                    label: __('Undo'),
                    enabled: window.editor.doc.historySize().undo !== 0,
                    click(item, hexoWindow) {
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
                    enabled: inEditor && (require('electron').clipboard.readText().length !== 0||
                        !clipboard.readImage().isEmpty()),
                    click(item, hexoWindow){
                        pasteData();
                    }
                },
                {
                    label: __('Delete'),
                    enabled: inEditor && window.editor.doc.somethingSelected(),
                    click(item, hexoWindow) {
                        hexoWindow.webContents.sendInputEvent({ type: 'keyDown', modifiers: [], keyCode: 'Delete' });
                        hexoWindow.webContents.sendInputEvent({ type: 'keyUp', modifiers: [], keyCode: 'Delete' });
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: __('Select All'),
                    click(item, hexoWindow) {
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
                    click(item, hexoWindow) {
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
                    click(item, hexoWindow) {
                        window.scrollTogether = !window.scrollTogether;
                    }
                },
                {
                    type: moeApp.useHexo ?  'separator' :'normal',
                    visible: moeApp.useHexo,
                },
                {
                    label: "HEXO",
                    visible: moeApp.useHexo,
                    enabled: !shellServer.processRunning(),
                    click(item, hexoWindow) {
                        const shell = require('electron').shell
                        shell.showItemInFolder(path.join(hexo.config.__basedir, '*'))
                    },
                    submenu: [
                        {
                            label: __('File Rename'),
                            click(item, hexoWindow) {
                                window.changeFileName(true);
                            }
                        },
                        {
                            label: __('HEXOOpenPath'),
                            click(item, hexoWindow) {
                                const shell = require('electron').shell
                                shell.showItemInFolder(path.join(hexo.config.__basedir, '*'))
                            }
                        },
                        {
                            label: __('HEXOQuickPublish'),
                            click(item, hexoWindow) {
                                shellServer.generalAndDeploy();
                            }
                        },
                        {
                            type: 'separator'
                        },
                        {
                            label: __('HEXOServer'),
                            click(item, hexoWindow) {
                                shellServer.server();
                            }
                        },
                        {
                            label: __('HEXOClean'),
                            click(item, hexoWindow) {
                                shellServer.clean();
                            }
                        },
                        {
                            label: __('HEXOGenerate'),
                            click(item, hexoWindow) {
                                shellServer.general();
                            }
                        },
                        {
                            label: __('HEXODeploy'),
                            click(item, hexoWindow) {
                                shellServer.deploy();
                            }
                        },
                        {
                            label: __('HEXOKillPort'),
                            click(item, hexoWindow) {
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
