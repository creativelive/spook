'use strict';

var path = require('path');
var Hapi = require('hapi');
var async = require('async');
var db = require('../lib/db');
var runner = require('../lib/runner');
var formatter = require('../lib/json-formatter');
var cache = require('../lib/cache');

exports.act = function(request, reply) {
  var SLUM = request.params.slug + '-' + request.params.num;
  if (runner.open[SLUM]) {
    reply.view('job/run', runner.open[SLUM].data);
  } else {
    reply.redirect('/' + path.join('job', request.params.slug, request.params.num));
  }
};

exports.list = function(request, reply) {
  var key = 'job/list';
  var data = cache.get(key);

  if (data && (data.generated > runner.lastrun)) {
    if (request.query.json) {
      return reply(formatter(data));
    } else {
      return reply.view('job/list', data);
    }
  }

  var lengths = {
    short: 5,
    medium: 25,
    long: 125
  };

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
        }).limit(lengths.long).exec(function(err, runs) {
          job.runs = runs;
          cb(err, job);
        });
      });
    });
    async.parallel(fns, function(err, jobs) {
      if (err) {
        return reply(Hapi.error.internal(err));
      }

      jobs.forEach(function(job) {
        var totalRuns = job.runs.length;
        job.stats = {
          history: {}
        };
        Object.keys(lengths).forEach(function(length) {
          job.stats.history[length] = {
            PASS: 0,
            FAIL: 0,
            VOID: 0,
            NONE: totalRuns > lengths[length] ? 0 : (lengths[length] - totalRuns)
          };
        });
        job.runs.forEach(function(run, i) {
          if (i < lengths.short) {
            job.stats.history.short[run.TO.ST]++;
          }
          if (i < lengths.medium) {
            job.stats.history.medium[run.TO.ST]++;
          }
          job.stats.history.long[run.TO.ST]++;
        });
        job.runs = job.runs.slice(0, 5);
      });

      var data = {
        generated: parseInt(+new Date() / 1000, 10),
        jobs: jobs
      };

      cache.set(key, data);

      if (request.query.json) {
        return reply(formatter(data));
      } else {
        reply.view('job/list', data);
      }

    });
  });
};

exports.open = function(request, reply) {
  var runs = [];
  for (var run in runner.open) {
    runs.push(runner.open[run].data.run);
  }

  var data = {
    runs: runs
  };

  if (request.query.json) {
    return reply(data);
  } else {
    reply.view('job/open', data);
  }
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

    var data = {
      job: res.job,
      runs: res.runs
    };

    if (request.query.json) {
      return reply(formatter(data));
    } else {
      reply.view('job/runs', data);
    }

  });
};

exports.run = function(request, reply) {
  runner.run({
    SLUG: request.params.slug,
    webhook: request.query.webhook || request.server.settings.app.webhook
  }, function(err, res) {
    if (err) {
      return reply(Hapi.error.internal(err));
    }
    if (!res) {
      return reply(Hapi.error.notFound('error initiating run'));
    }
    reply.view('job/run', res);
  });
};
