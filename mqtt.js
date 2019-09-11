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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var mqtt = __importStar(require("mqtt"));
var events_1 = require("events");
var MQTT_Client = /** @class */ (function (_super) {
    __extends(MQTT_Client, _super);
    function MQTT_Client(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        _this.client = mqtt.connect(_this.config.broker);
        _this.client.on("connect", _this.clientConnect.bind(_this));
        _this.client.on("error", _this.clientError.bind(_this));
        _this.client.on("closed", _this.clientClose.bind(_this));
        return _this;
    }
    MQTT_Client.prototype.clientConnect = function () {
        this.emit("connect");
    };
    MQTT_Client.prototype.clientError = function (err) {
        if (err) {
            this.emit("error");
            return console.error("MQTT Error: %s", err.toString());
        }
    };
    MQTT_Client.prototype.clientClose = function (err) {
        this.emit("closed");
        if (err) {
            return console.error("MQTT Error on close: %s", err.toString());
        }
    };
    MQTT_Client.prototype.publish = function (topic, payload) {
        this.client.publish(topic, payload);
    };
    return MQTT_Client;
}(events_1.EventEmitter));
exports.MQTT_Client = MQTT_Client;
//# sourceMappingURL=mqtt.js.map