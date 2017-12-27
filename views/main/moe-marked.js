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

const MoeditorHighlight = require('./moe-highlight');
const MoeditorMathRenderer = require('./moe-math');
// const MoeditorUMLRenderer = require('./moe-uml');
const MoeMark = require('moemark');

const Previewer = require('./hexo/previewer');

MoeMark.setOptions({
    lineNumber: true,
    math: true,
    umlchart: true,
    breaks: false,
    highlight: MoeditorHighlight,
});

var previewer = new Previewer;

module.exports = (content,option,callback) => {
        MoeMark.setOptions({
            math: moeApp.config.get('math'),
            umlchart: moeApp.config.get('uml-diagrams'),
            breaks: moeApp.config.get('breaks'),
            umlRenderer: require('./moe-uml')
        });

        var mathCnt = 0, mathID = 0, math = new Array();

        if (typeof option === 'function')
            callback = option;

        if (!option || !option.mathRenderer) {
            option = {};
            option.mathRenderer = function (str, display) {
                var res = MoeditorMathRenderer.tryRender(str, display);
                if (res !== undefined) {
                    return res;
                } else {
                    mathCnt++, mathID++;
                    var id = 'math-' + mathID;
                    var res = '<span id="' + id + '"></span>'
                    math[id] = {s: str, display: display};
                    return res;
                }
            }
        }
        return previewer.render(content, MoeMark, option,callback);
}
