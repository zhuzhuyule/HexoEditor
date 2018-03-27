module.exports = (function () {
    const log = log4js.getLogger('uploadServer.js');
    const path = require('path');
    let isUploading = false;
    let imgType = {
        "png": '.png',
        "jpg": '.jpg',
        "jpeg": '.jpg',
        "bmp": '.bmp',
        ".png": '.png',
        ".jpg": '.jpg',
        ".jpeg": '.jpg',
        ".bmp": '.bmp'
    }
    //help varible
    let smmsServer, qiniuServer, cosServer;
    let finishedCount, totalCount, pathIndex;
    let statusList, successList, errorList;
    let timeout, startDate;
    let typeServer;
    let typeBack;
    let order;
    //
    let baseDir, uploadArray, finishedCallback;

    function getSmmsServer() {
        if (!smmsServer) {
            log.info('create SmmsServer');
            smmsServer = new (require('./hexo-smms'))();
        }
        return smmsServer;
    }

    function getQiNiuServer() {
        if (!qiniuServer) {
            log.info('create qiniuServer');
            qiniuServer = new (require('./hexo-qiniu'))();
            qiniuServer.update(
                moeApp.config.get('image-qiniu-accessKey'),
                moeApp.config.get('image-qiniu-secretKey'),
                moeApp.config.get('image-qiniu-bucket'),
                moeApp.config.get('image-qiniu-url-protocol') + moeApp.config.get('image-qiniu-url') + '/'
            );
        }
        return qiniuServer;
    }

    function getCOSServer() {
        if (!cosServer) {
            log.info('create cosServer');
            cosServer = new (require('./hexo-cos'))();
            let bucketObj = moeApp.config.get('image-cos-bucket');
            bucketObj = (bucketObj || "|").split('|');
            cosServer.update(
                moeApp.config.get('image-cos-accessKey'),
                moeApp.config.get('image-cos-secretKey'),
                bucketObj[0],
                bucketObj[1],
                moeApp.config.get('image-cos-url-protocol'),
                moeApp.config.get('image-cos-customize-enable') ? moeApp.config.get('image-cos-customize') : ''
            );
        }
        return cosServer;
    }

    function asyncUploadToSmms(imgPath, callback) {
        statusList[imgPath] = {type: 0};
        log.debug(`upload [${imgPath}] to SM.MS`);
        getSmmsServer().uploadFile(imgPath, '', callback);
    }

    function asyncUploadToQiNiu(imgPath, serverName, callback) {
        log.debug(`upload [${imgPath}] to QiNiu [${serverName}]`);
        getQiNiuServer().uploadFile(imgPath, serverName, callback);
    }

    function asyncUploadToCOS(imgPath, serverName, callback) {
        log.debug(`upload [${imgPath}] to Cos [${serverName}]`);
        getCOSServer().sliceUploadFile(imgPath, serverName, callback);
    }

    function relativePath(p) {
        return path.relative(baseDir, p).replace(/\\/g, '/');
    }

    function asyncUploadFile(imgPath, callback) {
        switch (typeServer) {
            case 'qiniu':
                asyncUploadToQiNiu(imgPath, relativePath(imgPath), callback)
                break;
            case 'cos':
                asyncUploadToCOS(imgPath, relativePath(imgPath), callback)
                break;
            default: {
                if (typeBack > 2) {
                    if (statusList[imgPath]) {
                        if (statusList[imgPath].typeServer == 'qiniu') {
                            asyncUploadToQiNiu(imgPath, statusList[imgPath].pathname, callback)
                        } else {
                            asyncUploadToCOS(imgPath, statusList[imgPath].pathname, callback)
                        }
                    } else {
                        asyncUploadToSmms(imgPath, callback);
                    }
                } else {
                    asyncUploadToSmms(imgPath, callback);
                }
            }
        }
    }

    function checktime() {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            log.warn(`upload operate timeout !`);
            uploadEnd(true);
        }, 30000)
    }

    /**
     * 回调函数
     * @param fileID
     * @param result
     *   response = {
     *      id: 'localFileAbsolutePath',              //传入文件本地绝对路径
     *      type: '1|2|10|20|100|200',                //1|2 Smms; 10|20 Qiniu; 100|200 Cos  (1:失败，2：成功)
     *      statusCode: 200|int,                      //服务器代码，200:正常，其他:报错
     *      data: {
     *        localname: 'abc.png',                   //本地文件名
     *        storename: '5a6bea876702d.png',         //服务器文件名，SM.MS随机生成
     *        path: '/abc/abc/5a6bea876702d.png',     //服务器路径
     *        url: 'https://...../abc/abc/5a6bea876702d.png'  //图片地址
     *        hash: 'asdf7sdf8asdf78'                 //删除Hash
     *      },
     *      msg: 'error message'                      //一般只有报错才使用到
     *      errorlist: 'url'                          //一般只有报错才使用到,报错列表是个官网地址
     *   }
     * }
     */


    function uploaded(response) {
        order++;
        let result = response;
        let uploadNext = true;
        let imgPath = result.id;
        let nextType = '';
        if( result.statusCode == 200){
            log.info(`sucess:[${result.id}]-->[${result.data.url}]`);
        }else{
            log.warn(`failed:[${result.statusCode}][${+result.id}]-->[${result.msg}]`);
        }

        if (typeServer == 'smms' && typeBack > 2) {  //是否需要备份
            statusList[imgPath].type += result.type;
            if (statusList[imgPath].type == 2) {  //Smsm
                statusList[imgPath].hash = result.data.hash;
                statusList[imgPath].url = result.data.url;
                if (result.data.path.startsWith('/'))
                    statusList[imgPath].pathname = result.data.path.slice(1);
                else
                    statusList[imgPath].pathname = result.data.path;
                uploadNext = backUpload(result)
            } else if (statusList[imgPath].type == 22) {   //Qiniu
                uploadNext = backUpload(result)
            }
            nextType = statusList[imgPath].serverType;
        }

        let info = {
            order: order,
            isLoading: (finishedCount !== totalCount),
            finishedCount: finishedCount,
            totalCount: totalCount,
            useTime: new Date() - startDate,
            timeout: false,
            serverType: typeServer,
            response: response,
            nextPath: imgPath,
            nextType: nextType
        }


        if (!uploadNext) {
            asyncUploadFile(imgPath, uploaded);
            finishedCallback(info, successList, errorList);
        } else {
            finishedCount++;
            console.log(finishedCount + '/' + totalCount);
            if (typeServer == 'smms' && typeBack > 2) {
                if (statusList[imgPath].type == typeBack) {
                    result.data.hash = statusList[imgPath].hash;
                    result.data.url = statusList[imgPath].url;
                    successList.push(result)
                } else {
                    errorList.push(result)
                }
            } else {
                if (result.statusCode == 200) {
                    successList.push(result)
                } else {
                    errorList.push(result)
                }
            }

            if (pathIndex < totalCount) {
                info.nextPath = uploadArray[pathIndex];
                finishedCallback(info, successList, errorList);
                asyncUploadFile(info.nextPath, uploaded)
                pathIndex++;
            } else if (finishedCount == totalCount) {
                uploadEnd();
                return;
            }
        }
        checktime();
    }

    function backUpload(response) {
        let imgPath = response.id;
        if (typeBack == 22) {
            if (statusList[imgPath].type == 2) {
                statusList[imgPath].typeServer = 'qiniu';
                return false;
            } else {
                statusList[imgPath].typeServer = ''
                return true;
            }
        } else if (typeBack == 202) {
            if (statusList[imgPath].type == 2) {
                statusList[imgPath].typeServer = 'cos';
                return false;
            } else {
                statusList[imgPath].typeServer = ''
                return true;
            }
        } else if (typeBack == 222) {
            if (statusList[imgPath].type == 2) {
                statusList[imgPath].typeServer = 'qiniu';
                return false;
            } else if (statusList[imgPath].type == 22) {
                statusList[imgPath].typeServer = 'cos';
                return false;
            } else {
                statusList[imgPath].typeServer = ''
                return true;
            }
        }
    }

    function uploadEnd(isTimeout) {
        try {
            clearTimeout(timeout);
            if (isTimeout)
                errorList.push('Upload time out!', {msg: 'Place check your net!'});
        } finally {
            let info = {
                order: order,
                isLoading: false,
                finishedCount: finishedCount,
                totalCount: totalCount,
                useTime: new Date() - startDate,
                timeout: !!isTimeout,
                serverType: typeServer
            }
            finishedCallback(info, successList, errorList);
            isUploading = false;
            log.info(`---End upload---[S:${successList.length}| F:${errorList.length}][time:${ new Date() - startDate}]`);
        }
    }

    class UploadServer {
        constructor() {
            isUploading = false;
        }

        isLoading() {
            return isUploading;
        }
        //SM.MS
        del(hash){
            getSmmsServer().del(hash)
        }
        clearSmmsList(){
            getSmmsServer().clear()
        }
        getSmmsList(callback){
            getSmmsServer().getList(callback);
        }

        //Qiniu
        updateQiniu(acessKey, secretKey, bucket, url) {
            getQiNiuServer().update(acessKey, secretKey, bucket, url)
        }

        getQiniuAccessToken(url) {
            getQiNiuServer().getAccessToken(url)
        }

        getQiniuBuckets(callback) {
            getQiNiuServer().getBuckets(callback)
        }

        getQiniuBucketsUrl(buketName, callback) {
            getQiNiuServer().getBucketsUrl(buketName, callback)
        }

        deleteQiniuFile(fileanme, cb) {
            getQiNiuServer().deleteFile(fileanme, cb)
        }
        //Cos
        updateCos(acessKey, secretKey, bucket, region, protocol,customize) {
            getCOSServer().update(acessKey, secretKey, bucket, region, protocol,customize||'')
        }

        getCosService(cb) {
            getCOSServer().getService(cb)
        }

        getCosFileURL(key, cb) {
            getCOSServer().getFileURL(key, cb)
        }

        getCosBucketLocation(cb) {
            getCOSServer().getBucketLocation(cb)
        }

        deleteCosFile(fileanme, cb) {
            getCOSServer().deleteObject(fileanme, cb)
        }

        //upload file
        upload(pathArray, srcDir, callback) {
            if (isUploading || typeof callback !== 'function')
                return;
            if (!(pathArray instanceof Array))
                return;
            log.info(`---Begin upload---[${pathArray.length}]`);
            startDate = new Date();
            isUploading = true;
            baseDir = srcDir;
            uploadArray = pathArray;
            finishedCallback = callback;
            totalCount = uploadArray.length;
            finishedCount = 0;
            timeout = 0;
            order = 0;
            typeServer = moeApp.config.get('image-web-type');
            typeBack = moeApp.config.get('image-back-type');

            successList = []
            errorList = [];
            if (!statusList) statusList = new Map();
            statusList.clear();

            if (totalCount > 0) {
                checktime();
                let len = (totalCount > 5) ? 5 : totalCount;
                for (pathIndex = 0; pathIndex < len; pathIndex++) {
                    asyncUploadFile(uploadArray[pathIndex], uploaded)
                }
            } else {
                uploadEnd();
            }
        }
    }

    return UploadServer;
})();
