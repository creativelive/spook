/*eslint no-process-exit:0 */
'use strict';

var pad = require('pad');
var path = require('path');
var async = require('async');
var split = require('split');
var fs = require('fs');
var glob = require('glob');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var slug = require('slug');

function casperCmds(argv, cb) {
  var cmds = {};
  async.parallel({
    includes: function(cb) {
      glob(argv.includes, {
        cwd: argv.cwd
      }, cb);
    },
    tests: function(cb) {
      glob(argv.tests || '*', {
        cwd: path.join(argv.cwd, argv.base || '')
      }, cb);
    }
  }, function(err, res) {
    var args = ['--includes=' + res.includes.join(',')].concat(argv._);

    res.tests.forEach(function(test) {
      cmds[test] = {
        cmd: ['test'].concat(['./' + path.join(argv.base, test)]).concat(args),
        base: argv.base
      };
    });

    if (!res.tests.length) {
      err = 'no test files found';
    }
    cb(err, cmds);
  });
}

// possible test states
var states = {
  NONE: 0,
  PASS: 1,
  WARN: 2,
  VOID: 3,
  FAIL: 4
};

// regexs for casperjs log output
var re = {
  results: /(PASS|FAIL) (\d+) tests* executed in (\d+\.\d+)s, (\d+) passed, (\d+) failed, (\d+) dubious, (\d+) skipped./,
  test: /Test file: (.*)\.js/
};

