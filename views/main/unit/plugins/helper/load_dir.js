var fs = require('fs');
var path = require('path');

var load = function(path, name) {
    if (name) {
        return require(path + name);
    }
    return require(path)
};

module.exports = function (dir) {
    fs.readdirSync(dir).forEach(function (filename) {
        if (!/\.js$/.test(filename)) {
            return;
        }
        var name = path.basename(filename, '.js');
        load(dir + '/',name);
    });
}