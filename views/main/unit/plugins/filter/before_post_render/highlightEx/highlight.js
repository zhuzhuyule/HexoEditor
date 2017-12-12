'use strict';

var hljs = require('highlight.js/lib/highlight');
var Entities = require('html-entities').XmlEntities;
var entities = new Entities();
var alias = require('./highlight_alias.json');

hljs.configure({
    classPrefix: ''
});

function highlightUtil(str, options) {
    if (typeof str !== 'string') throw new TypeError('str must be a string!');
    options = options || {};

    var gutter = options.hasOwnProperty('gutter') ? options.gutter : true;
    var wrap = options.hasOwnProperty('wrap') ? options.wrap : true;
    var firstLine = options.hasOwnProperty('firstLine') ? +options.firstLine : 1;
    var diff = options.hasOwnProperty('diff') ? options.diff : false;
    var caption = options.caption;
    var mark = options.hasOwnProperty('mark') ? options.mark : [];
    var tab = options.tab;
    var data = highlight(str, options);

    if (!wrap) return data.value;

    var lines = data.value.split('\n');
    var numbers = '';
    var content = '';
    var result = '';
    var diffclass = '';
    var line;

    for (var i = 0, len = lines.length; i < len; i++) {
        line = lines[i];
        if (tab) line = replaceTabs(line, tab);
        numbers += '<div class="line">' + (firstLine + i) + '</div>';
        diffclass = '';
        if (diff) {
            if (/^([\+\-\!])[^\1]/i.test(line)) {
                if (/^\-/i.test(line))
                    diffclass = ' diff-deletion';
                else
                    diffclass = ' diff-addition';
                line = line.slice(1);
            }
        }
        content += '<div class="line';
        content += (mark.indexOf(firstLine + i) !== -1) ? ' marked' : '';
        content += diffclass;
        content += '">' + line + '</div>';
    }

    result += '<figure class="highlight' + (data.language ? ' ' + data.language : '') + '">';

    if (caption) {
        result += '<figcaption>' + caption + '</figcaption>';
    }

    //旧样式
    //if (gutter) {
    //    result += '<table style="hasGutter"><tr>';
    //    result += '<td class="gutter"><pre>' + numbers + '</pre></td>';
    //} else {
    //    result += '<table style="noGutter"><tr>';
    //}

    //result += '<td class="code"><pre>' + content + '</pre></td>';
    //result += '</tr></table></figure>';

    //新样式
    result += '<div class="figcode">';

    if (gutter) {
        result += '<div class="gutter"><pre>' + numbers + '</pre></div>';
        //} else {
        //    result += '<div class="gutter hide"><pre>' + numbers + '</pre></div>';
    }

    result += '<div class="code"><pre>' + content + '</pre></div>';
    result += '</div></figure>';

    return result;
}

function encodePlainString(str) {
    return entities.encode(str);
}

function replaceTabs(str, tab) {
    return str.replace(/^\t+/, function(match) {
        var result = '';

        for (var i = 0, len = match.length; i < len; i++) {
            result += tab;
        }

        return result;
    });
}

function loadLanguage(lang) {
    hljs.registerLanguage(lang, require('highlight.js/lib/languages/' + lang));

}

function loadLanguageExtend(lang) {
    hljs.registerLanguage(lang, require('./languages/'+lang));
}

function tryLanguage(lang) {
    if (hljs.getLanguage(lang)) return true;
    if (alias.extends[lang]) {
        loadLanguageExtend(alias.extends[lang]);
        return true;
    }
    if (!alias.aliases[lang]) return false;
    loadLanguage(alias.aliases[lang]);
    return true;
}

function loadAllLanguages() {
    alias.languages.filter(function(lang) {
        return !hljs.getLanguage(lang);
    }).forEach(loadLanguage);
}

function highlight(str, options) {
    var lang = options.lang;
    var autoDetect = options.hasOwnProperty('autoDetect') ? options.autoDetect : false;

    if (!lang && autoDetect) {
        loadAllLanguages();
        lang = (function() {
            var result = hljs.highlightAuto(str);
            if (result.relevance > 0 && result.language) return result.language;
            return;
        })();
    }

    if (!lang) {
        lang = 'plain';
    }

    var result = {
        value: encodePlainString(str),
        language: lang.toLowerCase()
    };

    if (result.language === 'plain') {
        return result;
    }

    if (!tryLanguage(result.language)) {
        result.language = 'plain';
        return result;
    }

    return tryHighlight(str, result.language) || result;
}

function tryHighlight(str, lang) {
    try {
        var matching = str.match(/(\r?\n)/);
        var separator = matching ? matching[1] : '';
        var lines = matching ? str.split(separator) : [str];
        var result = {};
        var html = '';

        var rReg = new RegExp('\{\{%.*?\%}\}', '');
        var rRegDeal = new RegExp('((?:(?!\{\{%.*?%\}\}).)+)((?:\{\{%(.*?)%\}\})|$)', 'g');
        var lineHtmlValue, lineValue, matchPart;

        while (lines.length > 0) {
            lineValue = lines.shift();
            if (rReg.test(lineValue)) {
                lineHtmlValue = '';
                while (matchPart = rRegDeal.exec(lineValue)) {
                    result = hljs.highlight(lang, matchPart[1], false, result.top);
                    if (typeof matchPart[3] === 'undefined') {
                        lineHtmlValue += result.value;
                    } else {
                        lineHtmlValue += result.value + matchPart[3];
                    }
                }
                result.value = lineHtmlValue;
            } else {
                result = hljs.highlight(lang, lineValue, false, result.top);
            }
            html += ('' == html ? '' : separator) + result.value;
        }

        result.value = html;
        return result;
    } catch (err) {
        return;
    }
}


module.exports = highlightUtil;