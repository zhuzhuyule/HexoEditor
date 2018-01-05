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
    moment = require('moment'),
    fs = require('fs'),
    path = require('path');

let lastDir = '';

class MoeditorAction {
    static openNew() {
        let windows = require('electron').BrowserWindow.getAllWindows();
        let w, i;
        for (i = windows.length - 1; i > -1; i--) {
            w = windows[i];
            if (w.moeditorWindow && !w.moeditorWindow.changed) {
                w.focus();
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
                } while (fs.existsSync(fileName))
                if (fs.existsSync(templateFile)) {
                    content = fs.readFileSync(templateFile).toString()
                        .replace(/title:\s+\{\{[^\}]+\}\}/, 'title: ' + nowDate.replace(/[-: ]/g, ''))
                        .replace(/date:\s+/, 'date: ' + nowDate)
                        .replace(/\{\{[^\}]+\}\}/g, '');
                }

                lastDir = fileDir;
                MoeditorFile.write(fileName, content);
                if (fs.existsSync(fileName)) {
                    let w = require('electron').BrowserWindow.getFocusedWindow();
                    if (typeof w.moeditorWindow == 'undefined' || w.moeditorWindow.changed || w.moeditorWindow.content) {
                        app.addRecentDocument(fileName);
                        moeApp.open(fileName);
                    } else {
                        w.moeditorWindow.fileName = fileName;
                        w.moeditorWindow.directory = lastDir;
                        w.moeditorWindow.fileContent = w.moeditorWindow.content = MoeditorFile.read(fileName).toString();
                        w.moeditorWindow.changed = false;
                        w.moeditorWindow.window.setDocumentEdited(false);
                        w.moeditorWindow.window.setRepresentedFilename(w.moeditorWindow.fileName);
                        w.moeditorWindow.window.webContents.send('refresh-editor', {});
                        app.addRecentDocument(fileName);
                    }
                    notOpened = false;
                }
            }
        } catch (e) {
            console.log(e)
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
            let w, i;
            for (i = windows.length - 1; i > -1; i--) {
                w = windows[i];
                if (w.moeditorWindow) {
                    if (w.moeditorWindow.fileName == filename) {
                        w.focus();
                        break;
                    } else if (w.moeditorWindow.fileName == '' && !w.moeditorWindow.changed) {
                        try {
                            w.moeditorWindow.fileName = filename;
                            w.moeditorWindow.directory = lastDir;
                            w.moeditorWindow.fileContent = w.moeditorWindow.content = MoeditorFile.read(filename).toString();
                            w.moeditorWindow.changed = false;
                            w.moeditorWindow.window.setDocumentEdited(false);
                            w.moeditorWindow.window.setRepresentedFilename(w.moeditorWindow.fileName);
                            w.moeditorWindow.window.webContents.send('refresh-editor', {});
                            app.addRecentDocument(filename);
                            w.focus();
                            break;
                        } catch (e) {
                            console.log(e);
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

    static save(w) {
        if (typeof w == 'undefined') w = require('electron').BrowserWindow.getFocusedWindow();
        if (typeof w.moeditorWindow == 'undefined') return false;

        if (typeof w.moeditorWindow.fileName == 'undefined' || w.moeditorWindow.fileName == '') {
            return MoeditorAction.saveAs(w);
        } else {
            try {
                MoeditorFile.write(w.moeditorWindow.fileName, w.moeditorWindow.content);
                w.moeditorWindow.fileContent = w.moeditorWindow.content;
                w.moeditorWindow.changed = false;
                w.moeditorWindow.window.setDocumentEdited(false);
                w.moeditorWindow.window.setRepresentedFilename(w.moeditorWindow.fileName);
                w.moeditorWindow.window.webContents.send('pop-message', {
                    type: 'success',
                    content: __('Saved successfully.')
                });
                moeApp.addRecentDocument(w.moeditorWindow.fileName);
                return true;
            } catch (e) {
                w.moeditorWindow.window.webContents.send('pop-message', {
                    type: 'error',
                    content: __('Can\'t save file') + ', ' + e.toString()
                });
                console.log('Can\'t save file: ' + e.toString());
                return false;
            }
        }
        return false;
    }

    static saveAs(w) {
        if (typeof w == 'undefined') w = require('electron').BrowserWindow.getFocusedWindow();
        if (typeof w.moeditorWindow == 'undefined') return false;

        const fileName = dialog.showSaveDialog(w,
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
            MoeditorFile.write(fileName, w.moeditorWindow.content);
            w.moeditorWindow.fileContent = w.moeditorWindow.content;
            w.moeditorWindow.fileName = fileName;
            w.moeditorWindow.changed = false;
            moeApp.addRecentDocument(fileName);
            w.moeditorWindow.window.setDocumentEdited(false);
            w.moeditorWindow.window.setRepresentedFilename(fileName);
            w.moeditorWindow.window.webContents.send('pop-message', {
                type: 'success',
                content: __('Saved successfully.')
            });
            w.moeditorWindow.window.webContents.send('set-title', fileName);
            return true;
        } catch (e) {
            w.moeditorWindow.window.webContents.send('pop-message', {
                type: 'error',
                content: __('Can\'t save file') + ', ' + e.toString()
            });
            console.log('Can\'t save file: ' + e.toString());
            return false;
        }
    }

    static exportAsHTML(w, f) {
        if (typeof w == 'undefined') w = require('electron').BrowserWindow.getFocusedWindow();
        if (typeof w.moeditorWindow == 'undefined') return;

        const fileName = dialog.showSaveDialog(w,
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
                w.moeditorWindow.window.webContents.send('pop-message', {
                    type: 'info',
                    content: __('Exporting as HTML, please wait ...')
                });
                MoeditorFile.write(fileName, s);
                const {shell} = require('electron');
                shell.openItem(fileName);
            } catch (e) {
                w.moeditorWindow.window.webContents.send('pop-message', {
                    type: 'error',
                    content: __('Can\'t export as HTML') + ', ' + e.toString()
                });
                console.log('Can\'t export as HTML: ' + e.toString());
            }
        });
    }

    static exportAsPDF(w, f) {
        if (typeof w == 'undefined') w = require('electron').BrowserWindow.getFocusedWindow();
        if (typeof w.moeditorWindow == 'undefined') return;

        const fileName = dialog.showSaveDialog(w,
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
                w.moeditorWindow.window.webContents.send('pop-message', {
                    type: 'error',
                    content: __('Can\'t export as PDF') + ', ' + e.toString()
                });
                console.log('Can\'t export as PDF: ' + e.toString());
            }
            try {
                w.moeditorWindow.window.webContents.send('pop-message', {
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
