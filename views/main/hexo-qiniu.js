var qiniu = require("qiniu");
//需要填写你的 Access Key 和 Secret Key
qiniu.conf.ACCESS_KEY = '';
qiniu.conf.SECRET_KEY = '';
qiniu.baseWeb = 'http://*.bkt.clouddn.com/'
//要上传的空间
const bucket = 'test';

//构建上传策略函数，设置回调的url以及需要回调给业务服务器的数据
function uptoken(bucket, key) {
    var options = {
        scope: bucket + ":" + key
    };
    var putPolicy = new qiniu.rs.PutPolicy(options);
    return putPolicy.uploadToken();
}

//构造上传函数
function uploadFile(key, localFile,callback) {
    //生成上传 Token
    let token = uptoken(bucket, key);
    var formUploader = new qiniu.form_up.FormUploader(qiniu.conf);
    var extra = new qiniu.form_up.PutExtra();
    formUploader.putFile(token, key, localFile, extra,
        function (respErr, respBody, respInfo) {
            if (respErr) {
                throw respErr;
            }
            console.log(2, respBody);
            if (respInfo.statusCode == 200 || respInfo.statusCode ==  579) {
                console.log(respBody);
                let response = {
                    code: 'success',
                    data: {
                        url: qiniu.baseWeb+respBody.key
                    }
                }
                 callback(md5(localFile),response);
            } else {
                console.log(respInfo.statusCode);
                let response = {
                    error: respInfo.statusCode + respBody,
                }
                callback(md5(localFile),response);
            }
        });
}
module.exports = uploadFile;