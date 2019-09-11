'use strict';

import { MQTT_Client } from "./mqtt";
import { BridgePoller } from "./poller";
let config:any  = require('./config.json');
let client:MQTT_Client = new MQTT_Client(config);
if (config.bridges === undefined || !config.bridges.length) {
    console.error(
        "No Philips Hue bridges are configured. Please configure a bridge and try again."
    );
    process.exit(1);
} 

let poller:BridgePoller=new BridgePoller(config,client);

poller.startPolling();

function exitHandler() {
  poller.end();
  process.exit();
}

// Disconnect client when script exits
process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);

