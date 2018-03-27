/*
 *  This file is part of Moeditor.
 *
 *  Copyright (c) 2016 Menci <huanghaorui301@gmail.com>
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

const {dialog} = require('electron'),
    MoeditorFile = require('./moe-file'),
    log = log4js.getLogger('action.js'),
    moment = require('moment'),
    fs = require('fs'),
    path = require('path');

let lastDir = '';

class MoeditorAction {
    static openNew() {
        let windows = require('electron').BrowserWindow.getAllWindows();
        let hexoWindow, i;
        for (i = windows.length - 1; i > -1; i--) {
            hexoWindow = windows[i];
            if (hexoWindow.hexoeditorWindow && hexoWindow.hexoeditorWindow.content.length < 1 &&!hexoWindow.hexoeditorWindow.changed) {
                hexoWindow.focus();
                break;
            }
        }
        if (i < 0)
            moeApp.open();
    }

    static openNewHexo() {
        let notOpened = false;
        try {
            let hexoDir = moeApp.config.get('hexo-root-dir');
            if( hexoDir && fs.existsSync(hexoDir)){
                let templateFile = path.resolve(hexoDir, 'scaffolds', 'post.md');
                let content = '' +
                    '---\n' +
                    'title: {{ title }}\n' +
                    'date: {{ date }}\n' +
                    'categories: \n' +
                    'tags: \n' +
                    '---';

                let fileDir = path.resolve(hexoDir, 'source', '_posts');
                if (fs.statSync(fileDir).isDirectory()) {
                    let nowDate, fileName, count = 0;
                    do {
                        nowDate = moment().format('YYYY-MM-DD HH:mm:ss');
                        if (count > 0)
                            nowDate = nowDate + count;
                        count += 1;
                        fileName = path.resolve(fileDir, nowDate.replace(/[-: ]/g, '') + '.md');
                        if (count > 50) {
                            break;
                        }
                    } while (fs.existsSync(fileName));
                    if (fs.existsSync(templateFile)) {
                        content = fs.readFileSync(templateFile).toString()
                            .replace(/title:\s+\{\{[^\}]+\}\}/, 'title: ' + nowDate.replace(/[-: ]/g, ''))
                            .replace(/date:\s+/, 'date: ' + nowDate)
                            .replace(/\{\{[^\}]+\}\}/g, '');
                    }

                    lastDir = fileDir;
                    MoeditorFile.write(fileName, content);
                    if (fs.existsSync(fileName)) {
                        let hexoWindow = require('electron').BrowserWindow.getFocusedWindow();
                        if (typeof hexoWindow.hexoeditorWindow == 'undefined' || hexoWindow.hexoeditorWindow.changed || hexoWindow.hexoeditorWindow.content) {
                            app.addRecentDocument(fileName);
                            moeApp.open(fileName,fileName);
                        } else {
                            hexoWindow.hexoeditorWindow.defName = fileName;
                            hexoWindow.hexoeditorWindow.fileName = fileName;
                            hexoWindow.hexoeditorWindow.directory = lastDir;
                            hexoWindow.hexoeditorWindow.fileContent = hexoWindow.hexoeditorWindow.content = MoeditorFile.read(fileName).toString();
                            hexoWindow.hexoeditorWindow.changed = false;
                            hexoWindow.hexoeditorWindow.window.setDocumentEdited(false);
                            hexoWindow.hexoeditorWindow.window.setRepresentedFilename(hexoWindow.hexoeditorWindow.fileName);
                            hexoWindow.hexoeditorWindow.window.webContents.send('refresh-editor', {});
                            app.addRecentDocument(fileName);
                        }
                        notOpened = false;
                    }
                }
            }
        } catch (e) {
            log.error(e)
        } finally {
            if (notOpened)
                moeApp.open();
        }
    }

    static open() {
        const files = dialog.showOpenDialog(
            {
                defaultPath: lastDir,
                properties: ['openFile'/*, 'multiSelections'*/],
                filters: [
                    {name: __("Markdown Documents"), extensions: ['md', 'mkd', 'markdown']},
                    {name: __("All Files"), extensions: ['*']}
                ]
            }
        );

        if (typeof files == 'undefined') return;
        let filename = files[0];
        if (filename) {
            let windows = require('electron').BrowserWindow.getAllWindows();
            let hexoWindow, i;
            for (i = windows.length - 1; i > -1; i--) {
                hexoWindow = windows[i];
                if (hexoWindow.hexoeditorWindow) {
                    if (hexoWindow.hexoeditorWindow.fileName == filename) {
                        hexoWindow.focus();
                        break;
                    } else if (hexoWindow.hexoeditorWindow.fileName == '' && !hexoWindow.hexoeditorWindow.changed) {
                        try {
                            hexoWindow.hexoeditorWindow.fileName = filename;
                            hexoWindow.hexoeditorWindow.directory = lastDir;
                            hexoWindow.hexoeditorWindow.fileContent = hexoWindow.hexoeditorWindow.content = MoeditorFile.read(filename).toString();
                            hexoWindow.hexoeditorWindow.changed = false;
                            hexoWindow.hexoeditorWindow.window.setDocumentEdited(false);
                            hexoWindow.hexoeditorWindow.window.setRepresentedFilename(hexoWindow.hexoeditorWindow.fileName);
                            hexoWindow.hexoeditorWindow.window.webContents.send('refresh-editor', {});
                            app.addRecentDocument(filename);
                            hexoWindow.focus();
                            break;
                        } catch (e) {
                            log.error(e);
                        }
                    }
                }
            }
            if (i < 0) {
                app.addRecentDocument(filename);
                moeApp.open(filename);
            }
        }
    }

    static save(hexoWindow) {
        if (typeof hexoWindow == 'undefined') hexoWindow = require('electron').BrowserWindow.getFocusedWindow();
        if (typeof hexoWindow.hexoeditorWindow == 'undefined') return false;

        if (typeof hexoWindow.hexoeditorWindow.fileName == 'undefined' || hexoWindow.hexoeditorWindow.fileName == '') {
            return MoeditorAction.saveAs(hexoWindow);
        } else {
            try {
                MoeditorFile.write(hexoWindow.hexoeditorWindow.fileName, hexoWindow.hexoeditorWindow.content);
                hexoWindow.hexoeditorWindow.isSaved = true;
                hexoWindow.hexoeditorWindow.fileContent = hexoWindow.hexoeditorWindow.content;
                hexoWindow.hexoeditorWindow.changed = false;
                hexoWindow.hexoeditorWindow.window.setDocumentEdited(false);
                hexoWindow.hexoeditorWindow.window.setRepresentedFilename(hexoWindow.hexoeditorWindow.fileName);
                hexoWindow.hexoeditorWindow.window.webContents.send('pop-message', {
                    type: 'success',
                    content: __('Saved successfully.')
                });
                moeApp.addRecentDocument(hexoWindow.hexoeditorWindow.fileName);
                return true;
            } catch (e) {
                hexoWindow.hexoeditorWindow.window.webContents.send('pop-message', {
                    type: 'error',
                    content: __('Can\'t save file') + ', ' + e.toString()
                });
                log.error('Can\'t save file: ' + e.toString());
                return false;
            }
        }
        return false;
    }

    static saveAs(hexoWindow) {
        if (typeof hexoWindow == 'undefined') hexoWindow = require('electron').BrowserWindow.getFocusedWindow();
        if (typeof hexoWindow.hexoeditorWindow == 'undefined') return false;

        const fileName = dialog.showSaveDialog(hexoWindow,
            {
                defaultPath: lastDir,
                filters: [
                    {name: __("Markdown Documents"), extensions: ['md', 'mkd', 'markdown']},
                    {name: __("All Files"), extensions: ['*']}
                ]
            }
        );
        if (typeof fileName == 'undefined') return false;
        lastDir = path.dirname(fileName);

        try {
            MoeditorFile.write(fileName, hexoWindow.hexoeditorWindow.content);
            hexoWindow.hexoeditorWindow.isSaved = true;
            hexoWindow.hexoeditorWindow.directory = lastDir;
            hexoWindow.hexoeditorWindow.fileContent = hexoWindow.hexoeditorWindow.content;
            hexoWindow.hexoeditorWindow.fileName = fileName;
            hexoWindow.hexoeditorWindow.changed = false;
            moeApp.addRecentDocument(fileName);
            hexoWindow.hexoeditorWindow.window.setDocumentEdited(false);
            hexoWindow.hexoeditorWindow.window.setRepresentedFilename(fileName);
            hexoWindow.hexoeditorWindow.window.webContents.send('pop-message', {
                type: 'success',
                content: __('Saved successfully.')
            });
            hexoWindow.hexoeditorWindow.window.webContents.send('set-title', fileName);
            return true;
        } catch (e) {
            hexoWindow.hexoeditorWindow.window.webContents.send('pop-message', {
                type: 'error',
                content: __('Can\'t save file') + ', ' + e.toString()
            });
            log.error('Can\'t save file: ' + e.toString());
            return false;
        }
    }

    static exportAsHTML(hexoWindow, f) {
        if (typeof hexoWindow == 'undefined') hexoWindow = require('electron').BrowserWindow.getFocusedWindow();
        if (typeof hexoWindow.hexoeditorWindow == 'undefined') return;

        const fileName = dialog.showSaveDialog(hexoWindow,
            {
                defaultPath: lastDir,
                filters: [
                    {name: __("HTML Documents"), extensions: ['html', 'htm']},
                ]
            }
        );
        if (typeof fileName == 'undefined') return;
        lastDir = path.dirname(fileName);

        f((s) => {
            try {
                hexoWindow.hexoeditorWindow.window.webContents.send('pop-message', {
                    type: 'info',
                    content: __('Exporting as HTML, please wait ...')
                });
                MoeditorFile.write(fileName, s);
                const {shell} = require('electron');
                shell.openItem(fileName);
            } catch (e) {
                hexoWindow.hexoeditorWindow.window.webContents.send('pop-message', {
                    type: 'error',
                    content: __('Can\'t export as HTML') + ', ' + e.toString()
                });
                log.error('Can\'t export as HTML: ' + e.toString());
            }
        });
    }

    static exportAsPDF(hexoWindow, f) {
        if (typeof hexoWindow == 'undefined') hexoWindow = require('electron').BrowserWindow.getFocusedWindow();
        if (typeof hexoWindow.hexoeditorWindow == 'undefined') return;

        const fileName = dialog.showSaveDialog(hexoWindow,
            {
                defaultPath: lastDir,
                filters: [
                    {name: __("PDF Documents"), extensions: ['pdf']},
                ]
            }
        );
        if (typeof fileName == 'undefined') return;
        lastDir = path.dirname(fileName);

        f((s) => {
            let errorHandler = (e) => {
                hexoWindow.hexoeditorWindow.window.webContents.send('pop-message', {
                    type: 'error',
                    content: __('Can\'t export as PDF') + ', ' + e.toString()
                });
                log.warn('Can\'t export as PDF: ' + e.toString());
            }
            try {
                hexoWindow.hexoeditorWindow.window.webContents.send('pop-message', {
                    type: 'info',
                    content: __('Exporting as PDF, please wait ...')
                });
                const exportPDF = require('./moe-pdf');
                exportPDF({s: s, path: fileName}, errorHandler);
            } catch (e) {
                errorHandler(e);
            }
        });
    }
}

module.exports = MoeditorAction;
