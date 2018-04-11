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

const body = document.body;
const codemirror = document.querySelector('#editor > .CodeMirror');

function tryRun(callback, val){
    try{
        callback(val)
    } catch (e){
        console.log(e)
    }
}


function setEditorFont(val) {
    body.setAttribute('settings-editor-font', val);
}

function setScrollTogether(val) {
    moeApp.config.set('scroll-Together',val);
    window.scrollTogether = val;
}

function setShowLineNumber(val) {
    let editor = document.querySelector('#editor');
    if (val){
        editor.classList.add('gutter');
    } else {
        editor.classList.remove('gutter')
    }

    window.editor.setOption('lineNumbers', !!val);
    window.editor.refresh();
}

function setEditorTheme(val) {
    for (const s of codemirror.classList) {
        if (s.startsWith('cm-s')) {
            codemirror.classList.remove(s);
            break;
        }
    }
    codemirror.classList.add('cm-s-' + val);

    // let link = document.getElementById('editor-theme');
    // if (!link) {
    //     link = document.createElement('link');
    //     document.head.appendChild(link);
    //     link.rel = 'stylesheet';
    //     link.id = 'editor-theme';
    // }
    // link.href = path.resolve(path.dirname(path.dirname(require.resolve('codemirror'))), 'theme', val+'.css');
}

function setEditorFontSize(val) {
    codemirror.classList.add('notransition');
    codemirror.style.fontSize = val + 'px';
    codemirror.offsetHeight;
    codemirror.classList.remove('notransition');
    window.editor.refresh();
}

function setEditorLineHeight(val) {
    codemirror.classList.add('notransition');
    codemirror.style.lineHeight = val;
    codemirror.offsetHeight;
    codemirror.classList.remove('notransition');
    window.editor.refresh();
}

function setImagePath(val) {
    imgManager.updateBase();
    window.editor.refresh();
}

function setMath(val) {
    window.editor.refresh();
    window.updatePreview(true);
}

function setUMLDiagrams(val) {
    window.updatePreview(true);
}

function setHighlightTheme(val) {
    const themedir = moeApp.getHighlightThemesDir();
    let link = document.getElementById('highlight-theme');
    if (!link) {
        link = document.createElement('link');
        document.head.appendChild(link);
        link.rel = 'stylesheet';
        link.id = 'highlight-theme';
    }
    let file = path.join(themedir, `${val}.css`);
    link.href = (fs.existsSync(file) ? file : '');

    link = document.getElementById('highlight-theme-index');
    if (!link) {
        link = document.createElement('link');
        document.head.appendChild(link);
        link.rel = 'stylesheet';
        link.id = 'highlight-theme-index';
    }
    if ( val == 'none'){
        link.href = '';
    } else{
        file = path.join(themedir, 'index.css');
        link.href = (fs.existsSync(file) ? file : '');
    }
}

function setRenderTheme(val) {
    const container = document.getElementById('container');
    if (['*GitHub','*No Theme'].indexOf(val) > -1){
        $(container).addClass('_def');
        $(container).removeClass('post-body');
    } else /*if ( 'post-body' == val )*/{
        $(container).removeClass('_def');
        $(container).addClass('post-body');
    }
    moeApp.containerClasss = container.className.replace('preview','');

    let link = document.getElementById('render-theme');
    if (!link) {
        link = document.createElement('link');
        document.head.appendChild(link);
        link.rel = 'stylesheet';
        link.id = 'render-theme';
    }
    link.href = require('./moe-rendertheme').getCSS(true);
}

function setHexoAutoSetting(val) {
    // hexo.highlightEx = val;
    // window.updatePreview(true);
};

function setHexoConfigEnable(val) {
    moeApp.useHexo = val;
    hexo.changeConfig();
    imgManager.updateBase();
    window.updatePreview(true);
};

function setHexoConfig(val) {
    hexo.changeConfig();
    imgManager.updateBase();
    window.updatePreview(true);
};

function setHexoTagPaths(val) {
    hexo.loadTags();
    window.updatePreview(true);
}

