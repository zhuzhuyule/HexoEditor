module.exports = (() => {
    const regStandardCharacterB = /^((-?\d+(,\d{3})*(\.\d+)?(x?\*?\d*\^\d+)?)|((\d+-)+\d+)|(_?[-\da-zA-Z\u4E00-\u9FFF\-]_?))+/;
    const regStandardCharacterE = /((-?\d+(,\d{3})*(\.\d+)?(x?\*?\d*\^\d+)?)|((\d+-)+\d+)|(_?[-\da-zA-Z\u4E00-\u9FFF\-]_?))+$/;
    var editor = CodeMirror.fromTextArea(document.querySelector('#editor textarea'), {
        lineNumbers: false,
        mode: 'yaml-frontmatter',
        matchBrackets: true,
        theme: moeApp.config.get('editor-theme'),
        lineWrapping: true,
        extraKeys: {
            Esc: 'singleSelection',
            Enter: 'newlineAndIndentContinueMarkdownList',
            Home: 'goLineLeft',
            End: 'goLineRight',
            Tab: function (codeMirror) {
                codeMirror.indentSelection(parseInt(codeMirror.getOption("indentUnit")));
            },
            'Shift-Tab': 'indentLess',
            'Ctrl-B': function () {
                emphasizeChange('**',/(\*\*|__)+/g);
            },
            'Ctrl-I': function () {
                emphasizeChange('*',/(\*|_)+/g);
            },
            'Ctrl-`': function () {
                emphasizeChange('`',/(`)+/g);
            }
        },
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

    function emphasizeChange(item,reg) {
        var content = getSelection();
        var left = content.before[1];
        var right = content.after[1];
        var change;
        if ((left.length > 1 && left == reverseStr(right)) && reg.test(left)) {
            content.before[1] = left.replace(reg, '');
            content.after[1] = right.replace(reg, '');
            change = left.length - content.before[1].length;
            content.content[2].anchor.ch -= change;
            content.content[2].head.ch -= change;
        } else {
            content.before[1] = item + left;
            content.after[1] += item;
            content.content[2].anchor.ch += item.length;
            content.content[2].head.ch += item.length;
        }

        if (editor.somethingSelected()) {
            editor.replaceRange(content.before[1] + content.content[1] + content.after[1], content.before[2].anchor, content.after[2].head);
            editor.setSelection(content.content[2].anchor, content.content[2].head);
            editor.focus();
        } else {
            editor.replaceRange(content.before[1] + content.content[1] + content.after[1], content.before[2].anchor, content.after[2].head);
        }
    }

    /**
     * 返回选中数据区以及前后修饰符
     * @param range
     * @returns {{offset: number, content: *[], before: *[], after: *[]}}
     */
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

        if (/^[\*~_`]+$/.test(strShort) && strShort.replace(/^ */).startsWith(reverseStr(strLong).replace(/^ */))) {
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

    /**
     * 字符置反
     * @param str
     */
    function reverseStr(str) {
        return str.split('').reverse().join('');
    }

    /**
     * 获取指定位置所在范围
     * @param pos
     * @returns {*}
     */
    function getPosRange(pos) {
        return editor.findWordAt(pos)
    }

    /**
     * 获取指定范围的前一个或者后一个范围
     * @param range
     * @param sticky
     * @returns {*}
     */
    function getRange(range, sticky) {
        var pos = range.anchor;
        sticky = sticky || 'before';
        if ('after' == sticky)
            pos = range.head;
        pos.sticky = sticky;
        return getPosRange(pos)
    }

    /**
     * 获取文本内容
     * @param range
     * @returns {*}
     */
    function getText(range) {
        return editor.getRange(range.anchor, range.head);
    }

    function getLine(range) {
        return editor.getLine(range.anchor.line);
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

    /**
     * 获取强调内容真实范围 前（before)/后（after) 范围集合
     * @param range     指定范围
     * @param sticky    前/后查询
     * @returns {*}     内容真实范围（包含@range范围）
     */
    function serachContentRange(range, sticky) {
        sticky = sticky || 'before';
        let matchText = getText(range);
        let reg = new RegExp(reverseStr(matchText).replace(/\*/g, '\\*') + '$');
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
            /**
             * 未选中状态：
             * 1.光标在空格之后
             * 2.光标在普通字符中
             * 3.光标在语法标志中
             * 4.光标在标记之中
             */

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
    }

    return editor;
})();
