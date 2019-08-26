'use strict';


var equal   = require('equals');
let config:any  = require('./config.json');




function slugify(value) {
  return value.toString().toLowerCase().replace(/[ \.\-\/\\]/g, '_').replace(/[^a-z0-9_]/g, '');
}





function getTime(sensor) {
  return new Date(sensor.state.lastupdated);
}

// Exit handling to disconnect client
function exitHandler() {
  client.end();
  process.exit();
}

// Disconnect client when script exits
process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);

