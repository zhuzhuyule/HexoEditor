/**
 * Created by nuintun on 2016/1/14.
 */

'use strict';

var spawn = require('child_process').spawn;

/**
 * normalize exec args
 * @param command
 * @param options
 * @returns {{cmd: *, shell: *, args: *, options: *}}
 */
function normalizeExecArgs(command, options){
    var shell, args;

    // Make a shallow copy before patching so we don't clobber the user's
    // options object.
    options = options || {};

    if (process.platform === 'win32') {
        shell = process.env.comspec || 'cmd.exe';
        args = ['/s', '/c', '"' + command + '"'];
        options.windowsVerbatimArguments = true;
    } else {
        shell = '/bin/sh';
        args = ['-c', command];
    }

    if (options.shell) {
        shell = options.shell;
    }

    return {
        shell: shell,
        args: args,
        options: options
    };
}

/**
 * exec thread
 */
module.exports = function (){
    var parsed = normalizeExecArgs.apply(null, arguments);
    return spawn(parsed.shell, parsed.args, parsed.options);
};