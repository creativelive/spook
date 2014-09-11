/*eslint no-process-exit:0 */
'use strict';

var gulp = require('gulp');
var path = require('path');
var parseArgs = require('minimist');

var conf = {
  args: parseArgs(process.argv.slice(2)),
  gwd: __dirname
};

// combine all the gulp tasks
require('fs').readdirSync('./gulp').forEach(function(file) {
  if (path.extname(file) === '.js') {
    require('./gulp/' + file)(gulp, conf);
  }
});

gulp.task('default', function() {
  console.log('gulp!');
});

process.on('exit', function() {
  if (gulp.fail) {
    // return non-zero exit code
    process.exit(1);
  }
});
