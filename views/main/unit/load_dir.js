var fs = require('fs');
var path = require('path');

var load = function(path, name) {
    if (name) {
        delete require.cache[require.resolve(path + name)]
        return require(path + name);
    }
    delete require.cache[require.resolve(path)]
    return require(path)
};

module.exports = function (dir) {
    try{
        if (!dir) return ;
        dir = dir.toString().replace(/\\+/g, '\\\\');
	if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir).forEach(function (filename) {
            if (!/\.js$/.test(filename)) {
                return;
            }
            var name = path.basename(filename, '.js');
            load(path.join(dir,name));
        });
    } catch(e) {
        console.log(dir,e)
    }

}