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

window.md5 = (text) => {
    return require('crypto').createHash('md5').update(text).digest('hex');
};

class ImgManager {
    constructor() {
        this.fileName = path.basename(hexoWindow.fileName, path.extname(hexoWindow.fileName)) || hexoWindow.ID || "";
        this.imgPathToUrl = {};
        this.imgPathToDel = {};
        this.imgMD5IDList = {};
        this.imgPathIDList = {};
        this.imgBaseDir = '';
        this.imgPathDir = '';
        this.type = {
            png: '.png',
            jpg: '.jpg',
            jpeg: '.jpg',
            bmp: '.bmp'
        }
        this.updateBase();
    }

    updateBase() {
        let rootPaht = '';
        if (moeApp.config.get('image-source-center')) {
            rootPaht = moeApp.config.get('image-source-center');
        } else if (moeApp.useHexo && hexo.config.__basedir) {
            rootPaht = path.join(hexo.config.__basedir, 'source', 'images');
        } else {
            rootPaht = hexoWindow.directory;
        }
        rootPaht = rootPaht.replace(/\\/g, '/');
        this.imgPathDir = path.join(rootPaht, this.fileName);
        if (this.imgBaseDir && this.imgBaseDir !== rootPaht) {
            const oldPath = path.join(this.imgBaseDir, this.fileName);
            if (fs.existsSync(oldPath)) {
                try {
                    fs.renameSync(oldPath, this.imgPathDir);
                } catch (e) {
                    fs.renameSync(oldPath, this.imgPathDir);
                }
                this.updateDictionary(this.imgBaseDir, rootPaht)
            }
        }
        this.imgBaseDir = rootPaht;
    }

    mkdirsSync(dirpath, mode) {
        if (!fs.existsSync(dirpath)) {
            var pathtmp;
            dirpath.split(path.sep).forEach(function (dirname) {
                if (pathtmp) {
                    pathtmp = path.join(pathtmp, dirname);
                }
                else {
                    pathtmp = dirname;
                }
                if (!fs.existsSync(pathtmp)) {
                    if (!fs.mkdirSync(pathtmp, mode)) {
                        return false;
                    }
                }
            });
        }
        return true;
    }

    relativePath(p) {
        if (hexoWindow.useHexo)
            return '/images/' + path.relative(this.imgBaseDir, p).replace(/\\/g, '/');
        return '/' + path.relative(this.imgBaseDir, p).replace(/\\/g, '/');
    }

    resolvePath(p) {
        if (path.isAbsolute(p))
            p = '.' + p;
        if (hexoWindow.useHexo) {
            if ([0, 1].includes(p.indexOf('images/')))
                return path.resolve(this.imgBaseDir, '..', p).replace(/\\/g, '/');
        }
        return path.resolve(this.imgBaseDir, p).replace(/\\/g, '/');
    }

    getQiNiuServer() {
        if (!this.qiniuServer) {
            this.qiniuServer = new (require('./hexo-qiniu'))();
            this.qiniuServer.update(
                moeApp.config.get('image-qiniu-accessKey'),
                moeApp.config.get('image-qiniu-secretKey'),
                moeApp.config.get('image-qiniu-bucket'),
                moeApp.config.get('image-qiniu-url-protocol') + moeApp.config.get('image-qiniu-url') + '/'
            );
        }
        return this.qiniuServer;
    }

    getImageOfPath(imgPath, md5ID) {
        if (fs.existsSync(imgPath)) {
            imgPath = imgPath.replace(/\\/g, '/');
            let relativePath = '';
            if (this.imgPathIDList[imgPath]) {
                relativePath = this.imgPathIDList[imgPath];
            } else {
                relativePath = '/' + path.relative(this.imgBaseDir, imgPath).replace(/\\/g, '/');
                this.imgPathIDList[imgPath] = relativePath;
                if (md5ID) {
                    this.imgMD5IDList[md5ID] = imgPath;
                }
            }
            return relativePath
        }
    }

