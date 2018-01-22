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

const marked = require('./moe-marked') ;
const MoeditorMathRenderer = require('./moe-math');
const SVGFixer = require('./svgfixer');

let gLastContent = '';
let gNeedUpdate = false;
let gUpdateRunning = false;

module.exports = (cm, force, cb) => {
    hexoWindow.content = cm.getValue();
    if (hexoWindow.fileContent !== hexoWindow.content) {
        hexoWindow.changed = true;
        hexoWindow.window.setDocumentEdited(true);
    } else {
        hexoWindow.changed = false;
    }

    if (gNeedUpdate || (!force && gLastContent == hexoWindow.content))
        return;

    if (gUpdateRunning ){
        gNeedUpdate = true;
    } else {
        setTimeout(updateAsync,0);
    }

    function updateAsync() {
        gLastContent = cm.getValue();
        gUpdateRunning = true;

        marked(gLastContent,markEnd);

        function markEnd(value){
            var math = new Array();
            var rendered = null;
            rendered = document.createElement('span');
            rendered.innerHTML = value;
            MoeditorMathRenderer.renderMany(math, (math) => {
                for (let id in math)
                    rendered.querySelector('#' + id).innerHTML = math[id].res;

                var set = new Set();
                let lineNumbers = rendered.querySelectorAll('moemark-linenumber') || [];
                for (let elem of lineNumbers) {
                    set.add(parseInt(elem.getAttribute('i')));
                }

                window.lineNumbers = (Array.from(set)).sort((a, b) => {
                    return a - b;
                });
                window.scrollMap = undefined;

                document.getElementById('container').innerHTML = rendered.innerHTML;
                SVGFixer(document.getElementById('container'));
                $('#right-panel .CodeMirror-vscrollbar div').height(document.getElementById('preview').scrollHeight);

                gUpdateRunning = false;
                if (gNeedUpdate){
                    gNeedUpdate = false;
                    setTimeout(updateAsync,0);
                }
                if(typeof cb === 'function')
                    cb();
            });
            $('#right-panel .CodeMirror-vscrollbar div').height(document.getElementById('preview').scrollHeight);
        }
    }
}
