'use strict';

var Hapi = require('hapi');
var chalk = require('chalk');
var ejs = require('./lib/ejs');
var moment = require('moment');
var path = require('path');

module.exports = function init(opts) {
  opts = opts || {};
  opts.port = opts.port || 3000;
  opts.cwd = opts.cwd || process.cwd();

  // server opts
  var server = new Hapi.Server('localhost', opts.port, {
    cors: true,
    debug: {
      request: ['error']
    },
    views: {
      isCached: false,
      path: path.join(__dirname, 'templates'),
      engines: {
        ejs: {
          module: ejs
        }
      }
    }
  });

  server.settings.app = opts;
  server.settings.app.runPath = path.join(opts.cwd, 'run');

  // logging
  server.on('request', function(request, event) {
    var statics = ['css', 'img', 'js'];
    var log = true;
    if (event.data && event.data.url) {
      if (event.data.url === '/favicon.ico') {
        return;
      }
      for (var i = 0, il = statics.length; i < il; i++) {
        if (event.data.url.substr(1, statics[i].length) === statics[i]) {
          log = false;
          break;
        }
      }
      if (log) {
        console.log(chalk.blue('[spook] ' + moment().format('YYYY-MM-DD HH:mm:ss') + ' ' + event.data.url));
      }
    }
  });

  // io
  var io = require('./lib/io')(server.listener);

  // db
  require('./lib/db')({
    runPath: server.settings.app.runPath
  }, function(err, res){
    if(err) {
      console.log(err);
      return;
    }
    server.app.db = res;
    server.route(require('./routes/static'));
    server.route(require('./routes/runnables')(opts));
    server.route(require('./routes'));
    server.ext('onPreResponse', require('./server/onPreResponse'));

    server.app.pio = {};

    server.start(function(){
      console.log(chalk.blue('[spook] server started on port', opts.port));

      io.namespace.run = {};
      io.namespace.open = {
        server: io.server.of('/open'),
        data: {}
      };
      io.namespace.open.fn = {};
      io.namespace.open.fn.count = function() {
        return Object.keys(io.namespace.open.data).length || 0;
      };
      io.namespace.open.server.on('connection', function(socket){
        socket.on('disconnect', function(){});
      });

    });
  });

};
