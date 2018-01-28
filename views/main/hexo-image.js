window.md5 = (text) => {
    return require('crypto').createHash('md5').update(text).digest('hex');
};

class ImgManager {
    constructor() {
        this.postName = path.basename(hexoWindow.fileName, path.extname(hexoWindow.fileName)) || hexoWindow.ID || "";
        this.imgMD5ToPath = {};
        this.imgPathToUrlPath = {};
        this.imgPathToMarkURL = {};
        this.imgPathToDelHash = {};
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
        this.imgPathDir = path.join(rootPaht, this.postName);
        if (this.imgBaseDir && this.imgBaseDir !== rootPaht) {
            const oldPath = path.join(this.imgBaseDir, this.postName);
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

    getUploadServer() {
        if (!this.uploadServer) {
            this.uploadServer = moeApp.getUploadServer();
        }
        return this.uploadServer;
    }

    getImageOfPath(imgPath, md5ID) {
        if (fs.existsSync(imgPath)) {
            imgPath = imgPath.replace(/\\/g, '/');
            let relativePath = '';
            if (this.imgPathToMarkURL[imgPath]) {
                relativePath = this.imgPathToMarkURL[imgPath];
            } else {
                relativePath = '/' + path.relative(this.imgBaseDir, imgPath).replace(/\\/g, '/');
                this.imgPathToMarkURL[imgPath] = relativePath;
                if (md5ID) {
                    this.imgMD5ToPath[md5ID] = imgPath;
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
                if (this.imgPathToMarkURL[imgPath]) {
                    relativePath = this.imgPathToMarkURL[imgPath];
                } else {
                    relativePath = '/' + path.relative(this.imgBaseDir, imgPath).replace(/\\/g, '/');
                    this.imgPathToMarkURL[imgPath] = relativePath;
                    if (md5ID) {
                        this.imgMD5ToPath[md5ID] = imgPath;
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
        if (this.imgMD5ToPath[md5ID]) {
            return this.imgPathToMarkURL[this.imgMD5ToPath[md5ID]]
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
        this.updateDictionary('/' + this.postName + '/', '/' + fileName + '/')
        this.postName = fileName;
    }

    updateDictionary(oldStr, newStr) {
        if (Object.keys(this.imgPathToMarkURL).length > 0) {
            this.imgPathToMarkURL = JSON.parse(JSON.stringify(this.imgPathToMarkURL).replace(new RegExp(oldStr, 'g'), newStr));
            if (Object.keys(this.imgMD5ToPath).length > 0)
                this.imgMD5ToPath = JSON.parse(JSON.stringify(this.imgMD5ToPath).replace(new RegExp(oldStr, 'g'), newStr));
        }
    }

    uploadDelAll() {
        Object.keys(this.imgPathToDelHash).forEach(k => {
            this.getSmmsServer().del(imgManager.imgPathToDelHash[k])
            delete imgManager.imgPathToDelHash[k];
        })
    }


    uploadLocalSrc() {
        let arr = [];
        document.querySelector('#right-panel').querySelectorAll('img[localimg="true"]').forEach((item) => {
            let filePath = decodeURI(item.src).replace(/^file:\/\/\//, '');
            if (fs.existsSync(filePath)) {
                arr.push(filePath);
            } else {
            }
        })

        this.getUploadServer().upload(arr,this.imgBaseDir,(success,error)=>{
            updateSrc(success)
            updateError(error)
        });

        function updateError(errorList) {
                let errMsg = '';
                errorList.forEach((response) => {
                    errMsg += response.id + ':' + __(response.msg) + '</br>';
                })
                if (errMsg) {
                    window.popMessageShell(null, {
                        content: errMsg,
                        type: 'danger',
                        autoHide: false
                    })
                } else {
                    window.popMessageShell(null, {
                        content: __('All Files') + ' ' + __('Upload Finished'),
                        type: 'success',
                        btnTip: 'check',
                        autoHide: true
                    });
                }
        }

        function updateSrc(successList) {
            var content = editor.getValue();
            successList.forEach((response) => {
                content = content.replace(new RegExp(imgManager.imgPathToMarkURL[response.id], 'g'), response.data.url);
                imgManager.imgPathToUrlPath[response.id] = response.data.path;
                imgManager.imgPathToMarkURL[response.id] = response.data.url;
                imgManager.imgPathToDelHash[response.id] = response.data.hash||'';
            })
            editor.setValue(content);
            hexoWindow.content = content;
            hexoWindow.changed = true;
        }
    }
}

module.exports = ImgManager;