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

require('electron-titlebar');

document.addEventListener('DOMContentLoaded', () => {
    window.localized.push(() => {
        const selectLocale = document.querySelector('select[data-key=locale]');
        const languages = moeApp.locale.getLanguages();
        for (let lang in languages) {
            let option = document.createElement('option');
            option.value = lang;
            option.text = languages[lang];
            selectLocale.appendChild(option);
            console.log(moeApp.locale.sysLocale);
            if (lang === moeApp.locale.sysLocale) {
                selectLocale.firstElementChild.text += ' - ' + languages[lang];
            }
        }
        const oldVal = moeApp.config.get('locale');
        selectLocale.value = oldVal;
        selectLocale.addEventListener('change', () => {
            moeApp.locale.setLocale(selectLocale.value);
            window.localized.push(() => {
                const languages = moeApp.locale.getLanguages();
                for (let lang in languages) {
                    selectLocale.querySelector('[value="' + lang + '"]').text = languages[lang];
                    if (lang === moeApp.locale.sysLocale) {
                        selectLocale.firstElementChild.text += ' - ' + languages[lang];
                    }
                }
            });
            ipcRenderer.send('setting-changed', { key: 'locale', val: selectLocale.value });
        });
        require('electron').remote.getCurrentWindow().show();
    });

    // Save settings and send messages
    const ipcRenderer = require('electron').ipcRenderer;

    const items = document.querySelectorAll('.settings-item[data-key]');
    for (const item of items) {
        const key = item.getAttribute('data-key');
        const oldVal = moeApp.config.get(key);
        if (item.tagName === 'SELECT' || item.tagName === 'INPUT' || item.tagName === 'TEXTAREA') {
            if (item.tagName === 'INPUT' && item.type === 'checkbox') item.checked = oldVal;
            else item.value = oldVal;
            item.addEventListener('change', () => {
                let val;
                if (item.tagName === 'INPUT' && item.type === 'checkbox') val = item.checked;
                else val = item.value;
                console.log(key + ': ' + val);
                moeApp.config.set(key, val);
                if (!item.classList.contains('dont-notify')) ipcRenderer.send('setting-changed', { key: key, val: val });
            });
        }
    }

    // Custom render themes
    let renderThemeSelect = document.querySelector('select[data-key="render-theme"]');
    function reloadRenderThemeSelect() {
        renderThemeSelect.querySelectorAll('option:not(.builtin)').forEach((a) => renderThemeSelect.removeChild(a));
        const custom = moeApp.config.get('custom-render-themes');
        for (const x in custom) {
            const option = document.createElement('option');
            option.value = option.text = x;
            if (fs.existsSync(path.resolve( custom[x],'main.css')))
                option.classList.add('invalidFile');
            renderThemeSelect.appendChild(option);
        }
        renderThemeSelect.value = moeApp.config.get('render-theme');
    }
    let renderThemeButtonAdd = document.querySelector('select[data-key="render-theme"] ~ button.button-add');
    let renderThemeButtonRemove = document.querySelector('select[data-key="render-theme"] ~ button.button-remove');
    function setRenderThemeButtons() {
        if (renderThemeSelect.selectedOptions[0].classList.contains('builtin')) {
            renderThemeButtonRemove.setAttribute('disabled', null);
        } else {
            renderThemeButtonRemove.removeAttribute('disabled');
        }
        reloadHighlightSelect(renderThemeSelect.value);
    }
    setRenderThemeButtons();


    renderThemeSelect.addEventListener('change', setRenderThemeButtons);
    const dialog = require('electron').remote.dialog;
    renderThemeButtonAdd.addEventListener('click', () => {
        dialog.showOpenDialog(window.w, { properties: ['openDirectory', 'multiSelections'] }, (fileNames) => {
            if (!fileNames || fileNames.length === 0) return;
            const a = fileNames.filter((s) => {
                try {
                    let files = fs.readdirSync(s);
                    if (files.includes('main.css')){
                        return true;
                    } else if (files.includes('.css')){
                        let stylecss = [];
                        files.filter(function (file) {
                           if ( file.endsWith('.css')){
                               stylecss.push(fs.readFileSync(path.join(s,file)));
                           }
                           return false;
                        })
                        fs.writeFileSync(path.join(s,'main.css'),stylecss);
                        return true;
                    }
                    return false;
                } catch (e) {
                    return false;
                }
            });
            let themes = JSON.parse(JSON.stringify(moeApp.config.get('custom-render-themes')));
            for (const s of a) themes[path.basename(s)] = s;
            moeApp.config.set('custom-render-themes', themes);
            console.log(themes);
            reloadRenderThemeSelect();
        });
    });
    renderThemeButtonRemove.addEventListener('click', () => {
        let option = renderThemeSelect.selectedOptions[0];
        if (!option || option.classList.contains('builtin')) return;
        let themes = JSON.parse(JSON.stringify(moeApp.config.get('custom-render-themes')));
        themes[option.value] = undefined;
        moeApp.config.set('custom-render-themes', themes);
        reloadRenderThemeSelect();

        // Reset to default
        moeApp.config.set('render-theme', 'GitHub');
        renderThemeSelect.value = 'GitHub';

        let e = document.createEvent('HTMLEvents');
        e.initEvent('change', false, true);
        renderThemeSelect.dispatchEvent(e);
    });

    // Highlight Theme
    function reloadHighlightSelect(currTheme) {
        let highlightSelect = document.querySelector('select[data-key="highlight-theme"]');
        const oldvar =  moeApp.config.get("highlight-theme") || highlightSelect.value;
        let flagValid = false;
        highlightSelect.innerHTML = '';
        const themedir = moeApp.getHighlightThemesDir();
        if (themedir){
            var arr=['default','none','normal','github','github-gist'];
            arr.forEach(s => {
                if (fs.existsSync(path.join(themedir,s+'.css')) || s == 'none')    {
                    if (!flagValid && s == oldvar) flagValid = true;
                    const option = document.createElement('option');
                    option.value = option.text = s;
                    option.style.background = "#f4f4f4";
                    highlightSelect.appendChild(option);
                }
            });
            fs.readdirSync(themedir)
                .filter(s => s.endsWith('.css'))
                .map(s => s.substr(0, s.length - 4))
                .filter(s => (arr.indexOf(s) < 0) && ('index' !== s))
                .forEach(s => {
                    if (!flagValid && s == oldvar) flagValid = true;
                    const option = document.createElement('option');
                    option.value = option.text = s;
                    highlightSelect.appendChild(option);
                });
            if (flagValid && oldvar){
                highlightSelect.value = oldvar;
            } else if (currTheme == 'GitHub') {
                highlightSelect.value = 'github';
            } else{
                highlightSelect.value = moeApp.hexo.config.highlight_theme  || highlightSelect.children[0] && highlightSelect.children[0].value;
            }
            highlightSelect.removeAttribute('disabled');
        } else {
            highlightSelect.setAttribute('disabled',null);
            ipcRenderer.send('setting-changed', { key: 'highlight-theme', val: "" });
        }

    }

    //Hexo config loading
    let hexoConfigEnableButton = document.querySelector('input[data-key="hexo-config-enable"]');
    let hexoConfigLoadButton = document.querySelector('#hexo-config-btn');
    let hexoConfigInput = document.querySelector('input[data-key="hexo-config"]');
    hexoConfigLoadButton.addEventListener('click', () => {
        dialog.showOpenDialog(window.w, {
            properties: ['openFile'],
            filters: [
                { name: __('All Files'), extensions: ['yml'] },
                { name: __('All Files'), extensions: ['*'] }
            ]
        }, (fileName) => {
            if (!fileName || fileName.length === 0) return;
            moeApp.config.set('hexo-config', fileName);
            console.log(fileName);
            if(hexoConfigInput.value !== fileName)
                ipcRenderer.send('setting-changed', { key: 'hexo-config', val: fileName });
            hexoConfigInput.value = fileName;
        });
    });
    hexoConfigEnableButton.addEventListener('change', () => {
        if  (hexoConfigEnableButton.checked){
            hexoConfigInput.style.display = 'inline-block';;
            hexoConfigLoadButton.style.display = 'inline-block';;
            btnAddTagClick('ConfigChange');
        }  else {
            hexoConfigInput.style.display = 'none';;
            hexoConfigLoadButton.style.display = 'none';;
            btnRemoveTagClick('ConfigChange');
        }
    });

    // Hexo setting
    let customTagsSelect = document.querySelector('select#custom-tags');
    function renderHexoTagsSelect(e) {
        customTagsSelect.querySelectorAll('option:not(.builtin)').forEach((a) => customTagsSelect.removeChild(a));
        const tagPaths = moeApp.config.get('hexo-tag-paths');
        tagPaths.forEach(function (x) {
            const option = document.createElement('option');
            option.value = option.text = x;
            customTagsSelect.appendChild(option);
        });
        if (e === 'tagschanges')
            ipcRenderer.send('setting-changed', { key: 'hexo-tag-paths', val: '' });
    }
    let renderTagsButtonAdd = document.querySelector('select#custom-tags ~ div button.button-add');
    let renderTagsButtonRemove = document.querySelector('select#custom-tags ~ div button.button-remove');
    function setRenderTagButtons() {
        if (customTagsSelect.selectedOptions.length === 0) {
            renderTagsButtonRemove.setAttribute('disabled', null);
        } else {
            renderTagsButtonRemove.removeAttribute('disabled');
        }
    }
    setRenderTagButtons();
    customTagsSelect.addEventListener('change', setRenderTagButtons);

    function btnAddTagClick(t){
        if (t !== 'ConfigChange') {
            dialog.showOpenDialog(window.w, {properties: ['openDirectory', 'multiSelections']}, (fileNames) => {
                if (!fileNames || fileNames.length === 0) return;
                const a = fileNames.filter((s) => {
                    try {
                        return /\w+\.\js\b/.test(fs.readdirSync(s).toString());
                    } catch (e) {
                        return false;
                    }
                });
                let paths = JSON.parse(JSON.stringify(moeApp.config.get('hexo-tag-paths')));
                if(! (paths instanceof Array))
                    paths = [];
                paths = [...new Set(paths.concat(a))];
                moeApp.config.set('hexo-tag-paths', paths);
                console.log(paths);
                renderHexoTagsSelect('tagschanges');
            });
        }
    }
    function btnRemoveTagClick(t) {
        if (t === 'ConfigChange') {
            return
        }

        let option = customTagsSelect.selectedOptions[0];
        if (!option || option.classList.contains('builtin')) return;
        let paths = JSON.parse(JSON.stringify(moeApp.config.get('hexo-tag-paths')));
        paths = paths.filter(function (i) {
            if (i == option.value)
                return false;
            return true
        })
        moeApp.config.set('hexo-tag-paths', paths);
        renderHexoTagsSelect('tagschanges');

        // Reset to default
        moeApp.config.set('hexo-tags-select', '');
        customTagsSelect.value = '';

        let e = document.createEvent('HTMLEvents');
        e.initEvent('change', false, true);
        customTagsSelect.dispatchEvent(e);
    }
    renderTagsButtonAdd.addEventListener('click',btnAddTagClick);
    renderTagsButtonRemove.addEventListener('click',btnRemoveTagClick);


    // Custom CSSs
    let customCSSsSelect = document.querySelector('select#custom-csss');
    function reloadCustomCSSsSelect() {
        customCSSsSelect.innerHTML = '';
        const custom = moeApp.config.get('custom-csss');
        for (const x in custom) {
            const option = document.createElement('option');
            option.value = option.text = x;
            option.selected = custom[x].selected;
            customCSSsSelect.appendChild(option);
        }
    }
    let customCSSsButtonAdd = document.querySelector('select#custom-csss ~ div button.button-add');
    let customCSSsButtonRemove = document.querySelector('select#custom-csss ~ div button.button-remove');
    function setCustomCSSsButtons() {
        if (customCSSsSelect.selectedOptions.length === 0) {
            customCSSsButtonRemove.setAttribute('disabled', null);
        } else {
            customCSSsButtonRemove.removeAttribute('disabled');
        }
    }
    setCustomCSSsButtons();
    customCSSsSelect.addEventListener('change', setCustomCSSsButtons);
    customCSSsButtonAdd.addEventListener('click', () => {
        dialog.showOpenDialog(window.w, {
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: __('CSS Files'), extensions: ['css'] },
                { name: __('All Files'), extensions: ['*'] }
            ]
        }, (fileNames) => {
            if (!fileNames || fileNames.length === 0) return;
            let csss = JSON.parse(JSON.stringify(moeApp.config.get('custom-csss')));
            for (const s of fileNames) csss[path.basename(s)] = { fileName: s, selected: false };
            moeApp.config.set('custom-csss', csss);
            console.log(csss);
            reloadCustomCSSsSelect();
        });
    });
    customCSSsButtonRemove.addEventListener('click', () => {
        if (customCSSsSelect.selectedOptions.length === 0) return;
        let csss = JSON.parse(JSON.stringify(moeApp.config.get('custom-csss')));
        for (let option of customCSSsSelect.selectedOptions) {
            csss[option.value] = undefined;
        }
        moeApp.config.set('custom-csss', csss);
        reloadCustomCSSsSelect();
        let e = document.createEvent('HTMLEvents');
        e.initEvent('change', false, true);
        customCSSsSelect.dispatchEvent(e);
    });
    customCSSsSelect.addEventListener('change', () => {
        let csss = JSON.parse(JSON.stringify(moeApp.config.get('custom-csss')));
        for (let option of customCSSsSelect.querySelectorAll('option')) {
            csss[option.value].selected = option.selected;
        }
        moeApp.config.set('custom-csss', csss);
        console.log(csss);
        ipcRenderer.send('setting-changed', { key: 'custom-csss', val: csss });
    });

    function newCustomeTheme(dir){
        try {
            let fileNames = fs.readdirSync(dir);
            let stylecss = [];
            fileNames.filter(function (file) {
                if (file.endsWith('.css')) {
                    stylecss.push(fs.readFileSync(path.resolve(dir, file)));
                }
                return false;
            });
            if (stylecss.length > 0) {
                fs.writeFileSync(path.resolve(dir, 'main.css'), stylecss.toString());

                themes[hexoTheme] = dir;
                moeApp.config.set('custom-render-themes', themes);
                return true;
            }
        } catch (e) {
            return false;
        }
    }

    let hexoAutoSettingButton = document.querySelector('input[data-key="hexo-auto-setting"]');
    hexoAutoSettingButton.addEventListener('click',function (e) {
        if (this.checked){
            hexoConfigEnableButton.checked || hexoConfigEnableButton.click();
            hexoConfigInput.value || hexoConfigLoadButton.click();
            let mathCheck = document.querySelector('input[data-key="math"]');
            !mathCheck.checked || mathCheck.click();

            let umlCheck = document.querySelector('input[data-key="uml-diagrams"]');
            !umlCheck.checked || umlCheck.click();

            let breaksCheck = document.querySelector('input[data-key="breaks"]');
            breaksCheck.checked || breaksCheck.click();


            let hexoConfig = moeApp.getHexo().config;
            let themes = JSON.parse(JSON.stringify(moeApp.config.get('custom-render-themes')));
            let hexoTheme = hexoConfig.theme;
            let isFindStyle = false;
            if (themes[hexoTheme]){
                if (fs.existsSync(path.resolve( themes[hexoTheme],'main.css'))) {
                    renderThemeSelect.value = hexoTheme;
                    reloadHighlightSelect(hexoTheme);
                    isFindStyle = true;
                }else {
                    if (newCustomeTheme(themes[hexoTheme])) {
                        isFindStyle = true;
                    }
                }
            }
            //未配置主题，自动配置
            let classDir = path.join(hexoConfig.__basedir,hexoConfig.public_dir,'css');
            if (!isFindStyle){
                if (fs.lstatSync(classDir).isDirectory()){
                    try {
                        let fileNames = fs.readdirSync(classDir);
                        if (fileNames.includes('main.css')){
                            isFindStyle = true;
                        } else {
                            isFindStyle = newCustomeTheme(classDir);
                        }
                    } catch (err) {
                    }
                }
            }
            if (isFindStyle) {
                themes[hexoTheme] = classDir;
                renderThemeSelect.value = hexoTheme;
                reloadHighlightSelect(hexoTheme);
            }
        }
    })

});
