/*
 *  This file is part of Moeditor.
 *
 *  Copyright (c) 2016 Menci <huanghaorui301@gmail.com>
 *  Copyright (c) 2016 Wamadahama
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
    const editor = document.getElementById('editor');

    document.querySelectorAll('#cover-bottom-right> [mode-button]').forEach(function (item) {
        item.addEventListener('click', (e) => {
            var type = item.getAttribute('mode-button');
            setMode(type)
        })
    })
    function setMode(m) {
        if (window.editMode === m) return;
        document.body.setAttribute('class', m);

        window.editMode = m;
        if (window.updatePreview)
            window.updatePreview(true);
        moeApp.config.set('edit-mode', m);
        document.getElementById('main').classList.remove('notransition');
        setTimeout(() => {
            document.getElementById('main').classList.add('notransition');
            window.editor.refresh();
        }, 500);
    }

    setMode(moeApp.config.get('edit-mode'));

    window.editor.focus();

    let OldModule = '';
    require('electron').ipcRenderer.on('change-edit-mode', (e, arg) => {
        if (arg === 'read' || arg === 'write'|| arg === 'preview'){
            if (window.editMode == arg){
                setMode(OldModule);
            }else{
                OldModule = window.editMode || 'preview'
                setMode(arg);
            }
        } else if (arg === 'changepreview') {
            if (document.querySelector('.write'))
                setMode('preview');
            else if (document.querySelector('.read'))
                setMode('write');
            else
                setMode('read');
        } else
            setMode('preview');
    });

    editor.addEventListener('transitionend', (e) => {
        if (e.target === editor && e.propertyName === 'width') window.editor.refresh();
    });
});
