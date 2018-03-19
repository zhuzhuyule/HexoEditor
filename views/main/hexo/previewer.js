'use strict';

const YAML = require('yamljs');
const Hexo = require('./hexo');
const __ = require('lodash');
const Promise = require('bluebird');
const url = require('url');

var rEscapeContent = /<escape(?:[^>]*)>([\s\S]*?)<\/escape>/g;
var rSwigVar = /\{\{[\s\S]*?\}\}/g;
var rSwigComment = /\{#[\s\S]*?#\}/g;
var rSwigBlock = /\{%[\s\S]*?%\}/g;
var rSwigFullBlock = /\{% *(.+?)(?: *| +.*)%\}[\s\S]+?\{% *end\1 *%\}/g;
var placeholder = '\uFFFC';
var rPlaceholder = /(?:<|&lt;)\!--\uFFFC(\d+)--(?:>|&gt;)/g;

global.lodash = require('lodash');
global.ctx = global.hexo = new Hexo();


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
                    srcLocal = imgManager.resolvePath(src)|| '';
                    //首先查询用户设置目录
                    if (!srcLocal && moeApp.config.get('image-source-center')) {
                        srcLocal = path.join(moeApp.config.get('image-source-center'), src);
                        if (!fs.existsSync(srcLocal))
                            srcLocal = '';
                    }
                    //再查询Hexo资源目录
                    if (!srcLocal && moeApp.useHexo && hexo.config.__basedir) {
                        srcLocal = path.join(hexo.config.__basedir, 'source', src);
                        if (!fs.existsSync(srcLocal))
                            srcLocal = '';
                    }
                    //最后查询文档所在目录
                    if (!srcLocal)
                        srcLocal = path.join(hexoWindow.directory, src);
                    //最后查询文档所在目录
                    if (!srcLocal)
                        srcLocal = path.join(moeApp.appDataPath,'images');

                    img.id = src;
                    img.setAttribute('localImg', true);
                    src = url.resolve('file://', srcLocal);
                }
            }
            img.setAttribute('src', src);
        }
        data.content = contentHtml.html();
    }

    if (moeApp.useHexo) {
        Promise.resolve()
            .then(tryFilterHeader).catch(console.log)
            .then(before_post_render).catch(console.log)
            .then(escapeTag).catch(console.log)
            .then(markdownContent, markdownContent).catch(console.log)
            .then(backTag).catch(console.log)
            .then(after_post_render).catch(console.log)
            .then(checkRes).catch(console.log)
            .then(function () {
                callback(data.content)
            })
    } else {
        Promise.resolve()
            .then(markdownContent, markdownContent).catch(console.log)
            .then(checkRes).catch(console.log)
            .then(function () {
                callback(data.content)
            })
    }

};

module.exports = Previewer;