    getImageOfFile(file) {
        let imgPath = file.path;
        if (fs.existsSync(imgPath)) {
            let relativePath = '';
            try {
                if (imgPath.indexOf(this.imgPathDir) != 0) {
                    let imageAbsolutePath = path.join(this.imgPathDir, path.basename(imgPath));
                    if (!fs.existsSync(imageAbsolutePath))
                        if (!fs.existsSync(this.imgPathDir))
                            this.mkdirsSync(this.imgPathDir);
                    fs.writeFileSync(imageAbsolutePath, fs.readFileSync(imgPath));
                    imgPath = imageAbsolutePath;
                }

                imgPath = imgPath.replace(/\\/g, '/');
                if (this.imgPathIDList[imgPath]) {
                    relativePath = this.imgPathIDList[imgPath];
                } else {
                    relativePath = '/' + path.relative(this.imgBaseDir, imgPath).replace(/\\/g, '/');
                    this.imgPathIDList[imgPath] = relativePath;
                    if (md5ID) {
                        this.imgMD5IDList[md5ID] = imgPath;
                    }
                }
            } catch (e) {
            } finally {
                return relativePath
            }
        }
    }

    getImageOfObj(imgObject, imgName, ext) {
        if (!ext || ext == '.png') {
            imgObject = imgObject.toPNG();
        } else if (ext == '.bmp') {
            imgObject = imgObject.toBitmap();
        } else if (ext == '.jpg') {
            imgObject = imgObject.toJPEG(100);
        } else {
            imgObject = imgObject.toPNG();
        }

        let md5ID = md5(imgObject);
        if (this.imgMD5IDList[md5ID]) {
            return this.imgPathIDList[this.imgMD5IDList[md5ID]]
        }
        let imageName = imgName || require('moment')().format('YYYYMMDDhhmmssSSS');
        ext = (ext && this.type[ext.toLowerCase().replace(/^\./, '')]) || '.png';

        let count = 0;
        let imageAbsolutePath = path.join(this.imgPathDir, imageName + ext);
        do {
            if (count > 0)
                imageAbsolutePath = path.join(this.imgPathDir, imageName + count + ext);
            count += 1;
            if (count > 50) {
                imageAbsolutePath = path.join(this.imgPathDir, imageName + require('moment')().format('YYYYMMDDhhmmssSSS') + ext);
                break;
            }
        } while (fs.existsSync(imageAbsolutePath));
        this.mkdirsSync(path.dirname(imageAbsolutePath));
        fs.writeFileSync(imageAbsolutePath, imgObject);
        return this.getImageOfPath(imageAbsolutePath, md5ID)
    }

    renameImage(imgName, newImgName) {
        this.updateDictionary(imgName + '$', newImgName)
    }

    renameDirPath(fileName) {
        this.updateDictionary('/' + this.filename + '/', '/' + fileName + '/')
        this.filename = fileName;
    }

    updateDictionary(oldStr, newStr) {
        if (Object.keys(this.imgPathIDList).length > 0) {
            this.imgPathIDList = JSON.parse(JSON.stringify(this.imgPathIDList).replace(new RegExp(oldStr, 'g'), newStr));
            if (Object.keys(this.imgMD5IDList).length > 0)
                this.imgMD5IDList = JSON.parse(JSON.stringify(this.imgMD5IDList).replace(new RegExp(oldStr, 'g'), newStr));
        }
    }

    uploadDelAll() {
        Object.keys(this.imgPathToDel).forEach(k => {
            imgManager.uploadDel(imgManager.imgPathToDel[k])
            delete imgManager.imgPathToDel[k];
        })
    }

    uploadDel(fileHash) {
        let xhr = new XMLHttpRequest();
        xhr.open('post', 'https://sm.ms/delete/' + fileHash);
        xhr.send();
    }

