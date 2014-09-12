'use strict';

var job = require('../handlers/job');
var run = require('../handlers/run');

module.exports = [{
  method: 'GET',
  path: '/favicon.ico',
  handler: {
    file: './public/img/spook-64.png'
  }
}, {
  method: 'GET',
  path: '/',
  config: {
    handler: job.list
  }
}, {
  method: 'GET',
  path: '/open',
  config: {
    handler: job.open
  }
}, {
  method: 'GET',
  path: '/open/{slug}/{num}',
  config: {
    handler: job.act
  }
}, {
  method: 'GET',
  path: '/job/{slug}/{num}',
  config: {
    handler: run.detail
  }
}, {
  method: 'GET',
  path: '/job/{slug}',
  config: {
    handler: job.runs
  }
}, {
  method: 'GET',
  path: '/job/{slug}/run',
  config: {
    handler: job.run
  }
}];
