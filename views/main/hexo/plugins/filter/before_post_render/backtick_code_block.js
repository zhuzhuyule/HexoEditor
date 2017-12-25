'use strict';

const highlight = require('./highlight/backtick_code_block');
const highlightEx = require('./highlightEx/backtick_code_block');

function backtickCodeBlock(data) {
    if (data.highlightEx) {
        return highlightEx.apply(this,[data])
    } else {
        return highlight.apply(this,[data])
    }
}

module.exports = backtickCodeBlock;
