import { sprintf } from 'sprintf-js';
import { UUIDGen, Service, Characteristic } from './platform.js';

export class VantageLoad {
    constructor(log, parent, name, vid, type) {
        this.displayName = name;
        this.UUID = UUIDGen.generate(vid);
        this.name = name.replace(/[^\w ]/g, '');
        this.parent = parent;
        this.address = vid;
        this.log = log;
        this.bri = 100;
        this.power = false;
        this.sat = 0;
        this.hue = 0;
        this.type = type;
    }

    getServices() {
        var service = new Service.AccessoryInformation();
        service.setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'Vantage Controls')
            .setCharacteristic(Characteristic.Model, 'Power Switch')
            .setCharacteristic(Characteristic.SerialNumber, 'VID ' + this.address);

        if (this.name.toLowerCase().indexOf('fan') !== -1) {
            this.lightBulbService = new Service.Fan(this.name);
            this.lightBulbService.getCharacteristic(Characteristic.RotationSpeed)
                .setProps({ minValue: 0, maxValue: 100, minStep: 25 });
            this.type = 'fan';
        } else {
            this.lightBulbService = new Service.Lightbulb(this.name);
            this.lightBulbService.getCharacteristic(Characteristic.Brightness)
                .setProps({ minValue: 0, maxValue: 100, minStep: 5 });
        }

        if (this.type === 'fan') {
            this.lightBulbService.getCharacteristic(Characteristic.RotationSpeed)
                .on('set', (level, callback) => {
                    this.bri = parseInt(level);
                    this.log(sprintf('fan level %s = %d', this.address, this.bri));
                    this.parent.infusion.Load_Dim(this.address, this.bri);
                    callback(null);
                })
                .on('get', (callback) => {
                    //console.log("wtf");
                    this.log.debug(sprintf('get fanlevel %s = %d', this.address, this.bri));
                    callback(null, this.bri);
                });

        }


        //console.log(this.lightBulbService); //here
        this.lightBulbService.getCharacteristic(Characteristic.On)
            .on('set', (level, callback) => {
                this.log.debug(sprintf('setPower %s = %s', this.address, level));
                this.power = (level > 0);
                if (this.power && this.bri === 0) {
                    this.bri = 100;
                }
                this.parent.infusion.Load_Dim(this.address, this.bri);
                callback(null);
            })
            .on('get', (callback) => {
                this.log.debug(sprintf('getPower %s = %s', this.address, this.power));
                callback(null, this.power);
            });

        if (this.type === 'dimmer' || this.type === 'rgb') {
            this.lightBulbService.getCharacteristic(Characteristic.Brightness)
                .on('set', (level, callback) => {
                    this.log(sprintf('setBrightness %s = %d', this.address, level));
                    this.bri = parseInt(level);
                    this.power = (this.bri > 0);
                    this.parent.infusion.Load_Dim(this.address, this.bri);
                    callback(null);
                })
                .on('get', (callback) => {
                    //console.log("wtf");
                    this.log.debug(sprintf('getBrightness %s = %d', this.address, this.bri));
                    callback(null, this.bri);
                });
        }

        if (this.type === 'rgb') {
            this.lightBulbService.getCharacteristic(Characteristic.Saturation)
                .on('set', (level, callback) => {
                    this.power = true;
                    this.sat = level;
                    this.parent.infusion.RGBLoad_DissolveHSL(this.address, this.hue, this.sat, this.bri);
                    callback(null);
                })
                .on('get', (callback) => {
                    callback(null, this.sat);
                });
            this.lightBulbService.getCharacteristic(Characteristic.Hue)
                .on('set', (level, callback) => {
                    this.power = true;
                    this.hue = level;
                    this.parent.infusion.RGBLoad_DissolveHSL(this.address, this.hue, this.sat, this.bri);
                    callback(null);
                })
                .on('get', (callback) => {
                    callback(null, this.hue);
                });
        }


        this.parent.infusion.getLoadStatus(this.address);
        return [service, this.lightBulbService];
    }
}
