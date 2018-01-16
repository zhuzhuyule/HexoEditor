'use strict';

const YAML = require('yamljs');
const Hexo = require('./hexo');
const __ = require('lodash');
const Promise = require('bluebird');
const url = require('url');
const fs = require('fs');

var rEscapeContent = /<escape(?:[^>]*)>([\s\S]*?)<\/escape>/g;
var rSwigVar = /\{\{[\s\S]*?\}\}/g;
var rSwigComment = /\{#[\s\S]*?#\}/g;
var rSwigBlock = /\{%[\s\S]*?%\}/g;
var rSwigFullBlock = /\{% *(.+?)(?: *| +.*)%\}[\s\S]+?\{% *end\1 *%\}/g;
var placeholder = '\uFFFC';
var rPlaceholder = /(?:<|&lt;)\!--\uFFFC(\d+)--(?:>|&gt;)/g;

global.lodash = require('lodash');
global.ctx = global.hexo = new Hexo();
moeApp.setHexo(hexo);

function Previewer() {
}

Previewer.prototype.render = function (content, MoeMark, options, callback) {
    hexo.isLoadedTag || hexo.loadTags();

    var data = {
        highlightEx: hexo.config.highlightEx,
        content: content
    };
    var cache = [];
    var tag = hexo.extend.tag;

    function escapeContent(str) {
        return '<!--' + placeholder + (cache.push(str) - 1) + '-->';
    }

    function tryFilterHeader() {
        data.content = data.content.replace(/^---+([\w\W]+?)---+/, function () {
            data = __.extend(data, YAML.parse(arguments[1]))
            return '';
        });
    }

    function before_post_render() {
        hexo.execFilterSync('before_post_render', data, {context: hexo});
    }

    function escapeTag() {
        data.content = data.content.toString()
            .replace(rEscapeContent, escapeContent)
            .replace(rSwigFullBlock, escapeContent)
            .replace(rSwigBlock, escapeContent)
            .replace(rSwigComment, '')
            .replace(rSwigVar, escapeContent);
    }

    function markdownContent() {
        MoeMark(data.content, options, function (err, content) {
            data.content = content;
        });
    }

    function backTag() {
        // Replace cache data with real contents
        data.content = data.content.replace(rPlaceholder, function () {
            return cache[arguments[1]];
        });
        // Render with Nunjucks
        data.content = tag.render(data.content, data);
    }

    function after_post_render() {
        hexo.execFilter('after_post_render', data, {context: hexo});
        checkRes();
    }

    function checkRes() {
        let contentHtml = $('<div></div>');
        contentHtml.html(data.content);
        let imgs = contentHtml.find('img') || [];
        for (let img of imgs) {
            let src = img.getAttribute('src');
            let srcLocal = '';
            if (src && (url.parse(src).protocol === null)) {
                if (!fs.existsSync(src)) {
                    srcLocal = (imgRelativePathToID[src] ? imgRelativeToAbsolute[src] : '');
                    if (!srcLocal && !moeApp.defTheme && hexo.config.__basedir) {
                        srcLocal = path.join(hexo.config.__basedir, 'source', src);
                        if (!fs.existsSync(srcLocal))
                            srcLocal = '';
                    }
                    if (!srcLocal && moeApp.config.get('image-path')) {
                        srcLocal = path.join(moeApp.config.get('image-path'), src);
                        if (!fs.existsSync(srcLocal))
                            srcLocal = '';
                    }
                    if (!srcLocal)
                        srcLocal = path.join(w.directory, src);
                    img.id = src;
                    img.setAttribute('localImg', true);
                    src = url.resolve('file://', srcLocal);
                }
            }
            img.setAttribute('src', src);
        }
        data.content = contentHtml.html();
    }

    if (moeApp.defTheme) {
        Promise.resolve()
            .then(escapeTag).catch(console.log)
            .then(markdownContent, markdownContent).catch(console.log)
            .then(backTag).catch(console.log)
            .then(function () {
                callback(data.content)
            })
    } else {
        Promise.resolve()
            .then(tryFilterHeader).catch(console.log)
            .then(before_post_render).catch(console.log)
            .then(escapeTag).catch(console.log)
            .then(markdownContent, markdownContent).catch(console.log)
            .then(backTag).catch(console.log)
            .then(after_post_render).catch(console.log)
            .then(function () {
                callback(data.content)
            })
    }

};

module.exports = Previewer;
