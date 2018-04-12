/*
 *  This file is part of HexoEditor.
 *
 *  Copyright (c) 2018 zhuzhuyule <zhuzhuyule@gmail.com>
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
const FormatTables = require('./formatTables');

module.exports = (() => {
    var keyMaps = {
        Esc: 'singleSelection',
        Enter: 'newlineAndIndentContinueMarkdownList',
        Home: 'goLineLeft',
        End: 'goLineRight',
        'Tab':tabAdd,
        'Shift-Tab': tabSubtract,
        'Ctrl-B': toggleBlod,
        'Ctrl-I': toggleItalic,
        'Ctrl-D': toggleDelete,
        'Ctrl-`': toggleComment,
        'Ctrl-L': toggleUnOrderedList,
        'Ctrl-Alt-L': toggleOrderedList,
        'Ctrl-]': toggleHeader,
        'Ctrl-[': toggleUnHeader,
        'Ctrl-=': toggleBlockquote,
        'Ctrl--': toggleUnBlockquote,
        'Ctrl-U': drawLink,
        'Ctrl-Alt-U': drawImageLink,
        'Ctrl-T': drawTable,
        'Ctrl-V': pasteOriginContent,
        'Shift-Ctrl-V': pasteContent,
        'Alt-F': formatTables
    }

    /**
     * Action for add space of "indentUnit" count.
     */
    function tabAdd(cm){
        let indentCount = parseInt(cm.getOption("indentUnit")) || 4;
        cm.indentSelection(indentCount);
    }

    /**
     * Action for subtract space of "indentUnit" count or delete start modifier.
     */
    function tabSubtract(cm) {
        const posStart = cm.getCursor('from');
        const posEnd = cm.getCursor('to');
        let needSubtract = true;
        if (posStart.line === posEnd.line) {
            let line = cm.getLine(posStart.line);
            line.replace(/^([*+-] |\d\. )(.*)$/, (all, part1, part2) => {
                posStart.ch -= part1.length;
                cm.replaceRange(part2, CodeMirror.Pos(posStart.line, 0), CodeMirror.Pos(posStart.line, all.length))
                cm.setCursor(posStart);
                cm.focus();
                needSubtract = false;
            })
        }
        if (needSubtract) {
            let indentCount = parseInt(cm.getOption("indentUnit")) || 4;
            cm.indentSelection(-indentCount);
        }
    }

    /**
     * Fix shortcut. Mac use Command, others use Ctrl.
     */
    function fixShortcut() {
        if (process.platform == 'drawin')
            Object.keys(keyMaps).forEach(item => {
                if (item.indexOf('Ctrl') > -1) {
                    var val = keyMaps[item];
                    delete keyMaps[item];
                    keyMaps[item.replace('Ctrl', 'Cmd')] = val;
                }
            })
    }

    function toggleBlod() {
        modifiersChange('**',/(\*\*|__)+/g);
    }
    function toggleItalic() {
        modifiersChange('*',/(\*|_)/g);
    }
    function toggleDelete() {
        modifiersChange('~~',/(~~)+/g);
    }
    function toggleComment() {
        modifiersChange('`',/(`)/);
    }

    /**
     * The state of CodeMirror at the given position.
     */
    function getState (cm, pos) {
        pos = pos || cm.getCursor('start');
        var stat = cm.getTokenAt(pos);
        if (!stat.type)
            return {};

        var types = stat.type.split(' ');

        var ret = {}, data, text;
        for (var i = 0; i < types.length; i++) {
            data = types[i];
            if (data === 'strong') {
                ret.bold = true;
            } else if (data === 'variable-2') {
                text = cm.getLine(pos.line);
                if (/^\s*\d+\.\s/.test(text)) {
                    ret['ordered-list'] = true;
                } else {
                    ret['unordered-list'] = true;
                }
            } else if (data === 'atom') {
                ret.quote = true;
            } else if (data === 'em') {
                ret.italic = true;
            }
        }
        return ret;
    }

    function _replaceSelection (cm, active, start, end) {
        var text;
        var startPoint = cm.getCursor('start');
        var endPoint = cm.getCursor('end');
        if (active) {
            text = cm.getLine(startPoint.line);
            start = text.slice(0, startPoint.ch);
            end = text.slice(startPoint.ch);
            cm.replaceRange(start + end, CodeMirror.Pos(startPoint.line, 0), CodeMirror.Pos(startPoint.line, text.length));
        } else {
            text = cm.getSelection();
            cm.replaceSelection(start + text + end);

            startPoint.ch += start.length;
            endPoint.ch += start.length;
        }
        cm.setSelection(startPoint, endPoint);
        cm.focus();
    }

    /**
     * toggling line state
     * @param cm
     * @param name
     * @private
     */
    function _toggleContinueLine (cm, name) {
        var startPoint = cm.getCursor('start');
        var endPoint = cm.getCursor('end');
        var map = {
            'header': '#',
            'unquote': '>',
            'unheader': '#',
            'quote': '>'
        };
        //判断标识符是否可连续
        var isCancleAction = ['unheader', 'unquote'].indexOf(name) > -1 ;
        //操作每行的标识符
        for (var i = startPoint.line; i <= endPoint.line; i++) {
            (function (i) {
                var text = cm.getLine(i);
                var match = text.match(/^(\s*(?:[*+-] +|\d\. +|>+ +|#+ +)*(?:[*+-] |\d\. |>+ |#+ ))(.*)$/);
                var flages = '';  //前置标识 集合如：>>> * 1.
                var oldLength = 0,extend = map[name] + ' ';
                //将整行分割为 标识符区、文本区
                if (match !== null) {
                    flages = match[1];
                    text = match[2];
                }
                if( i === startPoint.line || i===endPoint.line)
                    oldLength = flages.length;
                //存在 标识符区域时，做去重检测（去重只检验末尾标识符（最近的添加的）是否与需要添加的标识符相同）
                if (flages) {
                    if (isCancleAction){
                        extend = '';
                        flages = flages.replace(new RegExp(map[name] + '(?=[^'+map[name]+']+$)'),'a').replace(/(^| )(a )/,'$1').replace('a','');
                    } else {
                        flages.replace(/^(.*(>|#))\s$/, (all, part1, part2) => {
                            extend = '';
                            //末尾标识符与 新添加标识符 相同
                            if (part2 == map[name] ) {
                                //相同标识符的状态下
                                //可连续的标识符：将做连续添加操作
                                flages = part1 + map[name] + ' ';
                            } else {
                                //不相同的标识符状态
                                flages += map[name] + ' ';
                            }
                        });
                    }
                    flages += extend;
                    text = flages + text;
                }  else {
                    //行首无标识符且当前操作不为取消操作时，添加新标识符到行首
                    if (!isCancleAction)
                        text = text.replace(/^(\s*)(.*)$/,(all,part1,part2)=>{
                            flages = map[name] + ' ';
                            return part1 + flages + part2;
                        })
                }
                if( i === startPoint.line)
                    startPoint.ch -= oldLength - flages.length;
                if((startPoint.line !== endPoint.line || startPoint.ch !== endPoint.ch)&& i === endPoint.line)
                    endPoint.ch -= oldLength - flages.length;
                cm.replaceRange(text, CodeMirror.Pos(i, 0), CodeMirror.Pos(i, cm.getLine(i).length));
            })(i);
        }
        cm.setSelection(startPoint,endPoint);
        cm.focus();
    }

    function _toggleLine (cm, name) {
        var startPoint = cm.getCursor('start');
        var endPoint = cm.getCursor('end');
        var map = {
            'unordered-list': '*',
            'ordered-list': '1.'
        };
        //操作每行的标识符
        for (var i = startPoint.line; i <= endPoint.line; i++) {
            (function (i) {
                var text = cm.getLine(i);
                var match = text.match(/^(\s*(?:[*+-] +|\d\. +|>+ +|#+ +)*(?:[*+-] |\d\. |>+ |#+ ))(.*)$/);
                var modifiers = '';  //前置标识 集合如：>>> * 1.
                var oldLength = 0,extend = map[name] + ' ';
                //将整行分割为 标识符区、文本区
                if (match !== null) {
                    modifiers = match[1];
                    text = match[2];
                }
                if( i === startPoint.line || i===endPoint.line)
                    oldLength = modifiers.length;
                //存在 标识符区域时，做去重检测（去重只检验末尾标识符（最近的添加的）是否与需要添加的标识符相同）
                if (modifiers) {
                    modifiers.replace(/^(.*)([*+-]|\d\.)\s$/, (all, part1, part2) => {
                        extend = '';
                        if(part2.length != map[name].length){
                            modifiers =  part1 +  map[name] + ' ';
                        } else {
                            modifiers = part1;
                        }
                    });
                    modifiers += extend;
                    text = modifiers + text;
                }  else {
                    //行首无标识符且当前操作不为取消操作时，添加新标识符到行首
                        text = text.replace(/^(\s*)(.*)$/,(all,part1,part2)=>{
                            modifiers = map[name] + ' ';
                            return part1 + modifiers + part2;
                        })
                }
                if( i === startPoint.line)
                    startPoint.ch -= oldLength - modifiers.length;
                if((startPoint.line !== endPoint.line || startPoint.ch !== endPoint.ch)&& i === endPoint.line)
                    endPoint.ch -= oldLength - modifiers.length;
                cm.replaceRange(text, CodeMirror.Pos(i, 0), CodeMirror.Pos(i, cm.getLine(i).length));
            })(i);
        }
        cm.setSelection(startPoint,endPoint);
        cm.focus();
    }

    /**
     * Action for toggling blockquote.
     */
    function toggleBlockquote (cm) {
        _toggleContinueLine(cm, 'quote');
    }
    /**
     * Action for toggling decrease blockquote.
     */
    function toggleUnBlockquote (cm) {
        _toggleContinueLine(cm, 'unquote');
    }

    /**
     * Action for toggling ul.
     */
    function toggleUnOrderedList (cm) {
        _toggleLine(cm, 'unordered-list');
    }

    /**
     * Action for toggling ol.
     */
    function toggleOrderedList (cm) {
        _toggleLine(cm, 'ordered-list');
    }

    /**
     * Action for toggling header.
     */
    function toggleHeader (cm) {
        _toggleContinueLine(cm, 'header');
    }

    /**
     * Action for toggling decrease header.
     */
    function toggleUnHeader (cm) {
        _toggleContinueLine(cm, 'unheader');
    }

    /**
     * Action for drawing a link.
     */
    function drawLink (cm) {
        var stat = getState(cm);
        _replaceSelection(cm, stat.link, '[', ']()');
    }
    /**
     * Action for drawing a image link.
     */
    function drawImageLink (cm) {
        var stat = getState(cm);
        _replaceSelection(cm, stat.link, '![', ']()');
    }
    /**
     * Action for drawing a table.
     */
    function drawTable (cm) {
        const posStart = cm.getCursor('from');
        const posEnd = cm.getCursor('to');
        const selectContent = cm.getRange(posStart,posEnd);
        var col = 3,row = 3;
        var match = selectContent.match(/(\d+)\D+?(\d+)/);
        if( match !== null){
           row = parseInt(match[1]);
           col = parseInt(match[2]);
        } else {
            match = cm.getLine(posStart.line).slice(0,posStart.ch).match(/(\d+)\D+?(\d+)/);
            if( match !== null){
                posStart.ch -= match[0].length;
                row = parseInt(match[1]);
                col = parseInt(match[2]);
            }
        }
        col = (col > 12 ? 12 : col);
        var table = '\n\n';
        if (/^\s*$/.test( cm.getLine(posStart.line).slice(0,posStart.ch))){
            table = '\n';
        }
        for(var r = 0,rlen = row + 2; r < rlen; r++){
            for (var c = 0; c < col; c++){
                if ( 1 === r){
                    table += '| :--: '
                } else {
                    table += '|      ';
                }
                if ( c === col-1){
                    table += '|\n';
                }
            }
        }
        cm.replaceRange(table,posStart,posEnd);
        cm.focus();
    }

    let praseHtml;
    /**
     * Action for paste date what is HTML or Image.
     */
    function pasteContent(cm) {
        let image = clipboard.readImage();
        if (!image.isEmpty()) {
            let imageTitle = cm.getSelection();
            cm.replaceSelection(`![${imageTitle}](${imgManager.getImageOfObj(image,imageTitle)})`);
        } else {
            if (!praseHtml)
                praseHtml = require('./tomarkdown');
            let content = praseHtml(clipboard.readHTML(),{
                converters: [
                    {
                        filter: 'img',
                        replacement: function (innerHTML, node) {
                            if (1 === node.attributes.length) {
                                return "";
                            }
                            return "![](" + node.src + ")";
                        }
                    },{
                        filter: 'a',
                        replacement: function (innerHTML, node) {
                            if (innerHTML.length > 0) {
                                return "["+innerHTML+"](" + node.href + ")";
                            }
                            return "";
                        }
                    }
                ], gfm: true
            });
            content = content.trim();
            if (content === ''){
                content = clipboard.readText()
            } else {
                // code 中 <, > 进行转义
                var codes = content.split('```');
                if (codes.length > 1) {
                    for (var i = 0, iMax = codes.length; i < iMax; i++) {
                        if (i % 2 === 1) {
                            codes[i] = codes[i].replace(/<\/span><span style="color:#\w{6};">/g, '').replace(/</g, '<').replace(/>/g, '>');
                        }
                    }
                }
                content = codes.join('```');

                // ascii 160 替换为 30
                content = $('<div>' + content + '</div>').text().replace(/\n{2,}/g, '\n\n').replace(/ /g, ' ');
                content = content.trim();
            }
            cm.replaceSelection(content)
        }
    }
    /**
     * Action for paste date what is HTML or Image.
     */
    function pasteOriginContent(cm) {
        let image = clipboard.readImage();
        if (!image.isEmpty()) {
            let imageTitle = cm.getSelection();
            cm.replaceSelection(`![${imageTitle}](${imgManager.getImageOfObj(image,imageTitle)})`);
        } else {
            cm.replaceSelection(clipboard.readText())
        }
    }

    /**
     * Action for format document tables.
     */
    function formatTables(cm) {
        FormatTables.formatTables(cm);
    }
    fixShortcut();
    CodeMirror.commands.pasteContent = pasteContent;
    CodeMirror.commands.pasteOriginContent = pasteOriginContent;
    var editor = CodeMirror.fromTextArea(document.querySelector('#editor textarea'), {
        lineNumbers: false,
        mode: 'yaml-frontmatter',
        matchBrackets: true,
        theme: moeApp.config.get('editor-theme'),
        lineWrapping: true,
        extraKeys: keyMaps,
        fixedGutter: false,
        // foldGutter: true,
        // gutters:["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
        // auto:"auto",
        // autoCloseBrackets: true,

        tabSize: moeApp.config.get('tab-size'),
        indentUnit: moeApp.config.get('tab-size'),
        viewportMargin: Infinity,
        styleActiveLine: true,
        showCursorWhenSelecting: true
    });

    editor.focus();

    const regStandardCharacterB = /^((-?\d+(,\d{3})*(\.\d+)?(x?\*?\d*\^\d+)?)|((\d+-)+\d+)|(_?[-\da-zA-Z\u4E00-\u9FFF\-]_?))+/;
    const regStandardCharacterE = /((-?\d+(,\d{3})*(\.\d+)?(x?\*?\d*\^\d+)?)|((\d+-)+\d+)|(_?[-\da-zA-Z\u4E00-\u9FFF\-]_?))+$/;
    /**
     * 字符置反
     * @param str
     */
    function reverseStr(str) {
        return str.split('').reverse().join('');
    }

    function getLine(line) {
        return editor.getLine(line);
    }
    function getSelectWords(){
        const posStart = editor.getCursor('from');
        const posEnd = editor.getCursor('to');
        const selectContent = editor.getRange(posStart,posEnd);
        const leftContent = getLine(posStart.line).slice(0,posStart.ch).replace(/^\s*([\*\-\+\>] |\d\. )+/,(item)=>{
            startPos = item.length;
            return item.replace(/./g,' ')
        });
        const rightContent = getLine(posEnd.line).slice(posEnd.ch);

        var match;
        match = leftContent.match(/(`|~~|\*\*?|__)+$/);
        var leftModifiers = (match === null) ? '': match[0];
        match = rightContent.match(/^(`|~~|\*\*?|__)+/);
        var rightModifiers = (match === null) ? '': match[0];
        match = (reverseStr(leftModifiers)+ 'a' + rightModifiers).match(/^((`|~~|\*\*?|__?)+).*?a.*?\1/);
        var modifiers = (match === null) ? '': reverseStr(match[1]);

        return {
            words: selectContent,
            range: {
                startWord: posStart,
                endWord: posEnd,
                start: CodeMirror.Pos(posStart.line,posStart.ch - modifiers.length,'after'),
                end: CodeMirror.Pos(posEnd.line,posEnd.ch + modifiers.length,'before')
            },
            modifiers: modifiers
        }
    }
    function getAutoWords(pos){
        const curPos = pos.ch;
        const line = getLine(pos.line);
        var lineLeft,lineRight;
        var match=null,curWord = '', lineNew='',modifiers = '';
        var startPos,start = curPos,end = curPos;
        //以光标位分割点，截取前后两部分文本
        //并左侧字符串删除 特殊字符 结尾部分
        //并右侧字符串删除 特殊字符 结尾部分
        lineLeft = line.slice(0,curPos);
        lineLeft = lineLeft.replace(/(`|~~|\*\*?|__)+$/,'');
        lineRight= line.slice(curPos,line.length);
        lineRight = lineRight.replace(/^(`|~~|\*\*?|__)+/,'');

        //当前光标前后是否有 特殊字符 （`、~~、**、__、*、_）
        start = lineLeft.length;
        end = lineLeft.length + line.length - lineLeft.length - lineRight.length;
        curWord =  line.slice(start, end );

        //消除已有匹配
        lineLeft = lineLeft.replace(/^\s*([\*\-\+\>] |\d\. )+/,(item)=>{
            startPos = item.length;
            return item.replace(/./g,' ')
        });
        lineLeft = lineLeft.replace(/\\[_~`\*]/g,(item)=>{return item.replace(/./g,'a')});
        lineLeft = lineLeft.replace(/`.+?`/g,(item)=>{return item.replace(/./g,' ')});
        lineLeft = lineLeft.replace(/([~_\*]{2}|[_\*](?!\*|_|~|`)).+?\1/g,(item)=>{return item.replace(/./g,' ')});

        lineRight = reverseStr(lineRight);
        lineRight = lineRight.replace(/[_~`\*]\\/g,(item)=>{return item.replace(/./g,'a')});
        lineRight = lineRight.replace(/`.+?`/g,(item)=>{return item.replace(/./g,' ')});
        lineRight = lineRight.replace(/([~_\*]{2}|[_\*](?!\*|_|~|`)).+?\1/g,(item)=>{return item.replace(/./g,' ')});
        lineRight = reverseStr(lineRight);

        lineNew = lineLeft+curWord+lineRight;
        match = lineNew.match(/((?=(~|\*|_|`))\2*)((?=(~|\*|_|`))\4*)((?=(~|\*|_|`))\6*)((?=(~|\*|_|`))\8*)(.*?)(\7\5\3\1)/);
        if(match !== null) {
            modifiers = reverseStr(match[10]);
            start = match['index'] +  modifiers.length;
            curWord = match[9]
            end = start + match[9].length;
        }else{
            lineLeft = line.slice(0,curPos);
            lineLeft = lineLeft.replace(regStandardCharacterE,'');
            lineRight= line.slice(curPos,line.length);
            lineRight = lineRight.replace(regStandardCharacterB,'');

            //其他操作
            start = lineLeft.length;
            end = lineLeft.length + line.length - lineLeft.length - lineRight.length;
            curWord =  line.slice(start, end );
        }
        return {
            cursorEnd: curPos === end + modifiers.length,
            words: curWord,
            range: {
                startWord: CodeMirror.Pos(pos.line,start,'after'),
                endWord: CodeMirror.Pos(pos.line,end,'before'),
                start: CodeMirror.Pos(pos.line,start - modifiers.length,'after'),
                end: CodeMirror.Pos(pos.line,end + modifiers.length,'before')
            },
            modifiers: modifiers
        }
    }

    function changeModifiers(modifiers,item,reg){
        var newModifiers;
        if( item.length == 1){
            modifiers = modifiers.replace(/([~_\*])\1/g, (item)=>{
                switch (item){
                    case '~~': return '11';
                    case '__': return '22';
                    case '**': return '33';
                    default: return item;
                };
            });
        }
        if (modifiers.length > 0 && reg.test(modifiers)) {
            newModifiers = modifiers.replace(reg,'')
        } else {
            newModifiers = modifiers.replace(/^(`*)(.*)/,'$1'+item+'$2');
        }
        if( item.length == 1) {
            newModifiers = newModifiers.replace(/11|22|33/g, (item) => {
                switch (item) {
                    case '11': return '~~';
                    case '22': return '__';
                    case '33': return '**';
                }
                ;
            });
        }
        return newModifiers;
    }
    function modifiersChangeSelect(item,reg) {
        const wordsInfo = getSelectWords();
        //生成新的 修饰符
        var newModifiers = changeModifiers(wordsInfo.modifiers, item, reg);
        //计算 修饰符 变化长度
        var changeLength = newModifiers.length - wordsInfo.modifiers.length;

        //修改选词位置信息 及 包含修饰符后的 位置信息
        wordsInfo.range.startWord.ch += changeLength;
        if( wordsInfo.range.endWord.line === wordsInfo.range.startWord.line){
            //同行情况下，末尾选中位置也 增加或者减少 变化的长度
            wordsInfo.range.endWord.ch += changeLength;
            // wordsInfo.range.end.ch += changeLength*2;  //修饰符变化，尾部位置双倍长度变化
        }

        editor.replaceRange(newModifiers + wordsInfo.words + reverseStr(newModifiers), wordsInfo.range.start, wordsInfo.range.end);
        editor.setSelection(wordsInfo.range.startWord, wordsInfo.range.endWord);
    }
    function modifiersChangeAuto(item,reg) {
        const pos = editor.getCursor();
        const wordsInfo = getAutoWords(pos);
        //判断光标位置是否在选词 非末尾 并且 修饰符已存在，则移动光标到末尾
        if ( !wordsInfo.cursorEnd && (wordsInfo.modifiers.indexOf(item)>-1) ){
            editor.setCursor(wordsInfo.range.end);
            editor.focus();
            return ;
        }
        //生成新的 修饰符
        var newModifiers = changeModifiers(wordsInfo.modifiers, item, reg);
        //计算 修饰符 变化长度
        var changeLength = newModifiers.length - wordsInfo.modifiers.length;
        //修改选词位置信息 及 包含修饰符后的 位置信息
        wordsInfo.range.startWord.ch += changeLength;
        wordsInfo.range.endWord.ch += changeLength;
        // wordsInfo.range.end.ch += changeLength*2;  //修饰符变化，尾部位置双倍长度变化

        editor.replaceRange(newModifiers + wordsInfo.words + reverseStr(newModifiers), wordsInfo.range.start, wordsInfo.range.end);
        if(wordsInfo.words == '')
            editor.setCursor(wordsInfo.range.endWord);
        else {
            if (wordsInfo.cursorEnd)
                pos.ch += changeLength * 2;
            else
                pos.ch += changeLength;
            editor.setCursor(pos);
        }
    }

    function modifiersChange(item,reg) {
        if (editor.somethingSelected()) {
            modifiersChangeSelect(item,reg)
        } else {
            modifiersChangeAuto(item,reg)
        }
        editor.focus();
    }

    return editor;
})();


/*以下是一些比较傻的方案*/
/*

/!**
 * 返回选中数据区以及前后修饰符
 * @param range
 * @returns {{offset: number, content: *[], before: *[], after: *[]}}
 *!/
function checkSelection(range) {
    //获取选中 对象
    let textContent = getText(range);
    let textBefore = "", textAfter = "";
    //获取前置 对象
    range.anchor.sticky = 'before';
    let rangeBefore = getPosRange(range.anchor);
    if (range.head == rangeBefore.head) {
        _.extend(rangeBefore.head, rangeBefore.anchor);
    } else {
        _.extend(rangeBefore.head, range.anchor);
        textBefore = getText(rangeBefore);
    }
    //获取后置 对象
    range.head.sticky = 'after';
    let rangeAfter = getPosRange(range.head);
    if (range.head == rangeAfter.head) {
        _.extend(rangeAfter.anchor, rangeAfter.head);
    } else {
        _.extend(rangeAfter.anchor, range.head);
        textAfter = getText(rangeAfter);
    }

    let strShort, strLong;
    if (textBefore.length > textAfter.length)
        strLong = textBefore, strShort = textAfter;
    else
        strShort = textBefore, strLong = textAfter;

    if (/^[\*~_`]+$/.test(strShort) && strShort.replace(/^ *!/).startsWith(reverseStr(strLong).replace(/^ *!/))) {
        if (textBefore.length > textAfter.length) {
            rangeBefore.anchor.ch = rangeBefore.head.ch - strShort.length;
            textBefore = textBefore.slice(textBefore.length - strShort.length, textBefore.length);
        }
        else if (textBefore.length < textAfter.length) {
            rangeAfter.head.ch = rangeAfter.anchor.ch + strShort.length;
            textAfter = textAfter.slice(0, strShort.length);
        }
    } else {
        _.extend(rangeBefore.anchor, rangeBefore.head);
        textBefore = '';

        _.extend(rangeAfter.head, rangeAfter.anchor);
        textAfter = '';
    }
    range.anchor.sticky = null;
    range.head.sticky = null;
    return {
        offset: 0,
        content: ['' == textContent, textContent, range],
        before: ['' == textBefore, textBefore, rangeBefore],
        after: ['' == textAfter, textAfter, rangeAfter]
    }
}

/!**
 * 获取指定范围的前一个或者后一个范围
 * @param range
 * @param sticky
 * @returns {*}
 *!/
function getRange(range, sticky) {
    var pos = range.anchor;
    sticky = sticky || 'before';
    if ('after' == sticky)
        pos = range.head;
    pos.sticky = sticky;
    return getPosRange(pos)
}

/!**
 * 获取文本内容
 * @param range
 * @returns {*}
 *!/
function getText(range) {
    return editor.getRange(range.anchor, range.head);
}

function getCheckStart(param) {
    let lineStart = null;
    if (param.anchor && param.anchor.line) {
        lineStart = editor.getLine(param.anchor.line).match(/^( |> )*\* /);
    } else if (typeof lineStart == 'string') {
        lineStart = param.match(/^( |> )*\* /);
    }
    return (null == lineStart) ? 0 : lineStart[0].length;
    ;
}

function checkRange(range, content) {
    var checkContent, findWord = content.slice(0, range.head.ch).match(regStandardCharacterE);
    if (findWord != null) {
        checkContent = findWord[0];
        range.anchor.ch = range.head.ch - checkContent.length;
    }
    findWord = content.slice(range.anchor.ch, content.length).match(regStandardCharacterB);
    if (findWord != null) {
        checkContent = findWord[0];
        range.head.ch = range.anchor.ch + checkContent.length;
    }
    return checkContent
}

/!**
 * 获取强调内容真实范围 前（before)/后（after) 范围集合
 * @param range     指定范围
 * @param sticky    前/后查询
 * @returns {*}     内容真实范围（包含@range范围）
 *!/