function Spook(opts, cb) {
  opts = opts || {};
  opts.cwd = opts.cwd || process.cwd();
  opts.listener = opts.listener || function() {};

  var tests;
  var voided;
  var timeout = (opts.timeout || 20) * 1000;
  var cmds;
  var start;
  var run = {
    ACT: 1,
    DU: 0,
    TE: {},
    TO: {
      ST: 'NONE',
      TO: 0,
      DU: 0,
      PA: 0,
      FA: 0,
      DB: 0,
      SK: 0
    }
  };
  var spook = {};
  var casper = {};
  var ws = {};
  var hanged = {};

  var cleanup = function() {
    voided = true;
    console.log('caught SIGINT');
    save();
    process.exit();
  };
  process.on('SIGINT', cleanup);

  function save(cb) {
    process.removeListener('SIGINT', cleanup);
    cb = cb || function() {};

    for (var name in run.TE) {
      // check for tests that didn't return results
      if (run.TE[name].ST === 'NONE') {
        run.TE[name].ST = 'VOID';
      }
      // ensure overall state is correct
      if (states[run.TE[name].ST] > states[run.TO.ST]) {
        run.TO.ST = run.TE[name].ST;
      }
    }
    // if run totally failed
    if (voided || run.TO.ST === 'NONE') {
      run.TO.ST = 'VOID';
    }
    // log duration and end time;
    var end = +new Date();
    run.END = parseFloat((end / 1000).toFixed(0));
    run.DU = (end - start) / 1000;

    // resolve any rounding issues
    run.TO.DU = parseFloat(run.TO.DU.toFixed(3));

    // run is no longer active
    delete run.ACT;

    cb(null, run);

    // TODO: find a way to handle the sigint event - drop run.json somewhere sync'ly? Have server ingest on startup?
  }

  casperCmds(opts, function(err, res) {
    if (err) {
      return cb(err);
    }
    cmds = res;
    tests = Object.keys(cmds);
    cb(err, {
      tests: tests
    });
  });

  spook.run = function runner(cb) {
    start = +new Date();
    run.STA = parseFloat((start / 1000).toFixed(0));
    var fns = [];
    tests.forEach(function(test, index) {
      var testFile;
      fns.push(function(cb) {
        if (voided) {
          clearInterval(hanged[test]);
          return cb();
        }
        // add output to test command
        cmds[test].cmd.push('--output=' + opts.out);

        // no colors if recording
        if (opts.record) {
          cmds[test].cmd.push('--no-colors');
        }

        casper[test] = spawn('casperjs', cmds[test].cmd, {
          cwd: opts.cwd
        });

        // check for hangs
        var hung = false;
        hanged[test] = setInterval(function() {
          if (hung) {
            clearInterval(hanged[test]);
            var warning = 'SPOOK: casperjs process exceeded timeout (' + timeout + 'ms)';
            if (opts.record && ws[test]) {
              ws[test].write(warning + '\n');
            }
            console.log(warning);
            spook.kill(test);
            run.TO.ST = 'VOID';
          }
          hung = true;
        }, timeout);

        if (opts.record) {
          ws[test] = fs.createWriteStream(path.join(opts.out, pad(3, index, '0') + '.' + slug(test) + '.log'), {
            flags: 'a'
          });
          casper[test].stdout.pipe(ws[test]);
        }

        casper[test].stdout.pipe(split())
          .on('data', function(ln) {
            // note that we're still alive
            hung = false;

            // casperjs output to stdout
            if (opts.verbose) {
              console.log(ln);
            }

            opts.listener({
              type: 'ln',
              test: test,
              val: ln
            });

            var match;
            // check to see if the test file has been logged
            match = ln.match(re.test);
            if (match) {
              testFile = path.relative(path.join(opts.cwd, cmds[test].base), path.dirname(match[1]));
              run.TE[testFile] = run.TE[testFile] || {
                ST: 'NONE',
                TO: 0,
                DU: 0,
                PA: 0,
                FA: 0,
                DB: 0,
                SK: 0
              };
              return;
            }

            // check to see if the test results have been logged
            match = ln.match(re.results);
            if (match) {
              var testResults = {
                ST: match[1],
                TO: parseInt(match[2], 10),
                DU: parseFloat(match[3]),
                PA: parseInt(match[4], 10),
                FA: parseInt(match[5], 10),
                DB: parseInt(match[6], 10),
                SK: parseInt(match[7], 10)
              };
              // record test results
              run.TE[testFile] = testResults;
              // update totals
              run.TO.TO += testResults.TO;
              run.TO.DU += testResults.DU;
              run.TO.PA += testResults.PA;
              run.TO.FA += testResults.FA;
              run.TO.DB += testResults.DB;
              run.TO.SK += testResults.SK;
              // set overall state
              if (states[testResults.ST] > states[run.TO.ST]) {
                run.TO.ST = testResults.ST;
              }
              return;
            }

          })
          .on('end', function(err) {
            if (err) {
              console.log(err);
            }
            if (opts.record && ws[test]) {
              ws[test].end();
            }
          })
          .on('error', function(err) {
            console.log(err);
          });

        casper[test].on('close', function() {
          clearInterval(hanged[test]);
          cb();
        });

      });
    });

    if (opts.work === 'series') {
      async.series(fns, function(err, res) {
        if (err) {
          console.log(err);
        }
        save(function(err, res) {
          cb(err, run);
        });
      });
    } else if (opts.work === 'parallel') {
      async.parallelLimit(fns, opts['parallel-limit'] || 3, function(err, res) {
        if (err) {
          console.log(err);
        }
        save(function(err, res) {
          cb(err, run);
        });
      });
    }
  };

  spook.kill = function(test) {
    if (voided) {
      return;
    }
    var killCMD;
    var warning = 'SPOOK: detected KILL request.';
    if (test) {
      // TODO: change mask to look for last 2 dirs of opts.out, then don't need to pass in mask
      // kill one test
      clearInterval(hanged[test]);
      console.log('SPOOK: trying to kill test:', test);
      killCMD = 'ps -ef | grep ' + path.join(cmds[test].base, test) + ' | grep ' + opts.out.substr(-5) + ' | awk \'{print $2}\'';
      if (ws[test] && !ws[test].closed) {
        ws[test].end(warning + '\n');
      }
    } else {
      // kill all tests
      voided = true;
      killCMD = 'ps -ef | grep \'output=' + opts.out + '\' | awk \'{print $2}\'';
      Object.keys(cmds).forEach(function(test, index) {
        clearInterval(hanged[test]);
        if (ws[test] && !ws[test].closed) {
          ws[test].end(warning + '\n');
        }
        console.log(warning);
        run.TO.ST = 'VOID';
      });
    }
    // execute kill commands
    exec(killCMD, function(error, stdout, stderr) {
      if (stderr) {
        console.log('SPOOK: error trying to kill casperjs process');
        console.log('stderr: ' + stderr);
        return;
      }
      var pids = stdout.split('\n');
      for (var pid in pids) {
        pid = pids[pid];
        if (pid) {
          console.log('SPOOK: kill', pid);
          exec('kill ' + pid);
        }
      }
    });
  };

  return spook;
}

module.exports = Spook;
