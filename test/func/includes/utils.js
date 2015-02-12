'use strict';

var dump = require('utils').dump;

if (casper.cli.options.dump) {
  // output horizontal rules around an object
  casper.__utils.dump = function(name, value) {
    var braceFull = '---------------------------------------------------------------------------';
    var lineLen = 76;
    var nameLen = name.length;
    var braceLen = parseInt((lineLen - nameLen) / 2, 10);
    var braceChar = '-';

    function repeatChar(char, times) {
      var repeated = '';
      while (times-- > 0) {
        repeated += char;
      }
      return repeated;
    }

    var bracePart = repeatChar(braceChar, braceLen);
    console.log(bracePart + name + bracePart);
    dump(value);
    console.log(braceFull);
  };
} else {
  casper.__utils.dump = function() {};
}

// save a screenshot in a format spook will pick up
casper._capture = casper.capture;
casper.capture = function capture(targetFilepath, clipRect, opts) {
  opts = opts || {};
  opts.format = opts.format || 'jpg';
  opts.quality = opts.quality || 75;
  console.log('saving screenshot ' + targetFilepath + '.' + opts.format);
  casper._capture(casper.__env.output + targetFilepath + '.' + opts.format, clipRect, opts);
};
