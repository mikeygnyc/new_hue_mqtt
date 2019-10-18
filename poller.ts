"use strict";
import request from "request";
import { EventEmitter } from "events";
import { MQTT_Client } from "./mqtt";
import * as crypto from "crypto";
import * as http from "http";
import * as async from "async";
import express from "express";

const agent = new http.Agent({ maxSockets: 5 });
export class BridgePoller extends EventEmitter {
    public config: any;
    public client: MQTT_Client;
    public lastUpdate: number;
    public constructor(config: any, client: MQTT_Client) {
        super();
        this.config = config;
        this.client = client;
        // Set up the express app
        const app = express();
        // get all todos
        app.get("/healthz", this.healthz.bind(this));
        const PORT = 5000;

        app.listen(PORT, () => {
            console.log(`server running on port ${PORT}`);
        });
    }
    public healthz(req, res) {
        let now:Date = new Date(Date.now());
        const threshTime=now.setSeconds(now.getSeconds()-30);
        
        if (threshTime>this.lastUpdate){
            console.error("Last update greater than 30 seconds ago! Sending non-ok response.")
            res.status(417).send({"Health":"FAIL"});
        } else {
            res.status(200).send({"Health":"OK"});
        }
        
    }
    public end() {
        this.config.bridges.forEach((bridge: any, index: any) => {
            bridge.running = false;
        });
    }
    public startPolling() {
        this.config.bridges.forEach((bridge: any, index: any) => {
            if (!bridge || undefined === bridge.host || !bridge.host) {
                console.error(
                    'Cannot poll Hue bridge: missing required argument "host"'
                );
                process.exit(1);
            }

            if (undefined === bridge.username || !bridge.username) {
                console.error(
                    `Cannot poll Hue bridge ${bridge.host}: missing required argument "username"`
                );
                process.exit(1);
            }
            bridge.running = true;
            bridge.id = index;
            bridge.interval = bridge.interval || 1000;
            bridge.prefix = bridge.prefix || "hue";
            bridge.sensors = {};
            bridge.lights = {};
            console.log(
                `Polling Hue bridge ${bridge.host} every ${bridge.interval}ms`
            );
            this.runPolls(bridge);
        });
    }
    // private getTime(sensor: any) {
    //     return new Date(sensor.state.lastupdated);
    // }
    private getHash(object: any): string {
        if (!object) {
            object = " ";
        }
        const hash = crypto
            .createHash("md5")
            .update(JSON.stringify(object))
            .digest("hex");
        return hash;
    }
    private slugify(value: any): string {
        var val: string = value.toString();
        let valLc: string = val.toLowerCase();
        let valRepOne: string = valLc.replace(/[ \.\-\/\\]/g, "_");
        let valRepTwo: string = valRepOne.replace(/[^a-z0-9_]/g, "");
        return valRepTwo;
    }
    private runPolls(_bridge: any) {
        let bridge = _bridge;
        var thys = this;
        try {
            async.series([
                function(callback) {
                    if (bridge.enable_sensors_poll) {
                        thys.pollSensors(bridge, callback);
                    }
                },
                function(callback) {
                    if (bridge.enable_lights_poll) {
                        thys.pollLights(bridge, callback);
                    }
                }
            ]);
        } catch (err) {
            console.error(`caught error polling: ${err}`);
        } finally {
            thys.setPollTimer(bridge);
        }
    }

