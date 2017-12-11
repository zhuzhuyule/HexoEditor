var fs = require('hexo-fs');
var YAML = require('yamljs');
var path = require('path');
var extend = require('./objExtend');
var defConfig = require('./default_config');

function loadYAMLFile(file) {
    var configPath = file;
    if (fs.statSync(file).isDirectory()) {
        configPath = (file + '/_config.yml').replace('//', '/');
    }
    var baseDir = path.dirname(configPath);

    defConfig.basedir = defConfig;
    var config = fs.existsSync(configPath) ? YAML.parse(fs.readFileSync(configPath).toString()) : {};
    var themeConfig = {};
    if (config.theme) {
        configPath = baseDir + '/themes/'+config.theme +'/_config.yml';
        defConfig.tagdir = baseDir + '/themes/'+config.theme +'/scripts/tags';
        themeConfig = fs.existsSync(configPath) ? YAML.parse(fs.readFileSync(configPath).toString()) : {};
    }
    return extend(defConfig,config,themeConfig);
}


module.exports = loadYAMLFile;