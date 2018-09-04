/*
*  This file is part of HexoEditor.
*
*  Copyright (c) 2018 zhuzhuyule
*/
var shellServer = (function () {
    'use strict'
    const Promise = require('bluebird');
    const thread_kill = require('./thread_kill');
    const exec = require('child_process').exec;
    const util = require('util');
    const log = log4js.getLogger('hexo-shell.js')

    let _shellServer = false;

    class ShellServer {
        constructor() {
            this.shellProcess = null;
            this.isForce = false;
            this.oldbiu = null;
            this.drags = null;
            _shellServer = this;
        }

        processRunning() {
            return (this.shellProcess && this.shellProcess != null)
        }

        sendConsole(content, type, btnTip) {
            if (_shellServer.closeMsg) return;
            try {
                _shellServer.lastWindow.hexoeditorWindow.window.webContents.send('pop-message-shell', {
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
            let flagOK = false;
            
            clearTimeout(_shellServer.timeID);
            _shellServer.closeMsg = false;
            _shellServer.lastWindow = require('electron').BrowserWindow.getFocusedWindow();
            _shellServer.isForce = false;
            log.info("path:", process.env.PATH)
            log.info('Begin execute:', `[${moeApp.hexo.config.__basedir}] [${command}]`);
            _shellServer.shellProcess = exec(command, {cwd: moeApp.hexo.config.__basedir});
            _shellServer.sendConsole('<i class="fa fa-spinner fa-pulse fa-fw margin-bottom"></i>' + __("Executing"), 'info', 'ban');
            _shellServer.shellProcess.stderr.on('data', (data) => {
                log.error(data);
            });
            _shellServer.shellProcess.stdout.on('data', (data) => {
                clearTimeout(_shellServer.timeID);
                log.debug(data);
                if (/INFO  Hexo is running at https?:\/+/.test(data)) {
                    flagOK = true;
                    _shellServer.sendConsole('<i class="fa fa-spinner fa-pulse fa-fw margin-bottom"></i>' + __('ServerStart'), 'info', 'stop');

                    // fix 这里会报异常
                    const externalParams = function() {
                        const d = data.match(/INFO  Hexo is running at (https?:\/+[^\/]+\/). Press Ctrl.C to stop./i);
                        if (!d) {
                            return null
                        }

                        if (d.length > 2) {
                            return d[1]
                        }

                        return null
                    }();
                
                    if (externalParams) {
                        require('electron').shell.openExternal(externalParams)
                    }
                } else {
                    _shellServer.timeID = setTimeout(() => {
                        if (!flagOK) {
                            _shellServer.kill(_shellServer.shellProcess)
                            flagOK = -1;
                        }
                    }, 10000)
                }
            });
            _shellServer.shellProcess.on('close', (code, signal) => {
                log.info('End   execute:', `[${moeApp.hexo.config.__basedir}] [${command}]`);
                if (flagOK === -1)
                    _shellServer.sendConsole(__('Operation Execution Timeout'), 'danger', 'close');
                else if (_shellServer.isForce)
                    _shellServer.sendConsole(__('Operation Canceled'), 'success', 'check');
                else if (code == 0)
                    _shellServer.sendConsole(__('Operation Finished'), 'success', 'check');
                _shellServer.shellProcess = null;
            });
            _shellServer.shellProcess.on('error', err => {
                if (_shellServer.shellProcess)
                    _shellServer.sendConsole(err, 'danger', 'close')
                log.error(err);
            })
        }

        kill(subProcess) {
            _shellServer.isForce = true;
            _shellServer.closeMsg = (typeof subProcess === "boolean");
            if (!subProcess)
                subProcess = _shellServer.shellProcess
            if (subProcess)
                thread_kill(subProcess.pid, function (err) {
                    log.error(err);
                });
        }

        checkPort(ip, port) {
            _shellServer.isForce = false;
            _shellServer.closeMsg = false;
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
                _shellServer.sendConsole(util.format(__('PortOccupied'), err.address, err.port), 'danger', 'close');
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
                    command = 'lsof -i:';
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
                        reg = new RegExp(util.format('TCP\\s+%s:%s\\s+\\d+.\\d+.\\d+.\\d+:\\d+\\s+LISTENING\\s+(\\d+)', ip, port), 'i');
                        break;
                    case 'darwin':
                        reg = new RegExp('\\w+\\s+(\\d+)\\s+', 'i');
                        break;
                    default:
                        reg = new RegExp(util.format('tcp\\s+\\d+\\s+\\d*\\s+%s:%s\\s+\\d+.\\d+.\\d+.\\d+:[*\\d]+\\s+LISTEN\\s+(\\d+)', ip, port), 'i');
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

    return ShellServer;
})();


module.exports = shellServer;
