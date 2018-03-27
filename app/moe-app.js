/*
 *  This file is part of Moeditor.
 *
 *  Copyright (c) 2016 Menci <huanghaorui301@gmail.com>
 *  Copyright (c) 2015 Thomas Brouard (for codes from Abricotine)
 *  Copyright (c) 2016 lucaschimweg
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

global.log4js = require('log4js');
const MoeditorWindow = require('./moe-window'),
    MoeditorAction = require('./moe-action'),
    MoeditorFile = require('./moe-file'),
    shortcut = require('electron-localshortcut'),
    MoeditorLocale = require('./moe-l10n'),
    MoeditorAbout = require('./moe-about'),
    MoeditorSettings = require('./moe-settings'),
    fs = require('fs'),
    path = require('path');

let shellServer = false;
let uploadServer = false;

class MoeditorApplication {
    constructor() {
        this.windows = new Array();
        this.hexoWindow = null;

        global.appDataPath = path.join(require('os').homedir(),'Documents','HexoEditor');
        log4js.configure({
            appenders: {
                out: {type: 'stdout', level: 'all'},//设置是否在控制台打印日志
                debugs: {type: 'file', filename: path.join(appDataPath,'logs','debug.log'), level: 'debug',maxLogSize: 1024*1024*5},
                infos: {type: 'file', filename: path.join(appDataPath,'logs','log.log'), level: 'debug',maxLogSize: 1024*1024*5},
                errors: { type: 'file', filename: path.join(appDataPath,'logs','error.log') ,maxLogSize: 1024*1024*2},
                debug: { type: 'logLevelFilter', appender: 'debugs', level: 'debug' },
                info: { type: 'logLevelFilter', appender: 'infos', level: 'info' },
                error: { type: 'logLevelFilter', appender: 'errors', level: 'error' }
            },
            categories: {
                default: {appenders: ['out', 'info', 'debug','error'], level: 'debug'}
            }
        })
        global.log = log4js.getLogger('log');
    }

    open(fileName, defName) {
        if (typeof fileName === 'undefined') {
            this.windows.push(new MoeditorWindow(process.cwd(), defName));
        } else {
            this.windows.push(new MoeditorWindow(fileName, defName));
        }
    }

    getShellServer() {
        if (!shellServer){
            log.info('create shellServer');
            shellServer = new (require('./tool/hexo-shell'))();
        }
        return shellServer;
    }

    getUploadServer() {
        if (!uploadServer) {
            log.info('create uploadServer');
            uploadServer = new (require('./tool/hexo-uploadServer'))();
        }
        return uploadServer;
    }

    run() {
        global.Const = require('./moe-const');

        app.setName(Const.name);

        const Configstore = require('configstore');
        this.config = new Configstore(Const.name, require('./moe-config-default'));
        this.Const = Const;

        this.locale = new MoeditorLocale();
        global.__ = str => this.locale.get(str);
        this.flag = new Object();
        moeApp.appDataPath = appDataPath;


        const a = process.argv;
        if (a[0].endsWith('electron') && a[1] == '.') a.shift(), a.shift();
        else a.shift();
        var docs = a.filter((s) => {
            if (s == '--debug') moeApp.flag.debug = true;
            else if (s == '--about') moeApp.flag.about = true;
            else if (s == '--settings') moeApp.flag.settings = true;

            try {
                return s.substring(0, 2) !== '--' && (MoeditorFile.isTextFile(s) || MoeditorFile.isDirectory(s));
            } catch (e) {
                return false;
            }
        });

        if (moeApp.flag.about) {
            MoeditorAbout();
            return;
        }

        if (moeApp.flag.settings) {
            this.listenSettingChanges();
            MoeditorSettings();
            return;
        }

        if (typeof this.osxOpenFile === 'string') docs.push(this.osxOpenFile);

        if (docs.length == 0) this.open();
        else for (var i = 0; i < docs.length; i++) {
            docs[i] = path.resolve(docs[i]);
            this.addRecentDocument(docs[i]);
            this.open(docs[i]);
        }

        if (process.platform === 'darwin') this.registerAppMenu();
        else this.registerShortcuts();

        this.listenSettingChanges();
    }

    registerAppMenu() {
        require('./moe-menu')(
            {
                fileNew: (hexoWindow) => {
                    MoeditorAction.openNew();
                },
                fileNewHexo: (hexoWindow) => {
                    MoeditorAction.openNewHexo();
                },
                fileOpen: (hexoWindow) => {
                    MoeditorAction.open();
                },
                fileSave: (hexoWindow) => {
                    MoeditorAction.save(hexoWindow);
                },
                fileSaveAs: (hexoWindow) => {
                    MoeditorAction.saveAs(hexoWindow);
                },
                fileExportHTML: (hexoWindow) => {
                    hexoWindow.webContents.send('action-export-html');
                },
                fileExportPDF: (hexoWindow) => {
                    hexoWindow.webContents.send('action-export-pdf');
                },
                modeToRead: (hexoWindow) => {
                    hexoWindow.webContents.send('change-edit-mode', 'read');
                },
                modeToWrite: (hexoWindow) => {
                    hexoWindow.webContents.send('change-edit-mode', 'write');
                },
                modeToPreview: (hexoWindow) => {
                    hexoWindow.webContents.send('change-edit-mode', 'preview');
                },
                about: (hexoWindow) => {
                    MoeditorAbout();
                },
                settings: (hexoWindow) => {
                    MoeditorSettings();
                }
            }
        );
    }

    registerShortcuts() {
        shortcut.register('CmdOrCtrl + N', () => {
            MoeditorAction.openNew();
        });

        shortcut.register('CmdOrCtrl + H', () => {
            MoeditorAction.openNewHexo();
        });

        shortcut.register('CmdOrCtrl + O', () => {
            MoeditorAction.open();
        });

        shortcut.register('CmdOrCtrl + S', () => {
            MoeditorAction.save();
        });

        shortcut.register('CmdOrCtrl + Shift + S', () => {
            MoeditorAction.saveAs();
        });

        shortcut.register('CmdOrCtrl + R', () => {
            let hexoWindow = require('electron').BrowserWindow.getFocusedWindow();
            if (hexoWindow) hexoWindow.webContents.send('change-edit-mode', 'read');
        });

        shortcut.register('CmdOrCtrl + W', () => {
            let hexoWindow = require('electron').BrowserWindow.getFocusedWindow();
            if (hexoWindow) hexoWindow.webContents.send('change-edit-mode', 'write');
        });

        shortcut.register('CmdOrCtrl + P', () => {
            let hexoWindow = require('electron').BrowserWindow.getFocusedWindow();
            if (hexoWindow) hexoWindow.webContents.send('change-edit-mode', 'preview');
        });

        shortcut.register('Alt + C', () => {
            let hexoWindow = require('electron').BrowserWindow.getFocusedWindow();
            if (hexoWindow) hexoWindow.webContents.send('change-edit-mode', 'changepreview');
        });

        shortcut.register('CmdOrCtrl + Alt + Shift + R', () => {
            hexoWindow.reload();
        });

        shortcut.register('CmdOrCtrl + Alt + S', () => {
            MoeditorSettings();
        });

        shortcut.register('CmdOrCtrl + Alt + Shift + F12', () => {
            let hexoWindow = require('electron').BrowserWindow.getFocusedWindow();
            hexoWindow.webContents.openDevTools();
        });
    }

    listenSettingChanges() {
        const ipcMain = require('electron').ipcMain;
        ipcMain.on('setting-changed', (e, arg) => {
            for (const window of require('electron').BrowserWindow.getAllWindows()) {
                window.webContents.send('setting-changed', arg);
            }
        });
    }

    addRecentDocument(path) {
        app.addRecentDocument(path);
    }

    getHighlightThemesDir() {
        const currTheme = this.config.get('render-theme')
        let themedir = 'github'
        if (!(currTheme == '*GitHub' || currTheme == '*No Theme')) {
            if (currTheme.startsWith('*'))
                themedir = currTheme.slice(1).toLowerCase();
            else
                themedir = currTheme.toLowerCase();
        }
        themedir = path.join(moeApp.Const.path + '/views/highlightThemes/', themedir);
        return (fs.existsSync(themedir) ? themedir : '');
    }

    getHexo() {
        return this.hexo;
    }

    setHexo(hexo) {
        this.hexo = hexo;
    }
    getLog4js(){
        return log4js;
    }
}

MoeditorApplication.count = 0;

module.exports = MoeditorApplication;
