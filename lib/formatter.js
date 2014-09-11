'use strict';

var chalk = require('chalk');
var util = require('util');
var pad = require('pad');

function formatResults(result) {
  var format = {
    NONE: chalk.white.bgBlack.bold,
    VOID: chalk.white.bgBlack.bold,
    PASS: chalk.white.bgGreen.bold,
    FAIL: chalk.white.bgRed.bold,
    WARN: chalk.white.bgYellow.bold
  };
  var msg = util.format('%s %d tests executed in %ds, %d passed, %d failed, %d dubious, %d skipped.', result.ST, result.TO, result.DU, result.PA, result.FA, result.DB, result.SK);
  return format[result.ST].bold(msg);
}

module.exports = function formatter(run) {
  var len = 22; // state, whitespace and punctuations
  ['tests', 'executed in', 'passed', 'failed', 'dubious', 'skipped'].forEach(function(col){
    len += col.length;
  });
  ['TO', 'PA', 'DU', 'FA', 'DB', 'SK'].forEach(function(col){
    len += String(run.TO[col]).length;
  });

  var summaryPad = pad('', (len / 2) - 12, ' ');
  console.log('');
  console.log(summaryPad + '-----TEST SUMMARY-----' + summaryPad);
  for(var name in run.TE) {
    var TE = run.TE[name];
    console.log('#', name);
    console.log(formatResults(TE));
  }
  console.log('');
  console.log('');
  console.log(pad('', len, '-'));
  console.log(formatResults(run.TO));
  console.log('');
};
