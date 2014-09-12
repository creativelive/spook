'use strict';

var prettify = require('gulp-jsbeautifier');
var diff = require('gulp-diff').diff;
var diffReporter = require('gulp-diff').reporter;

module.exports = function(gulp, conf) {
  gulp.task('beautify', function() {
    var task = gulp.src([
        '!node_modules/**/*.js',
        '!public/**/*.js',
        '**/*.js'
      ], {
        base: './'
      })
      .pipe(prettify({
        config: '.jsbeautifyrc',
        mode: 'VERIFY_AND_WRITE'
      }))
      .pipe(diff())
      .pipe(diffReporter());
    if (conf.args.write) {
      // if task is run with `--write` then overwrite source files
      task.pipe(gulp.dest('./'));
    } else {
      task.on('data', function(data) {
        if (data.diff && Object.keys(data.diff).length) {
          // record that there have been errors
          gulp.fail = true;
        }
      });
    }
    return task;
  });
};
