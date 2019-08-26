"use strict";

import * as mqtt from "mqtt";

import { EventEmitter } from "events";
import { MqttClient } from "mqtt";

export class MQTT_Client extends EventEmitter {
    public client: MqttClient;
    public config: any;
    constructor(config:any) {
        super();
        this.config = config;
        this.client = mqtt.connect(this.config.broker);
        this.client.on("connect", this.clientConnect.bind(this));
        this.client.on("error",this.clientError.bind(this));
        this.client.on("closed",this.clientClose.bind(this));
    }
    private clientConnect() {
        this.emit("connect");
    }
    private clientError(err: any) {
        if (err) {
            this.emit("error");
            return console.error("MQTT Error: %s", err.toString());
        }
    }
    private clientClose(err: any) {
        this.emit("closed");
        if (err) {
            return console.error("MQTT Error on close: %s", err.toString());
        }
    }
}
