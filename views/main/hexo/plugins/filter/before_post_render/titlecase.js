'use strict';

var titlecase = require('titlecase');

function titlecaseFilter(data) {
  if (!this.config.titlecase || !data.title) return;

  data.title = titlecase(data.title.toString());
}

module.exports = titlecaseFilter;
