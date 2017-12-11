'use strict';

var extend = require('./extend');
var Render = require('./render');

function Hexo() {
    this.extend = {
        deployer: new extend.Deployer(),
        filter: new extend.Filter(),
        helper: new extend.Helper(),
        renderer: new extend.Renderer(),
        tag: new extend.Tag()
    };

    this.render = new Render(this);
    this.init();
}

Hexo.prototype.init = function() {
    // Load internal plugins
    require('./plugins/filter')(this);
    require('./plugins/helper')(this);
    require('./plugins/renderer')(this);
    require('./plugins/tag')(this);

    var config = this.extend.helper.get('loadconfig')('D:/SVN/WebBlog/_config.yml');
    this.config = config;
};

Hexo.prototype.execFilter = function(type, data, options) {
    return this.extend.filter.exec(type, data, options);
};

Hexo.prototype.execFilterSync = function(type, data, options) {
    return this.extend.filter.execSync(type, data, options);
};

module.exports = Hexo;
