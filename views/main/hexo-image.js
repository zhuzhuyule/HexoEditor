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

    getSmmsServer() {
        if (!this.smmsServer) {
            this.smmsServer = moeApp.getSmmsServer();
        }
        return this.smmsServer;
    }
    getQiNiuServer() {
        if (!this.qiniuServer) {
            this.qiniuServer = moeApp.getQiniuServer();
            this.qiniuServer.update(
                moeApp.config.get('image-qiniu-accessKey'),
                moeApp.config.get('image-qiniu-secretKey'),
                moeApp.config.get('image-qiniu-bucket'),
                moeApp.config.get('image-qiniu-url-protocol') + moeApp.config.get('image-qiniu-url') + '/'
            );
        }
        return this.qiniuServer;
    }

    getCOSServer() {
        if (!this.cosServer) {
            this.cosServer = moeApp.getCOSServer();
            let bucketObj = moeApp.config.get('image-cos-bucket');
            bucketObj = (bucketObj||"|").split('|');
            this.cosServer.update(
                moeApp.config.get('image-cos-accessKey'),
                moeApp.config.get('image-cos-secretKey'),
                bucketObj[0],
                bucketObj[1],
                moeApp.config.get('image-cos-url-protocol')
            );
        }
        return this.cosServer;
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
            this.getSmmsServer().del(imgManager.imgPathToDel[k])
            delete imgManager.imgPathToDel[k];
        })
    }


    asyncUploadToSmms(imgPath, callback) {
        this.getSmmsServer().uploadFile(imgPath,'',callback);
    }

    asyncUploadToQiNiu(imgPath, callback) {
        this.getQiNiuServer().uploadFile(imgPath,this.relativePath(imgPath).slice(1),callback);
    }

    asyncUploadToCOS(imgPath, callback) {
        this.getCOSServer().sliceUploadFile(imgPath,this.relativePath(imgPath).slice(1),callback);
    }

    asyncUploadFile(imgPath, callback) {
        switch (this.type){
            case 'qiniu':
                this.asyncUploadToQiNiu(imgPath,callback)
                break;
            case 'cos':
                this.asyncUploadToCOS(imgPath,callback)
                break;
            default:
                this.asyncUploadToSmms(imgPath, callback);
        }
    }

    uploadLocalSrc() {
        this.isUploading = true;
        this.timeout = 0;
        this.type = moeApp.config.get('image-web-type');

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

        /**
         * 回调函数
         * @param fileID
         * @param response
         *   response = {
         *      id: 'localFileAbsolutePath',                      //传入文件本地绝对路径
         *      statusCode: 200|int,                              //服务器代码，200:正常，其他:报错
         *      data: {
         *        localname: 'abc.png',                           //本地文件名
         *        storename: '5a6bea876702d.png',                 //服务器文件名，SM.MS随机生成
         *        path: '/abc/abc/5a6bea876702d.png',             //服务器路径
         *        url: 'https://...../abc/abc/5a6bea876702d.png'  //图片地址
         *      },
         *      msg: 'error message'                              //一般只有报错才使用到
         *      errorlist: 'url'                                  //一般只有报错才使用到
         *   }
         * }
         */
        function uploadRequest(response) {
            finishedCount++;
            console.log(finishedCount + '/' + uploadList.size)
            if (response.statusCode == 200) {
                successList.set(response.id, response)
            } else {
                errorList.set(response.id, response)
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
            successList.forEach((response) => {
                value = value.replace(new RegExp(imgManager.relativePath(response.id), 'g'), response.data.url);
                imgManager.imgPathToUrl[response.id] = response.data.url;
                imgManager.imgPathToDel[response.id] = response.data.hash;
            })

            editor.setValue(value);
            hexoWindow.content = value;
            hexoWindow.changed = true;
        }

        function uploadEnd(isTimeout) {
            try {
                updateSrc();
                let errMsg = '';
                errorList.forEach((response) => {
                    errMsg += response.id + ':' + __(response.msg) + '</br>';
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