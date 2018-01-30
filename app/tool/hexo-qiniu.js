/*
*  This file is part of HexoEditor.
*
*  Copyright (c) 2018 zhuzhuyule
*/

var qiniuServer = (function () {
    const path = require('path');
    let log = log4js.getLogger('hexo-qiniu.js');

    class QiniuServer {
        constructor(acessKey, secretKey) {
            this.request = require('request');
            this.qiniu = require('qiniu');
            this.bucket = '';
            this.qiniu.conf.ACCESS_KEY = acessKey;
            this.qiniu.conf.SECRET_KEY = secretKey;
            this.mac = new this.qiniu.auth.digest.Mac(acessKey, secretKey);
        }

        /**
         * 更新信息
         * @param acessKey
         * @param secretKey
         * @param bucket
         * @param url
         */
        update(acessKey, secretKey, bucket, url) {
            acessKey = acessKey || moeApp.config.get('image-qiniu-accessKey');
            secretKey = secretKey || moeApp.config.get('image-qiniu-secretKey');
            this.qiniu.conf.ACCESS_KEY = acessKey;
            this.qiniu.conf.SECRET_KEY = secretKey;
            this.mac = new this.qiniu.auth.digest.Mac(acessKey, secretKey);
            this.bucket = bucket || this.bucket || '';
            this.url = url || this.url || '';
            log.debug('update options.')
        }

        /**
         * 生成空间 文件名
         * @param bucket        空间名（必传）
         * @param key           Key值
         * @returns {string}
         */
        getUptoken(bucket, key) {
            var options = {
                scope: bucket + ":" + key
            };
            var putPolicy = new this.qiniu.rs.PutPolicy(options);
            return putPolicy.uploadToken();
        }

        /**
         * 生成 AccessToken
         * @param url
         * @returns {string}
         */
        getAccessToken(url) {
            return this.qiniu.util.generateAccessToken(this.mac, url);
        }

        /**
         * 异步获取空间列表
         */
        getBuckets(callback) {
            const url_api_bukets = 'https://rs.qbox.me/buckets';
            var request = this.request({
                url: url_api_bukets,
                method: 'GET',
                headers: {
                    'Authorization': this.getAccessToken(url_api_bukets),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }, (error, res, body) => {
                if(res.statusCode == 200 ) {
                    log.info(`getBuckets->[${body}]`)
                }  else {
                    log.error(`getBuckets->[${body}]`)
                }
                if (typeof callback === "function") {
                    callback({
                        statusCode: res.statusCode,
                        data: JSON.parse(body)
                    })
                }
            });
            return;
        }

        /**
         * 异步获取空间地址URL列表
         * @param buketName     空间名（必传）
         */
        getBucketsUrl(buketName, callback) {
            const url_api_bukets = 'https://api.qiniu.com/v6/domain/list?tbl=' + buketName;
            var request = this.request({
                url: url_api_bukets,
                method: 'GET',
                headers: {
                    'Authorization': this.getAccessToken(url_api_bukets),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }, (error, res, body) => {
                if(res.statusCode == 200 ) {
                    log.info(`getBucketsUrl->[${body}]`)
                }  else {
                    log.error(`getBucketsUrl->[${body}]`)
                }
                if (typeof callback === "function") {
                    callback({
                        statusCode: res.statusCode,
                        data: JSON.parse(body)
                    })
                }
            });
        }

        /**
         * 异步获取服务器文件列表
         * @param buketName     空间名称（必传）
         * @param prefix        虚拟目录（选填）
         */
        getBucketsFiles(buketName, prefix, callback) {
            if (!buketName) return;
            const url_api_bukets = require('util').format(
                'https://rsf.qbox.me/list?bucket=%s&marker=&limit=1&prefix=%s&delimiter=/', buketName, prefix || '')
            var request = this.request({
                url: url_api_bukets,
                method: 'GET',
                headers: {
                    'Authorization': this.getAccessToken(url_api_bukets),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }, (error, res, body) => {
                if (typeof callback === "function") {
                    callback({
                        statusCode: res.statusCode,
                        data: JSON.parse(body)
                    })
                } else {
                    console.log(res)
                }
            });
        }

        /**
         * 删除文件
         * @param key
         * @param callback
         */
        deleteFile(key,callback){
            if(key.startsWith('/')) key = key.slice(1);
            var config = new this.qiniu.conf.Config();
            var bucketManager = new this.qiniu.rs.BucketManager(this.mac, config);
            bucketManager.delete(this.bucket, key, function(error, data, response) {
                if([200].includes(response.statusCode) ) {
                    log.info(`[${key}]: was deleted!`)
                }  else {
                    log.error(`[${key}]:`+data.error);
                }
                if (typeof callback === "function") {
                    callback({
                        statusCode: response.statusCode,
                        data: data
                    })
                }
            });
        }

        /**
         * 异步上传单个文件
         * @param localFile         本地文件全路径
         * @param serverFileName    服务器保存名称（可带地址）
         * @param callback  callback(response)    //回调函数
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
         */
        uploadFile(localFile, serverFileName, callback) {
            //生成上传 Token
            let token = this.getUptoken(this.bucket, serverFileName);
            var formUploader = new this.qiniu.form_up.FormUploader(this.qiniu.conf);
            var extra = new this.qiniu.form_up.PutExtra();
            let qiniuServer = this;
            formUploader.putFile(token, serverFileName, localFile, extra,
                function (respErr, respBody, respInfo) {
                    if (typeof  callback == 'function') {
                        let result = {type:10,id: localFile};
                        try {
                            if (respInfo.statusCode == 200 || respInfo.statusCode == 579) {
                                result.type = 20;
                                result.statusCode = 200;
                                result.data = {
                                    localname: path.basename(localFile),
                                    storename: path.basename(serverFileName),
                                    path: respBody.key,
                                    url: qiniuServer.url + respBody.key
                                }
                                result.msg = '';
                                result.errorlist = '';
                            } else {
                                result.msg = respInfo.statusCode + respBody.error;
                                result.errorlist = 'https://developer.qiniu.com/kodo/api/3928/error-responses#2';
                            }
                        }catch (e){
                            log.error('uploadFile',localFile,e)
                        }finally {
                            callback(result)
                        }
                    }
                });
        }
    }
    return QiniuServer;
})();

module.exports = qiniuServer;