function serachContentRange(range, sticky) {
    sticky = sticky || 'before';
    let matchText = getText(range);
    let reg = new RegExp(reverseStr(matchText).replace(/\*!/g, '\\*') + '$');
    let rangeHelper, rangeNext = range;
    let strNext;
    let success = true;
    let safeCount = -1;
    //查找开头
    let checkStart = getCheckStart(range);
    //循环找出 与 matchText 对称 textHelper 如：**abcd**  ~abc~
    do {
        rangeHelper = rangeNext;
        rangeNext = getRange(rangeHelper, sticky);
        strNext = getText(rangeNext);
        if (checkStart > rangeHelper.anchor.ch || rangeHelper.anchor.ch == rangeNext.anchor.ch || safeCount > 1000) {
            success = false;
            break;
        }
        safeCount++;
    } while (!reg.test(strNext))
    if (success) {
        if (sticky == 'before') {
            _.extend(rangeHelper.head, range.anchor);
        } else {
            _.extend(rangeHelper.anchor, range.head);
        }
    } else {
        _.extend(rangeHelper.head, rangeHelper.anchor);
    }
    return rangeHelper;
}

function getSelection() {
    if (editor.state.completionActive) {
        return;
    }
    // 自动获取有效文本 结构如下：
    // 标识符+内容+标识符   (前 中 后 结构)
    let rangeContent;
    let textContent = '';
    //选中状态下
    if (editor.somethingSelected()) {
        var start = editor.getCursor('from');
        var end = editor.getCursor('to');
        //获取选中 对象
        rangeContent = getPosRange(end);
        rangeContent.anchor.ch = start.ch;
        rangeContent.anchor.line = start.line;
        rangeContent.head.ch = end.ch;
        rangeContent.head.line = end.line;
        return checkSelection(rangeContent);
    } else {
        /!**
         * 未选中状态：
         * 1.光标在空格之后
         * 2.光标在普通字符中
         * 3.光标在语法标志中
         * 4.光标在标记之中
         *!/

        var curPos = editor.getCursor();
        curPos.sticky = 'before';
        var rangeHelper = rangeContent = getPosRange(curPos);
        let lineContent = getLine(rangeContent);
        let checkStart = getCheckStart(lineContent);
        if (checkStart > curPos.ch) {
            _.extend(rangeContent.anchor, rangeContent.head);
            return checkSelection(rangeContent);
        }

        textContent = getText(rangeContent);
        //光标前面是空格
        if (/^ +$/.test(textContent)) {
            //空格+光标
            curPos.sticky = 'after';
            rangeContent = getPosRange(curPos);
            textContent = getText(rangeContent);
            if (/^ +$/.test(textContent)) {
                //空格+光标+空格或结尾 （前后都是空格，直接插入内容） |
                _.extend(rangeContent.anchor, rangeContent.head);
                return checkSelection(rangeContent);
            } else if (/^[\*~_`]+$/.test(textContent)) {
                //空格+光标+标记   |**
                //需要找到更后一位单词检查
                rangeContent.head.sticky = 'after';
                rangeContent = getPosRange(rangeContent.head);
                checkRange(rangeContent, lineContent);
                return checkSelection(rangeContent);
            } else {
                //空格+光标+内容   |abc
                checkRange(rangeContent, lineContent);
                return checkSelection(rangeContent);
            }
        } else if (/^[\*~`]+/.test(textContent)) {
            //标记+光标
            //1.标记+光标+内容
            //2.内容+标记+光标
            //需要向前查找单词
            if (0 != rangeHelper.anchor.ch) {
                //1.优先开始前找    标记+光标
                rangeContent = serachContentRange(rangeHelper, 'before');
                if (rangeContent.empty()) {
                    rangeContent = serachContentRange(rangeHelper, 'after');
                }
            } else {
                //2.向后查找
                rangeContent = serachContentRange(rangeHelper, 'after');
                if (rangeContent.empty()) {
                    rangeContent = serachContentRange(rangeHelper, 'before');
                }
            }
            return checkSelection(rangeContent);
        } else {
            //空格+光标+标记内容
            checkRange(rangeContent, lineContent);
            return checkSelection(rangeContent);
        }
    }
}*/
