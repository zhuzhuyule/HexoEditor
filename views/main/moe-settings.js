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

const path = require('path');
const body = document.body;
const codemirror = document.querySelector('#editor > .CodeMirror');

function setEditorFont(val) {
    body.setAttribute('settings-editor-font', val);
}

function setEditorTheme(val) {
    for (const s of codemirror.classList) {
        if (s.startsWith('cm-s')) {
            codemirror.classList.remove(s);
            break;
        }
    }
    codemirror.classList.add('cm-s-' + val);
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

function setMath(val) {
    if (val.toString() === 'true') window.editor.setOption('mode', 'gfm_math');
    else window.editor.setOption('mode', 'gfm');
    window.editor.refresh();
    window.updatePreview(true);
}

function setUMLDiagrams(val) {
    window.updatePreview(true);
}

function setHighlightTheme(val) {
    let link = document.getElementById('highlight-theme');
    if (!link) {
        link = document.createElement('link');
        document.head.appendChild(link);
        link.rel = 'stylesheet';
        link.id = 'highlight-theme';
    }
    link.href = path.join('../views/highlightstyles', `${val}.css`);
}

function setRenderTheme(val) {
    const container = document.getElementById('container');
    if (['GitHub','No Theme'].indexOf(val) > -1){
        $(container).addClass('_def')
    } else{
        $(container).removeClass('_def')
    }
    let link = document.getElementById('render-theme');
    if (!link) {
        link = document.createElement('link');
        document.head.appendChild(link);
        link.rel = 'stylesheet';
        link.id = 'render-theme';
    }
    link.href = require('./moe-rendertheme').getCSS(true);
}

function setHexoHighlightExtend(val) {
    hexo.highlightEx = val;
    window.updatePreview(true);
};

function setHexoConfigEnable(val) {
    hexo.enable = val;
    hexo.changeConfig();
    window.updatePreview(true);
};

function setHexoConfig(val) {
    hexo.changeConfig();
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
    console.log(val);
    if (Object.getOwnPropertyNames(val).length !== 0) for (let x in val) if (val[x].selected) {
        let link = document.createElement('link');
        link.href = val[x].fileName;
        link.rel = 'stylesheet';
        link.className = 'link-custom-csss';
        document.head.appendChild(link);
    }
}

setEditorFont(moeApp.config.get('editor-font'));
setEditorTheme(moeApp.config.get('editor-theme'));
setEditorFontSize(moeApp.config.get('editor-font-size'));
setEditorLineHeight(moeApp.config.get('editor-line-height'));
setHighlightTheme(moeApp.config.get('highlight-theme'));
setRenderTheme(moeApp.config.get('render-theme'));
setCustomCSSs(moeApp.config.get('custom-csss'));
setHexoHighlightExtend(moeApp.config.get('hexo-highlight-extend'));
setHexoConfigEnable(moeApp.config.get('hexo-config-enable'));
setHexoConfig(moeApp.config.get('hexo-config'));
setHexoTagPaths(moeApp.config.get('hexo-tag-paths'));

const ipcRenderer = require('electron').ipcRenderer;
ipcRenderer.on('setting-changed', (e, arg) => {
    if (arg.key === 'editor-font') {
        setEditorFont(arg.val);
    } else if (arg.key === 'editor-theme') {
        setEditorTheme(arg.val);
    } else if (arg.key === 'editor-font-size') {
        setEditorFontSize(arg.val);
    } else if (arg.key === 'editor-line-height') {
        setEditorLineHeight(arg.val);
    } else if (arg.key === 'math') {
        setMath(arg.val);
    } else if (arg.key === 'uml-diagrams') {
        setUMLDiagrams(arg.val);
    } else if (arg.key === 'highlight-theme') {
        setHighlightTheme(arg.val);
    } else if (arg.key === 'render-theme') {
        setRenderTheme(arg.val);
    } else if (arg.key === 'tab-size') {
        setTabSize(arg.val);
    } else if (arg.key === 'hexo-highlight-extend') {
        setHexoHighlightExtend(arg.val);
    } else if (arg.key === 'hexo-config-enable') {
        setHexoConfigEnable(arg.val);
    } else if (arg.key === 'hexo-config') {
        setHexoConfig(arg.val);
    } else if (arg.key === 'hexo-tag-paths') {
        setHexoTagPaths(arg.val);
    } else if (arg.key === 'custom-csss') {
        setCustomCSSs(arg.val);
    }
});