function setTabSize(val) {
    window.editor.setOption('tabSize', parseInt(val));
    window.editor.setOption('indentUnit', parseInt(val));
    window.editor.refresh();
}

function setCustomCSSs(val) {
    let a = document.getElementsByClassName('link-custom-csss');
    if (a.length !== 0) for (let e of a) e.parentNode.removeChild(e);
    if (Object.getOwnPropertyNames(val).length !== 0) for (let x in val) if (val[x].selected) {
        let link = document.createElement('link');
        link.href = val[x].fileName;
        link.rel = 'stylesheet';
        link.className = 'link-custom-csss';
        document.head.appendChild(link);
    }
}

function setTabSize(val) {
    window.editor.setOption('tabSize', parseInt(val));
    window.editor.setOption('indentUnit', parseInt(val));
    window.editor.refresh();
}

function setZoomFactor(val) {
    var scale = parseFloat(val);
    var webFrame = require('electron').webFrame;
    if (scale >= 0.7 && scale <= 1.6){
        webFrame.setZoomFactor(scale)
    }
}

function setSourceCenter(val) {
    if(imgManager ){
        imgManager.updateBase();
    }
}

function setImageWebType(val) {
    if (val === 'smms'){
        if (oldURL){
            let content = editor.getValue();
            content = content.replace(new RegExp(oldURL,'g'),'https://i.loli.net');
            editor.setValue(content);
            hexoWindow.changed = true;
            hexoWindow.content = content;
        }
        moeApp.config.set('image-base-url', 'https://i.loli.net');
    }
}

function SetQiNiuAccessKey(val) {
    if (imgManager && imgManager.uploadServer) {
        imgManager.uploadServer.updateQiniu(val)
    }
}

function SetQiNiuSecretKey(val) {
    if (imgManager && imgManager.uploadServer) {
        imgManager.qiniuServer.update('', val)
    }
}


function SetQiNiuBucket(val) {
    if (imgManager && imgManager.uploadServer) {
        imgManager.uploadServer.updateQiniu('', '', val)
    }
}

function SetQiNiuWeb(val) {
    if (val && val.oldURL && val.newURL) {
        let content = editor.getValue();
        content = content.replace(new RegExp(val.oldURL, 'g'), val.newURL);
        editor.setValue(content);
        hexoWindow.changed = true;
        hexoWindow.content = content;
    }
    if (imgManager && imgManager.uploadServer) {
        imgManager.uploadServer.updateQiniu('', '', '', val.newURL)
    }
}


function SetCosAccessKey(val) {
    if (imgManager && imgManager.uploadServer) {
        imgManager.uploadServer.updateCos(val)
    }
}

function SetCosSecretKey(val) {
    if (imgManager && imgManager.uploadServer) {
        imgManager.uploadServer.updateCos('', val)
    }
}


function SetCosBucket(val) {
    if (imgManager && imgManager.uploadServer) {
        val = (val || "|").split('|');
        imgManager.uploadServer.updateCos('', '', val[0], val[1])
    }
}

function SetCosWeb(val) {
    if (val && val.oldURL && val.newURL) {
        let content = editor.getValue();
        content = content.replace(new RegExp(val.oldURL, 'g'), val.newURL);
        editor.setValue(content);
        hexoWindow.changed = true;
        hexoWindow.content = content;
    }
    if (imgManager && imgManager.uploadServer) {
        let customize = (val && val.customize) ? val.customize : '';
        imgManager.uploadServer.updateCos('', '', '', '', moeApp.config.get('image-cos-url-protocol'), customize)
    }
}

