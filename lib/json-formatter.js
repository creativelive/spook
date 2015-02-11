'use strict';

var valid = {
  run: 1,
  runs: 1,
  job: 1,
  jobs: 1,
  desc: 1,
  stats: 1
};

// strips an json responses down to desired key sets
module.exports = function formatter(data) {
  var res = {};
  Object.keys(data).forEach(function(key) {
    if (valid[key]) {
      res[key] = data[key];
    }
  });
  return res;
};
