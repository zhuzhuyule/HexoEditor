window.md5 = (text) => {
    return require('crypto').createHash('md5').update(text).digest('hex');
};

let uploadList = [];

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

    hasUploadFile(){
        return (uploadList.length > 0)
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
        fs.access(rootPaht, fs.constants.R_OK | fs.constants.W_OK, (err) => {
            if(err){
                log.warn(`setting [${rootPaht}] failed.` + err)
                rootPaht = path.join(moeApp.appDataPath,'images');
            }   else {
                log.info(`setting [${rootPaht}] success.`)
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
        });
    }

    mkdirsSync(dirpath, mode) {
        try{
            if (!fs.existsSync(dirpath)) {
                if (dirpath.endsWith(path.sep))
                    dirpath = dirpath.slice(0, dirpath.length - 1);
                var pathtmp = '';
                var perPath = '';
                dirpath.split(path.sep).forEach(function (dirname) {
                    perPath = pathtmp;
                    dirname = (dirname == ''? '/':dirname);
                    if (pathtmp) {
                        pathtmp = path.join(pathtmp, dirname);
                    } else {
                        pathtmp = dirname;
                    }
                    if (!fs.existsSync(pathtmp)) {
                        if(perPath && fs.existsSync(perPath)){
                            fs.accessSync(perPath, fs.constants.R_OK | fs.constants.W_OK);
                            if (!fs.mkdirSync(pathtmp, mode)) {
                                return false;
                            }
                        } else {
                            return false;
                        }
                    }
                });
            }
            log.info(`setting [${dirpath}] success.`)
        } catch (e) {
            log.warn(`setting [${dirpath}] failed.` + e)
            return false;
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
                log.error(e);
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
        this.updateDictionary(imgName + '\\b', newImgName)
    }

    renameDirPath(fileName,notUpdateCache) {
        if (!notUpdateCache)
            this.updateDictionary('/' + this.postName + '/', '/' + fileName + '/')
        this.imgPathDir = path.resolve(this.imgPathDir,'..', fileName);
        this.postName = fileName;
    }

    updateDictionary(oldStr, newStr) {
        if (Object.keys(this.imgPathToMarkURL).length > 0) {
            this.imgPathToMarkURL = JSON.parse(JSON.stringify(this.imgPathToMarkURL).replace(new RegExp(oldStr, 'g'), newStr));
            if (Object.keys(this.imgPathToUrlPath).length > 0)
                this.imgPathToUrlPath = JSON.parse(JSON.stringify(this.imgPathToUrlPath).replace(new RegExp(oldStr, 'g'), newStr));
            if (Object.keys(this.imgPathToDelHash).length > 0)
                this.imgPathToDelHash = JSON.parse(JSON.stringify(this.imgPathToDelHash).replace(new RegExp(oldStr, 'g'), newStr));
            if (Object.keys(this.imgMD5ToPath).length > 0)
                this.imgMD5ToPath = JSON.parse(JSON.stringify(this.imgMD5ToPath).replace(new RegExp(oldStr, 'g'), newStr));
        }
    }

    abortUploading() {
        var typeServer = moeApp.config.get('image-web-type');
        var typeBack = moeApp.config.get('image-back-type');
        switch (typeServer) {
            case 'smms': {
                uploadList.forEach((response) => {
                        this.getUploadServer().del(response.data.hash);
                        if (typeBack > 220 || typeBack == 22)
                            this.getUploadServer().deleteQiniuFile(response.data.path);
                        if (typeBack > 200)
                            this.getUploadServer().deleteCosFile(response.data.path);
                    }
                );
                this.getUploadServer().clearSmmsList();
                break;
            }
            case 'qiniu': {
                uploadList.forEach((response) => {
                        this.getUploadServer().deleteQiniuFile(response.data.path);
                    }
                );
                break;
            }
            case 'cos': {
                uploadList.forEach((response) => {
                        this.getUploadServer().deleteCosFile(response.data.path);
                    }
                );
                break;
            }
        }
        uploadList = [];
    }

    uploadDelAll() {
        Object.keys(this.imgPathToDelHash).forEach(k => {
            this.getUploadServer().del(imgManager.imgPathToDelHash[k])
            delete imgManager.imgPathToDelHash[k];
        })
    }


    uploadLocalSrc() {
        let arr = [];
        let reg;
        if (process.platform == 'win32')
            reg = /^file:\/\/\//;
        else
            reg = /^file:\/\//;

        document.querySelector('#right-panel').querySelectorAll('img[localimg="true"]').forEach((item) => {
            let filePath = decodeURI(item.src).replace(reg, '');
            if (fs.existsSync(filePath)) {
                arr.push(filePath);
            }
        });
        let statuContentItem = document.querySelector('#status-content');
        statuContentItem.innerText = '';
        statuContentItem.style.opacity = 1;
        let content = '';
        let order = 0;
        let serverType = {
            smms: 'WebSM',
            qiniu: 'QiNiu',
            cos: 'WebCOS'
        }
        this.getUploadServer().upload(arr, this.imgBaseDir, (info, success, error) => {
            if (info.order > order) {
                order = info.order;
                if (info.isLoading) {
                    content = `[${info.finishedCount}/${info.totalCount}]`;
                    content += `"${info.response.id}" uploaded to ${__(serverType[info.serverType])} finished!`;
                    if (info.nextPath)
                        content += `And uploading "${info.nextPath}"`;
                    statuContentItem.innerText = content;
                } else {
                    updateSrc(success)
                    updateError(error)
                    content = `[${info.finishedCount}/${info.totalCount}]`;
                    content += `Upload End! Success: ${success.length} | Failed: ${error.length}|`;
                    statuContentItem.innerText = content;
                    setTimeout(() => {
                        statuContentItem.style.opacity = 0;
                    }, 5000)
                }
            }
        });

        function updateError(errorList) {
            let errMsg = '';
            let maxIndex = errorList.length - 1;
            if (maxIndex >= 0) {
                errorList.forEach((response, index) => {
                    log.warn(`Failed File:[${response.id}]==>[${__(response.msg)}]`);
                    errMsg += response.id + ':' + __(response.msg) + '</br>';
                    if (maxIndex == index) {
                        window.popMessageShell(null, {
                            content: errMsg,
                            type: 'danger',
                            autoHide: false
                        })
                    }
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
            let content = editor.getValue();
            let maxIndex = successList.length - 1;
            log.info(`Begin update Src[${maxIndex}]`);
            successList.forEach((response, index) => {
                uploadList.push(response);
                let relPath = imgManager.imgPathToMarkURL[response.id];
                if (relPath){
                    content = content.replace(new RegExp(relPath, 'g'), response.data.url);
                    imgManager.imgPathToUrlPath[response.id] = response.data.path;
                    imgManager.imgPathToMarkURL[response.id] = response.data.url;
                    imgManager.imgPathToDelHash[response.id] = (response.data.hash || '');
                    if (maxIndex == index) {
                        editor.setValue(content);
                        hexoWindow.content = content;
                        hexoWindow.changed = true;
                        log.info(`End update Src[${maxIndex}]`);
                    }
                }
            });
        }
    }
}

module.exports = ImgManager;