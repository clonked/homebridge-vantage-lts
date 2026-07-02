import { sprintf } from 'sprintf-js';
import { UUIDGen, Service, Characteristic } from './platform.js';

export class VantageThermostat {
    constructor(log, parent, name, vid, type) {
        this.DisplayName = name;
        this.name = name.replace(/[^\w ]/g, '');
        this.UUID = UUIDGen.generate(vid);
        this.parent = parent;
        this.address = vid;
        this.log = log;
        this.temperature = 0;
        this.targetTemp = 0;
        this.type = type;
        this.heating = 0;
        this.cooling = 0;
        this.mode = 0; //0=off, 1=heat, 2=cool, 3=auto
        this.units = 1; //0=celcius, 1=f
    }


    getServices() {
        var service = new Service.AccessoryInformation();
        service.setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'Vantage Controls')
            .setCharacteristic(Characteristic.Model, 'Thermostat')
            .setCharacteristic(Characteristic.SerialNumber, 'VID ' + this.address);

        this.thermostatService = new Service.Thermostat(this.name);
        this.thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', (callback) => {
                //this.log(sprintf("getTemperature %s = %.1f", this.address, this.temperature));
                callback(null, this.temperature);
            });


        this.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', (callback) => {
                this.log.debug(sprintf('getCurrentState %s = %f', this.address, this.mode));
                callback(null, this.mode);
            });

        this.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('set', (mode, callback) => {
                this.mode = mode;
                this.log.debug(sprintf('setTargetHeatingCoolingState %s = %s', this.address, mode));
                this.parent.infusion.Thermostat_SetTargetState(this.address, this.mode);
                callback(null);
            })
            .on('get', (callback) => {
                this.log.debug(sprintf('TargetHeatingCoolingState %s = %f', this.address, this.mode));
                callback(null, this.mode);
            });



        this.thermostatService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .on('get', (callback) => {
                this.log.debug(sprintf('HeatingThresholdTemperature %s = %f', this.address, this.heating));
                callback(null, this.heating);
            });

        this.thermostatService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .on('get', (callback) => {
                this.log.debug(sprintf('CoolingThresholdTemperature %s = %f', this.address, this.cooling));
                callback(null, this.cooling);
            });

        this.thermostatService.getCharacteristic(Characteristic.TargetTemperature)
            .on('set', (level, callback) => {
                this.targetTemp = parseFloat(level);
                if (this.mode === 1) {
                    this.heating = parseFloat(level);
                } else if (this.mode === 2) {
                    this.cooling = parseFloat(level);
                }
                this.log(sprintf('setTemperature %s = %s and current mode = %f', this.address, level, this.mode));
                this.parent.infusion.Thermostat_SetIndoorTemperature(this.address, this.targetTemp, this.mode, this.heating, this.cooling);
                callback(null);
            })

            .on('get', (callback) => {
                this.log(sprintf('getTargetTemperature %s = %.1f', this.address, this.targetTemp));
                callback(null, this.targetTemp);
            });

        this.thermostatService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('set', (units, callback) => {
                this.units = parseInt(units);
                this.log.debug(sprintf('getThermoUnit %s = %s', this.address, units));
                callback(null);
            })

            .on('get', (callback) => {
                this.log.debug(sprintf('getThermoUnits %s = %f', this.address, this.units));
                callback(null, this.units);
            });



        this.parent.infusion.Thermostat_GetIndoorTemperature(this.address);
        this.parent.infusion.Thermostat_GetState(this.address);
        this.parent.infusion.Thermostat_GetHeating(this.address);
        this.parent.infusion.Thermostat_GetCooling(this.address);
        //console.log(service);console.log(this.thermostatService);
        return [service, this.thermostatService];
    }
}
