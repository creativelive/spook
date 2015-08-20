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
  var serverOpts = {
    cors: true,
    views: {
      isCached: true,
      path: path.join(__dirname, 'templates'),
      engines: {
        ejs: {
          module: ejs
        }
      }
    }
  };
  if (opts.dev) {
    serverOpts.debug = {
      request: ['error']
    };
    serverOpts.views.isCached = false;
  }
  var server = new Hapi.Server('0.0.0.0', opts.port, serverOpts);

  server.settings.app = opts;
  var dbd = opts.dbd || 'run';
  // This is awful, but normalize doesn't remove trailing slashes, and we can't compare against dbd directly in case it isn't normalized (e.g. /foo/../)
  if(path.isAbsolute(dbd)) {
    server.settings.app.dbd = dbd;
  } else {
    server.settings.app.dbd = path.join(opts.cwd, (opts.dbd || 'run'));
  }

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
  require('./lib/io')(server.listener);

  // db
  require('./lib/db')({
    dbd: server.settings.app.dbd,
    prune: opts.prune
  }, function(err, res) {
    if (err) {
      console.log(err);
      return;
    }
    // setup the runner
    require('./lib/runner')({
      cwd: server.settings.app.cwd,
      dbd: server.settings.app.dbd,
      concurrent: server.settings.app.concurrent,
      'parallel-limit': server.settings.app['parallel-limit']
    });

    server.route(require('./routes/static'));
    server.route(require('./routes/runnables')({
      dbd: server.settings.app.dbd
    }));
    server.route(require('./routes'));
    server.ext('onPreResponse', require('./server/onPreResponse'));

    server.start(function() {
      console.log(chalk.blue('[spook] server started on port', opts.port));

    });
  });

};
