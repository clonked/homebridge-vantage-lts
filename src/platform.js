import { sprintf } from 'sprintf-js';
import { inherits } from 'util';
import Promise from 'promise';
import parser from 'xml2json';

import { VantageInfusion } from './VantageInfusion.js';
import { VantageThermostat } from './VantageThermostat.js';
import { VantageLoad } from './VantageLoad.js';
import { VantageBlind } from './VantageBlind.js';
import { VantageSwitch } from './VantageSwitch.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export var Accessory, Characteristic, Service, UUIDGen;

if (typeof console === 'undefined') {
    var console = {
        log: function() {},
        warn: function() {},
        error: function() {},
    };
}

export default function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.platformAccessory;
    UUIDGen = homebridge.hap.uuid;

    inherits(VantageLoad, Accessory);
    
    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, VantagePlatform);
};

class VantagePlatform {

    constructor(log, config, api) {
        this.log = log;
        this.config = config || {};
        this.api = api;
        this.ipaddress = config.ipaddress;
        this.lastDiscovery = null;
        this.items = [];
        
        if (config.omit === undefined) {
            this.omit = '';
        } else {
            this.omit = config.omit;
        }

        if (config.range === undefined) {
            this.range = '';
        } else {
            this.range = config.range; 
        }
        if (config.username === undefined) {
            this.username = '';
        } else {
            this.username = config.username;
        }
        if (config.password === undefined) {
            this.password = '';
        } else {
            this.password = config.password;
        }

        this.infusion = new VantageInfusion(config.ipaddress, this.items, false, this.omit, this.range, this.username, this.password);
        this.infusion.Discover();
        
        this.pendingrequests = 0;
        this.ready = false;
        this.callbackPromesedAccessories = undefined;
        this.getAccessoryCallback = null;

        this.log.info('VantagePlatform for InFusion Controller at ' + this.ipaddress);

        this.infusion.on('loadStatusChange', (vid, value) => {
            this.items.forEach((accessory) => {
                if (accessory.address === vid) {
                    if (accessory.type === 'relay') {
                        this.log(sprintf('relayStatusChange (VID=%s, Name=%s, Val:%d)', vid, accessory.name, value));
                        accessory.bri = parseInt(value);
                        accessory.power = ((accessory.bri) > 0);
                        //console.log(accessory);
                        if (accessory.switchService !== undefined) {
                            /* Is it ready? */
                            accessory.switchService.getCharacteristic(this.api.hap.Characteristic.On).setValue(accessory.power);
                        }
                    } else {
                        this.log(sprintf('loadStatusChange (VID=%s, Name=%s, Bri:%d)', vid, accessory.name, value));
                        accessory.bri = parseInt(value);
                        accessory.power = ((accessory.bri) > 0);
                        //console.log(accessory);

                        if (accessory.lightBulbService !== undefined) {
                            /* Is it ready? */
                            //console.log(accessory.lightBulbService.getCharacteristic(Characteristic.On));
                            accessory.lightBulbService.getCharacteristic(this.api.hap.Characteristic.On).setValue(accessory.power);
                            if (accessory.type === 'rgb' || accessory.type === 'dimmer') {
                                accessory.lightBulbService.getCharacteristic(this.api.hap.Characteristic.Brightness).setValue(accessory.bri);
                            }
                        }
                    }
                }
            });
        });

        this.infusion.on('blindStatusChange', (vid, value) => {
            this.items.forEach((accessory) => {
                if (accessory.address === vid) {
                    this.log(sprintf('blindStatusChange (VID=%s, Name=%s, Pos:%d)', vid, accessory.name, value));
                    accessory.pos = parseInt(value);
                    if (accessory.blindService !== undefined) {
                        /* Is it ready? */
                        accessory.blindService.getCharacteristic(Characteristic.CurrentPosition).setValue(accessory.pos);
                    }
                }
            });
        });

        this.infusion.on('thermostatOutdoorTemperatureChange', (vid, value) => {
            this.items.forEach((accessory) => {
                if (accessory.address === vid) {
                    accessory.temperature = parseFloat(value);
                    if (accessory.thermostatService !== undefined) {
                        /* Is it ready? */
                        accessory.thermostatService.getCharacteristic(Characteristic.CurrentTemperature).setValue(accessory.temperature);
                    }
                }
            });
        });

        this.infusion.on('thermostatIndoorModeChange', (vid, mode, targetTemp) => {
            this.items.forEach((accessory) => {
                //console.log(accessory)
                if (accessory.address === vid) {
                    //console.log(accessory)
                    if (accessory.thermostatService !== undefined) {
                        /* Is it ready? */
                        //console.log(accessory.thermostatService);
                        if (targetTemp === -1) {
                            accessory.mode = mode;
                            accessory.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).setValue(accessory.mode);
                        } else {
                            if (mode === 1) {
                                accessory.heating = targetTemp;
                                accessory.thermostatService.getCharacteristic(Characteristic.HeatingThresholdTemperature).setValue(accessory.heating);
                            } else if (mode === 2) {
                                accessory.cooling = targetTemp;
                                accessory.thermostatService.getCharacteristic(Characteristic.CoolingThresholdTemperature).setValue(accessory.cooling);
                            }
                            if ((accessory.mode === 1 && mode === 1) || (accessory.mode === 2 && mode === 2)) {
                                accessory.targetTemp = targetTemp;
                                accessory.thermostatService.getCharacteristic(Characteristic.TargetTemperature).setValue(accessory.targetTemp);
                            }
                        }
                    }
                }
            });
        });