tryRun(setEditorFont, moeApp.config.get('editor-font'));
tryRun(setShowLineNumber, !!moeApp.config.get('editor-ShowLineNumber'));
tryRun(setScrollTogether, moeApp.config.get('scroll-Together'));
tryRun(setEditorTheme, moeApp.config.get('editor-theme'));
tryRun(setEditorFontSize, moeApp.config.get('editor-font-size'));
tryRun(setZoomFactor, moeApp.config.get('scale-factor'));
tryRun(setEditorLineHeight, moeApp.config.get('editor-line-height'));
tryRun(setRenderTheme, moeApp.config.get('render-theme'));
tryRun(setHighlightTheme, moeApp.config.get('highlight-theme'));
tryRun(setCustomCSSs, moeApp.config.get('custom-csss'));
tryRun(setHexoAutoSetting, moeApp.config.get('hexo-auto-setting'));
tryRun(setHexoConfigEnable, moeApp.config.get('hexo-config-enable'));
tryRun(setHexoConfig, moeApp.config.get('hexo-config'));
tryRun(setHexoTagPaths, moeApp.config.get('hexo-tag-paths'));

const ipcRenderer = require('electron').ipcRenderer;
ipcRenderer.on('setting-changed', (e, arg) => {
    if (arg.key === 'editor-font') {
        tryRun(setEditorFont, arg.val);
    } else if (arg.key === 'editor-ShowLineNumber') {
        tryRun(setShowLineNumber, arg.val);
    } else if (arg.key === 'scroll-Together') {
        tryRun(setScrollTogether, arg.val);
    } else if (arg.key === 'editor-theme') {
        tryRun(setEditorTheme, arg.val);
    } else if (arg.key === 'editor-font-size') {
        tryRun(setEditorFontSize, arg.val);
    } else if (arg.key === 'editor-line-height') {
        tryRun(setEditorLineHeight, arg.val);
    } else if (arg.key === 'image-source-center') {
        tryRun(setImagePath, arg.val);
    } else if (arg.key === 'math') {
        tryRun(setMath, arg.val);
    } else if (arg.key === 'uml-diagrams') {
        tryRun(setUMLDiagrams, arg.val);
    } else if (arg.key === 'highlight-theme') {
        tryRun(setHighlightTheme, arg.val);
    } else if (arg.key === 'render-theme') {
        tryRun(setRenderTheme, arg.val);
    } else if (arg.key === 'tab-size') {
        tryRun(setTabSize, arg.val);
    } else if (arg.key === 'scale-factor') {
        tryRun(setZoomFactor, arg.val);
    } else if (arg.key === 'hexo-auto-setting') {
        tryRun(setHexoAutoSetting, arg.val);
    } else if (arg.key === 'hexo-config-enable') {
        tryRun(setHexoConfigEnable, arg.val);
    } else if (arg.key === 'hexo-config') {
        tryRun(setHexoConfig, arg.val);
    } else if (arg.key === 'hexo-tag-paths') {
        tryRun(setHexoTagPaths, arg.val);
    } else if (arg.key === 'custom-csss') {
        tryRun(setCustomCSSs, arg.val);
    } else if (arg.key === 'image-source-center') {
        tryRun(setSourceCenter, arg.val);
    } else if (arg.key === 'image-web-type') {
        tryRun(setImageWebType, arg.val);
    } else if (arg.key === 'image-qiniu-accessKey') {
        tryRun(SetQiNiuAccessKey, arg.val);
    } else if (arg.key === 'image-qiniu-secretKey') {
        tryRun(SetQiNiuSecretKey, arg.val);
    } else if (arg.key === 'image-qiniu-bucket') {
        tryRun(SetQiNiuBucket, arg.val);
    } else if (arg.key === 'image-qiniu-url') {
        tryRun(SetQiNiuWeb, arg.val);
    } else if (arg.key === 'image-cos-accessKey') {
        tryRun(SetCosAccessKey, arg.val);
    } else if (arg.key === 'image-cos-secretKey') {
        tryRun(SetCosSecretKey, arg.val);
    } else if (arg.key === 'image-cos-bucket') {
        tryRun(SetCosBucket, arg.val);
    } else if (arg.key === 'image-cos-url') {
        tryRun(SetCosWeb, arg.val);
    } else if (arg.key === 'image-cos-customize') {
        tryRun(SetCosWeb, arg.val);
    }
});