'use strict';

var Datastore = require('nedb');
var path = require('path');
var async = require('async');
var db = {};

module.exports = function init(opts, cb) {
  db.run = new Datastore({
    filename: path.join(opts.dbd, '.db', 'run'),
    autoload: false
  });
  db.job = new Datastore({
    filename: path.join(opts.dbd, '.db', 'job'),
    autoload: false
  });

  async.parallel({
    run: function(cb) {
      db.run.loadDatabase(function(err) {
        if (err) {
          console.log(err);
        }
        db.run.ensureIndex({
          fieldName: 'NUM'
        }, function(err) {
          if (err) {
            console.log(err);
          }
        });
        db.run.ensureIndex({
          fieldName: 'SLUM',
          unique: true
        }, function(err) {
          if (err) {
            console.log(err);
          }
        });

        // clear hung runs
        db.run.update({
          ACT: {
            $exists: true
          }
        }, {
          $set: {
            TO: {
              'ST': 'VOID',
              'TO': 0,
              'DU': 0,
              'PA': 0,
              'FA': 0,
              'DB': 0,
              'SK': 0
            },
            DU: 0
          }
        }, {
          multi: true
        }, function(err, numReplaced) {
          if (err) {
            console.log(err);
          }
          db.run.update({
            ACT: {
              $exists: true
            }
          }, {
            $unset: {
              ACT: true,
              ALIAS: true
            }
          }, {
            multi: true
          }, function(err, numReplaced) {
            if (err) {
              console.log(err);
            }
            if (numReplaced) {
              console.log('cleaned OPEN runs:', numReplaced);
            }
            cb();
          });
        });
      });
    },
    job: function(cb) {
      db.job.loadDatabase(function(err) {
        if (err) {
          console.log(err);
        }
        db.job.ensureIndex({
          fieldName: 'SLUG',
          unique: true
        }, function(err) {
          if (err) {
            console.log(err);
          }
        });

        cb();
      });
    }
  }, function(err, res) {
    module.exports = db;
    cb(err, db);
  });

};
