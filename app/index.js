/*
 *  This file is part of Moeditor.
 *
 *  Copyright (c) 2016 Menci <huanghaorui301@gmail.com>
 *  Copyright (c) 2015 Thomas Brouard (for codes from Abricotine)
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

// on darwin, to rewrite path
if (process.platform === "darwin") {
    const shellEnvs = require('shell-env').sync()
    process.env.PATH = shellEnvs.PATH;
}

const app = require('electron').app,
      MoeditorApplication = require('./moe-app');

var moeApp = null, openFile = null;

app.on("ready", () => {
    moeApp = new MoeditorApplication();
    global.moeApp = moeApp;
    global.app = app;
    app.moeApp = moeApp;
    if (openFile !== null)
        moeApp.osxOpenFile = openFile;
	moeApp.run();
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('open-file', (e, file) => {
    if (moeApp === null) openFile = file;
    else moeApp.open(file);
});

app.on('activate', () => {
    if (moeApp != null && moeApp.windows && moeApp.windows.length == 0) {
        moeApp.open();
    }
});
