let fs = require('fs');
let path = require('path');

let config = {
    SecretId: '',
    SecretKey: '',
    Bucket: '',
    Region: '',
    Protocol: 'http://'
};
let TaskId;

class COSServer {
    constructor(acessKey, secretKey) {
        acessKey = acessKey || moeApp.config.get('image-cos-accessKey');
        secretKey = secretKey || moeApp.config.get('image-cos-secretKey');
        config.SecretId = acessKey;
        config.SecretKey = secretKey;
        this.cos = new (require('cos-nodejs-sdk-v5'))({
            // 必选参数
            SecretId: acessKey,
            SecretKey: secretKey,
            // 可选参数
            FileParallelLimit: 5,    // 控制文件上传并发数
            ChunkParallelLimit: 5,   // 控制单个文件下分片上传并发数
            ChunkSize: 2 * 1024 * 1024,  // 控制分片大小，单位 B
        });
    }

    /**
     * 更新信息
     * @param acessKey
     * @param secretKey
     * @param bucket
     * @param region
     */
    update(acessKey, secretKey, bucket, region,protocol) {
        this.cos.options.SecretId = acessKey || config.SecretId || '';
        this.cos.options.SecretKey = secretKey || config.SecretKey || '';
        config.SecretId = acessKey || config.SecretId || '';
        config.SecretKey = secretKey || config.SecretKey || '';
        config.Bucket = bucket || config.Bucket || '';
        config.Region = region || config.Region || '';
        config.Protocol = protocol || config.Protocol || 'http://';
    }

    getService(cb) {
        this.cos.getService(function (err, data) {
            if (typeof cb === 'function')
                cb(err || data);
        });
    }

    getFileURL(key, cb) {
        let url = this.cos.getObjectUrl({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: key,
            Expires: 60,
            Sign: true,
        }, function (err, data) {
            if (typeof cb === 'function')
                cb(err || data);
        });
        return url;
    }

    getBucketLocation(cb) {
        this.cos.getBucketLocation({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region
        }, function (err, data) {
            if (typeof cb === 'function')
                cb(err || data);
        });
    }

    getBucketVersioning(cb) {
        this.cos.getBucketVersioning({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region
        }, function (err, data) {
            if (typeof cb === 'function')
                cb(err || data);
        });
    }

    putObjectCopy(filename, cb) {
        this.cos.putObjectCopy({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: filename,
            CopySource: config.Bucket + '.cos.' + config.Region + '.myqcloud.com/' + filename
        }, function (err, data) {
            if (typeof cb === 'function')
                cb(err || data);
        });
    }

    download(serverFile, localFile, cb) {
        let localName = localFile + path.basename(serverFile);
        this.cos.getObject({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: serverFile,
            Output: localName,
            onProgress: function (progressData) {
                console.log(JSON.stringify(progressData));
            }
        }, function (err, data) {
            if (typeof cb === 'function')
                cb(err || data);
        });
    }

    deleteObject(fileanme, cb) {
        this.cos.deleteObject({
            Bucket: config.Bucket, // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: fileanme
        }, function (err, data) {
            if (typeof cb === 'function')
                cb(err || data);
        });
    }

    deleteMultipleObject(fileanmes, cb) {
        this.cos.deleteMultipleObject({
            Bucket: config.Bucket,
            Region: config.Region,
            Objects: fileanmes  // [
                                //     {Key: '1mb.zip'},
                                //     {Key: '3mb.zip'},
                                // ]
        }, function (err, data) {
            if (typeof cb === 'function')
                cb(err || data);
        });
    }

    uploadFile(localFile, serverFile, cb) {
        if (!serverFile)
            serverFile = path.basename(localFile);
        this.cos.putObject({
            Bucket: config.Bucket, /* 必须 */ // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: serverFile, /* 必须 */
            TaskReady: function (tid) {
                TaskId = tid;
            },
            onProgress: function (progressData) {
                console.log(JSON.stringify(progressData));
            },
            // 格式1. 传入文件内容
            // Body: fs.readFileSync(filepath),
            // 格式2. 传入文件流，必须需要传文件大小
            Body: fs.createReadStream(localFile),
            ContentLength: fs.statSync(localFile).size
        }, function (err, data) {
            /*data = {
            *  ETag: "b2b35ae16725f9578f58ebe98f53bb4d",
            *  Location: "http://myblog-1256010832.cos.ap-chengdu.myqcloud.com/test.png",
            *  statusCode: 200,
            *  headers: {}
            }*/
            if (typeof cb === 'function')
                cb(err || data);
        });
    }

    sliceUploadFile(localFile, serverFile, cb) {
        if (!serverFile)
            serverFile = path.basename(localFile);
        this.cos.sliceUploadFile({
            Bucket: config.Bucket, /* 必须 */ // Bucket 格式：test-1250000000
            Region: config.Region,
            Key: serverFile, /* 必须 */
            FilePath: localFile, /* 必须 */
            TaskReady: function (tid) {
                TaskId = tid;
            },
            onHashProgress: function (progressData) {
                console.log(JSON.stringify(progressData));
            },
            onProgress: function (progressData) {
                console.log(JSON.stringify(progressData));
            },
        }, function (err, data) {
            /*data = {
            *  Bucket: "myblog",
            *  ETag: "",
            *  Key: "test.png",
            *  Location: "",
            *  statusCode: 200,
            *  headers: {}
            }*/
            if (typeof cb === 'function'){
                let response = {};
                if (err){
                    response.code = 'error';
                    response.error = err.error.message;
                } else{
                    response.code = 'success';
                    response.data = {
                        url: config.Protocol + data.Location,
                        hash: data.Key
                    }
                }
                cb(localFile,response,data);
            }
        });
    }

    cancelTask() {
        this.cos.cancelTask(TaskId);
        console.log('canceled');
    }

    pauseTask() {
        this.cos.pauseTask(TaskId);
        console.log('paused');
    }

    restartTask() {
        this.cos.restartTask(TaskId);
        console.log('restart');
    }
}

module.exports = COSServer;
