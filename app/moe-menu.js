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

module.exports = (cb) => {
    let template = [
        {
            localize() { this.label = __('File'); },
            submenu: [
                {
                    localize() { this.label = __('New'); },
                    accelerator: 'CmdOrCtrl+N',
                    click(item, hexoWindow) {
                        cb.fileNew(hexoWindow);
                    }
                },
                {
                    localize() { this.label = __('New Post'); },
                    accelerator: 'CmdOrCtrl+H',
                    click(item, hexoWindow) {
                        cb.fileNewHexo(hexoWindow);
                    }
                },
                {
                    localize() { this.label = __('Open') + '...'; },
                    accelerator: 'CmdOrCtrl+O',
                    click(item, hexoWindow) {
                        cb.fileOpen(hexoWindow);
                    }
                },
                {
                    type: 'separator'
                },
                {
                    localize() { this.label = __('Save'); },
                    accelerator: 'CmdOrCtrl+S',
                    click(item, hexoWindow) {
                        cb.fileSave(hexoWindow);
                    }
                },{
                    localize() { this.label = __('Save as'); },
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click(item, hexoWindow) {
                        cb.fileSaveAs(hexoWindow);
                    }
                },{
                    type: 'separator'
                },{
                    localize() { this.label = __('Export'); },
                    submenu: [
                        {
                            localize() { this.label = 'HTML...'; },
                            // accelerator: 'CmdOrCtrl+Shift+E',
                            click(item, hexoWindow) {
                                cb.fileExportHTML(hexoWindow);
                            }
                        }, {
                            localize() { this.label = 'PDF...'; },
                            // accelerator: 'CmdOrCtrl+Shift+P',
                            click(item, hexoWindow) {
                                cb.fileExportPDF(hexoWindow);
                            }
                        }
                    ]
                }
            ]
        },
        {
            localize() { this.label = __('Edit'); },
            submenu: [
                {
                    localize() { this.label = __('Undo'); },
                    role: 'undo'
                },
                {
                    localize() { this.label = __('Redo'); },
                    role: 'redo'
                },
                {
                    type: 'separator'
                },
                {
                    localize() { this.label = __('Cut'); },
                    role: 'cut'
                },
                {
                    localize() { this.label = __('Copy'); },
                    role: 'copy'
                },
                {
                    localize() { this.label = __('Paste'); },
                    role: 'paste'
                },
                {
                    localize() { this.label = __('Delete'); },
                    role: 'delete'
                },
                {
                    localize() { this.label = __('Select All'); },
                    role: 'selectall'
                },
                {
                    type: 'separator'
                },
                {
                    localize() { this.label = __('Mode'); },
                    submenu: [
                        {
                            localize() { this.label = __('Read Mode'); },
                            accelerator: 'CmdOrCtrl+Shift+R',
                            click(item, focusedWindow) {
                                if (focusedWindow) cb.modeToRead(focusedWindow);
                            }
                        },
                        {
                            localize() { this.label = __('Write Mode'); },
                            accelerator: 'CmdOrCtrl+Shift+G',
                            click(item, focusedWindow) {
                                if (focusedWindow) cb.modeToWrite(focusedWindow);
                            }
                        },
                        {
                            localize() { this.label = __('Preview Mode'); },
                            // accelerator: 'CmdOrCtrl+Shift+P', // It's been used for `Export PDF`.
                            click(item, focusedWindow) {
                                if (focusedWindow) cb.modeToPreview(focusedWindow);
                            }
                        }
                    ]
                }
            ]
        },
        {
            localize() { this.label = __('View'); },
            role: 'view',
            submenu: [
                {
                    role: 'togglefullscreen'
                },
                {
                    localize() { this.label = __('Toggle Developer Tools'); },
                    accelerator: process.platform === 'darwin' ? 'Alt+CmdOrCtrl+I' : 'Ctrl+Shift+I',
                    click(item, focusedWindow) {
                        if (focusedWindow)
                        focusedWindow.webContents.toggleDevTools();
                    }
                },
            ]
        },
        {
            localize() { this.label = __('Window'); },
            role: 'window',
            submenu: [
                {
                    localize() { this.label = __('Close'); },
                    // accelerator: 'CmdOrCtrl+W',
                    role: 'close'
                },
                {
                    localize() { this.label = __('Minimize'); },
                    accelerator: 'CmdOrCtrl+M',
                    role: 'minimize'
                },
                {
                    localize() { this.label = __('Zoom'); },
                    role: 'zoom'
                },
                {
                    type: 'separator'
                },
                {
                    localize() { this.label = __('Bring All to Front'); },
                    role: 'front'
                }
            ]
        },
        {
            localize() { this.label = __('Help'); },
            role: 'help',
            submenu: [
                {
                    localize() { this.label = 'HexoEditor on GitHub'; },
                    click() { require('electron').shell.openExternal('https://github.com/zhuzhuyule/HexoEditor'); }
                },
            ]
        },
    ];

    if (process.platform === 'darwin') {
        const name = Const.name;
        template.unshift({
            label: name,
            submenu: [
                {
                    localize() { this.label = __('About') + ' HexoEditor'; },
                    click() {
                        cb.about();
                    }
                },
                {
                    type: 'separator'
                },
                {
                    localize() { this.label = __('Preference') + '...'; },
                    accelerator: 'CmdOrCtrl+,',
                    click() {
                        cb.settings();
                    }
                },
                {
                    type: 'separator'
                },
                {
                    role: 'services',
                    localize() { this.label = __('Services'); },
                    submenu: []
                },
                {
                    type: 'separator'
                },
                {
                    localize() { this.label = __('Hide') + ' HexoEditor'; },
                    role: 'hide'
                },
                {
                    localize() { this.label = __('Hide Others'); },
                    role: 'hideothers'
                },
                {
                    localize() { this.label = __('Show All'); },
                    role: 'unhide'
                },
                {
                    type: 'separator'
                },
                {
                    localize() { this.label = __('Quit') + ' HexoEditor'; },
                    role: 'quit'
                },
            ]
        });
    }

    function localizeMenu(obj) {
        if (obj == null || typeof obj !== 'object') return;
        if (typeof obj.localize === 'function') obj.localize();
        if (Object.getOwnPropertyNames(obj).length > 0) for (const key in obj) localizeMenu(obj[key]);
    }
    localizeMenu(template);

    const {Menu, MenuItem, ipcMain} = require('electron');
    let menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    ipcMain.on('setting-changed', (e, arg) => {
        if (arg.key === 'locale') {
            localizeMenu(template);
            menu = Menu.buildFromTemplate(template);
            Menu.setApplicationMenu(menu);
        }
    });
};
