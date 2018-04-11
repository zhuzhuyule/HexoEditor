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
const dialog = require('electron').remote.dialog;

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
            ipcRenderer.send('setting-changed', {key: 'locale', val: selectLocale.value});
        });
        document.querySelector("#hexo-auto-setting").value = '<i class="fa fa-hand-pointer-o" aria-hidden="true"></i>';
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
                if (item.id === 'scaleFactor') {
                    if (item.value === '') item.value = oldVal;
                    else if (0.7 > item.value) item.value = 0.7;
                    else if (1.6 < item.value) item.value = 1.6;
                    val = item.value;
                }
                else if (item.tagName === 'INPUT' && item.type === 'checkbox') val = item.checked;
                else val = item.value;
                console.log(key + ': ' + val);
                moeApp.config.set(key, val);
                if (!item.classList.contains('dont-notify')) ipcRenderer.send('setting-changed', {key: key, val: val});
            });
        }
    }

    // Custom render themes
    let renderThemeSelect = document.querySelector('select[data-key="render-theme"]');

    function setCurrentTheme(currTheme, changeConfig) {
        if (!currTheme) {
            currTheme = moeApp.config.get('render-theme');
        } else {
            if (changeConfig)
                moeApp.config.set("render-theme", currTheme);
        }
        renderThemeSelect.value = currTheme;
        ipcRenderer.send('setting-changed', {key: "render-theme", val: currTheme});
    }

    function reloadRenderThemeSelect() {
        renderThemeSelect.querySelectorAll('option:not(.builtin)').forEach((a) => renderThemeSelect.removeChild(a));
        const custom = moeApp.config.get('custom-render-themes');
        for (const item in custom) {
            const option = document.createElement('option');
            option.value = option.text = item;
            if (!fs.existsSync(path.resolve(custom[item], 'main.css')))
                option.classList.add('invalidFile');
            renderThemeSelect.appendChild(option);
        }
        setCurrentTheme();
    }

    let renderThemeButtonAdd = document.querySelector('select[data-key="render-theme"] ~ button.button-add');
    let renderThemeButtonRemove = document.querySelector('select[data-key="render-theme"] ~ button.button-remove');

    function setRenderThemeButtons() {
        try {
            if (renderThemeSelect.selectedOptions[0].classList.contains('builtin')) {
                renderThemeButtonRemove.setAttribute('disabled', null);
            } else {
                renderThemeButtonRemove.removeAttribute('disabled');
            }
            reloadHighlightSelect(renderThemeSelect.value);
        } catch (e) {
            console.error(e)
        }
    }

    setRenderThemeButtons();

    renderThemeSelect.addEventListener('change', setRenderThemeButtons);
    renderThemeButtonAdd.addEventListener('click', () => {
        dialog.showOpenDialog(window.hexoWindow, {properties: ['openDirectory', 'multiSelections']}, (fileNames) => {
            if (!fileNames || fileNames.length === 0) return;
            const a = fileNames.filter((s) => {
                try {
                    let files = fs.readdirSync(s);
                    if (files.includes('main.css')) {
                        return true;
                    } else if (files.includes('.css')) {
                        let stylecss = [];
                        files.filter(function (file) {
                            if (file.endsWith('.css')) {
                                stylecss.push(fs.readFileSync(path.join(s, file)));
                            }
                            return false;
                        })
                        fs.writeFileSync(path.join(s, 'main.css'), stylecss);
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
            if (a.length > 0) {
                moeApp.config.set('render-theme', path.basename(a[0]));
            }
            reloadRenderThemeSelect();
        });
    });
    renderThemeButtonRemove.addEventListener('click', () => {
        let option = renderThemeSelect.selectedOptions[0];
        if (!option || option.classList.contains('builtin')) return;
        let themes = JSON.parse(JSON.stringify(moeApp.config.get('custom-render-themes')));
        themes[option.value] = undefined;
        moeApp.config.set('custom-render-themes', themes);
        moeApp.config.set('render-theme', '*GitHub');
        reloadRenderThemeSelect();
    });

    // Highlight Theme
    function reloadHighlightSelect(currTheme) {
        let highlightSelect = document.querySelector('select[data-key="highlight-theme"]');
        const oldvar = moeApp.config.get("highlight-theme") || highlightSelect.value;
        let flagValid = false;
        highlightSelect.innerHTML = '';
        const themedir = moeApp.getHighlightThemesDir();
        if (themedir) {
            var arr = ['default', 'none', 'normal', 'github', 'github-gist'];
            arr.forEach(s => {
                if (fs.existsSync(path.join(themedir, s + '.css')) || s == 'none') {
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
            if (flagValid && oldvar) {
                highlightSelect.value = oldvar;
            } else if (currTheme == 'GitHub') {
                highlightSelect.value = 'github';
            } else {
                highlightSelect.value = moeApp.hexo.config.highlight_theme || highlightSelect.children[0] && highlightSelect.children[0].value;
            }
            highlightSelect.removeAttribute('disabled');
        } else {
            highlightSelect.setAttribute('disabled', null);
            ipcRenderer.send('setting-changed', {key: 'highlight-theme', val: ""});
        }

    }

    //Hexo config loading
    let hexoConfigEnableButton = document.querySelector('input[data-key="hexo-config-enable"]');
    let hexoConfigLoadButton = document.querySelector('#hexo-config-btn');
    let hexoConfigInput = document.querySelector('input[data-key="hexo-config"]');

    hexoConfigEnableButton.addEventListener('click',()=>{
        moeApp.config.set('hexo-config-enable', hexoConfigEnableButton.checked);
        ipcRenderer.send('setting-changed', {key: 'hexo-config-enable', val: hexoConfigEnableButton.checked});
    })
    hexoConfigLoadButton.addEventListener('click', () => {
        dialog.showOpenDialog(window.hexoWindow, {
            properties: ['openFile'],
            filters: [
                {name: __('All Files'), extensions: ['yml']},
                {name: __('All Files'), extensions: ['*']}
            ]
        }, (fileName) => {
            if (!fileName || fileName.length === 0) return;
            fileName = fileName[0];
            if (hexoConfigInput.value !== fileName) {
                moeApp.config.set('hexo-config', fileName);
                ipcRenderer.send('setting-changed', {key: 'hexo-config', val: fileName});
                hexoConfigInput.value = fileName;
            }
        });
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
            ipcRenderer.send('setting-changed', {key: 'hexo-tag-paths', val: ''});
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

    function btnAddTagClick(t) {
        if (t !== 'ConfigChange') {
            dialog.showOpenDialog(window.hexoWindow, {properties: ['openDirectory', 'multiSelections']}, (fileNames) => {
                if (!fileNames || fileNames.length === 0) return;
                const a = fileNames.filter((s) => {
                    try {
                        return /\w+\.\js\b/.test(fs.readdirSync(s).toString());
                    } catch (e) {
                        return false;
                    }
                });
                let paths = JSON.parse(JSON.stringify(moeApp.config.get('hexo-tag-paths')));
                if (!(paths instanceof Array))
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

    renderTagsButtonAdd.addEventListener('click', btnAddTagClick);
    renderTagsButtonRemove.addEventListener('click', btnRemoveTagClick);


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
        dialog.showOpenDialog(window.hexoWindow, {
            properties: ['openFile', 'multiSelections'],
            filters: [
                {name: __('CSS Files'), extensions: ['css']},
                {name: __('All Files'), extensions: ['*']}
            ]
        }, (fileNames) => {
            if (!fileNames || fileNames.length === 0) return;
            let csss = JSON.parse(JSON.stringify(moeApp.config.get('custom-csss')));
            for (const s of fileNames) csss[path.basename(s)] = {fileName: s, selected: false};
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
        ipcRenderer.send('setting-changed', {key: 'custom-csss', val: csss});
    });

    function newCustomeTheme(dir) {
        try {
            if (!fs.existsSync(dir))
                return false;
            let fileNames = fs.readdirSync(dir);
            if (fileNames.includes('main.css'))
                return true;
            let stylecss = [];
            fileNames.filter(function (file) {
                if (file.endsWith('.css')) {
                    stylecss.push(fs.readFileSync(path.resolve(dir, file)));
                }
                return false;
            });
            if (stylecss.length > 0) {
                fs.writeFileSync(path.resolve(dir, 'main.css'), stylecss.toString());
                return true;
            }
        } catch (e) {
            return false;
        }
    }

    let hexoAutoSettingButton = document.querySelector('#hexo-auto-setting');
    hexoAutoSettingButton.addEventListener('click', function (e) {
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

        if (themes[hexoTheme]) {
            isFindStyle = newCustomeTheme(themes[hexoTheme])
        }
        //未配置主题，自动配置
        let classDir = '';
        if (hexoConfig.__basedir && fs.existsSync(hexoConfig.__basedir)){
            if(hexoConfig.public_dir){
                classDir = path.join(hexoConfig.__basedir, hexoConfig.public_dir, 'css');
            }
            if (!isFindStyle) {
                if (fs.existsSync(classDir) && fs.lstatSync(classDir).isDirectory()) {
                    isFindStyle = newCustomeTheme(classDir);
                }
            }
            if (isFindStyle) {
                for (let item in themes) {
                    if (themes.hasOwnProperty(item) && themes[item] == classDir) {
                        delete themes[item];
                    }
                }

                themes[hexoTheme] = classDir;
                moeApp.config.set('custom-render-themes', themes);
                moeApp.config.set("render-theme", hexoTheme);

                reloadRenderThemeSelect(hexoTheme);
                reloadHighlightSelect(hexoTheme);
            } else {
                dialog.showMessageBox(
                    window.hexoWindow,
                    {
                        type: 'warning',
                        title: __('Waring'),
                        message: __("WaringNoFile"),
                        detail: __("WaringNoFileDetail1") + classDir + __("WaringNoFileDetail2")
                    },
                    function (res) {
                    }
                )
            }
        }
    })


    //
    let imageSourceButton = document.querySelector('#image-source-center-btn');
    let imageSourceInput = document.querySelector('#image-source-center');
    imageSourceInput.value = moeApp.config.get(imageSourceInput.id);
    imageSourceButton.addEventListener('click', () => {
        dialog.showOpenDialog(window.hexoWindow, {
            properties: ['openDirectory'],
        }, (fileName) => {
            if (!fileName || fileName.length === 0) return;
            fileName = fileName[0];

            fs.access(fileName, fs.constants.R_OK | fs.constants.W_OK, (err) => {
                     if(err){
                         log.error(`setting [${fileName}] failed.`+err)
                         dialog.showMessageBox(
                             window.hexoWindow,
                             {
                                 type: 'warning',
                                 title: __('Waring'),
                                 message: __("WaringNoFile"),
                                 detail: 'Directory prohibit reading or writing!'
                             },
                             function (res) {
                             }
                         )
                     } else{
                         log.info(`setting [${fileName}] success.`)
                         if (imageSourceInput.value !== fileName) {
                             moeApp.config.set(imageSourceInput.id, fileName);
                             ipcRenderer.send('setting-changed', {key: imageSourceInput.id, val: fileName});
                             imageSourceInput.value = fileName;
                         }
                     }

            });

        });
    });

    let imageTabItem = document.querySelector('.item[data-tab="image"]');
    let imageTabContents = document.querySelector('.panel[data-tab="image"]');
    let imageType = imageTabContents.querySelector('#image-web-type');

    //SM.MS
    let imageSmmsBackQiniu = imageTabContents.querySelector('#image-back-type-qiniu');
    let imageSmmsBackCos = imageTabContents.querySelector('#image-back-type-cos');

    //QiNiu
    let imageAccessKey = imageTabContents.querySelector('#image-qiniu-accessKey');
    let imageSecretKey = imageTabContents.querySelector('#image-qiniu-secretKey');
    let imageBucket = imageTabContents.querySelector('#image-qiniu-bucket');
    let imageBaseWebProtocol = imageTabContents.querySelector('#image-qiniu-url-protocol');
    let imageBaseWeb = imageTabContents.querySelector('#image-qiniu-url');

    //腾讯
    let imageCosAccessKey = imageTabContents.querySelector('#image-cos-accessKey');
    let imageCosSecretKey = imageTabContents.querySelector('#image-cos-secretKey');
    let imageCosBucket = imageTabContents.querySelector('#image-cos-bucket');
    let imageCosBaseWebProtocol = imageTabContents.querySelector('#image-cos-url-protocol');
    let imageCosBaseWeb = imageTabContents.querySelector('#image-cos-url');
    let imageCosCustomizeCheck = imageTabContents.querySelector('#image-cos-customize-enable');
    let imageCosCustomize = imageTabContents.querySelector('#image-cos-customize');

    imageType.addEventListener('change', function (e) {
        moeApp.config.set(imageType.id, imageType.value);
        let imageSmmsItems = imageTabContents.querySelectorAll('tr[data-type="image-smms"]')
        let imageQiNiuItems = imageTabContents.querySelectorAll('tr[data-type="image-qiniu"]')
        let imageCosItems = imageTabContents.querySelectorAll('tr[data-type="image-cos"]')
        if (imageType.value == 'qiniu') {
            imageAccessKey.value = moeApp.config.get(imageAccessKey.id);
            imageSecretKey.value = moeApp.config.get(imageSecretKey.id);
            checkBuckets();
            imageSmmsItems.forEach((item) => {
                item.style.display = 'none'
            })
            imageCosItems.forEach((item) => {
                item.style.display = 'none'
            })
            imageQiNiuItems.forEach((item) => {
                item.style.display = 'table-row'
            })
        } else if (imageType.value == 'cos') {
            imageCosAccessKey.value = moeApp.config.get(imageCosAccessKey.id);
            imageCosSecretKey.value = moeApp.config.get(imageCosSecretKey.id);
            checkCosBuckets();
            imageSmmsItems.forEach((item) => {
                item.style.display = 'none'
            })
            imageQiNiuItems.forEach((item) => {
                item.style.display = 'none'
            })
            imageCosItems.forEach((item) => {
                item.style.display = 'table-row'
            })
        } else {
            imageQiNiuItems.forEach((item) => {
                item.style.display = 'none'
            })
            imageCosItems.forEach((item) => {
                item.style.display = 'none'
            })
            imageSmmsItems.forEach((item) => {
                item.style.display = 'table-row'
            })
            ipcRenderer.send('setting-changed', {key: imageType.id, val: imageType.value});
        }
        imageTabItem.click();
    })

    function hasUploadServer() {
        if (!global.uploadServer) {
            global.uploadServer = moeApp.getUploadServer();
            return global.uploadServer;
        }
        return global.uploadServer;
    }

    //SM.MS
    var backtype = moeApp.config.get('image-back-type');
    if ([222, 22].includes(backtype)) {
        imageSmmsBackQiniu.value = 1;
        imageSmmsBackQiniu.innerHTML = '<i class="fa fa-check-square-o" aria-hidden="true"></i>'
    } else {
        imageSmmsBackQiniu.value = 0;
        imageSmmsBackQiniu.innerHTML = '<i class="fa fa-square-o" aria-hidden="true"></i>'
    }
    if ([222, 202].includes(backtype)) {
        imageSmmsBackCos.value = 1;
        imageSmmsBackCos.innerHTML = '<i class="fa fa-check-square-o" aria-hidden="true"></i>'
    } else {
        imageSmmsBackCos.value = 0;
        imageSmmsBackCos.innerHTML = '<i class="fa fa-square-o" aria-hidden="true"></i>'
    }

    imageSmmsBackQiniu.addEventListener('click', () => {
        var backtype = moeApp.config.get('image-back-type');
        if (imageSmmsBackQiniu.value == 0) {
            if (moeApp.config.get(imageBaseWeb.id)){
                imageSmmsBackQiniu.value = 1;
                imageSmmsBackQiniu.innerHTML = '<i class="fa fa-check-square-o" aria-hidden="true"></i>'
                if (backtype> 200)
                    backtype = 222;
                else
                    backtype = 22;
            } else {
                let imageQiNiuItems = imageTabContents.querySelectorAll('tr[data-type="image-qiniu"]');
                imageQiNiuItems.forEach((item) => {
                    item.style.display = 'table-row'
                })
                imageTabItem.click();
            }
        } else {
            imageSmmsBackQiniu.value = 0;
            imageSmmsBackQiniu.innerHTML = '<i class="fa fa-square-o" aria-hidden="true"></i>'
            if (backtype> 200)
                backtype = 202;
            else
                backtype = 2;
        }
        moeApp.config.set('image-back-type',backtype);
    })
    imageSmmsBackCos.addEventListener('click', () => {
        var backtype = moeApp.config.get('image-back-type');
        if (imageSmmsBackCos.value == 0) {
            if (moeApp.config.get(imageBaseWeb.id)) {
                imageSmmsBackCos.value = 1;
                imageSmmsBackCos.innerHTML = '<i class="fa fa-check-square-o" aria-hidden="true"></i>'
                if (backtype < 23)
                    backtype += 200;
            } else {
                let imageCosItems = imageTabContents.querySelectorAll('tr[data-type="image-cos"]')
                imageCosItems.forEach((item) => {
                    item.style.display = 'table-row'
                })
                imageTabItem.click();
            }
        } else {
            imageSmmsBackCos.value = 0;
            imageSmmsBackCos.innerHTML = '<i class="fa fa-square-o" aria-hidden="true"></i>'
            if (backtype> 200)
                backtype -= 200;
        }
        moeApp.config.set('image-back-type',backtype);
    })

    //QiNiu
    function checkBuckets() {
        if (hasUploadServer()) {
            let oldBucket = moeApp.config.get(imageBucket.id);
            uploadServer.getQiniuBuckets((response) => {
                imageBucket.innerHTML = '';
                if (response.statusCode == 200) {
                    response.data.forEach((name) => {
                        let option = document.createElement('option');
                        option.value = name;
                        option.innerText = name;
                        imageBucket.appendChild(option);
                        if ((option.value == oldBucket)) {
                            option.selected = true;
                            imageBucket.value = option.value;
                        }
                    })
                    if (!imageBucket.value && imageBucket.firstChild) {
                        imageBucket.value = imageBucket.firstChild.value;
                    }
                    let event = new Event('change');
                    imageBucket.dispatchEvent(event);
                } else {
                }
            })
        }
    }

    function checkURLs(bucket) {
        if (hasUploadServer()) {
            let oldurl = moeApp.config.get(imageBaseWeb.id);
            uploadServer.getQiniuBucketsUrl(bucket, (response) => {
                if (response.statusCode == 200) {
                    imageBaseWeb.innerHTML = '';
                    response.data.forEach((url) => {
                        let option = document.createElement('option');
                        option.value = url;
                        option.innerText = url;
                        imageBaseWeb.appendChild(option);
                        if ((option.value == oldurl)) {
                            option.selected = true;
                            imageBaseWeb.value = oldurl;
                        }
                    })
                    if (!imageBaseWeb.value && imageBaseWeb.firstChild) {
                        imageBaseWeb.value = imageBaseWeb.firstChild.value;
                    }
                    let event = new Event('change');
                    imageBaseWeb.dispatchEvent(event);
                } else {
                }
            })
        }
    }


    imageAccessKey.addEventListener('blur', () => {
        imageAccessKey.type = 'password';
        if (imageAccessKey.value && imageAccessKey.value.length == 40 && imageSecretKey.value && imageSecretKey.value.length == 40) {
            let oldKey = moeApp.config.get(imageAccessKey.id);
            if (oldKey != imageAccessKey.value) {
                moeApp.config.set(imageAccessKey.id, imageAccessKey.value);
                if (hasUploadServer()) {
                    uploadServer.updateQiniu(imageAccessKey.value, imageSecretKey.value)
                    ipcRenderer.send('setting-changed', {key: imageAccessKey.id, val: imageAccessKey.value});
                    checkBuckets();
                }
            }
        }
    })
    imageAccessKey.addEventListener('focus', () => {
        imageAccessKey.type = 'type';
    })
    imageSecretKey.addEventListener('blur', () => {
        imageSecretKey.type = 'password';
        if (imageAccessKey.value && imageAccessKey.value.length == 40 && imageSecretKey.value && imageSecretKey.value.length == 40) {
            let oldKey = moeApp.config.get(imageSecretKey.id);
            if (oldKey != imageSecretKey.value) {
                moeApp.config.set(imageSecretKey.id, imageSecretKey.value);
                if (hasUploadServer()) {
                    uploadServer.updateQiniu(imageAccessKey.value, imageSecretKey.value)
                    ipcRenderer.send('setting-changed', {key: imageSecretKey.id, val: imageSecretKey.value});
                    checkBuckets();
                }
            }
        }
    })

    imageSecretKey.addEventListener('focus', () => {
        imageSecretKey.type = 'type';
    })

    imageBucket.addEventListener('change', function (e) {
        moeApp.config.set(imageBucket.id, imageBucket.value);
        checkURLs(imageBucket.value);
        ipcRenderer.send('setting-changed', {key: imageBucket.id, val: imageBucket.value});
    })


    function protocolChange(type) {
        if ((!type && imageBaseWebProtocol.value == 'http://') || type == 'https://') {
            imageBaseWebProtocol.style.width = '53px';
            imageBaseWeb.style.width = 'calc(100% - 57px)';
            imageBaseWebProtocol.value = 'https://';
        } else {
            imageBaseWebProtocol.style.width = '47px';
            imageBaseWeb.style.width = 'calc(100% - 51px)';
            imageBaseWebProtocol.value = 'http://';
        }
    }

    imageBaseWebProtocol.value = moeApp.config.get('image-qiniu-url-protocol');
    protocolChange(imageBaseWebProtocol.value);
    imageBaseWebProtocol.addEventListener('click', () => {
        protocolChange();
        imageBaseWeb.dispatchEvent(new Event('change'));
    })

    imageBaseWeb.addEventListener('change', function (e) {
        let oldURL = moeApp.config.get('image-base-url');
        let value = {
            oldURL: (oldURL),
            newURL: (imageBaseWeb.value ? imageBaseWebProtocol.value + imageBaseWeb.value : '')
        };
        moeApp.config.set('image-base-url', value.newURL);
        moeApp.config.set(imageBaseWebProtocol.id, imageBaseWebProtocol.value);
        moeApp.config.set(imageBaseWeb.id, imageBaseWeb.value);
        ipcRenderer.send('setting-changed', {key: imageBaseWeb.id, val: value});
    })


    //Tencent
    function checkCosBuckets() {
        if (hasUploadServer()) {
            let oldBucket = moeApp.config.get(imageCosBucket.id);
            uploadServer.getCosService((response) => {
                imageCosBucket.innerHTML = '';
                if (response.statusCode == 200) {
                    response.Buckets.forEach((bucket) => {
                        let option = document.createElement('option');
                        option.value = bucket.Name + '|' + bucket.Location;
                        option.innerText = '[' + bucket.Location + ']  ' + bucket.Name;
                        imageCosBucket.appendChild(option);
                        if ((option.value == oldBucket)) {
                            option.selected = true;
                            imageCosBucket.value = option.value;
                        }
                    })
                    if (!imageCosBucket.value && imageCosBucket.firstChild) {
                        imageCosBucket.value = imageCosBucket.firstChild.value;
                    }
                    if (imageCosBucket.value) {
                        let event = new Event('change');
                        imageCosBucket.dispatchEvent(event);
                    }
                } else {
                    console.log(response, response.error.Message);
                }
            })
        }
    }

    imageCosAccessKey.addEventListener('blur', () => {
        imageCosAccessKey.type = 'password';
        if (imageCosAccessKey.value && imageCosAccessKey.value.length == 36 && imageCosSecretKey.value && imageCosSecretKey.value.length == 32) {
            let oldKey = moeApp.config.get(imageCosAccessKey.id);
            if (oldKey != imageCosAccessKey.value) {
                moeApp.config.set(imageCosAccessKey.id, imageCosAccessKey.value);
                if (hasUploadServer()) {
                    uploadServer.updateCos(imageCosAccessKey.value, imageCosSecretKey.value)
                    ipcRenderer.send('setting-changed', {key: imageCosAccessKey.id, val: imageCosAccessKey.value});
                    checkCosBuckets();
                }
            }
        }
    })
    imageCosAccessKey.addEventListener('focus', () => {
        imageCosAccessKey.type = 'type';
    })
    imageCosSecretKey.addEventListener('blur', () => {
        imageCosSecretKey.type = 'password';
        if (imageCosAccessKey.value && imageCosAccessKey.value.length == 36 && imageCosSecretKey.value && imageCosSecretKey.value.length == 32) {
            let oldKey = moeApp.config.get(imageCosSecretKey.id);
            if (oldKey != imageCosSecretKey.value) {
                moeApp.config.set(imageCosSecretKey.id, imageCosSecretKey.value);
                if (hasUploadServer()) {
                    uploadServer.updateCos(imageCosAccessKey.value, imageCosSecretKey.value)
                    ipcRenderer.send('setting-changed', {key: imageCosSecretKey.id, val: imageCosSecretKey.value});
                    checkCosBuckets();
                }
            }
        }
    })

    imageCosSecretKey.addEventListener('focus', () => {
        imageCosSecretKey.type = 'type';
    })

    imageCosBucket.addEventListener('change', function (e) {
        moeApp.config.set(imageCosBucket.id, imageCosBucket.value);
        imageCosBaseWeb.value = imageCosBucket.value.replace('|', '.cos.') + '.myqcloud.com' + '/';
        imageCosBaseWeb.title = imageCosBaseWeb.value;
        moeApp.config.set(imageCosBaseWeb.id, imageCosBaseWeb.value);
        ipcRenderer.send('setting-changed', {key: imageCosBucket.id, val: imageCosBucket.value});
        imageCosBaseWeb.dispatchEvent(new Event('change'));
    })


    function protocolChange(type) {
        if ((!type && imageCosBaseWebProtocol.value == 'http://') || type == 'https://') {
            imageCosBaseWebProtocol.style.width = '53px';
            imageCosBaseWeb.style.width = 'calc(100% - 57px)';
            imageCosBaseWebProtocol.value = 'https://';
        } else {
            imageCosBaseWebProtocol.style.width = '47px';
            imageCosBaseWeb.style.width = 'calc(100% - 51px)';
            imageCosBaseWebProtocol.value = 'http://';
        }
    }

    imageCosBaseWebProtocol.value = moeApp.config.get(imageCosBaseWebProtocol.id);
    protocolChange(imageCosBaseWebProtocol.value);
    imageCosBaseWebProtocol.addEventListener('click', () => {
        protocolChange();
        imageCosBaseWeb.dispatchEvent(new Event('change'));
    })

    imageCosBaseWeb.addEventListener('change', (e)=> {
        if(imageCosCustomizeCheck.checked){
            imageCosCustomize.dispatchEvent(new Event('blur'));
        } else {
            let oldURL = moeApp.config.get('image-base-url');
            let value = {
                oldURL: (oldURL),
                newURL: (imageCosBaseWeb.value ? imageCosBaseWebProtocol.value + imageCosBaseWeb.value : '')
            };
            moeApp.config.set('image-base-url', value.newURL);
            moeApp.config.set(imageCosBaseWebProtocol.id, imageCosBaseWebProtocol.value);
            moeApp.config.set(imageCosBaseWeb.id, imageCosBaseWeb.value);
            ipcRenderer.send('setting-changed', {key: imageCosBaseWeb.id, val: value});
        }
    })


    imageCosCustomizeCheck.checked = moeApp.config.get(imageCosCustomizeCheck.id);
    if (imageCosCustomizeCheck.checked ){
        imageCosCustomize.removeAttribute('disabled');
    }  else {
        imageCosCustomize.setAttribute('disabled',true);
    }
    imageCosCustomizeCheck.addEventListener('click',(e)=>{
        moeApp.config.set(imageCosCustomizeCheck.id, imageCosCustomizeCheck.checked);
        if (imageCosCustomizeCheck.checked ){
            imageCosCustomize.removeAttribute('disabled');
            imageCosCustomize.dispatchEvent(new Event('blur'));
        }  else {
            imageCosCustomize.setAttribute('disabled',true);
            imageCosBaseWeb.dispatchEvent(new Event('change'));
        }
    })

    imageCosCustomize.value = moeApp.config.get(imageCosCustomize.id);
    imageCosCustomize.addEventListener('blur',(e)=>{
        let oldURL = moeApp.config.get('image-base-url');
        let value = {
            oldURL: (oldURL),
            newURL: (imageCosCustomize.value||''),
            customize: (imageCosCustomize.value||'')
        };
        moeApp.config.set('image-base-url', value.newURL);
        moeApp.config.set(imageCosCustomize.id, imageCosCustomize.value);
        ipcRenderer.send('setting-changed', {key: imageCosCustomize.id, val: value});
    })

    let type = moeApp.config.get(imageType.id);
    if (type == 'qiniu' || type == 'cos') {
        imageType.value = type;
        let event = new Event('change');
        imageType.dispatchEvent(event);
    }
});
