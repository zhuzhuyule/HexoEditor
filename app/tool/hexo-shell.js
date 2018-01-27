/*
*  This file is part of HexoEditor.
*
*  Copyright (c) 2018 zhuzhuyule
*/

'use strict'


const Promise = require('bluebird');
const thread_kill = require('./thread_kill');
const exec = require('child_process').exec;
const util = require('util');

let shellServer = false;
class ShellServer {
    constructor() {
        this.shellProcess = null;
        this.isForce = false;
        this.oldbiu = null;
        this.drags = null;
        shellServer = this;
    }

    processRunning() {
        return (this.shellProcess && this.shellProcess != null)
    }

    sendConsole(content, type, btnTip) {
        if (shellServer.closeMsg) return;
        try {
            shellServer.lastWindow.hexoeditorWindow.window.webContents.send('pop-message-shell', {
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
        clearTimeout(shellServer.timeID);
        shellServer.closeMsg = false;
        shellServer.lastWindow = require('electron').BrowserWindow.getFocusedWindow();
        shellServer.isForce = false;
        shellServer.shellProcess = exec(command, {cwd: moeApp.hexo.config.__basedir});
        shellServer.sendConsole('<i class="fa fa-spinner fa-pulse fa-fw margin-bottom"></i>'+__("Executing"), 'info', 'ban');
        shellServer.shellProcess.stderr.on('data', (data) => {
            console.log(data);
        });
        shellServer.shellProcess.stdout.on('data', (data) => {
            clearTimeout(shellServer.timeID);
            console.log(data);
            if ( /INFO  Hexo is running at https?:\/+/.test(data) ) {
                flagOK = true;
                shellServer.sendConsole('<i class="fa fa-spinner fa-pulse fa-fw margin-bottom"></i>'+__('ServerStart'), 'info', 'stop');
                require('electron').shell.openExternal(data.match(/INFO  Hexo is running at (https?:\/+[^\/]+\/). Press Ctrl.C to stop./i)[1])
            } else {
                shellServer.timeID = setTimeout(() => {
                    if (!flagOK) {
                        shellServer.kill(shellServer.shellProcess)
                        flagOK = -1;
                    }
                }, 10000)
            }
        });
        shellServer.shellProcess.on('close', (code, signal) => {
            if (flagOK === -1)
                shellServer.sendConsole(__('Operation Execution Timeout'), 'danger', 'close');
            else if (shellServer.isForce)
                shellServer.sendConsole(__('Operation Canceled'), 'success', 'check');
            else if (code == 0)
                shellServer.sendConsole(__('Operation Finished'), 'success', 'check');
            shellServer.shellProcess = null;
        });
        shellServer.shellProcess.on('error', err => {
            if (shellServer.shellProcess)
                shellServer.sendConsole(err, 'danger', 'close')
            console.error(err);
        })
    }

    kill(subProcess) {
        shellServer.isForce = true;
        shellServer.closeMsg = (typeof subProcess === "boolean");
        if (!subProcess)
            subProcess = shellServer.shellProcess
        if (subProcess)
            thread_kill(subProcess.pid, function (err) {
                console.error(err);
            });
    }

    checkPort(ip, port) {
        shellServer.isForce = false;
        shellServer.closeMsg = false;
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
            shellServer.sendConsole(util.format(__('PortOccupied'),err.address,err.port), 'danger', 'close');
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
