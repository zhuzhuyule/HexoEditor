/*
*  This file is part of Moeditor.
*
*  Copyright (c) 2016 Menci <huanghaorui301@gmail.com>
*  Copyright (c) 2016 lucaschimweg
*  Copyright (c) 2016 douglaseccker
*  Copyright (c) 2016 PifyZ
*  Copyright (c) 2016 Hyuchia
*  Copyright (c) 2016 welksonramos
*  Copyright (c) 2016 caiocdasilva
*  Copyright (c) 2016 lawgsy <lawgsy@gmail.com>
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
*
*  The translation providers:
*   - en: Menci
*   - zh_CN: Menci
*   - de: lucaschimweg
*   - pt: douglaseccker & welksonramos & caiocdasilva
*   - fr: PifyZ
*   - es: Hyuchia
*   - nl: lawgsy
*   - it: iamsisar
*
*  If you want to help translate this app, please copy the `en` items of the
*  `strings` constant as the template, and fill each item with the translated
*  string. The `_name` item in a language is the language's name.
*
*  You can translate for a language (e.g. en) or a language with specified
*  region (e.g. zh_CN). The app will choose the language with specified region
*  first, fallback to only language when the former is unavailable, and fallback
*  to English when they are all unavailable.
*
*  Send a PR to us after translating.
*
*/

'use strict'


const Promise = require('bluebird');
const {ipcMain} = require('electron');
const thread_kill = require('./tool/thread_kill');
const exec = require('child_process').exec;
const util = require('util');

class ShellServer {
    constructor() {
        this.shellProcess = null;
        this.isForce = false;
        this.oldbiu = null;
        this.drags = null;
    }

    processRunning() {
        return (this.shellProcess && this.shellProcess != null)
    }

    sendConsole(content, type, btnTip) {
        if (moeApp.shellServer.closeMsg) return;
        try {
            moeApp.shellServer.lastWindow.moeditorWindow.window.webContents.send('pop-message-shell', {
                subProcess: this.shellProcess,
                content: content,
                type: type,
                btnTip: btnTip,
            });
        } catch (e) {
            content.error(e)
        }
    }

    execCmd(command) {
        console.log('execute', command);
        let flagOK = false;
        clearTimeout(moeApp.shellServer.timeID);
        moeApp.shellServer.closeMsg = false;
        moeApp.shellServer.lastWindow = require('electron').BrowserWindow.getFocusedWindow();
        moeApp.shellServer.isForce = false;
        moeApp.shellServer.shellProcess = exec(command, {cwd: moeApp.hexo.config.__basedir});
        moeApp.shellServer.sendConsole('<i class="fa fa-spinner fa-pulse fa-fw margin-bottom"></i>'+__("Executing"), 'info', 'ban');
        moeApp.shellServer.shellProcess.stderr.on('data', (data) => {
            console.log(data);
        });
        moeApp.shellServer.shellProcess.stdout.on('data', (data) => {
            clearTimeout(moeApp.shellServer.timeID);
            if (flagOK || (/INFO  Hexo is running at https?:\/+/.test(data)) ) {
                flagOK = true;
                moeApp.shellServer.sendConsole('<i class="fa fa-spinner fa-pulse fa-fw margin-bottom"></i>'+__('ServerStart'), 'info', 'stop');



                require('electron').shell.openExternal(data.match(/INFO  Hexo is running at (https?:\/+[^\/]+\/). Press Ctrl.C to stop./i)[1])
            } else {
                moeApp.shellServer.timeID = setTimeout(() => {
                    if (!flagOK) {
                        moeApp.shellServer.kill(moeApp.shellServer.shellProcess)
                        flagOK = -1;
                    }
                }, 10000)
            }
            console.log(data);
        });
        moeApp.shellServer.shellProcess.on('close', (code, signal) => {
            if (flagOK === -1)
                moeApp.shellServer.sendConsole(__('Operation Execution Timeout'), 'danger', 'close');
            else if (moeApp.shellServer.isForce)
                moeApp.shellServer.sendConsole(__('Operation Canceled'), 'success', 'check');
            else if (code == 0)
                moeApp.shellServer.sendConsole(__('Operation Finished'), 'success', 'check');
            moeApp.shellServer.shellProcess = null;
        });
        moeApp.shellServer.shellProcess.on('error', err => {
            if (moeApp.shellServer.shellProcess)
                moeApp.shellServer.sendConsole(err, 'danger', 'close')
            console.error(err);
        })
    }

