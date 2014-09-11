'use strict';

var Socket = require('socket.io');
var namespace = {};

module.exports = function init(server) {
  var io = {
    server: Socket(server),
    namespace: namespace
  };
  module.exports = io;
  return io;
};
