'use strict';

// https://github.com/imathis/hsl-picker/blob/master/assets/javascripts/modules/color.coffee

function tagcloudHelper(tags, options) {
    if (!options && (!tags || !tags.hasOwnProperty('length'))) {
        options = tags;
        tags = this.site.tags;
    }

    if (!tags || !tags.length) return '';
    options = options || {};

    var min = options.min_font || 10;
    var max = options.max_font || 20;
    var orderby = options.orderby || 'name';
    var order = options.order || 1;
    var unit = options.unit || 'px';
    var color = options.color || '#fff';
    var colorTag = options.colorTag || '';
    var transform = options.transform;
    var separator = options.separator || ' ';
    var result = [];
    var self = this;
    var startColor, endColor;


    // Sort the tags
    if (orderby === 'random' || orderby === 'rand') {
        tags = tags.random();
    } else {
        tags = tags.sort(orderby, order);
    }

    // Ignore tags with zero posts
    tags = tags.filter(function(tag) {
        return tag.length;
    });

    // Limit the number of tags
    if (options.amount) {
        tags = tags.limit(options.amount);
    }

    var sizes = [];

    tags.sort('length').forEach(function(tag) {
        var length = tag.length;
        if (~sizes.indexOf(length)) return;

        sizes.push(length);
    });

    var length = sizes.length - 1;


    var colorClass = '';
    switch (Math.floor(Math.random() * 3)) {
        case 1:
            colorClass = 'blue';
            break;
        case 2:
            colorClass = 'green';
            break;
        default:
            colorClass = '';
    }
    result.push('<ul class="tags">');
    tags.forEach(function(tag) {
        result.push(
            '<li class="' + colorClass + '"><a href="' + self.url_for(tag.path) + '" >' +
            (transform ? transform(tag.name) : tag.name) + '<span>' + tag.length + '</span></a></li>'
        );
    });
    result.push('</ul>');

    return result.join(separator);
}


module.exports = tagcloudHelper;