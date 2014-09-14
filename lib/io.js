'use strict';

var Socket = require('socket.io');

module.exports = function init(server) {
  var io = Socket(server);
  module.exports = io;
  return io;
};
