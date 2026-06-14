'use strict';

const md5lib = require('md5');

function md5(str) {
  return md5lib(str);
}

module.exports = { md5 };
