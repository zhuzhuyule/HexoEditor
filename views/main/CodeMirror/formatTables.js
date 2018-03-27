/*
 *  This file is part of HexoEditor.
 *
 *  Copyright (c) 2018 zhuzhuyule <zhuzhuyule@gmail.com>
 *
 *  Fix from https://github.com/neilsustc/vscode-markdown/blob/7d46777c1130ffa0c4b9f34092881a5d85e218c6/src/tableFormatter.ts#L5
 *
 *  HexoEditor is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  HexoEditor is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with HexoEditor. If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';
module.exports = (function () {
    let tableHelper = {
        formatTables: function (cm) {
            let pos = cm.getCursor();
            let value = cm.getValue();
            value = value.replace(detectTableReg(), (table) => {
                return formatTable(table)
            })
            cm.setValue(value);
            cm.setCursor(pos);
        }
    }

    function detectTableReg() {
        var lineBreak = '\\r?\\n';
        var contentLine = '\\|?.+\\|.*\\|? *';
        var hyphenLine = '\\|?[ :]*[-]{2,}[- :\\|]*\\|? *';
        var tableRegex = new RegExp(contentLine + lineBreak + hyphenLine + '\(?:' + lineBreak + contentLine + '\)\+', 'g');
        return tableRegex;
    }

    function formatTable(text) {
        let rows = text.split(/\r?\n/g);
        let content = rows.map(row => {
            // Escape
            // 1. replace (`,`) pair with (%60,`) to distinguish starting and ending `
            // 2. escape | in %60...|...` (use while clause because in case of %60...|...|...`)
            // 3. escape \|
            row = row.replace(/`([^`]*?)`/g, '%60$1`');
            while (/%60([^`]*?)\|([^`]*?)`/.test(row)) {
                row = row.replace(/%60([^`]*?)\|([^`]*?)`/, '%60$1%7c$2`');
            }
            row = row.replace(/\\\|/g, '\\%7c');
            return row.trim().replace(/^\|/g, '').replace(/\|$/g, '').trim().split(/\s*\|\s*/g).map(cell => {
                return cell.replace(/%7c/g, '|').replace(/%60/g, '`');
            });
        });
        // Normalize the num of hyphen
        content[1] = content[1].map(cell => {
            if (/:-+:/.test(cell)) {
                return ':---:';
            } else if (/:-+/.test(cell)) {
                return ':---';
            } else if (/-+:/.test(cell)) {
                return '---:';
            } else if (/-+/.test(cell)) {
                return '---';
            }
        });

        let colWidth = Array(content[0].length).fill(3);
        let cn = /[\u4e00-\u9eff，。《》？；：‘“’”（）【】、—]/g;
        content.forEach(row => {
            row.forEach((cell, i) => {
                // Treat Chinese characters as 2 English characters
                let cellLength = cell.length;
                if (cn.test(cell)) {
                    cellLength += cell.match(cn).length;
                }
                if (colWidth[i] < cellLength) {
                    colWidth[i] = cellLength;
                }
            });
        });
        // Format
        content[1] = content[1].map((cell, i) => {
            if (cell == ':---:') {
                return ':' + '-'.repeat(colWidth[i] - 2) + ':';
            } else if (cell == ':---') {
                return ':' + '-'.repeat(colWidth[i] - 1);
            } else if (cell == '---:') {
                return '-'.repeat(colWidth[i] - 1) + ':';
            } else if (cell == '---') {
                return '-'.repeat(colWidth[i]);
            }
        });

        return content.map(row => {
            let cells = row.map((cell, i) => {
                let cellLength = colWidth[i];
                if (cn.test(cell)) {
                    cellLength -= cell.match(cn).length;
                }
                return (cell + ' '.repeat(cellLength)).slice(0, cellLength);
            });
            return '| ' + cells.join(' | ') + ' |';
        }).join('\n');
    }

    return tableHelper;
})();
