import { sprintf } from 'sprintf-js';
import { UUIDGen, Service, Characteristic } from './platform.js';

export class VantageSwitch {
    constructor(log, parent, name, vid, type) {
        this.displayName = name;
        this.UUID = UUIDGen.generate(vid);
        this.name = name.replace(/[^\w ]/g, '');
        this.parent = parent;
        this.address = vid;
        this.log = log;
        this.type = type;
        this.bri = 100;
        this.power = false;
    }

    getServices() {
        var service = new Service.AccessoryInformation();
        service.setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'Vantage Controls')
            .setCharacteristic(Characteristic.Model, 'Switch')
            .setCharacteristic(Characteristic.SerialNumber, 'VID ' + this.address);

        this.switchService = new Service.Switch(this.name);

        //console.log(this.lightBulbService); //here
        this.switchService.getCharacteristic(Characteristic.On)
            .on('set', (level, callback) => {
                this.log.debug(sprintf('setPower %s = %s', this.address, level));
                this.power = (level > 0);
                if (this.power && this.bri === 0) {
                    this.bri = 100;
                }
                this.parent.infusion.setRelay(this.address, this.power * this.bri);
                callback(null);
            })
            .on('get', (callback) => {
                this.log.debug(sprintf('getPower %s = %s', this.address, this.power));
                callback(null, this.power);
            });

        this.parent.infusion.getLoadStatus(this.address);
        return [service, this.switchService];
    }
}
