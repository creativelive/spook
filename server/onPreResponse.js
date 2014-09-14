'use strict';

var moment = require('moment');
var runner = require('../lib/runner');

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

    context.moment = moment;
    context.now = moment().unix();
    context.msgs = context.msgs || [];
    context.queued = runner.queued();
    context.openCount = Object.keys(runner.open).length || 0;
    console.log(context);
    if (response.isBoom) {
      context.err = (response.output.statusCode === 404 ? 'Page not found' : 'Something went wrong');
      var templates = {
        404: 'error/404'
      };
      context.msg = response.message;
      context.code = response.output.statusCode;
      return reply.view(templates[response.output.statusCode] || 'error/500', context).code(response.output.statusCode);
    }
  }

  return reply();
};
