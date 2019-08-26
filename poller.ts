'use strict';
import * as request from 'request';
import { EventEmitter } from 'events';
import { MQTT_Client } from './mqtt';

export class BridgePoller extends EventEmitter{
    public config:any;
    public client:MQTT_Client;
    public constructor(config:any, client:MQTT_Client){
        super();
        if (config.bridges === undefined || !config.bridges.length) {
            console.error('No Philips Hue bridges are configured. Please configure a bridge and try again.');
            process.exit(1);
        } else {
            this.config=config;
            this.client=client;
        }
    }

    public startPolling() {
        this.config.bridges.forEach(function(bridge, index) {
          if (!bridge || undefined === bridge.host || !bridge.host) {
            console.error('Cannot poll Hue bridge: missing required argument "host"');
            process.exit(1);
          }
      
          if (undefined === bridge.username || !bridge.username) {
            console.error('Cannot poll Hue bridge %s: missing required argument "username"', bridge.host);
            process.exit(1);
          }
      
          bridge.id       = index;
          bridge.interval = bridge.interval || 1000;
          bridge.polling  = false;
          bridge.prefix   = bridge.prefix || 'hue';
          bridge.sensors  = {};
          bridge.skipped  = false;
      
          console.log('Polling Hue bridge %s every %dms', bridge.host, bridge.interval);
      
          bridge.timer = setInterval(this.pollSensors, bridge.interval, bridge);
          this.pollSensors(bridge);
        });
      }

      public pollSensors(_bridge) {
        var bridge = _bridge;
      
        if (bridge.polling) {
          if (!bridge.skipped) {
            bridge.skipped = true;
            console.log('Polling skipped on Hue bridge %s. Consider raising your polling interval.', bridge.host);
          }
          return false;
        }
      
        bridge.polling = true;
      
        var opts = {
          method: 'GET',
          uri: 'http://' + bridge.host + '/api/' + bridge.username + '/sensors',
          json: true
        };
      
        request(opts, function(err, res, body) {
          if (err) {
            bridge.polling = false;
            return console.error('Error polling sensors on Hue bridge %s: %s', bridge.host, err.toString());
          }
      
          var sensors = body;
      
          Object.keys(sensors).forEach(function(id) {
            var sensorA = sensors[id];
            var sensorB = bridge.sensors[id];
      
            if (undefined !== sensorA.error) {
              bridge.polling = false;
              return console.error('Error polling sensors on Hue bridge %s: %s', bridge.host, sensorA.error.description);
            }
      
            if (undefined === sensorB) {
              bridge.sensors[id] = sensorA;
              return;
            }
      
            if (getTime(sensorA) >= getTime(sensorB) && !equal(sensorA.state, sensorB.state)) {
              var nameSlug = slugify(sensorA.name);
      
              Object.keys(sensorA.state).forEach(function(key) {
                var keySlug = slugify(key);
                var topic = bridge.prefix + '/' + nameSlug + '/' + keySlug;
                var payload = sensorA.state[key];
      
                // console.log('%s %s', topic, payload.toString());
                this.client.publish(topic, payload.toString());
              });
            }
      
            bridge.sensors[id] = sensorA;
          });
      
          bridge.polling = bridge.skipped = false;
        });
      }
}
