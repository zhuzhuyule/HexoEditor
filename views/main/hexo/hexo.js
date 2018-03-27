'use strict';

const path = require('path');
const loadfile = require('./loadconfig');
const loaddir = require('./load_dir');
const defConfig = require('./default_config');

function Hexo() {
    const extend = require('./extend');
    const Render = require('./render');

    this.isLoadedTag = false;
    this.config = $.extend({},defConfig);
    this.extend = {
        deployer: new extend.Deployer(),
        filter: new extend.Filter(),
        helper: new extend.Helper(),
        renderer: new extend.Renderer(),
        tag: new extend.Tag()
    };
    this.highlightEx = !!this.config.highlightEx;
    this.enable = !!moeApp.config.get('hexo-config-enable');
    this.render = new Render(this);
    this.loadConfig();
    moeApp.config.set('hexo-root-dir',this.config.__basedir);
    moeApp.setHexo(this);
}

Hexo.prototype.init = function() {
    // Load internal plugins
    this.extend.deployer.clear();
    this.extend.filter.clear();
    this.extend.helper.clear();
    this.extend.renderer.clear();
    this.extend.tag.clear();
    require('./plugins/filter')(this);
    require('./plugins/helper')(this);
    require('./plugins/renderer')(this);
    require('./plugins/tag')(this);
    require('hexo-renderer-ejs');
    require('hexo-renderer-marked');
    require('hexo-renderer-stylus');
};

Hexo.prototype.execFilter = function(type, data, options) {
    return this.extend.filter.exec(type, data, options);
};

Hexo.prototype.execFilterSync = function(type, data, options) {
    return this.extend.filter.execSync(type, data, options);
};

Hexo.prototype.loadConfig = function () {
    try {
        if (this.enable) {
            let file = moeApp.config.get('hexo-config');
            let customCfg = loadfile(file);
            if (typeof customCfg === 'object')
                this.config = lodash.extend(this.config, customCfg);
        } else {
            this.config = {};
            this.config = $.extend({}, defConfig);
        }
    }catch (e){
        console.log(e);
    }
}

Hexo.prototype.loadTags = function () {
    this.isLoadedTag = true;
    this.init();
    let paths = moeApp.config.get('hexo-tag-paths');
    if (!(paths instanceof Array))
        paths = [];
    if (this.config.__themedir)
        paths = [path.join(this.config.__themedir,'scripts','tags')].concat(paths);
    for(let i=0,len=paths.length; i<len;i++)  {
        loaddir(paths[i]);
    }
}

Hexo.prototype.changeConfig = function (enable) {
    this.enable = enable;
    let file = moeApp.config.get('hexo-config');
    if (typeof file === 'object')
        file = file.toString();
    this.config.__basedir = path.dirname(file|| '');
    // var sep = path.sep;
    // this.base_dir = base + sep;
    // this.public_dir = pathFn.join(base, 'public') + sep;
    // this.source_dir = pathFn.join(base, 'source') + sep;
    // this.plugin_dir = pathFn.join(base, 'node_modules') + sep;
    // this.script_dir = pathFn.join(base, 'scripts') + sep;
    // this.scaffold_dir = pathFn.join(base, 'scaffolds') + sep;
    // this.theme_dir = pathFn.join(base, 'themes', defaultConfig.theme) + sep;
    // this.theme_script_dir = pathFn.join(this.theme_dir, 'scripts') + sep;

    if (enable){
        // Load Hexo config
        this.loadConfig();
        // Load tags file
        this.loadTags();
    }
    moeApp.setHexo(hexo);
}

module.exports = Hexo;
