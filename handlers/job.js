'use strict';

var Hapi = require('hapi');
var async = require('async');
var Spook = require('../lib/spook');
var db = require('../lib/db');
var io = require('../lib/io');
var pad = require('pad');
var path = require('path');
var mkdirp = require('mkdirp');
var minimist = require('minimist');
var glob = require('glob');
var fs = require('fs');
var gm = require('gm');
var concurrent = 2;
var q = async.queue(function(task, cb) {
  task(cb);
}, concurrent);

exports.act = function(request, reply) {
  db.run.findOne({
    SLUG: request.params.slug,
    NUM: parseInt(request.params.num, 10),
    ACT: {
      $exists: true
    }
  }, function(err, run) {
    if (err) {
      return reply(Hapi.error.internal(err));
    }
    if (!run || !io.room[run.SLUM]) {
      return reply.redirect('/' + path.join('job', request.params.slug, request.params.num));
    }
    var data = io.room[run.SLUM].data;

    reply.view('job/run', {
      tests: data.tests,
      run: data.run,
      job: data.job,
      msgs: io.room[run.SLUM].msgs
    });
  });
};

exports.list = function(request, reply) {
  var fns = [];
  db.job.find({}).sort({
    SLUG: 1
  }).exec(function(err, jobs) {
    if (err) {
      return reply(Hapi.error.internal(err));
    }
    jobs.forEach(function(job) {
      fns.push(function(cb) {
        db.run.find({
          SLUG: job.SLUG,
          ACT: {
            $exists: false
          }
        }).sort({
          NUM: -1
        }).limit(5).exec(function(err, runs) {
          job.runs = runs;
          cb(err, job);
        });
      });
    });
    async.parallel(fns, function(err) {
      if (err) {
        return reply(Hapi.error.internal(err));
      }
      reply.view('job/list', {
        jobs: jobs
      });
    });
  });
};

exports.open = function(request, reply) {
  db.run.find({
    ACT: 1
  }).sort({
    SLUG: 1,
    NUM: 1
  }).exec(function(err, runs) {
    if (err) {
      return reply(Hapi.error.internal(err));
    }
    reply.view('job/open', {
      runs: runs
    });
  });
};

exports.runs = function(request, reply) {
  async.parallel({
    job: function(cb) {
      db.job.findOne({
        SLUG: request.params.slug
      }, function(err, job) {
        cb(err, job);
      });
    },
    runs: function(cb) {
      db.run.find({
        SLUG: request.params.slug
      }).sort({
        NUM: -1
      }).exec(function(err, runs) {
        cb(err, runs);
      });
    }
  }, function(err, res) {
    if (err) {
      return reply(Hapi.error.internal(err));
    }
    if (!res.job) {
      return reply(Hapi.error.notFound('job not found'));
    }
    reply.view('job/runs', {
      job: res.job,
      runs: res.runs
    });
  });
};

exports.run = function(request, reply) {
  var run = {
    ACT: 1,
    STA: parseInt(+new Date() / 1000, 10)
  };
  var job;
  var mask;

  async.series({
    job: function(cb) {
      db.job.findOne({
        SLUG: request.params.slug
      }, function(err, doc) {
        job = doc;
        cb(err);
      });
    },
    run: function(cb) {
      // prepare a new run doc in the db
      db.run.count({
        SLUG: request.params.slug
      }, function(err, count) {
        if (err) {
          return cb(err);
        }
        run.NUM = ++count;
        mask = pad(4, run.NUM, '0');
        mask = path.join(mask.substr(0, 2), mask.substr(2));
        run.SLUG = request.params.slug;
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
      return reply(Hapi.error.internal(err));
    }
    var argv = minimist(job.CMD.split(' '));
    argv.cwd = request.server.settings.app.cwd;
    argv.record = true;
    argv.out = path.join(request.server.settings.app.runPath, job.SLUG, mask);
    argv.work = 'parallel';
    mkdirp(argv.out, function(err) {
      if (err) {
        return reply(Hapi.error.internal(err));
      }
      argv.record = true;

      var spook = Spook(argv, function(err, res) {
        if (err) {
          return reply(Hapi.error.internal(err));
        }
        var tests = res.tests;
        io.room[run.SLUM] = {
          data: {
            tests: tests,
            run: run,
            job: job
          },
          queued: true,
          msgs: [],
          kill: spook.kill
        };

        argv.listener = function listener(msg) {
          console.log('emit ln to', run.SLUM);
          io.room[run.SLUM].msgs.push(msg);
          io.server.in(run.SLUM).emit('run', msg);
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
            io.room[run.SLUM].data.run.STA = start;
            io.room[run.SLUM].queued = false;

            console.log('open emit', run.SLUM, 'STA');
            io.server.emit('open', {
              type: 'STA',
              SLUM: run.SLUM,
              open: Object.keys(io.room).length || 0
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
              }, res, function(err, numReplaced, doc) {
                if (err) {
                  console.log(err);
                }
                delete io.room[run.SLUM];

                console.log('open emit', run.SLUM, 'END');
                io.server.emit('open', {
                  type: 'END',
                  SLUM: run.SLUM,
                  open: Object.keys(io.room).length || 0
                });

                // call the concurrent queue callback
                qcb();

                // make some thumbnail images (don't wait for callback, we'll fire and forget)
                glob('*.jpg', {
                  cwd: argv.out
                }, function(err, images) {
                  if (err) {
                    console.log(err);
                  }
                  var gms = [];
                  if (images) {
                    images.forEach(function(img) {
                      gms.push(function(cb) {
                        var rs = fs.createReadStream(path.join(argv.out, img));
                        var ws = fs.createWriteStream(path.join(argv.out, 'thumb.' + img));
                        gm(rs)
                          .resize(200)
                          .stream()
                          .pipe(ws);
                        ws.on('close', function() {
                          cb();
                        });

                      });
                    });
                  }
                  // fire and forget generating thumbnails
                  async.parallelLimit(gms, 10, function(err) {
                    if (err) {
                      console.log(err);
                    }
                  });
                });
              });
            });
          });
        };

        reply.view('job/run', {
          queued: io.room[run.SLUM].queued,
          tests: tests,
          run: run,
          job: job,
          msgs: io.room[run.SLUM].msgs
        });

        setTimeout(function() {
          q.push(task);
        }, 1000);

      });
    });
  });
};
