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

// displays usage and exits
function usage() {
  console.log('Usage: node scripts/sync.js [refresh]');
  console.log('');
  console.log('refresh:');
  console.log('Refresh all and re-fetch all external data for all peers such as');
  console.log('geolocation and other data.')
  console.log('');
  console.log('If no arguments are given, the script will just run and add any');
  console.log('discovered peers to the database.');
  console.log('');
  process.exit(0);
}

var mode = 'discover';

// check options
if (process.argv.length > 3) {
  usage();
} else if (process.argv.length == 3) {
  switch(process.argv[2])
  {
  case 'refresh':
    mode = 'refresh';
    break;
  default:
    usage();
  }
}

function create_location(geo) {
  var geolocation = geo.country_name;
  if (geo.city != null) {
    geolocation = geo.city + ", " + geo.country_name;
  }
  return geolocation;
}

mongoose.connect(dbString, function(err) {
  if (err) {
    console.log('Unable to connect to database: %s', dbString);
    console.log('Aborting');
    exit();
  } else if (mode == 'discover') {
    request({uri: 'http://127.0.0.1:' + settings.port + '/api/getpeerinfo', json: true}, function (error, response, body) {
      lib.syncLoop(body.length, function (loop) {
        var i = loop.iteration();
        var address = body[i].addr.split(':')[0];
        db.find_peer(address, function(peer) {
          if (peer || body[i].version == 0) {
            // peer already exists or is invalid
            loop.next();
          } else {
            request({headers: {'User-Agent': 'iquidus/explorer'}, uri: 'https://ipapi.co/' + address + '/json', json: true},
            function (error, response, geo) {
              var geolocation = create_location(geo);
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
  } else if (mode == 'refresh') {
    // clean up any peers missing geolocation
    db.get_peers(function(peers) {
      requests = peers.length;
      peers.forEach(function(peer, index) {
        if (peer.geolocation == '') {
          requests++;
          request({headers: {'User-Agent': 'iquidus/explorer'}, uri: 'https://ipapi.co/' + peer.address + '/json', json: true},
          function (error, response, geo) {
            peer.geolocation = create_location(geo);
            db.update_peer(peer, function() {
              requests--;
            });
          }, false);
        }
        if (index == peers.length - 1)
          exit();
      });
    });
  }
});