    kill(subProcess) {
        moeApp.shellServer.isForce = true;
        moeApp.shellServer.closeMsg = (typeof subProcess === "boolean");
        if (!subProcess)
            subProcess = moeApp.shellServer.shellProcess
        if (subProcess)
            thread_kill(subProcess.pid, function (err) {
                console.error(err);
            });
    }

    checkPort(ip, port) {
        moeApp.shellServer.isForce = false;
        moeApp.shellServer.closeMsg = false;
        return new Promise(function (resolve, reject) {
            if (port > 65535 || port < 1) {
                return reject(new Error('Port number ' + port + ' is invalid. Try a number between 1 and 65535.'));
            }
            var server = require('net').createServer();
            server.once('error', reject);
            server.once('listening', function () {
                server.close();
                resolve(`${ip}:${port}`);
            });

            server.listen(port, ip);
        });
    }

    serverFail(err) {
        if (err.code === 'EADDRINUSE') { // 端口Ip地址占用
            moeApp.shellServer.sendConsole(util.format(__('PortOccupied'),err.address,err.port), 'danger', 'close');
        }
    }

    server() {
        this.checkPort(moeApp.hexo.config.server.ip, moeApp.hexo.config.server.port)
            .then(this.execCmd('hexo s'), this.serverFail);
    }

    clean() {
        Promise.resolve()
            .then(this.execCmd('hexo clean'));
    }

    general() {
        Promise.resolve()
            .then(this.execCmd('hexo g'));
    }

    deploy() {
        Promise.resolve()
            .then(this.execCmd('hexo d'));
    }

    generalAndDeploy() {
        Promise.resolve()
            .then(this.execCmd('hexo g -d'));
    }

    stopServerForce() {
        const port = moeApp.hexo.config.server.port;
        const ip = moeApp.hexo.config.server.ip;
        let command = '';
        switch (process.platform) {
            case 'win32':
                command = 'netstat -nao | findstr ';
                break;
            case 'darwin':
                command = 'netstat -anp|grep ';
                break;
            default:
                command = 'netstat -anp|grep ';
                break;
        }
        this.execCmd(command + port);
        let portList = [];

        this.shellProcess.stdout.on('data', (data) => {
            let reg;
            switch (process.platform) {
                case 'win32':
                    reg =  new RegExp(util.format('TCP\\s+%s:%s\\s+\\d+.\\d+.\\d+.\\d+:\\d+\\s+LISTENING\\s+(\\d+)', ip, port),'i');
                    break;
                case 'darwin':
                    reg =  new RegExp(util.format('tcp\\s+\\d+\\s+\\d*\\s+%s:%s\\s+\\d+.\\d+.\\d+.\\d+:[*\\d]+\\s+LISTEN\\s+(\\d+)', ip, port),'i');
                    break;
                default:
                    reg =  new RegExp(util.format('tcp\\s+\\d+\\s+\\d*\\s+%s:%s\\s+\\d+.\\d+.\\d+.\\d+:[*\\d]+\\s+LISTEN\\s+(\\d+)', ip, port),'i');
                    break;
            }

            if (reg.test(data)) {
                let pid = data.match(reg)[1]
                if (pid)
                    portList.push(pid)
            }
        });

        this.shellProcess.on('close', (code, signal) => {
            if (portList.length > 0) {
                for (let i = 0, len = portList.length; i < len; i++) {
                    thread_kill(portList[i])
                }
            }
            this.sendConsole(__('Operation Finished'), 'success', 'check');
            this.shellProcess = null;
        });
    }
}

module.exports = ShellServer;
