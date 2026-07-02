import { sprintf } from 'sprintf-js';
import { UUIDGen, Service, Characteristic } from './platform.js';

export class VantageBlind {
    constructor(log, parent, name, vid, type) {
        this.displayName = name;
        this.UUID = UUIDGen.generate(vid);
        this.name = name.replace(/[^\w ]/g, '');
        this.parent = parent;
        this.address = vid;
        this.log = log;
        this.pos = 100;
        this.type = type;
        this.posState = 2; //decreasing=0, increasing=1, stopped=2
    }

    getServices() {
        var service = new Service.AccessoryInformation();
        service.setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'Vantage Controls')
            .setCharacteristic(Characteristic.Model, 'Blind')
            .setCharacteristic(Characteristic.SerialNumber, 'VID ' + this.address);

        this.blindService = new Service.WindowCovering(this.name);

        //console.log(this.lightBulbService); //here
        this.blindService.getCharacteristic(Characteristic.CurrentPosition)
            .on('get', (callback) => {
                this.log.debug(sprintf('getPos %s = %s', this.address, this.pos));
                callback(null, this.pos);
            });

        this.blindService.getCharacteristic(Characteristic.TargetPosition)
            .on('set', (pos, callback) => {
                this.log.debug(sprintf('setPos %s = %s', this.address, pos));
                this.pos = pos;
                this.parent.infusion.setBlindPos(this.address, this.pos);
                callback(null);
            })
            .on('get', (callback) => {
                this.log.debug(sprintf('geTargetPos %s = %s', this.address, this.pos));
                callback(null, this.pos);
            });

        this.blindService.getCharacteristic(Characteristic.PositionState)
            .on('get', (callback) => {
                this.log.debug(sprintf('getBlindState %s = %s', this.address, this.posState));
                callback(null, this.posState);
            });


        this.parent.infusion.getBlindPos(this.address);
        return [service, this.blindService];
    }
}
