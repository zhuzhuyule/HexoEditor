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

'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const ipcRenderer = require('electron').ipcRenderer;

    let drags = document.getElementsByClassName('drag');

    ipcRenderer.on('pop-message', (e, arg) => {
        if (arg.type === 'error') arg.type = 'danger';
        biu(arg.content, { type: arg.type, autoHide: true, pop: true, closeButton: '<i class="fa fa-close"></i>' });

        // workaround for #electron/electron/6970
        for (let drag of drags) {
            drag.style.width = '0';
            drag.offsetHeight;
            setTimeout(() => {
                drag.style.width = ''
            }, 1000);
        }
    });

    let oldbiu = null;
    window.popMessageShell = (e,arg)=>{
        if (oldbiu && oldbiu != null) oldbiu.hide();
        oldbiu = biu(arg.content, {
            type: 'webConsole biu-' + arg.type,
            autoHide: !!arg.autoHide,
            pop: true,
            align: arg.align || 'left',
            closeButton: '<i class="fa fa-' + (arg.btnTip||"close") + '" aria-hidden="true" title=' + __(arg.btnTip||"Close") + '></i>'
        });
        oldbiu.closeButton.addEventListener('click', function () {
            process.nextTick(moeApp.getShellServer().kill);
        });

        if (!drags)
            drags = document.getElementsByClassName('drag');
        // workaround for #electron/electron/6970
        for (let drag of drags) {
            drag.style.width = '0';
            drag.offsetHeight;
            setTimeout(() => {
                drag.style.width = ''
            }, 1000);
        }
    }
    ipcRenderer.on('pop-message-shell',popMessageShell)  ;


    ipcRenderer.on('refresh-editor', function () {
        const path = require('path');
        let hexoWindow  = window.hexoWindow;

        if (hexoWindow.fileName !== '') {
            document.getElementsByTagName('title')[0].innerText = 'HexoEditor - ' + path.basename(hexoWindow.fileName);
        }

        // TODO-ly 解决第一次图片保存地址不对的问题
        let fileName = path.basename(hexoWindow.fileName, path.extname(hexoWindow.fileName));
        if(fileName !== imgManager.postName){
            imgManager.renameDirPath(fileName,true);
        }

        document.querySelector('#editor textarea').innerText = hexoWindow.content;
        window.editor.setValue(hexoWindow.content);
        window.updatePreview(true);
    })
});
