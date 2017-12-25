'use strict';

var yaml = require('yamljs');
var escapeYAML = require('hexo-front-matter').escape;

function yamlHelper(data) {
  return yaml.load(escapeYAML(data.text));
}

module.exports = yamlHelper;
