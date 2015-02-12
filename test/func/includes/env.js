'use strict';

casper.__utils = {};

casper.__env = {};

var config = {
  viewport: {
    mobile: {
      width: 320,
      height: 568
    },
    tablet: {
      width: 800,
      height: 1024
    },
    desktop: {
      width: 1200,
      height: 1200
    }
  }
};

// base url
casper.__env.baseUrl = 'http://localhost:3000';

// viewport size
casper.options.viewportSize = config.viewport[casper.cli.options.viewport] || config.viewport.desktop;

// where to log to
casper.__env.output = casper.cli.options.output + '/';

casper.on('remote.message', function logRemoteMessage(message) {
  casper.__utils.dump('client console', message);
});
