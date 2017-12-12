'use strict';

module.exports = function(ctx) {
  var filter = ctx.extend.filter;

  require('./after_post_render')(ctx);
  require('./before_post_render')(ctx);
};
