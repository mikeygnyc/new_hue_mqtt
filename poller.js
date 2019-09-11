"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var request_1 = __importDefault(require("request"));
var events_1 = require("events");
var crypto = __importStar(require("crypto"));
var http = __importStar(require("http"));
var async = __importStar(require("async"));
var agent = new http.Agent({ maxSockets: 5 });
var BridgePoller = /** @class */ (function (_super) {
    __extends(BridgePoller, _super);
    function BridgePoller(config, client) {
        var _this = _super.call(this) || this;
        _this.config = config;
        _this.client = client;
        return _this;
    }
    BridgePoller.prototype.end = function () {
        this.config.bridges.forEach(function (bridge, index) {
            bridge.running = false;
        });
    };
    BridgePoller.prototype.startPolling = function () {
        var _this = this;
        this.config.bridges.forEach(function (bridge, index) {
            if (!bridge || undefined === bridge.host || !bridge.host) {
                console.error('Cannot poll Hue bridge: missing required argument "host"');
                process.exit(1);
            }
            if (undefined === bridge.username || !bridge.username) {
                console.error('Cannot poll Hue bridge %s: missing required argument "username"', bridge.host);
                process.exit(1);
            }
            bridge.running = true;
            bridge.id = index;
            bridge.interval = bridge.interval || 1000;
            bridge.prefix = bridge.prefix || "hue";
            bridge.sensors = {};
            bridge.lights = {};
            console.log("Polling Hue bridge %s every %dms", bridge.host, bridge.interval);
            _this.runPolls(bridge);
        });
    };
    // private getTime(sensor: any) {
    //     return new Date(sensor.state.lastupdated);
    // }
    BridgePoller.prototype.getHash = function (object) {
        if (!object) {
            object = " ";
        }
        var hash = crypto
            .createHash("md5")
            .update(JSON.stringify(object))
            .digest("hex");
        return hash;
    };
    BridgePoller.prototype.slugify = function (value) {
        var val = value.toString();
        var valLc = val.toLowerCase();
        var valRepOne = valLc.replace(/[ \.\-\/\\]/g, "_");
        var valRepTwo = valRepOne.replace(/[^a-z0-9_]/g, "");
        return valRepTwo;
        // return value
        //     .toString()
        //     .toLowerCase()
        //     .replace(/[ \.\-\/\\]/g, "_")
        //     .replace(/[^a-z0-9_]/g, "");
    };
    BridgePoller.prototype.runPolls = function (_bridge) {
        var bridge = _bridge;
        var thys = this;
        async.series([
            function (callback) {
                if (bridge.enable_sensors_poll) {
                    thys.pollSensors(bridge, callback);
                }
            },
            function (callback) {
                if (bridge.enable_lights_poll) {
                    thys.pollLights(bridge, callback);
                }
            },
            function (callback) {
                thys.setPollTimer(bridge);
            }
        ]);
    };
    BridgePoller.prototype.pollSensors = function (bridge, callback) {
        var thys = this;
        var sensors_opts = {
            method: "GET",
            uri: "http://" +
                bridge.host +
                "/api/" +
                bridge.username +
                "/sensors",
            json: true,
            agent: agent
        };
        request_1.default(sensors_opts, function (err, res, body) {
            try {
                var proceed = true;
                if (err) {
                    console.error("Error polling sensors on Hue bridge %s: %s", bridge.host, err.toString());
                    proceed = false;
                }
                if (res.statusCode !== 200) {
                    console.error("Error polling sensors on Hue bridge %s: %s", bridge.host, body.toString());
                    proceed = false;
                }
                if (proceed) {
                    var sensors_1 = body;
                    if (!bridge.IdMap) {
                        bridge.IdMap = new Map();
                        Object.keys(sensors_1).forEach(function (id) {
                            var sensor = sensors_1[id];
                            if (sensor.uniqueid) {
                                var nameSlug = thys.slugify(sensor.name);
                                var productName = sensor.productname;
                                var uniqueid = sensor.uniqueid; //00:17:88:01:03:29:7e:0e-02-0406
                                var masterId = uniqueid.substr(0, 28);
                                if (productName === "Hue motion sensor") {
                                    bridge.IdMap.set(masterId, nameSlug);
                                }
                            }
                        });
                    }
                    Object.keys(sensors_1).forEach(function (id) {
                        var sensorA = sensors_1[id];
                        var sensorB = bridge.sensors[id];
                        if (sensorA.error) {
                            console.error("Error polling sensors on Hue bridge %s: %s", bridge.host, sensorA.error.description);
                        }
                        else {
                            if (sensorB === undefined) {
                                bridge.sensors[id] = sensorA;
                            }
                            if (thys.getHash(sensorA) !==
                                thys.getHash(sensorB)) {
                                var nameSlug = thys.slugify(sensorA.name);
                                var sendState = false;
                                if (sensorA.uniqueid) {
                                    var productName = sensorA.productname;
                                    var uniqueid = sensorA.uniqueid; //00:17:88:01:03:29:7e:0e-02-0406
                                    var masterId = uniqueid.substr(0, 28);
                                    if (bridge.IdMap.has(masterId)) {
                                        nameSlug = bridge.IdMap.get(masterId).toString();
                                    }
                                    switch (productName) {
                                        case "Hue motion sensor":
                                            nameSlug = nameSlug + "/motion";
                                            sendState = true;
                                            break;
                                        case "Hue ambient light sensor":
                                            nameSlug =
                                                nameSlug + "/ambientlight";
                                            sendState = true;
                                            break;
                                        case "Hue temperature sensor":
                                            nameSlug =
                                                nameSlug + "/temperature";
                                            sendState = true;
                                            break;
                                    }
                                }
                                if (sendState) {
                                    var topic;
                                    var payload;
                                    if (bridge.subtopics) {
                                        Object.keys(sensorA.state).forEach(function (key) {
                                            var keySlug = thys.slugify(key);
                                            topic =
                                                bridge.prefix +
                                                    "/" +
                                                    nameSlug +
                                                    "/" +
                                                    keySlug;
                                            payload =
                                                sensorA.state[key];
                                        });
                                    }
                                    else {
                                        topic =
                                            bridge.prefix + "/" + nameSlug;
                                        payload = JSON.stringify(sensorA.state);
                                    }
                                    if (bridge.logchanges) {
                                        console.log("%s, %s %s", new Date(Date.now()), topic, payload.toString());
                                    }
                                    thys.client.publish(topic, payload.toString());
                                }
                            }
                            bridge.sensors[id] = sensorA;
                        }
                    });
                }
            }
            catch (err) {
                console.error("Error polling lights on Hue bridge %s: %s", bridge.host, err.toString());
            }
            finally {
                callback();
            }
        });
    };
    BridgePoller.prototype.pollLights = function (bridge, callback) {
        var thys = this;
        var lights_opts = {
            method: "GET",
            uri: "http://" + bridge.host + "/api/" + bridge.username + "/lights",
            json: true,
            agent: agent
        };
        request_1.default(lights_opts, function (err, res, body) {
            try {
                var proceed = true;
                if (err) {
                    console.error("Error polling lights on Hue bridge %s: %s", bridge.host, err.toString());
                    proceed = false;
                }
                if (res.statusCode !== 200) {
                    console.error("Error polling lights on Hue bridge %s: %s", bridge.host, body.toString());
                    proceed = false;
                }
                if (proceed) {
                    var lights_1 = body;
                    Object.keys(lights_1).forEach(function (id) {
                        var lightA = lights_1[id];
                        var lightB = bridge.lights[id];
                        if (lightA.error) {
                            console.error("Error polling lights on Hue bridge %s: %s", bridge.host, lightA.error.description);
                        }
                        else {
                            if (lightB === undefined) {
                                bridge.lights[id] = lightA;
                                lightB = {};
                            }
                            if (thys.getHash(lightA.state) !==
                                thys.getHash(lightB.state)) {
                                var nameSlug = thys.slugify(lightA.name.toString());
                                var topic;
                                var payload;
                                if (bridge.subtopics) {
                                    Object.keys(lightA.state).forEach(function (key) {
                                        var keySlug = thys.slugify(key);
                                        topic =
                                            bridge.prefix +
                                                "/" +
                                                nameSlug +
                                                "/" +
                                                keySlug;
                                        payload = lightA.state[key];
                                    });
                                }
                                else {
                                    topic = bridge.prefix + "/" + nameSlug;
                                    payload = JSON.stringify(lightA.state);
                                }
                                if (bridge.logchanges) {
                                    console.log("%s, %s %s", new Date(Date.now()), topic, payload.toString());
                                }
                                thys.client.publish(topic, payload.toString());
                            }
                            bridge.lights[id] = lightA;
                        }
                    });
                }
            }
            catch (err) {
                console.error("Error polling lights on Hue bridge %s: %s", bridge.host, err.toString());
            }
            finally {
                callback();
            }
        });
    };
    BridgePoller.prototype.setPollTimer = function (bridge) {
        if (bridge.running) {
            bridge.timer = setTimeout(this.runPolls.bind(this), bridge.interval, bridge);
        }
    };
    return BridgePoller;
}(events_1.EventEmitter));
exports.BridgePoller = BridgePoller;
//# sourceMappingURL=poller.js.map