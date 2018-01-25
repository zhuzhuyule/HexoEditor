class qiniuServer {
    constructor(acessKey, secretKey) {
        this.qiniu = require('./qiniu/index');
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
        this.qiniu.conf.ACCESS_KEY = acessKey;
        this.qiniu.conf.SECRET_KEY = secretKey;
        this.mac = new this.qiniu.auth.digest.Mac(acessKey, secretKey);
        this.bucket = bucket||this.bucket||'';
        this.url = url||this.url||'';
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
        let xhr = new XMLHttpRequest();
        xhr.open('get', url_api_bukets);
        xhr.setRequestHeader('Authorization', this.getAccessToken(url_api_bukets));
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) { // 成功完成
                console.log(xhr.status)
                console.log(xhr.responseText)
                if (typeof callback === "function") {
                    callback({
                        code: xhr.status,
                        data: JSON.parse(xhr.responseText)
                    })
                }
            }
        }
        xhr.send();
    }

    /**
     * 异步获取空间地址URL列表
     * @param buketName     空间名（必传）
     */
    getBucketsUrl(buketName,callback) {
        const url_api_bukets = 'https://api.qiniu.com/v6/domain/list?tbl=' + buketName;

        let xhr = new XMLHttpRequest();
        xhr.open('get', url_api_bukets);
        xhr.setRequestHeader('Authorization', this.getAccessToken(url_api_bukets));
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) { // 成功完成
                console.log(xhr.status)
                console.log(xhr.responseText)
                if (typeof callback === "function") {
                    callback({
                        code: xhr.status,
                        data: JSON.parse(xhr.responseText)
                    })
                }
            }
        }
        xhr.send();
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
        let xhr = new XMLHttpRequest();
        xhr.open('get', url_api_bukets);
        xhr.setRequestHeader('Authorization', this.getAccessToken(url_api_bukets));
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) { // 成功完成
                console.log(xhr.status)
                console.log(xhr.responseText)
                if (typeof callback === "function") {
                    callback({
                        code: xhr.status,
                        data: JSON.parse(xhr.responseText)
                    })
                }
            }
        }
        xhr.send();
    }

    /**
     * 异步上传单个文件
     * @param localFile         本地文件全路径
     * @param serverFileName    服务器保存名称（可带地址）
     * @param callback          上传完成响应回调
     */
    uploadFile(localFile,serverFileName, callback) {
        //生成上传 Token
        let token = this.getUptoken(this.bucket, serverFileName);
        var formUploader = new this.qiniu.form_up.FormUploader(this.qiniu.conf);
        var extra = new this.qiniu.form_up.PutExtra();
        let qiniuServer = this;
        formUploader.putFile(token, serverFileName, localFile, extra,
            function (statusCode,response, responseText) {
                console.log( response);
                if (statusCode == 200 || statusCode == 579) {
                    let result = {
                        code: 'success',
                        data: {
                            url: qiniuServer.url + response.key
                        }
                    }
                    callback(localFile, result);
                } else {
                    console.log(statusCode);
                    let result = {
                        error: statusCode + responseText,
                    }
                    callback(localFile, result);
                }
            });
    }
}

module.exports = qiniuServer;