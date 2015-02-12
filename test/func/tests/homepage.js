'use strict';

// basic test

casper.test.begin('open homepage', 1, function(test) {
  var url = casper.__env.baseUrl;
  casper.start(url)
    .then(function() {
      casper.capture('homepage');
    })
    .then(function(){
      test.assert(true);
    })
    .run(function() {
      test.done();
    });

});
