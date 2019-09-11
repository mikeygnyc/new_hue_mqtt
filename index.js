'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var mqtt_1 = require("./mqtt");
var poller_1 = require("./poller");
var config = require('./config.json');
var client = new mqtt_1.MQTT_Client(config);
if (config.bridges === undefined || !config.bridges.length) {
    console.error("No Philips Hue bridges are configured. Please configure a bridge and try again.");
    process.exit(1);
}
var poller = new poller_1.BridgePoller(config, client);
poller.startPolling();
function exitHandler() {
    poller.end();
    process.exit();
}
// Disconnect client when script exits
process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);
//# sourceMappingURL=index.js.map