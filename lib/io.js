'use strict';

var Socket = require('socket.io');
var room = {};

module.exports = function init(server) {
  var io = {
    server: Socket(server),
    room: room
  };
  module.exports = io;
  return io;
};
