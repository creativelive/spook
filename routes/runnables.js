'use strict';

var path = require('path');
var routes = [];

module.exports = function(opts) {

  routes.push({
    method: 'GET',
    path: '/file/{file*}',
    handler: {
      directory: {
        path: path.join(opts.runPath),
        listing: false,
        index: false
      }
    }
  });

  return routes;
};
