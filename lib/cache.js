'use strict';

var LRU = require('lru-cache');

var cache;
if (!cache) {
  var opts = {
    max: 500,
    maxAge: 1000 * 60 * 60,
    stale: true
  };
  cache = LRU(opts);
}
module.exports = cache;
