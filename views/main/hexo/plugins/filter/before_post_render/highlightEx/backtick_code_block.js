'use strict';

// var stripIndent = require('strip-indent');
var highlight = require('./highlight');

var rBacktick = /(\s*)(`{3,}|~{3,}) *(.*) *\n([\s\S]+?)\s*\2(\n|$)/g;

var rUrl = /\s+url:(https?:\/\/\S+)(?:\s+(\S+))?\s*/i;
var rLang = /(?:^|lang:)\s*(\w+)[\$\s]/i;
var rLineNumber = /\s*line_number:(\w+)/i;
var rDiff = /\s*diff:(\w+)/i;
var rFirstLine = /\s*first_line:(\d+)/i;
var rMark = /\s*mark:([0-9,\-]+)/i;
var rDirCaption = /\s:((?:.(?!\s\b\w+:))*(?:\w+\.)*(?:.(?!\s\b\w+:))*(?:\w+\.)*[\\\/])?([^\\\/]+?)(?:(\.[^\.\s]+)\b)?\s*(?=\s\b\w+:|$)/i;
// var rDirCaption = /(?#begin)\s+:(?#path)((?:.(?!\s\b\w+:))*(?:\w+\.)*(?:.(?!\s\b\w+:))*(?:\w+\.)*[\\\/])?(?#name)([^\\\/]+?)(?#suffix)(?:\.([^\.\s]+)\b)?(?#end)\s*(?=\s\b\w+:|$)/;


/**
 * Code block
 *
 * Syntax:
 *   ```language [:title] [lang:language] [line_number:(true|false)] [first_line:number] [mark:#,#-#] [url:url download|下载]%}
 *   code snippet
 *   ```
 */
function matchCaption(caption) {
    if (rDirCaption.test(caption)) {
        var capMatch;
        capMatch = caption.match(rDirCaption);
        return '<span class="fileDir">' + capMatch[1] + '</span><span class="caption">' + capMatch[2] + '</span><span class="suffix">.' + capMatch[3] + '</span>';
    } else {
        return '<span class="caption">' + caption + '</span>';
    }
}

function backtickCodeBlock(data) {
    var config = this.config.highlight || {};
    if (!config.enable) return;

    data.content = data.content.replace(rBacktick, function() {
        var start = arguments[1];
        var end = arguments[5];
        var args = arguments[3];
        var content = arguments[4];

        var args = ' ' + args + ' ';
        // 完全修改 为  tag模式
        var caption = '';
        var lang = '';
        var line_number = config.line_number;
        var rdiff = false;
        var first_line = 1;
        var mark = [];
        var match;

        if (rLineNumber.test(args)) {
            args = args.replace(rLineNumber, function() {
                line_number = arguments[1] === 'true';
                return ' ';
            });
        }
        if (rDiff.test(args)) {
            args = args.replace(rDiff, function() {
                rdiff = arguments[1] === 'true';
                return ' ';
            });
        }

        if (rFirstLine.test(args)) {
            args = args.replace(rFirstLine, function() {
                first_line = arguments[1];
                return ' ';
            });
        }

        if (rMark.test(args)) {
            args = args.replace(rMark, function() {
                mark = arguments[1].split(',').reduce(function getMarkedLines(prev, cur) {
                    var a, b, temp;
                    if (/\-/.test(cur)) {
                        a = Number(cur.substr(0, cur.indexOf('-')));
                        b = Number(cur.substr(cur.indexOf('-') + 1));
                        if (b < a) { // switch a & b
                            temp = a;
                            a = b;
                            b = temp;
                        }

                        for (; a <= b; a++) {
                            prev.push(a);
                        }

                        return prev;
                    }

                    prev.push(Number(cur));
                    return prev;
                }, []);

                return ' ';
            });
        }

        if (rDirCaption.test(args)) {
            args = args.replace(rDirCaption, function() {
                var path = arguments[1];
                var title = arguments[2];
                var suffix = arguments[3];

                if (path) {
                    caption = '<span class="fileDir">' + path + '</span>';
                }
                if (title) {
                    caption += '<span class="caption">' + title + '</span>';
                }
                if (suffix) {
                    caption += '<span class="suffix">' + suffix + '</span>';
                    lang = suffix;
                }
                return ' ';
            });
        }

        if (rLang.test(args)) {
            args = args.replace(rLang, function() {
                lang = arguments[1];
                return ' ';
            });
        }

        if (rUrl.test((args))) {
            args = args.replace(rUrl, function() {
                var url = arguments[1];
                var option = arguments[2];
                if (typeof option === "undefined") {
                    caption += '<a href="' + url + '" target="_blank">link</a>'
                } else if (option == "download" || option == "下载") {
                    caption += '<a href="' + url + '" download=""><i class="fa fa-download" aria-hidden="true"></i> ' + option + '</a>'
                } else {
                    caption += '<a href="' + url + '" target="_blank">' + option + '</a>'
                }
                return ' ';
            });

            // match = args.match(rUrl);
            // match = args.match(rCaptionUrlTitle);
            // caption = matchCaption(match[1]) + '<a href="' + match[2] + match[3] + '">' + match[4] + '</a>';
        }

        // content = stripIndent(content);

        content = highlight(content, {
            lang: lang,
            firstLine: first_line,
            caption: caption,
            gutter: line_number,
            diff: rdiff,
            mark: mark,
            tab: config.tab_replace,
            autoDetect: config.auto_detect
        })
            .replace(/{/g, '&#123;')
            .replace(/}/g, '&#125;');

        return start + '<escape>' + content + '</escape>' + (end ? '\n\n' : '');
    });
}

module.exports = backtickCodeBlock;