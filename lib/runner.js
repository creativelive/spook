'use strict';

var pad = require('pad');
var path = require('path');
var async = require('async');
var mkdirp = require('mkdirp');
var minimist = require('minimist');
var Spook = require('./spook');
var db = require('./db');
var io = require('./io');
var thumbs = require('./thumbs');
var q;
var runner = {
  open: {},
  env: {}
};

var Run = function Run(opts, cb) {
  var mask;
  var run = {
    ACT: 1,
    STA: parseInt(+new Date() / 1000, 10)
  };
  var job;

  async.series({
    job: function(cb) {
      db.job.findOne({
        SLUG: opts.SLUG
      }, function(err, doc) {
        job = doc;
        cb(err);
      });
    },
    run: function(cb) {
      // prepare a new run doc in the db
      db.run.count({
        SLUG: opts.SLUG
      }, function(err, count) {
        if (err) {
          return cb(err);
        }
        run.NUM = ++count;
        mask = pad(4, run.NUM, '0');
        mask = path.join(mask.substr(0, 2), mask.substr(2));
        run.SLUG = opts.SLUG;
        run.SLUM = run.SLUG + '-' + run.NUM;
        // shortcut to allow running route not to have to look up job each time
        // this document is entirely replaced once run completes
        run.ALIAS = job.ALIAS;
        db.run.insert(run, function(err, doc) {
          run = doc;
          cb(err);
        });
      });
    }
  }, function(err) {
    if (err) {
      return cb(err);
    }
    var argv = minimist(job.CMD.split(' '));
    argv.cwd = runner.env.cwd;
    argv.record = true;
    argv.out = path.join(runner.env.dbd, job.SLUG, mask);
    argv.work = 'parallel';
    argv['parallel-limit'] = runner.env['parallel-limit'];
    argv.record = true;
    mkdirp(argv.out, function(err) {
      if (err) {
        return cb(err);
      }
      var spook = Spook(argv, function(err, res) {
        if (err) {
          return cb(err);
        }
        var tests = res.tests;
        runner.open[run.SLUM] = {
          data: {
            tests: tests,
            run: run,
            job: job,
            msgs: []
          },
          queued: true,
          kill: spook.kill
        };

        argv.listener = function listener(msg) {
          // console.log('emit ln to', run.SLUM);
          runner.open[run.SLUM].data.msgs.push(msg);
          io.in(run.SLUM).emit('run', msg);
        };

        var task = function(qcb) {
          var start = parseInt(+new Date() / 1000, 10);
          db.run.update({
            _id: run._id
          }, {
            $set: {
              STA: start
            }
          }, function(err) {
            if (err) {
              console.log(err);
            }
            runner.open[run.SLUM].data.run.STA = start;
            runner.open[run.SLUM].queued = false;

            // console.log('open emit', run.SLUM, 'STA');
            io.emit('open', {
              type: 'STA',
              SLUM: run.SLUM,
              open: Object.keys(runner.open).length || 0
            });

            spook.run(function(err, res) {
              if (err) {
                console.log(err);
              }
              res.NUM = run.NUM;
              res.SLUM = run.SLUM;
              res.SLUG = run.SLUG;
              db.run.update({
                SLUG: run.SLUG,
                NUM: run.NUM
              }, res, function(err, numReplaced) {
                if (err) {
                  console.log(err);
                }
                delete runner.open[run.SLUM];

                // console.log('open emit', run.SLUM, 'END');
                io.emit('open', {
                  type: 'END',
                  SLUM: run.SLUM,
                  DU: res.DU,
                  ST: res.TO.ST,
                  open: Object.keys(runner.open).length || 0
                });

                thumbs({
                  out: argv.out
                });

                // call the concurrent queue callback
                qcb();
              });
            });
          });
        };
        cb(err, {
          data: runner.open[run.SLUM].data,
          task: task
        });
      });
    });
  });
};

runner.run = function run(opts, cb) {
  Run(opts, function(err, res) {
    if (err) {
      return cb(err);
    }
    setTimeout(function() {
      q.push(res.task);
    }, 1000);
    cb(err, res.data);
  });
};

runner.queued = function queued() {
  var runs = {};
  for (var i in runner.open) {
    if (runner.open[i].queued === true) {
      runs[i] = true;
    }
  }
  return runs;
};

module.exports = function init(opts) {
  q = async.queue(function(task, cb) {
    task(cb);
  }, opts.concurrent || 2);

  io.on('connection', function(socket) {
    // console.log('user join io');
    socket.on('join', function(room) {
      socket.join(room);
    });
    socket.on('kill', function(SLUM) {
      if (runner.open[SLUM]) {
        runner.open[SLUM].kill();
      }
    });
    socket.on('disconnect', function() {
      // console.log('user left io');
    });
  });

  runner.env.cwd = opts.cwd;
  runner.env.dbd = opts.dbd;
  runner.env['parallel-limit'] = opts['parallel-limit'];

  module.exports = runner;

  return runner;
};
