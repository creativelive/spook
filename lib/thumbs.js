'use strict';

var glob = require('glob');
var gm = require('gm');
var fs = require('fs');
var path = require('path');
var async = require('async');

module.exports = function thumbs(opts, cb) {
  cb = cb || function() {};
  // make some thumbnail images (don't wait for callback, just fire and forget)
  glob('*.jpg', {
    cwd: opts.out
  }, function(err, images) {
    if (err) {
      return cb(err);
    }
    var gms = [];
    if (images) {
      images.forEach(function(img) {
        gms.push(function(cb) {
          var rs = fs.createReadStream(path.join(opts.out, img));
          var ws = fs.createWriteStream(path.join(opts.out, 'thumb.' + img));
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
      return cb(err);
    });
  });
};
