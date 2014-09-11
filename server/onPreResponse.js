'use strict';

var moment = require('moment');
var io = require('../lib/io');

module.exports = function(request, reply) {
  // pre-populate view context
  // http://blog.cedric-ziel.com/articles/manipulating-hapijs-view-context/
  var response = request.response;

  if (response.variety === 'view' || response.isBoom) {
    var context;
    if (response.isBoom) {
      context = response.context || {};
    } else {
      context = response.source.context || {};
    }

    // make moment available to ejs templates
    context.moment = moment;
    context.now = moment().unix();
    context.openCount = io.namespace.open.fn.count();

    context.queued = {};
    for(var run in io.namespace.run) {
      if(io.namespace.run[run].queued) {
        context.queued[run] = true;
      }
    }

    console.log('OPEN:', context.openCount);
    console.log('QUEUED:', Object.keys(context.queued).length);
    console.log('context.openCount:', context.openCount);


    if (response.isBoom) {
      context.err = (response.output.statusCode === 404 ? 'page not found' : 'something went wrong');
      var templates = {
        404: 'error/404'
      };
      return reply.view(templates[response.output.statusCode] || 'error/500', context).code(response.output.statusCode);
    }
  }

  return reply();
};
