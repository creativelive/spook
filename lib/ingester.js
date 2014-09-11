'use strict';

var globule = require('globule');
var async = require('async');
var rimraf = require('rimraf').sync;
var gm = require('gm');
var path = require('path');
var fs = require('fs');
var glob = require('glob');

var db;

function setJob(ingest, cb) {

  var job = {
    ALIAS: ingest.ALIAS,
    SLUG: ingest.SLUG,
    OPTS: ingest.OPTS,
    CWD: ingest.CWD
  };

  db.job.update({SLUG:job.SLUG}, job, { upsert: true }, function(err, numReplaced, job) {
    if(err) {
      console.log(err);
    }
    cb(err, job);
  });
}

module.exports = function ingester(opts, cb) {
  db = opts.db || require('./db')(opts);

  var files = globule.find('*.json', {
    srcBase: opts.ingest,
    prefixBase: opts.ingest
  });


  var ingests = [];
  files.forEach(function(file) {
    ingests.push(require(file));
    fs.renameSync(file, file + '.lock');
  });

  var fns = [];
  ingests.forEach(function(ingest, i){
    fns.push(function (cb) {



      setJob(ingest, function(err, job) {

        db.run.insert({
          NUM: ingest.NUM,
          SLUG: ingest.SLUG,
          SLUM: ingest.SLUM,
          TE: ingest.TE,
          TO: ingest.TO,
          STA: ingest.STA,
          END: ingest.END,
          DU: ingest.DU
        }, function(err, run){
          if(err) {
            console.log(err);
          }
          if(run) {
            console.log('imported run: ', run.SLUM, run._id);

            glob('*.jpg', {
              cwd: ingest.path
            }, function (err, images) {
              var gms = [];
              if(images) {
                images.forEach(function(img){
                  gms.push(function(cb){
                    var rs = fs.createReadStream(path.join(ingest.path, img));
                    var ws = fs.createWriteStream(path.join(ingest.path, 'thumb.' + img));
                    gm(rs)
                      .resize(200)
                      .stream()
                      .pipe(ws);

                    ws.on('close', function() {
                      // console.log('image', img);
                      cb();
                    });

                  });
                });
              }
              async.parallelLimit(gms, 10, function(err) {
                rimraf(files[i]);
                cb(err);

              });

            });



          }


        });
      });
    });
  });
  async.parallelLimit(fns, 10, function(err, res) {
    cb(err);
  });

};