        this.infusion.on('thermostatDidChange', () => {
            this.items.forEach((accessory) => {
                //console.log(accessory)
                if (accessory.type === 'thermostat') {
                    //console.log(accessory)
                    if (accessory.thermostatService !== undefined) {
                        /* Is it ready? */
                        //console.log(accessory.thermostatService);
                        this.infusion.Thermostat_GetIndoorTemperature(accessory.address);
                        this.infusion.Thermostat_GetState(accessory.address);
                        this.infusion.Thermostat_GetHeating(accessory.address);
                        this.infusion.Thermostat_GetCooling(accessory.address);
                    }
                }
            });
        });

        this.infusion.on('thermostatIndoorTemperatureChange', (vid, value) => {
            this.items.forEach((accessory) => {
                //console.log(accessory)
                if (accessory.address === vid) {
                    accessory.temperature = parseFloat(value);
                    //console.log(accessory)
                    if (accessory.thermostatService !== undefined) {
                        /* Is it ready? */
                        //console.log(accessory.thermostatService);
                        accessory.thermostatService.getCharacteristic(Characteristic.CurrentTemperature).setValue(accessory.temperature);
                    }
                }
            });
        });

        this.infusion.on('endDownloadConfiguration', (configuration) => {
            this.log.debug('VantagePlatform for InFusion Controller (end configuration download)');
            var parsed = JSON.parse(parser.toJson(configuration));
            //this.log("input=    %s",configuration);
            var dict = {};
            var Areas = parsed.Project.Objects.Object.filter((el) => {
                var key = Object.keys(el)[0];
                return key === 'Area';
            });
            var Area = {};
            for (var i = 0; i < Areas.length; i++) {
                var item = Areas[i].Area;
                Area[item.VID] = item;
            }
            var blindItems = {};
            var range = this.range;
            var omit = this.omit;
            if (range !== '') {
                range = range.replace(' ', '');
                range = range.split(',');
                if (range.length !== 2) { 
                    range = ['0', '999999999'];
                }
            } else {
                range = ['0', '999999999'];
            }
            if (omit !== '') {
                omit = omit.replace(' ', '');
                omit = omit.split(',');
            }

            var supportedObjects = [
                'Thermostat',
                'Load',
                'Blind',
                'RelayBlind',
                'QubeBlind',
                'Lutron.Shade_x2F_Blind_Child_CHILD',
            ];

            for (var x = 0; x < parsed.Project.Objects.Object.length; x++) {
                var thisItemKey = Object.keys(parsed.Project.Objects.Object[x])[0];
                var thisItem = parsed.Project.Objects.Object[x][thisItemKey];
                if (!omit.includes(thisItem.VID) && (parseInt(thisItem.VID) >= parseInt(range[0])) && (parseInt(thisItem.VID) <= parseInt(range[1])) &&
                    supportedObjects.includes(thisItem.ObjectType)) {
                    this.pendingrequests = this.pendingrequests + 1;
                        
                    this.log(sprintf('New HVAC added (VID=%s, Name=%s, Thermostat)', thisItem.VID, thisItem.Name));
                        
                    var name = thisItem.Name.replace(/[^\w ]/g, '');
                    thisItem.Name = name;

                    if (thisItem.Area !== undefined && thisItem.Area !== '') {
                        var areaVID = thisItem.Area;
                        if (Area[areaVID] !== undefined && Area[areaVID].Name !== undefined && Area[areaVID].Name !== '') {
                            name = Area[areaVID].Name + ' ' + name;
                        }
                    }

                    name = name.replace('-', '');
                    if (dict[name.toLowerCase()] === undefined && name !== '') {
                        dict[name.toLowerCase()] = name;
                    } else {
                        name = name + ' VID' + thisItem.VID;
                        dict[name.toLowerCase()] = name;
                    }
                    this.items.push(new VantageThermostat(this.log, this, name, thisItem.VID, 'thermostat'));
                    this.pendingrequests = this.pendingrequests - 1;
                    this.callbackPromesedAccessoriesDo();
                }
                if (
                    thisItem.ObjectType === 'Load' && (
                        thisItem.LoadType === 'Incandescent' ||
                        thisItem.LoadType === 'Fluor. Mag non-Dim' ||
                        thisItem.LoadType === 'Fluor. Magnetic Dim' ||
                        thisItem.LoadType === 'Fluor. Electronic non-Dim' ||
                        thisItem.LoadType === 'Fluor. Electronic Dim' ||
                        thisItem.LoadType === 'Magnetic Low Voltage' ||
                        thisItem.LoadType === 'Electronic Low Voltage' ||
                        thisItem.LoadType === 'Motor' ||
                        thisItem.LoadType === 'Halogen' ||
                        thisItem.LoadType === 'LED Dim' ||
                        thisItem.LoadType === 'LED non-Dim' ||
                        thisItem.LoadType === 'LED' ||
                        thisItem.LoadType === 'Low Voltage Relay' ||
                        thisItem.LoadType === 'High Voltage Relay' ||
                        thisItem.DeviceCategory === 'Lighting'
                    )
                ) {

                    //this.log.warn(sprintf("New light asked (VID=%s, Name=%s, ---)", thisItem.VID, thisItem.Name));
                    if (thisItem.DName !== undefined && thisItem.DName !== '' && (typeof thisItem.DName === 'string')) {
                        thisItem.Name = thisItem.DName;
                    }
                    this.pendingrequests = this.pendingrequests + 1;
                    //this.log(sprintf("New load asked (VID=%s, Name=%s, ---)", thisItem.VID, thisItem.Name));
                    //added below
                    //var name = thisItem.Name
                    name = thisItem.Name.toString();
                    if (thisItem.Area !== undefined && thisItem.Area !== '') {
                        areaVID = thisItem.Area;
                        if (Area[areaVID] !== undefined && Area[areaVID].Name !== undefined && Area[areaVID].Name !== '') {
                            name = Area[areaVID].Name + ' ' + name;
                        }
                    }
                    // if (thisItem.LoadType === "Low Voltage Relay" || thisItem.LoadType === "High Voltage Relay")
                    // 	name = name + " RELAY"
                    name = name.replace('-', '');
                    if (dict[name.toLowerCase()] === undefined && name !== '') {
                        dict[name.toLowerCase()] = name;
                    } else {
                        name = name + ' VID' + thisItem.VID;
                        dict[name.toLowerCase()] = name;
                    }
                    if (
                        thisItem.LoadType === 'Fluor. Mag non-Dim' ||
                        thisItem.LoadType === 'LED non-Dim' ||
                        thisItem.LoadType === 'Fluor. Electronic non-Dim' ||
                        thisItem.LoadType === 'Low Voltage Relay' ||
                        thisItem.LoadType === 'Motor' ||
                        thisItem.DeviceCategory === 'Lighting' ||
                        thisItem.LoadType === 'High Voltage Relay'
                    ) {
                        if (thisItem.LoadType === 'Low Voltage Relay' || thisItem.LoadType === 'High Voltage Relay') {
                            this.log(sprintf('New relay added (VID=%s, Name=%s, RELAY)', thisItem.VID, thisItem.Name));
                            this.items.push(new VantageSwitch(this.log, this, name, thisItem.VID, 'relay'));
                        } else {
                            this.log(sprintf('New load added (VID=%s, Name=%s, NON-DIMMER)', thisItem.VID, thisItem.Name));
                            this.items.push(new VantageLoad(this.log, this, name, thisItem.VID, 'non-dimmer'));
                        }
                    } else {
                        this.log(sprintf('New load added (VID=%s, Name=%s, DIMMER)', thisItem.VID, thisItem.Name));
                        this.items.push(new VantageLoad(this.log, this, name, thisItem.VID, 'dimmer'));
                    }
                    this.pendingrequests = this.pendingrequests - 1;
                    this.callbackPromesedAccessoriesDo();
                }
                if (
                    thisItem.ObjectType === 'Blind' ||
                    thisItem.ObjectType === 'RelayBlind' ||
                    thisItem.ObjectType === 'Lutron.Shade_x2F_Blind_Child_CHILD' ||
                    thisItem.ObjectType === 'QubeBlind'
                ) {
                    //this.log.warn(sprintf("New light asked (VID=%s, Name=%s, ---)", thisItem.VID, thisItem.Name));
                    if (thisItem.DName !== undefined && thisItem.DName !== '' && (typeof thisItem.DName === 'string')) {
                        thisItem.Name = thisItem.DName;
                    }
                    this.pendingrequests = this.pendingrequests + 1;
                    //added below
                    name = thisItem.Name.toString();
                    if (thisItem.Area !== undefined && thisItem.Area !== '') {
                        areaVID = thisItem.Area;
                        if (Area[areaVID] !== undefined && Area[areaVID].Name !== undefined && Area[areaVID].Name !== '') {
                            name = Area[areaVID].Name + ' ' + name;
                        }
                    }
                    name = name.replace('-', '');
                    if (dict[name.toLowerCase()] === undefined && name !== '') {
                        dict[name.toLowerCase()] = name;
                    } else {
                        name = name + ' VID' + thisItem.VID;
                        dict[name.toLowerCase()] = name;
                    }
                    if (thisItem.ObjectType === 'RelayBlind') {
                        blindItems[thisItem.OpenLoad] = thisItem.OpenLoad;
                        blindItems[thisItem.CloseLoad] = thisItem.CloseLoad;
                        if (thisItem.PowerLoad !== '0') {
                            blindItems[thisItem.PowerLoad] = thisItem.PowerLoad;
                        }
                    }
                    // var name = "VID" + thisItem.VID + " " + thisItem.Name
                    this.log(sprintf('New Blind added (VID=%s, Name=%s, BLIND)', thisItem.VID, thisItem.Name));
                    this.items.push(new VantageBlind(this.log, this, name, thisItem.VID, 'blind'));
                    this.pendingrequests = this.pendingrequests - 1;
                    this.callbackPromesedAccessoriesDo();
                }
            }
            
            for (var y = 0; y < this.items.length; y++) {
                if (blindItems[this.items[y].address]) {
                    this.items.splice(y, 1);
                    y--;
                }
            }
            this.log.warn('VantagePlatform for InFusion Controller (end configuration store)');
            this.ready = true;
            this.callbackPromesedAccessoriesDo();
            //console.log("done??");
        });
    }

    /**
	 * Called once, returns the list of accessories only
	 * when the list is complete
	 */
    callbackPromesedAccessoriesDo() {
        if (this.callbackPromesedAccessories !== undefined && this.ready && this.pendingrequests === 0) {
            this.log.warn('VantagePlatform for InFusion Controller (is open for business)');
            //console.log(this.items)
            this.callbackPromesedAccessories(this.items);
        } else {
            this.log.debug(sprintf('VantagePlatform for InFusion Controller (%s,%s)', this.ready, this.pendingrequests));
        }
    }

    getDevices() {
        return new Promise((resolve) => {
            if (!this.ready) {
                this.log.debug('VantagePlatform for InFusion Controller (wait for getDevices promise)');
                this.callbackPromesedAccessories = resolve;
            } else {
                this.log.debug('In resolve else');
                this.log.debug(this.items);
                resolve(this.items);
            }
        });
    }

    /* Get accessory list */
    accessories(callback) {      
        this.getDevices().then((devices) => {
            this.log.debug('VantagePlatform for InFusion Controller (accessories readed)');
            callback(devices);
        });
    }
}


