/*
*  This file is part of HexoEditor.
*
*  Copyright (c) 2018 zhuzhuyule
*
*/

var smms = (function () {
    const log = log4js.getLogger('hexo-smms.js');
    const path = require('path');
    const fs = require('fs');
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.133 Safari/537.36';

    class Smms {
        constructor() {
            this.__ = require('lodash');
            this.FormData = require('form-data');
            this.request = require('request');
        }

        clear() {
            this.request({
                url: 'https://sm.ms/clear/',
                method: 'GET',
                headers: {'user-agent': userAgent}
            })
        }

        del(fileHash) {
            this.request({
                url: 'https://sm.ms/delete/' + fileHash,
                method: 'GET',
                headers: {'user-agent': userAgent}
            }, (error, res, body) => {
                var content = body;
                if (content) {
                    content = content.match(/<div class="container"><div[^>]*>([^<]*)</)
                    if (content != null){
                        log.info(`[${fileHash}]:`+content[1])
                        content = fileHash + ' : ' + content[1];
                    }
                }
            })
        }

        getList(callback) {
            this.request({
                url: "https://sm.ms/api/list",
                method: 'GET',
                headers: {'user-agent': userAgent}
            }, (error, res, body) => {
                if (typeof callback === "function") {
                    if (res.statusCode == 200)
                        callback({
                            statusCode: res.statusCode,
                            data: (typeof(body) == 'string') ? JSON.parse(body) : body
                        });
                    else {
                        console.log(body)
                    }
                }
            })
        }

        /**
         * 生成File对象
         * @param filename
         * @param serverName
         * @returns {FormData}
         */
        getFormData(filename, serverName) {
            let buffer = fs.readFileSync(filename);
            let type = path.extname(filename)
            type = (type && type.slice(1)) || 'jpg';
            let form = new this.FormData();
            form.append('smfile', buffer, {
                filename: serverName || path.basename(filename),
                contentType: 'image/' + type
            });
            return form;
        }

        /**
         * 上传文件
         * @param localFile                       //本地文件
         * @param serverFileName                  //服务器文件名称
         * @param callback  callback(response)    //回调函数
         *   response = {
     *      id: 'localFileAbsolutePath',                      //传入文件本地绝对路径
     *      statusCode: 200|int,                              //服务器代码，200:正常，其他:报错
     *      data: {
     *        localname: 'abc.png',                           //本地文件名
     *        storename: '5a6bea876702d.png',                 //服务器文件名，SM.MS随机生成
     *        path: '/abc/abc/5a6bea876702d.png',             //服务器路径
     *        url: 'https://...../abc/abc/5a6bea876702d.png', //图片地址
     *        hash: 'sd8fsd8766d90sdf9'                       //删除hash
     *      },
     *      msg: 'error message'                              //一般只有报错才使用到
     *   }
         */
        uploadFile(localFile, serverFileName, callback) {
            var formData = this.getFormData(localFile, serverFileName);
            var request = this.request({
                url: "https://sm.ms/api/upload",
                method: 'POST',
                headers: this.__.extend({}, formData.getHeaders(), {'user-agent': userAgent})
            }, (error, res, body) => {
                if (typeof callback === "function") {
                    let response = JSON.parse(body);
                    let result = {type: 1, id: localFile};
                    if (res.statusCode == 200) {
                        result.statusCode = (response.code == 'success' ? 200 : -1);
                        if (result.statusCode == 200) {
                            result.type = 2;
                            result.data = {
                                localname: response.data.filename,
                                storename: response.data.storename,
                                path: response.data.path,
                                url: response.data.url,
                                hash: response.data.hash
                            }
                            result.msg = '';
                        } else {
                            result.msg = response.msg;
                        }
                    } else {
                        result.statusCode = res.statusCode;
                        result.msg = res.statusMessage;
                    }
                    callback(result)
                } else {
                    log.info(res)
                }
            });
            formData.pipe(request);
        }
    }
    return Smms;
})()


module.exports = smms;