    private pollSensors(bridge: any, callback: Function) {
        let thys = this;
        let sensors_opts = {
            method: "GET",
            uri:`http://${bridge.host}/api/${bridge.username}/sensors`,
            json: true,
            agent: agent
        };
        try {
            request(sensors_opts, function(err, res, body) {
                if (err) {
                    console.error(
                        `Error polling sensors on Hue bridge ${
                            bridge.host
                        }: ${err.toString()}`
                    );
                    throw err;
                }
                if (res.statusCode !== 200) {
                    console.error(
                        `Error polling sensors on Hue bridge status: ${res.statusCode.toString()} ${
                            bridge.host
                        }: ${body.toString()}`
                    );
                    throw `error code:  ${res.statusCode.toString()}`;
                }

                let sensors: any = body;
                if (!bridge.IdMap) {
                    bridge.IdMap = new Map<string, string>();
                    Object.keys(sensors).forEach((id: any) => {
                        var sensor = sensors[id];
                        if (sensor.uniqueid) {
                            var nameSlug: string = thys.slugify(sensor.name);
                            var productName: string = sensor.productname;
                            var uniqueid: string = sensor.uniqueid; //00:17:88:01:03:29:7e:0e-02-0406
                            var masterId: string = uniqueid.substr(0, 28);
                            if (productName === "Hue motion sensor") {
                                bridge.IdMap.set(masterId, nameSlug);
                            }
                        }
                    });
                }
                Object.keys(sensors).forEach((id: any) => {
                    let sensorA = sensors[id];
                    let sensorB = bridge.sensors[id];
                    if (sensorA.error) {
                        console.error(
                            `Error polling sensors on Hue bridge (sensor A) ${bridge.host}: ${sensorA.error.description}`
                        );
                        throw sensorA.error;
                    } else {
                        if (sensorB === undefined) {
                            bridge.sensors[id] = sensorA;
                        }
                        if (thys.getHash(sensorA) !== thys.getHash(sensorB)) {
                            var nameSlug: string = thys.slugify(sensorA.name);
                            var sendState: boolean = false;
                            if (sensorA.uniqueid) {
                                var productName: string = sensorA.productname;
                                var uniqueid: string = sensorA.uniqueid; //00:17:88:01:03:29:7e:0e-02-0406
                                var masterId: string = uniqueid.substr(0, 28);
                                if (bridge.IdMap.has(masterId)) {
                                    nameSlug = bridge.IdMap.get(
                                        masterId
                                    ).toString();
                                }
                                switch (productName) {
                                    case "Hue motion sensor":
                                        nameSlug = `${nameSlug}/motion`;
                                        sendState = true;
                                        break;
                                    case "Hue ambient light sensor":
                                        nameSlug = `${nameSlug}/ambientlight`;
                                        sendState = true;
                                        break;
                                    case "Hue temperature sensor":
                                        nameSlug = `${nameSlug}/temperature`;
                                        sendState = true;
                                        break;
                                }
                            }
                            if (sendState) {
                                var topic: string;
                                var payload: string;
                                if (bridge.subtopics) {
                                    Object.keys(sensorA.state).forEach(
                                        (key: any) => {
                                            var keySlug = thys.slugify(key);
                                            topic = `${bridge.prefix}/${nameSlug}/${keySlug}`
                                            payload = sensorA.state[key];
                                        }
                                    );
                                } else {
                                    topic = `${bridge.prefix}/${nameSlug}`;
                                    payload = JSON.stringify(sensorA.state);
                                }
                                if (bridge.logchanges) {
                                    console.log(
                                        `${new Date(
                                            Date.now()
                                        )}. ${topic} ${payload.toString()}`
                                    );
                                }
                                thys.client.publish(topic, payload.toString());
                            }
                        }
                        bridge.sensors[id] = sensorA;
                    }
                });
            });
        } catch (err) {
            console.error(
                `Error polling sensors on Hue bridge ${
                    bridge.host
                }: ${err.toString()}`
            );
        } finally {
            thys.lastUpdate = Date.now();
            callback();
        }
    }
    private pollLights(bridge: any, callback: Function) {
        let thys = this;
        let lights_opts = {
            method: "GET",
            uri:
                `http://${bridge.host}/api/${bridge.username}/lights`,
            json: true,
            agent: agent
        };
        try {
            request(lights_opts, function(err, res, body) {
                if (err) {
                    console.error(
                        `Error polling lights on Hue bridge ${
                            bridge.host
                        }: ${err.toString()}`
                    );
                    throw err;
                }
                if (res.statusCode !== 200) {
                    console.error(
                        `Error polling lights on Hue bridge ${
                            bridge.host
                        }: ${body.toString()}`
                    );
                    throw `error code: ${res.statusCode.toString()}`;
                }
                let lights: any = body;

                Object.keys(lights).forEach((id: any) => {
                    let lightA = lights[id];
                    let lightB = bridge.lights[id];
                    if (lightA.error) {
                        console.error(
                            `Error polling lights on Hue bridge ${bridge.host}: ${lightA.error.description}`
                        );
                        throw lightA.error;
                    } else {
                        if (lightB === undefined) {
                            bridge.lights[id] = lightA;
                            lightB = {};
                        }
                        if (
                            thys.getHash(lightA.state) !==
                            thys.getHash(lightB.state)
                        ) {
                            var nameSlug: string = thys.slugify(
                                lightA.name.toString()
                            );
                            var topic: string;
                            var payload: string;
                            if (bridge.subtopics) {
                                Object.keys(lightA.state).forEach(
                                    (key: any) => {
                                        var keySlug = thys.slugify(key);
                                        topic =`${bridge.prefix}/${nameSlug}/${keySlug}`;
                                        payload = lightA.state[key];
                                    }
                                );
                            } else {
                                topic = `${bridge.prefix}/${nameSlug}`;
                                payload = JSON.stringify(lightA.state);
                            }
                            if (bridge.logchanges) {
                                console.log(`${new Date(Date.now())}, ${topic} ${ payload.toString()}`
                                );
                            }
                            thys.client.publish(topic, payload.toString());
                        }
                        bridge.lights[id] = lightA;
                    }
                });
            });
        } catch (err) {
            console.error(
                `Error polling lights on Hue bridge ${
                    bridge.host
                }: ${err.toString()}`
            );
        } finally {
            thys.lastUpdate = Date.now();
            callback();
        }
    }
    private setPollTimer(bridge: any) {
        if (bridge.running) {
            bridge.timer = setTimeout(
                this.runPolls.bind(this),
                bridge.interval,
                bridge
            );
        }
    }
}
