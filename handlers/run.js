'use strict';

var Hapi = require('hapi');
var fs = require('fs');
var path = require('path');
var async = require('async');
var pad = require('pad');
var glob = require('glob');
var db = require('../lib/db');
var cache = require('../lib/cache');

exports.detail = function(request, reply) {
  var key = request.params.slug + '-' + request.params.num;
  var data = cache.get(key);

  if(data) {
    console.log('cache hit!');
    return reply.view('run/detail', data);
  }

  var needsCombinedRunLog = true;
  var mask = pad(4, request.params.num, '0');
  mask = path.join(mask.substr(0, 2), mask.substr(2));

  var dir = path.join(request.server.settings.app.runPath, request.params.slug, mask);
  var images = [];
  async.parallel({
    run: function(cb){
      db.run.findOne({NUM: parseInt(request.params.num,10), ACT: { $exists: false }, SLUG: request.params.slug}, function (err, run) {
        cb(null, run);
      });
    },
    log: function(cb){
      var fns = [];
      var raw = '';

      glob(path.join(dir, '*.log'), function(err, files){
        files.forEach(function(file){
          if(path.basename(file) === 'run.log'){
            needsCombinedRunLog = true;
          } else {
            fns.push(function(cb){
              fs.readFile(file, 'utf8', function(err, data){
                raw += data + '\n';
                cb(err);
              });
            });
          }
        });
        async.parallelLimit(fns, 10, function(err, res){

          if(needsCombinedRunLog) {
            fs.writeFile(path.join(dir, 'run.log'), raw, 'utf8', function(err){

            });
          }


          raw = raw.replace(/PASS/g, '<span class="fg-PASS">PASS</span>')
            .replace(/WARN/g, '<span class="fg-WARN">WARN</span>')
            .replace(/FAIL/g, '<span class="fg-FAIL">FAIL</span>')
            .replace(/VOID/g, '<span class="fg-VOID">VOID</span>')
            .replace(/SPOOK/g, '<span class="fg-VOID">SPOOK</span>')
            .replace(/saving screenshot (.*\.jpg)/g, function(match, p1) {
              images.push(p1);
              return '<a href="#' + p1 + '"><div class="screenshot-mini" style="background:url(/file/' + request.params.slug + '/' + mask + '/thumb.' + p1 + ');background-size: cover;"></div>' + p1 + '</a>';
            })
            .replace(/Test file\: (.*)/g, function(match, p1) {
              var split = p1.split('/').slice(-3);
              var name = split.join('/');
              return '<a class="anchor" name="' + split[1] + '">' + name + '</a><b>' + name + '</b>';
            })
            .replace(/\[error\] \[phantom\]/g, '<span class="fg-FAIL">error</span> [phantom]')
            .replace(/ {2}/g, '&nbsp;')
            .replace(/\n{2}/g, '\n')
            .replace(/\n/g, '<br>');
          cb(null, raw);
        });
      });
    },
    job: function(cb) {
      db.job.findOne({SLUG: request.params.slug}, function (err, job) {
        cb(null, job);
      });
    }
  }, function(err, res) {

    // if(err) {
    //   return reply(Hapi.error.internal(err));
    // }
    if(!res.run) {
      return reply(Hapi.error.notFound('run not found'));
    }

    // populate mask for thumbnails path
    res.run.MASK = mask;

    if(res.run.ACT) {
      // run in-progress
    }

    data = {
      job: res.job,
      run: res.run,
      log: res.log,
      images: images
    };
    cache.set(key, data);
    reply.view('run/detail', data);
  });

};
