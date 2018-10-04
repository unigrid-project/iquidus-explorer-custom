var mongoose = require('mongoose')
  , lib = require('../lib/explorer')
  , db = require('../lib/database')
  , settings = require('../lib/settings')
  , request = require('request');

var COUNT = 5000; //number of blocks to index

function exit() {
  mongoose.disconnect();
  process.exit(0);
}

var dbString = 'mongodb://' + settings.dbsettings.user;
dbString = dbString + ':' + settings.dbsettings.password;
dbString = dbString + '@' + settings.dbsettings.address;
dbString = dbString + ':' + settings.dbsettings.port;
dbString = dbString + '/' + settings.dbsettings.database;

mongoose.connect(dbString, function(err) {
  if (err) {
    console.log('Unable to connect to database: %s', dbString);
    console.log('Aborting');
    exit();
  } else {
    request({uri: 'http://127.0.0.1:' + settings.port + '/api/getpeerinfo', json: true}, function (error, response, body) {
      lib.syncLoop(body.length, function (loop) {
        var i = loop.iteration();
        var address = body[i].addr.split(':')[0];
        db.find_peer(address, function(peer) {
          if (peer || body[i].version == 0) {
            // peer already exists or is invalid
            loop.next();
          } else {
            request({uri: 'https://ipapi.co/' + address + '/json', json: true}, function (error, response, geo) {
              var geolocation = geo.country_name;
              if (geo.city != null) {
                geolocation = geo.city + ", " + geo.country_name;
              }
              db.create_peer({
                address: address,
                protocol: body[i].version,
                version: body[i].subver.replace('/', '').replace('/', ''),
                geolocation: geolocation
              }, function(){
                loop.next();
              });
            });
          }
        });
      }, function() {
        exit();
      });
    });
  }
});
