/*!
 * thread-kill
 * Date: 2016/1/14
 * https://github.com/nuintun/command-manager
 *
 * Referer: https://github.com/pkrumins/node-tree-kill
 */

'use strict';

var spawn = require('./spawn');
var exec = require('child_process').exec;

/**
 *
 * @param pid
 * @param signal
 * @param callback
 */
module.exports = function (pid, signal, callback){
    var tree = {};
    var pidsToProcess = {};

    tree[pid] = [];
    pidsToProcess[pid] = 1;

    if (typeof signal === 'function') {
        signal = 'SIGKILL';
        callback = signal;
    }

    switch (process.platform) {
        // win32
        case 'win32':
            exec('taskkill /pid ' + pid + ' /T /F', callback);
            break;
        // darwin
        case 'darwin':
            buildProcessTree(pid, tree, pidsToProcess, function (parentPid){
                return spawn('pgrep', ['-P', parentPid]);
            }, function (){
                killAll(tree, signal, callback);
            });
            break;
        // linux
        default:
            buildProcessTree(pid, tree, pidsToProcess, function (parentPid){
                return spawn('ps', ['-o', 'pid', '--no-headers', '--ppid', parentPid]);
            }, function (){
                killAll(tree, signal, callback);
            });
            break;
    }
};

function killAll(tree, signal, callback){
    var killed = {};

    try {
        Object.keys(tree).forEach(function (pid){
            tree[pid].forEach(function (pidpid){
                if (!killed[pidpid]) {
                    killPid(pidpid, signal);

                    killed[pidpid] = 1;
                }
            });

            if (!killed[pid]) {
                killPid(pid, signal);

                killed[pid] = 1;
            }
        });
    } catch (error) {
        if (callback) {
            return callback(error);
        } else {
            throw error;
        }
    }

    if (callback) {
        if (typeof callback === 'function') {
            return callback();
        }
    }
}

function killPid(pid, signal){
    try {
        process.kill(parseInt(pid, 10), signal);
    } catch (error) {
        if (error.code !== 'ESRCH') throw error;
    }
}

function buildProcessTree(parentPid, tree, pidsToProcess, spawnChildProcessesList, callback){
    var allData = '';
    var ps = spawnChildProcessesList(parentPid);

    ps.stdout.on('data', function (data){
        allData += data.toString('ascii');
    });

    var onClose = function (code){
        delete pidsToProcess[parentPid];

        if (code !== 0) {
            // no more parent processes
            if (Object.keys(pidsToProcess).length === 0) {
                callback();
            }
            return;
        }

        allData.match(/\d+/g).forEach(function (pid){
            pid = parseInt(pid, 10);

            tree[parentPid].push(pid);

            tree[pid] = [];
            pidsToProcess[pid] = 1;

            buildProcessTree(pid, tree, pidsToProcess, spawnChildProcessesList, callback);
        });
    };

    ps.on('close', onClose);
}