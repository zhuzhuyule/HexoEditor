var urllib = require('urllib');
var util = require('./util');
var conf = require('./conf');

exports.post = post;
exports.postMultipart = postMultipart;
exports.postWithForm = postWithForm;
exports.postWithoutForm = postWithoutForm;

function postMultipart(requestURI, requestForm, callbackFunc) {
  return post(requestURI, requestForm, callbackFunc);
}

function postWithForm(requestURI, requestForm, token, callbackFunc) {
  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  if (token) {
    headers['Authorization'] = token;
  }
  return post(requestURI, requestForm, headers, callbackFunc);
}

function postWithoutForm(requestURI, token, callbackFunc) {
  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (token) {
    headers['Authorization'] = token;
  }
  return post(requestURI, null, headers, callbackFunc);
}

function post(requestURI, data, callbackFunc) {
    let xhr = new XMLHttpRequest();
    xhr.open('post', requestURI);
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
            if (typeof callbackFunc === "function") {
                callbackFunc(xhr.status, xhr.response, xhr.responseText);
            }
        }
    }
    // xhr.upload.onprogress = (e) => {
    //     console.log(Math.floor(100 * e.loaded / e.total) + '%');
    // }
    xhr.send(data)
}