    asyncUploadToSm(imgPath, file, callback) {
        let formdata = new FormData();
        formdata.append('smfile', file);
        let xhr = new XMLHttpRequest();
        xhr.open('post', 'https://sm.ms/api/upload');
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) { // 成功完成
                // 判断响应结果:
                if (xhr.status === 200) {
                    // 成功，通过responseText拿到响应的文本:
                    if (typeof callback === "function") {
                        callback(imgPath, JSON.parse(xhr.responseText))
                    }
                } else {
                    // 失败，根据响应码判断失败原因:
                    if (typeof callback === "function") {
                        callback(imgPath, {code: xhr.status})
                    }
                }
            }
        }
        // xhr.upload.onprogress = (e) => {
        //     console.log(Math.floor(100 * e.loaded / e.total) + '%');
        // }
        xhr.send(formdata)
    }

    asyncUploadToQiNiu(imgPath, callback) {
        this.getQiNiuServer().uploadFile(imgPath,this.relativePath(imgPath).slice(1),callback);
    }

    asyncUploadFile(imgPath, callback) {
        if (this.isQiNiu){
            this.asyncUploadToQiNiu(imgPath,callback)
        } else {
            let file = new File([fs.readFileSync(imgPath)], md5(imgPath) + path.extname(imgPath), {type: 'image/' + path.extname(imgPath).slice(1)});
            return this.asyncUploadToSm(imgPath,file, callback);
        }
    }

    uploadLocalSrc() {
        this.isUploading = true;
        this.timeout = 0;
        this.isQiNiu = moeApp.config.get('image-web-type') == 'qiniu';

        let finishedCount = 0;
        let uploadList = new Map();
        let successList = new Map();
        let errorList = new Map();

        function checktime(isBreak) {
            clearTimeout(imgManager.timeout);
            if (!isBreak)
                imgManager.timeout = setTimeout(() => {
                    uploadEnd(true);
                }, 30000)
        }

        document.querySelector('#right-panel').querySelectorAll('img[localimg="true"]').forEach((item) => {
            let filePath = decodeURI(item.src).replace(/^file:\/\/\//, '');
            if (fs.existsSync(filePath)) {
                uploadList.set(filePath, filePath);
            } else {
                errorList.set(filePath, 'No Find File.');
            }
        })

        if (uploadList.size > 0) {
            checktime();
            uploadList.forEach((filepath) => {
                imgManager.asyncUploadFile(filepath, uploadRequest)
            })
        } else {
            uploadEnd();
        }

        function uploadRequest(fileID, response) {
            finishedCount++;
            console.log(finishedCount + '/' + uploadList.size)
            if (response.code == 'success') {
                successList.set(fileID, response)
            } else {
                errorList.set(fileID, response.error)
            }
            if (finishedCount >= uploadList.size) {
                checktime(true);
                uploadEnd(false);
                return;
            }
            checktime();
        }

        function updateSrc() {
            let value = editor.getValue();
            successList.forEach((v, k) => {
                value = value.replace(new RegExp(imgManager.relativePath(k), 'g'), v.data.url);
                imgManager.imgPathToUrl[k] = v.data.url;
                imgManager.imgPathToDel[k] = v.data.hash;
            })

            editor.setValue(value);
            hexoWindow.content = value;
            hexoWindow.changed = true;
        }

        function uploadEnd(isTimeout) {
            try {
                updateSrc();
                let errMsg = '';
                errorList.forEach((v, k) => {
                    errMsg += k + ':' + __(v) + '</br>';
                })
                if (isTimeout) errMsg += 'Upload time out.';
                if (errMsg) {
                    window.popMessageShell(null, {
                        content: errMsg,
                        type: 'danger',
                        autoHide: false
                    })
                } else {
                    window.popMessageShell(null, {
                        content: __('All Files') + ' ' + __('Upload Finished') + ' (' + uploadList.size + ')',
                        type: 'success',
                        btnTip: 'check',
                        autoHide: true
                    });
                }
            } finally {
                imgManager.isUploading = false;
            }
        }
    }
}

module.exports = ImgManager;