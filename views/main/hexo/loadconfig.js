var fs = require('hexo-fs');
var YAML = require('yamljs');
var path = require('path');
var loadsh = require('lodash');
var defConfig = require('./default_config');

function loadYAMLFile(file) {
    if (!file) return loadsh.extend({}, defConfig);
    file = file.toString().replace(/\\+/g, '\\\\');
    if (!fs.existsSync(file)) return {};
    var configPath = file;
    if (fs.statSync(file).isDirectory()) {
        configPath = (path.join(file, '_config.yml'));
    }
    var baseDir = path.dirname(configPath);
    var config = fs.existsSync(configPath) ? YAML.parse(fs.readFileSync(configPath).toString()) : {};
    defConfig.__basedir = baseDir;
    var themeConfig = {};
    if (config.theme) {
        defConfig.__themedir = path.join( baseDir,'themes',config.theme);
        configPath = path.join( defConfig.__themedir,'_config.yml');
        themeConfig = fs.existsSync(configPath) ? YAML.parse(fs.readFileSync(configPath).toString()) : {};
    }
    return loadsh.extend({}, defConfig, config, themeConfig);
}


module.exports = loadYAMLFile;