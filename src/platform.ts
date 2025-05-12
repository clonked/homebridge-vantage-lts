/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

import * as net from 'net';
import * as sprintf from 'sprintf-js';
import Promise from 'promise';
import * as parser from 'xml2json';
import * as libxmljs from 'libxmljs';
import * as sleep from 'sleep';
import * as events from 'events';
import * as fs from 'fs';


//import { DynamicPlatformPlugin } from 'homebridge/dist/api';

export class VantageInfusion extends events.EventEmitter { // implements DynamicPlatformPlugin {
	ipaddress: any;
	usecache: any;
	accessories: any;
	omit: any;
	range: any;
	username: any;
	password: any;
	command: net.Socket;
	interfaces: { [key: string]: any };
	constructor(ipaddress: any, accessories: any, usecache: any, omit: any, range: any, username: any, password: any) {
		super();
		this.ipaddress = ipaddress;
		this.usecache = usecache || true;
		this.accessories = accessories || [];
		this.omit = omit;
		this.range = range;
		this.username = username;
		this.password = password;
		this.command = new net.Socket();
		this.interfaces = {};
		this.StartCommand();
	}

	/**
	 * Start the command session. The InFusion controller (starting from the 3.2 version of the
	 * firmware) must be configured without encryption or password protection. Support to SSL
	 * and password protected connection will be introduced in the future, the IoT world is
	 * a bad place! 
	 */
	StartCommand() {
		this.command = net.connect({ host: this.ipaddress, port: 3001 }, () => {
			this.command.on('data', (data: { toString: () => string; }) => {
				/* Data received */
				const lines = data.toString().split('\n');
				let modeVal = 0;
				for (let i = 0; i < lines.length; i++) {
					const dataItem = lines[i].split(' ');
					// console.log(dataItem);
					if (lines[i].startsWith('S:BLIND') || lines[i].startsWith('R:GETBLIND')) 
					{
						/* Live update about load level (even if it's a RGB load') */
						console.log('blindStatusChange', parseInt(dataItem[1]), parseInt(dataItem[2]));
					}
					else if (lines[i].startsWith('S:LOAD ') || lines[i].startsWith('R:GETLOAD ')) {
						/* Live update about load level (even if it's a RGB load') */
						console.log('loadStatusChange', parseInt(dataItem[1]), parseInt(dataItem[2]));
					}
					else if (dataItem[0] === 'S:TEMP') {
						//console.log("now lets set the temp!" + parseInt(dataItem[2]));
						console.log(sprintf.sprintf('thermostatDidChange'), parseInt(dataItem[2]), 0);
						// this.emit(sprintf("thermostatIndoorTemperatureChange"), parseInt(dataItem[2]));
					}
					else if (dataItem[0] === 'R:INVOKE' && dataItem[3].includes('Thermostat.GetIndoorTemperature')) {
						//console.log("lets get the indoor temp!")
						console.log(sprintf.sprintf('thermostatIndoorTemperatureChange'), parseInt(dataItem[1]), parseFloat(dataItem[2]));
					}
					else if (dataItem[0] === 'S:THERMOP' 
						|| dataItem[0] === 'R:GETTHERMOP' 
						|| dataItem[0] === 'R:THERMTEMP') {
						
						if (dataItem[2].includes('OFF')) {
								modeVal = 0;
							}
						else if (dataItem[2].includes('HEAT')) {
							modeVal = 1;
						}
						else if (dataItem[2].includes('COOL')) {
							modeVal = 2;
						}
						else {
							modeVal = 3;
						}
					}
					
						// console.log(parseInt(modeVal));
						if (dataItem[0] === 'S:THERMOP' || dataItem[0] === 'R:GETTHERMOP') {
							console.log(sprintf.sprintf('thermostatIndoorModeChange'), parseInt(dataItem[1]), parseInt(modeVal.toString()), -1);
						}
						else {
							console.log(sprintf.sprintf('thermostatIndoorModeChange'), parseInt(dataItem[1]), parseInt(modeVal.toString())), parseFloat(dataItem[3].toString());
						}
				}

			if (this.username != '' && this.password != '') 
			{
				this.command.write(sprintf.sprintf('Login %s %s\n', this.username, this.password));
			}
			this.command.write(sprintf.sprintf('STATUS ALL\n'));
			this.command.write(sprintf.sprintf('ELENABLE 1 AUTOMATION ON\nELENABLE 1 EVENT ON\nELENABLE 1 STATUS ON\nELENABLE 1 STATUSEX ON\nELENABLE 1 SYSTEM ON\nELLOG AUTOMATION ON\nELLOG EVENT ON\nELLOG STATUS ON\nELLOG STATUSEX ON\nELLOG SYSTEM ON\n'));
		});	
	});
}


	getLoadStatus(vid : any) {
		this.command.write(sprintf.sprintf('GETLOAD %s\n', vid));
	}

	/**
	 * Send the IsInterfaceSupported request to the InFusion controller,
	 * it needs the VID of the object and the IID (InterfaceId) taken 
	 * previously with the configuration session
	 * @return true, false or a promise!
	 */
	isInterfaceSupported(item : any, interfaceName : any): any {
		if (this.interfaces[interfaceName] === undefined) {
			return new Promise((resolve) => {
				resolve({ 'item': item, 'interface': interfaceName, 'support': false });
			});
		} else {
			/**
			 * Sample
			 *   OUT| INVOKE 2774 Object.IsInterfaceSupported 32
			 *    IN| R:INVOKE 2774 0 Object.IsInterfaceSupported 32
			 */
			const interfaceId = this.interfaces[interfaceName];

			return new Promise((resolve) => {
				this.once(sprintf.sprintf('isInterfaceSupportedAnswer-%d-%d', parseInt(item.VID), parseInt(interfaceId)), (_support) => {
					resolve({ 'item': item, 'interface': interfaceName, 'support': _support });
				}
				);
				sleep.usleep(5000);
				this.command.write(sprintf.sprintf('INVOKE %s Object.IsInterfaceSupported %s\n', item.VID, interfaceId));
			});
		}
	}

	/**
	 * Start the discovery procedure that use the local cache or download from the InFusion controller
	 * the last configuration saved on the SD card (usually the developer save a backup copy of the configuration
	 * on this support but in some cases it can be different from the current running configuration, I need to
	 * check how to download it with a single pass procedure)
	 */
	Discover() {
		const configuration = net.connect({ host: this.ipaddress, port: 2001 }, () => {
			/**
			 * List interfaces, list configuration and then check if a specific interface 
			 * is supported by the recognized devices. 
			 */
			console.log('load dc file');

			let buffer = '';
			let xmlResult = '';
			const readObjects: {}[] = [];
			let writeCount = 0;
			const objectDict: { [key: string]: any } = {};

			const types = ['Area', 'Load', 'Thermostat', 'Blind', 'RelayBlind', 'Lutron.Shade_x2F_Blind_Child_CHILD', 'QubeBlind'];
			configuration.on('data', (data) => {
				buffer = buffer + data.toString().replace('\ufeff', '');

				try {
					buffer = buffer.replace('<?File Encode="Base64" /', '<File>');
					buffer = buffer.replace('?>', '</File>');

					if (buffer.includes('</File>')) {
						console.log('end');
						const start = buffer.split('<File>');
						const end = buffer.split('</File>');
						const bufferMatch = buffer.match('<File>' + '(.*?)' + '</File>') ?? '';
						buffer = bufferMatch[1];
						const newtextBuffer = new Buffer(buffer, 'base64');
						let newtext = newtextBuffer.toString();
						newtext = newtext.replace(/[\r\n]/g, '');
						const init = newtext.split('<Objects>')
						const newtextMatch = newtext.match('<Objects>' + '(.*?)' + '</Objects>');
						if (newtextMatch != null) {
							newtext = newtextMatch[1];
							console.log('null');
						}
						xmlResult = Buffer.from(init[0] + '<Objects>' + newtext + '</Objects></Project>').toString();
						xmlResult = xmlResult.toString();
						buffer = '<smarterHome>' + start[0] + '<File>' + xmlResult + '</File>' + end[end.length - 1] + '</smarterHome>';
					}
					libxmljs.parseXml(buffer);
				} catch (e) {
					return false;
				}
				if(writeCount < types.length) {
					console.log('parse Json: ' + types[writeCount]);
				}

				const parsed = JSON.parse(parser.toJson(buffer));
					if (parsed.smarterHome.IIntrospection !== undefined) {
						const interfaces = parsed.smarterHome.IIntrospection.GetInterfaces.return.Interface;
						for (let i = 0; i < interfaces.length; i++) {
							this.interfaces[interfaces[i].Name] = interfaces[i].IID;
						}
					}
					if (parsed.smarterHome.IBackup !== undefined) {
						const xmlconfiguration = Buffer.from(parsed.smarterHome.IBackup.GetFile.return.File, 'base64').toString("ascii"); // Ta-da
						this.emit('endDownloadConfiguration', xmlconfiguration);
						configuration.destroy();
					}
					if (parsed.smarterHome.IConfiguration !== undefined) {
						if (parsed.smarterHome.IConfiguration.GetFilterResults !== undefined) {
							const objectValue = parsed.smarterHome.IConfiguration.GetFilterResults.return.Object;
							buffer = '';
							objectDict[objectValue] = objectValue;
							writeCount++;
							configuration.write('<IConfiguration><GetFilterResults><call><Count>1000</Count><WholeObject>true</WholeObject><hFilter>' + objectValue + '</hFilter></call></GetFilterResults></IConfiguration>\n');
						}
					}
				 if (parsed.IConfiguration !== undefined) {
					if (parsed.IConfiguration.OpenFilter !== undefined) {
						const objectValue = parsed.IConfiguration.OpenFilter.return;
							buffer = '';
							objectDict[objectValue] = objectValue;
							writeCount++;
							configuration.write('<IConfiguration><GetFilterResults><call><Count>1000</Count><WholeObject>true</WholeObject><hFilter>' + objectValue + '</hFilter></call></GetFilterResults></IConfiguration>\n');
						}

					}
					else if (parsed.IConfiguration.GetFilterResults !== undefined) {
						const elements = parsed.IConfiguration.GetFilterResults.return.Object;
						if (elements !== undefined) {
							for (let i = 0; i < elements.length; i++) {
								const element = elements[i][types[writeCount - 1]];
								element['ObjectType'] = types[writeCount - 1];
								const elemDict: { [key: string]: any } = {}; // Explicitly type `elemDict` as an object
      
								elemDict[types[writeCount - 1]] = element;
								readObjects.push(elemDict);
							}
						}

						buffer = '';
						if (writeCount >= types.length) {
							const result: { [key: string]: any } = {}; 
           
							result['Project'] = {};
							result['Project']['Objects'] = {};
							result['Project']['Objects']['Object'] = readObjects;
							const options = { sanitize: true };
							const resultAsXml = parser.toXml(result, options)
							this.emit('endDownloadConfiguration', resultAsXml);
							configuration.destroy();
						} else{
							configuration.write('<IConfiguration><OpenFilter><call><Objects><ObjectType>' + types[writeCount] + '</ObjectType></Objects></call></OpenFilter></IConfiguration>\n');
						}
				}
			
				 if (parsed.ILogin !== undefined) {
					if (parsed.ILogin.Login !== undefined) {
						if (parsed.ILogin.Login.return === "true") {
							console.log("Login successful")
						}
						else {
							console.log("Login failed trying to get data anyways")
						}
						buffer = '';
						configuration.write('<IConfiguration><OpenFilter><call><Objects><ObjectType>' + types[0] + '</ObjectType></Objects></call></OpenFilter></IConfiguration>\n');
					}
				}
				buffer = '';
			});

			/* Aehm, async method becomes sync... */
			//configuration.write("<IIntrospection><GetInterfaces><call></call></GetInterfaces></IIntrospection>\n");

			if (fs.existsSync('/tmp/vantage.dc') && this.usecache) {
				fs.readFile('/tmp/vantage.dc', 'utf8', (err: any, data: any) => {
					if (!err) {
						this.emit('endDownloadConfiguration', data);
					}
				});
			} else if (fs.existsSync('/home/pi/vantage.dc') && this.usecache) {
				fs.readFile('/home/pi/vantage.dc', 'utf8', (err: any, data: any) => {
					if (!err) {
						this.emit('endDownloadConfiguration', data);
					}
				});
			} else {
				if (this.username !== '' && this.password !== '') {
					configuration.write('<ILogin><Login><call><User>' + this.username + '</User><Password>' + this.password + '</Password></call></Login></ILogin>\n');
				} else {
					configuration.write('<IConfiguration><OpenFilter><call><Objects><ObjectType>' + types[0] + '</ObjectType></Objects></call></OpenFilter></IConfiguration>\n');
				}
				//configuration.write("<IBackup><GetFile><call>Backup\\Project.dc</call></GetFile></IBackup>\n");
			}
		});
	}

	/**
	 * Send the set HSL color request to the controller 
	 */
	 RGBLoad_DissolveHSL(vid :any, h :any, s :any, l :any, time :any) {
		const thisTime = time || 500;
		this.command.write(sprintf.sprintf('INVOKE %s RGBLoad.DissolveHSL %s %s %s %s\n', vid, h, s, l * 1000, thisTime));
	}

	Thermostat_GetOutdoorTemperature(vid :any) {
		this.command.write(sprintf.sprintf('INVOKE %s Thermostat.GetOutdoorTemperature\n', vid));
	}

	Thermostat_GetIndoorTemperature(vid : any) {
		this.command.write(sprintf.sprintf('INVOKE %s Thermostat.GetIndoorTemperature\n', vid));
	}

	Thermostat_SetTargetState(vid : any, mode : any) {
		if (mode === 0) {
			this.command.write(sprintf.sprintf('THERMOP %s OFF\n', vid));
		}
		else if (mode === 1) {
			this.command.write(sprintf.sprintf('THERMOP %s HEAT\n', vid));
		}
		else if (mode === 2) {
			this.command.write(sprintf.sprintf('THERMOP %s COOL\n', vid));
		}
		else {
			this.command.write(sprintf.sprintf('THERMOP %s AUTO\n', vid));
		}
	}

	Thermostat_GetState(vid : any) {
		this.command.write(sprintf.sprintf('GETTHERMOP %s\n', vid));
	}

	Thermostat_GetHeating(vid : any) {
		this.command.write(sprintf.sprintf('GETTHERMTEMP %s HEAT\n', vid));
	}

	Thermostat_GetCooling(vid : any) {
		this.command.write(sprintf.sprintf('GETTHERMTEMP %s COOL\n', vid));
	}

	Thermostat_SetIndoorTemperature(vid: any, value: number, mode: number, heating: number, cooling: number) {
		// console.log("lets set this shit!!!");
		// console.log(mode)
		if (mode === 1) {
			this.command.write(sprintf.sprintf('THERMTEMP %s HEAT %s\n', vid, value));
		}
		else if (mode === 2) {
			this.command.write(sprintf.sprintf('THERMTEMP %s COOL %s\n', vid, value));
		}
		else if (mode === 3) {
			if (value > cooling) {
				this.command.write(sprintf.sprintf('THERMTEMP %s COOL %s\n', vid, value));
			}
			else if (value < heating) {
				this.command.write(sprintf.sprintf('THERMTEMP %s HEAT %s\n', vid, value));
			}
		}
	}

	/**
	 * Send the set light level to the controller
	 */
	Load_Dim(vid : any, level : any, time : any) {
		// TODO: reduce feedback (or command) rate
		const thisTime = time || 1;
		this.command.write(sprintf.sprintf('INVOKE %s Load.Ramp 6 %s %s\n', vid, thisTime, level));
	}

	/** blind commands*/
	setBlindPos(vid : any, pos : any) {
		// TODO: reduce feedback (or command) rate
		this.command.write(sprintf.sprintf('BLIND %s POS %s\n', vid, pos));
	}
	getBlindPos(vid : any) {
		// TODO: reduce feedback (or command) rate
		this.command.write(sprintf.sprintf('GETBLIND %s \n', vid));
	}

	/** relay commands*/
	setRelay(vid : any, level : any) {
		// TODO: reduce feedback (or command) rate
		this.command.write(sprintf.sprintf('LOAD %s %s\n', vid, level));
	}

}


export class VantagePlatform implements DynamicPlatformPlugin {
	log: any;
	config: { ipaddress?: any; omit?: any; range?: any; username?: any; password?: any; };
	api: any;
	ipaddress: any;
	lastDiscovery: null;
	items: any[];
	omit: string;
	range: string;
	username: string;
	password: string;
	infusion: VantageInfusion;
	pendingrequests: number;
	ready: boolean;
	callbackPromesedAccessories: ((accessories: any[]) => void) | undefined;
	getAccessoryCallback: null;

	constructor(log: any, config: { ipaddress?: any; omit?: any; range?: any; username?: any; password?: any; }, api: any) {
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
		}
		else {
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

		this.getAccessoryCallback = null;

		this.log.info('VantagePlatform for InFusion Controller at ' + this.ipaddress);

		this.infusion.on('loadStatusChange', (vid: any, value: string) => {
			//this.items.forEach(function (accessory: { address: any; type: string; name: any; bri: number; power: boolean; switchService: { getCharacteristic: (arg0: any) => { (): any; new(): any; getValue: { (arg0: null, arg1: any): void; new(): any; }; }; } | undefined; lightBulbService: { getCharacteristic: (arg0: any) => { (): any; new(): any; getValue: { (arg0: null, arg1: any): void; new(): any; }; }; } | undefined; }) {
			this.items.forEach(function(accessory : any) {
			if (accessory.address === vid) {
					if (accessory.type === 'relay') {
						console.log(sprintf.sprintf('relayStatusChange (VID=%s, Name=%s, Val:%d)', vid, accessory.name, value));
						accessory.bri = parseInt(value);
						accessory.power = ((accessory.bri) > 0);
						//console.log(accessory);
						if (accessory.switchService !== undefined) {
							/* Is it ready? */
							accessory.switchService.getCharacteristic(Characteristic.On).getValue(null, accessory.power);
						}
					}
					else {
						console.log(sprintf.sprintf('loadStatusChange (VID=%s, Name=%s, Bri:%d)', vid, accessory.name, value));
						accessory.bri = parseInt(value);
						accessory.power = ((accessory.bri) > 0);
						//console.log(accessory);
						if (accessory.lightBulbService !== undefined) {
							/* Is it ready? */
							accessory.lightBulbService.getCharacteristic(Characteristic.On).getValue(null, accessory.power);
							if (accessory.type == 'rgb' || accessory.type == 'dimmer') {
								accessory.lightBulbService.getCharacteristic(Characteristic.Brightness).getValue(null, accessory.bri);
							}
						}
					}
				}
			}.bind(this));
		});

		this.infusion.on('blindStatusChange', (vid: any, value: string) => {
			//this.items.forEach(function (accessory: { address: any; name: any; pos: number; blindService: { getCharacteristic: (arg0: any) => { (): any; new(): any; getValue: { (arg0: null, arg1: any): void; new(): any; }; }; } | undefined; }) {
			this.items.forEach(function(accessory : any) {
			if (accessory.address == vid) {
					console.log(sprintf.sprintf("blindStatusChange (VID=%s, Name=%s, Pos:%d)", vid, accessory.name, value));
					accessory.pos = parseInt(value);
					if (accessory.blindService !== undefined) {
						/* Is it ready? */
						accessory.blindService.getCharacteristic(Characteristic.CurrentPosition).getValue(null, accessory.pos);
					}
				}
			}.bind(this));
		});

		this.infusion.on('thermostatOutdoorTemperatureChange', (vid: any, value: string) => {
			this.items.forEach(function (accessory: { address: any; temperature: number; thermostatService: { getCharacteristic: (arg0: any) => { (): any; new(): any; getValue: { (arg0: null, arg1: any): void; new(): any; }; }; } | undefined; }) {
				if (accessory.address == vid) {
					accessory.temperature = parseFloat(value);
					if (accessory.thermostatService !== undefined) {
						/* Is it ready? */
						accessory.thermostatService.getCharacteristic(Characteristic.CurrentTemperature).getValue(null, accessory.temperature);
					}
				}
			}.bind(this));
		});

		this.infusion.on('thermostatIndoorModeChange', (vid: any, mode: number, targetTemp: number) => {
			this.items.forEach(function (accessory: { address: any; thermostatService: { getCharacteristic: (arg0: any) => { (): any; new(): any; getValue: { (arg0: null, arg1: any): void; new(): any; }; }; } | undefined; mode: number; heating: any; cooling: any; targetTemp: any; }) {
				//console.log(accessory)
				if (accessory.address == vid) {
					//console.log(accessory)
					if (accessory.thermostatService !== undefined) {
						/* Is it ready? */
						//console.log(accessory.thermostatService);
						if (targetTemp == -1) {
							accessory.mode = mode;
							accessory.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).getValue(null, accessory.mode);
						}
						else {
							if (mode == 1) {
								accessory.heating = targetTemp
								accessory.thermostatService.getCharacteristic(Characteristic.HeatingThresholdTemperature).getValue(null, accessory.heating);
							}
							else if (mode == 2) {
								accessory.cooling = targetTemp
								accessory.thermostatService.getCharacteristic(Characteristic.CoolingThresholdTemperature).getValue(null, accessory.cooling);
							}
							if ((accessory.mode == 1 && mode == 1) || (accessory.mode == 2 && mode == 2)) {
								accessory.targetTemp = targetTemp
								accessory.thermostatService.getCharacteristic(Characteristic.TargetTemperature).getValue(null, accessory.targetTemp);
							}
						}
					}
				}
			}.bind(this));
		});

		this.infusion.on('thermostatDidChange', (value: any) => {
			const $this = this;
			$this.items.forEach(function (accessory: { type: string; thermostatService: undefined; address: any; }) {
				//console.log(accessory)
				if (accessory.type == 'thermostat') {
					//console.log(accessory)
					if (accessory.thermostatService !== undefined) {
						/* Is it ready? */
						//console.log(accessory.thermostatService);
						$this.infusion.Thermostat_GetIndoorTemperature(accessory.address);
						$this.infusion.Thermostat_GetState(accessory.address);
						$this.infusion.Thermostat_GetHeating(accessory.address);
						$this.infusion.Thermostat_GetCooling(accessory.address);
					}
				}
			}.bind(this));
		});

		this.infusion.on('thermostatIndoorTemperatureChange', (vid: any, value: string) => {
			this.items.forEach(function (accessory: { address: any; temperature: number; thermostatService: { getCharacteristic: (arg0: any) => { (): any; new(): any; getValue: { (arg0: null, arg1: any): void; new(): any; }; }; } | undefined; }) {
				//console.log(accessory)
				if (accessory.address == vid) {
					accessory.temperature = parseFloat(value);
					//console.log(accessory)
					if (accessory.thermostatService !== undefined) {
						/* Is it ready? */
						//console.log(accessory.thermostatService);
						accessory.thermostatService.getCharacteristic(Characteristic.CurrentTemperature).getValue(null, accessory.temperature);
					}
				}
			}.bind(this));
		});

		this.infusion.on('endDownloadConfiguration', (configuration: string | Buffer<ArrayBufferLike>) => {
			this.log.debug('VantagePlatform for InFusion Controller (end configuration download)');
			const parsed = JSON.parse(parser.toJson(configuration));
			//this.log("input=    %s",configuration);
			const dict: { [key: string]: string } = {};
			const Areas = parsed.Project.Objects.Object.filter(function (el: any) {
				const key = Object.keys(el)[0];
				return key === 'Area';
			});
			const Area: { [key: string]: any } = {};

			for (let i = 0; i < Areas.length; i++) {
				const item = Areas[i].Area;
				Area[item.VID] = item;
			}
			const blindItems: { [key: string]: any } = {};
			let range = this.range;
			let rangeArray = [];
			let omitArray: string | any[] = [];
			if (range !== '') {
				range = range.replace(' ', '');
				rangeArray = range.split(',');
				if (rangeArray.length !== 2){
					rangeArray = ['0', '999999999'];
				}
			}
			else{
				rangeArray = ['0"', '999999999'];
			}
			if (this.omit !== '') {
				omitArray = this.omit.replace(' ', '').split(',');
			}

			for (let i = 0; i < parsed.Project.Objects.Object.length; i++) {
				const thisItemKey = Object.keys(parsed.Project.Objects.Object[i])[0];
				const thisItem = parsed.Project.Objects.Object[i][thisItemKey];
				if (!omitArray.includes(thisItem.VID) && (parseInt(thisItem.VID) >= parseInt(range[0])) && (parseInt(thisItem.VID) <= parseInt(range[1])) &&
					(thisItem.ObjectType === 'Thermostat' || thisItem.ObjectType === 'Load' || thisItem.ObjectType === 'Blind' || thisItem.ObjectType === 'RelayBlind' || thisItem.ObjectType === 'QubeBlind' || thisItem.ObjectType === 'Lutron.Shade_x2F_Blind_Child_CHILD')) {
					if (thisItem.DeviceCategory === 'HVAC' || thisItem.ObjectType === 'Thermostat') {
						if (thisItem.DName !== undefined && thisItem.DName !== '' && (typeof thisItem.DName === 'string')) {
							thisItem.Name = thisItem.DName;
						}
						this.pendingrequests = this.pendingrequests + 1;
						this.log(sprintf.sprintf('New HVAC added (VID=%s, Name=%s, Thermostat)', thisItem.VID, thisItem.Name));
						//added
						let name = thisItem.Name;
						name = name.toString();
						if (thisItem.Area !== undefined && thisItem.Area !== '') {
							const areaVID = thisItem.Area;
							if (Area[areaVID] !== undefined && Area[areaVID].Name !== undefined && Area[areaVID].Name !== ''){
								name = Area[areaVID].Name + ' ' + name;
							}
						}

						name = name.replace('-', '');
						if (dict[name.toLowerCase()] === undefined && name !== '') {
							dict[name.toLowerCase()] = name;
						}
						else {
							name = name + ' VID' + thisItem.VID;
							dict[name.toLowerCase()] = name;
						}
						this.items.push(new VantageThermostat(this.log, this, name, thisItem.VID, 'thermostat'));
						this.pendingrequests = this.pendingrequests - 1;
						this.callbackPromesedAccessoriesDo();
					}
					if (thisItem.ObjectType === 'Load' && (thisItem.LoadType === 'Incandescent' || thisItem.LoadType === 'Fluor. Mag non-Dim' || thisItem.LoadType === 'Fluor. Magnetic Dim'
						|| thisItem.LoadType === 'Fluor. Electronic non-Dim' || thisItem.LoadType === 'Fluor. Electronic Dim'
						|| thisItem.LoadType === 'Magnetic Low Voltage' || thisItem.LoadType === 'Electronic Low Voltage' || thisItem.LoadType === 'Motor'
						|| thisItem.LoadType === 'Halogen"' || thisItem.LoadType === 'LED Dim' || thisItem.LoadType === 'LED non-Dim' || thisItem.LoadType === 'LED' || thisItem.LoadType === 'Low Voltage Relay' || thisItem.LoadType === 'High Voltage Relay'
						|| thisItem.DeviceCategory === 'Lighting')) {

						//this.log.warn(sprintf("New light asked (VID=%s, Name=%s, ---)", thisItem.VID, thisItem.Name));
						if (thisItem.DName !== undefined && thisItem.DName !== '' && (typeof thisItem.DName === 'string')) {
							thisItem.Name = thisItem.DName;
						}
						this.pendingrequests = this.pendingrequests + 1;
						//this.log(sprintf("New load asked (VID=%s, Name=%s, ---)", thisItem.VID, thisItem.Name));
						//added below
						let name = thisItem.Name;
						name = name.toString();
						if (thisItem.Area !== undefined && thisItem.Area !== '') {
							const areaVID = thisItem.Area;
							if (Area[areaVID] !== undefined && Area[areaVID].Name !== undefined && Area[areaVID].Name !== '') {
								name = Area[areaVID].Name + ' ' + name;
							}
						}
						// if (thisItem.LoadType == "Low Voltage Relay" || thisItem.LoadType == "High Voltage Relay")
						// 	name = name + " RELAY"
						name = name.replace('-', '');
						if (dict[name.toLowerCase()] === undefined && name !== '') {
							dict[name.toLowerCase()] = name;
						} else {
							name = name + ' VID' + thisItem.VID;
							dict[name.toLowerCase()] = name;
						}
						if (thisItem.LoadType === 'Fluor. Mag non-Dim' || thisItem.LoadType === 'LED non-Dim' || thisItem.LoadType === 'Fluor. Electronic non-Dim' || thisItem.LoadType === 'Low Voltage Relay' || thisItem.LoadType === 'Motor' || thisItem.DeviceCategory === 'Lighting' || thisItem.LoadType === 'High Voltage Relay') {
							if (thisItem.LoadType === 'Low Voltage Relay' || thisItem.LoadType === 'High Voltage Relay') {
								this.log(sprintf.sprintf('New relay added (VID=%s, Name=%s, RELAY)', thisItem.VID, thisItem.Name));
								this.items.push(new VantageSwitch(this.log, this, name, thisItem.VID, 'relay'));
							} else {
								this.log(sprintf.sprintf('New load added (VID=%s, Name=%s, NON-DIMMER)', thisItem.VID, thisItem.Name));
								this.items.push(new VantageLoad(this.log, this, name, thisItem.VID, 'non-dimmer'));
							}
						} else {
							this.log(sprintf.sprintf('New load added (VID=%s, Name=%s, DIMMER)', thisItem.VID, thisItem.Name));
							this.items.push(new VantageLoad(this.log, this, name, thisItem.VID, 'dimmer'));
						}
						this.pendingrequests = this.pendingrequests - 1;
						this.callbackPromesedAccessoriesDo();
					}
					if (thisItem.ObjectType === 'Blind' || thisItem.ObjectType === 'RelayBlind' || thisItem.ObjectType === 'Lutron.Shade_x2F_Blind_Child_CHILD' || thisItem.ObjectType === 'QubeBlind') {
						//this.log.warn(sprintf("New light asked (VID=%s, Name=%s, ---)", thisItem.VID, thisItem.Name));
						if (thisItem.DName !== undefined && thisItem.DName !== '' && (typeof thisItem.DName === 'string')) {
							thisItem.Name = thisItem.DName;
						}

						this.pendingrequests = this.pendingrequests + 1;
						//added below
						let name = thisItem.Name;
						name = name.toString();
						if (thisItem.Area !== undefined && thisItem.Area !== '') {
							const areaVID = thisItem.Area;
							if (Area[areaVID] !== undefined && Area[areaVID].Name !== undefined && Area[areaVID].Name !== '') {
								name = Area[areaVID].Name + ' ' + name;
							}
						}
						name = name.replace('-', '');
						if (dict[name.toLowerCase()] === undefined && name !== '') {
							dict[name.toLowerCase()] = name;
						}
						else {
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
						this.log(sprintf.sprintf('New Blind added (VID=%s, Name=%s, BLIND)', thisItem.VID, thisItem.Name));
						this.items.push(new VantageBlind(this.log, this, name, thisItem.VID, 'blind'));
						this.pendingrequests = this.pendingrequests - 1;
						this.callbackPromesedAccessoriesDo();
					}
				}
			}
			for (let i = 0; i < this.items.length; i++) {
				if (blindItems[this.items[i].address]) {
					this.items.splice(i, 1);
					i--;
				}
			}
			this.log.warn('VantagePlatform for InFusion Controller (end configuration store)');
			this.ready = true;
			this.callbackPromesedAccessoriesDo();
			//console.log("done??");
		});
	}
	configureAccessory(accessory: PlatformAccessory): void {
		this.log.info(`Configuring accessory: ${accessory.displayName}`);
		this.items.push(accessory);
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
			this.log.debug(sprintf.sprintf('VantagePlatform for InFusion Controller (%s,%s)', this.ready, this.pendingrequests));
		}
	}

	getDevices() {
		return new Promise((resolve: (arg0: any) => void, reject: any) => {
			if (!this.ready) {
				this.log.debug('VantagePlatform for InFusion Controller (wait for getDevices promise)');
				this.callbackPromesedAccessories = resolve;
			} else {
				resolve(this.items);
			}
		});
	}

	/* Get accessory list */
	accessories(callback: (arg0: any) => void) {
		this.getDevices().then((devices: any) => {
			this.log.debug('VantagePlatform for InFusion Controller (accessories readed)');
			callback(devices);
		});
	}
}

class VantageThermostat {
	DisplayName: any;
	name: any;
	UUID: any;
	parent: any;
	address: any;
	log: any;
	temperature: number;
	targetTemp: number;
	type: string;
	heating: number;
	cooling: number;
	mode: number;
	units: number;
	thermostatService: any;
	constructor(log: any, parent: any, name: any, vid: any, type: string) {
		this.DisplayName = name;
		this.name = name;
		this.UUID = UUIDGen.generate(vid);
		this.parent = parent;
		this.address = vid;
		this.log = log;
		this.temperature = 0;
		this.targetTemp = 0;
		this.type = type;
		this.heating = 0;
		this.cooling = 0;
		this.mode = 0;  //0=off, 1=heat, 2=cool, 3=auto
		this.units = 1;  //0=celcius, 1=f
	}


	getServices() {
		const service = new Service.AccessoryInformation();
		service.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, 'Vantage Controls')
			.setCharacteristic(Characteristic.Model, 'Thermostat')
			.setCharacteristic(Characteristic.SerialNumber, 'VID ' + this.address);

		this.thermostatService = new Service.Thermostat(this.name);
		this.thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', (callback: (arg0: null, arg1: any) => void) => {
				//this.log(sprintf("getTemperature %s = %.1f", this.address, this.temperature));
				callback(null, this.temperature);
			});


		this.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
			.on('get', (callback: (arg0: null, arg1: any) => void) => {
				this.log.debug(sprintf.sprintf('getCurrentState %s = %f', this.address, this.mode));
				callback(null, this.mode);
			});

		this.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.on('set', (mode: any, callback: (arg0: null) => void) => {
				this.mode = mode;
				this.log.debug(sprintf.sprintf('setTargetHeatingCoolingState %s = %s', this.address, mode));
				this.parent.infusion.Thermostat_SetTargetState(this.address, this.mode)
				callback(null);
			})
			.on('get', (callback: (arg0: null, arg1: any) => void) => {
				this.log.debug(sprintf.sprintf('TargetHeatingCoolingState %s = %f', this.address, this.mode));
				callback(null, this.mode);
			});



		this.thermostatService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
			.on('get', (callback: (arg0: null, arg1: any) => void) => {
				this.log.debug(sprintf.sprintf('HeatingThresholdTemperature %s = %f', this.address, this.heating));
				callback(null, this.heating);
			});

		this.thermostatService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
			.on('get', (callback: (arg0: null, arg1: any) => void) => {
				this.log.debug(sprintf.sprintf('CoolingThresholdTemperature %s = %f', this.address, this.cooling));
				callback(null, this.cooling);
			});

		this.thermostatService.getCharacteristic(Characteristic.TargetTemperature)
			.on('set', (level: string, callback: (arg0: null) => void) => {
				this.targetTemp = parseFloat(level)
				if (this.mode == 1) {
					this.heating = parseFloat(level)
				}
				else if (this.mode == 2) {
					this.cooling = parseFloat(level)
				}
				this.log(sprintf.sprintf('setTemperature %s = %s and current mode = %f', this.address, level, this.mode));
				this.parent.infusion.Thermostat_SetIndoorTemperature(this.address, this.targetTemp, this.mode, this.heating, this.cooling);
				callback(null);
			})

			.on('get', (callback: (arg0: null, arg1: any) => void) => {
				this.log(sprintf.sprintf('getTargetTemperature %s = %.1f', this.address, this.targetTemp));
				callback(null, this.targetTemp);
			});

		this.thermostatService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.on('set', (units: string, callback: (arg0: null) => void) => {
				this.units = parseInt(units)
				this.log.debug(sprintf.sprintf('getThermoUnit %s = %s', this.address, units));
				callback(null);
			})

			.on('get', (callback: (arg0: null, arg1: any) => void) => {
				this.log.debug(sprintf.sprintf('getThermoUnits %s = %f', this.address, this.units));
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

class VantageLoad extends VantageAccessory {
	displayName: any;
	UUID: any;
	name: any;
	parent: any;
	address: any;
	log: any;
	bri: number;
	power: boolean;
	sat: number;
	hue: number;
	type: string;
	lightBulbService: any;
	constructor(log: any, parent: any, name: any, vid: any, type: string) {
		super();
		this.displayName = name;
		this.UUID = UUIDGen.generate(vid);
		this.name = name;
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
		const service = new Service.AccessoryInformation();
		service.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, 'Vantage Controls')
			.setCharacteristic(Characteristic.Model, 'Power Switch')
			.setCharacteristic(Characteristic.SerialNumber, 'VID ' + this.address);

		if (this.name.toLowerCase().indexOf('fan') !=+ -1 ) {
			this.lightBulbService = new Service.Fan(this.name);
			this.lightBulbService.getCharacteristic(Characteristic.RotationSpeed)
				.setProps({ minValue: 0, maxValue: 100, minStep: 25 });
			this.type = 'fan';
		} else {
			this.lightBulbService = new Service.Lightbulb(this.name);
		}

		if (this.type === 'fan') {
			this.lightBulbService.getCharacteristic(Characteristic.RotationSpeed)
					.on('set', (level: string, callback: (arg0: null) => void) => {						
						this.bri = parseInt(level);
						this.log(sprintf.sprintf('fan level %s = %d', this.address, this.bri));
						this.parent.infusion.Load_Dim(this.address, this.bri);
						callback(null);
					})
					.on('get', (callback: (arg0: null, arg1: any) => void) => {
						//console.log("wtf");
						this.log.debug(sprintf.sprintf('get fanlevel %s = %d', this.address, this.bri));
						callback(null, this.bri);
					});
		
		}
		
		
			//console.log(this.lightBulbService); //here
			this.lightBulbService.getCharacteristic(Characteristic.On)
				.on('set', (level: number, callback: (arg0: null) => void) => {
					this.log.debug(sprintf.sprintf('setPower %s = %s', this.address, level));
					this.power = (level > 0);
					if (this.power && this.bri === 0) {
						this.bri = 100;
					}
					this.parent.infusion.Load_Dim(this.address, (this.power ? 1 : 0) * this.bri);
					callback(null);
				})
				.on('get', (callback: (arg0: null, arg1: any) => void) => {
					this.log.debug(sprintf.sprintf('getPower %s = %s', this.address, this.power));
					callback(null, this.power);
				});

			if (this.type === 'dimmer' || this.type === 'rgb') {
				this.lightBulbService.getCharacteristic(Characteristic.Brightness)
					.on('set', (level: string, callback: (arg0: null) => void) => {
						this.log(sprintf.sprintf('setBrightness %s = %d', this.address, level));
						this.bri = parseInt(level);
						this.power = (this.bri > 0);
						this.parent.infusion.Load_Dim(this.address, (this.power ? 1 : 0) * this.bri);
						callback(null);
					})
					.on('get', (callback: (arg0: null, arg1: any) => void) => {
						//console.log("wtf");
						this.log.debug(sprintf.sprintf('getBrightness %s = %d', this.address, this.bri));
						callback(null, this.bri);
					});
			}

			if (this.type === 'rgb') {
				this.lightBulbService.getCharacteristic(Characteristic.Saturation)
					.on('set', (level: any, callback: (arg0: null) => void) => {
						this.power = true;
						this.sat = level;
						this.parent.infusion.RGBLoad_DissolveHSL(this.address, this.hue, this.sat, this.bri)
						callback(null);
					})
					.on('get', (callback: (arg0: null, arg1: any) => void) => {
						callback(null, this.sat);
					});
				this.lightBulbService.getCharacteristic(Characteristic.Hue)
					.on('set', (level: any, callback: (arg0: null) => void) => {
						this.power = true;
						this.hue = level;
						this.parent.infusion.RGBLoad_DissolveHSL(this.address, this.hue, this.sat, this.bri)
						callback(null);
					})
					.on('get', (callback: (arg0: null, arg1: any) => void) => {
						callback(null, this.hue);
					});
			}		
		

		this.parent.infusion.getLoadStatus(this.address);
		return [service, this.lightBulbService];
	}
}


class VantageBlind {
	displayName: any;
	UUID: any;
	name: any;
	parent: any;
	address: any;
	log: any;
	pos: number;
	type: string;
	posState: number;
	blindService: any;
	constructor(log: any, parent: any, name: any, vid: any, type: string) {
		this.displayName = name;
		this.UUID = UUIDGen.generate(vid);
		this.name = name;
		this.parent = parent;
		this.address = vid;
		this.log = log;
		this.pos = 100;
		this.type = type;
		this.posState = 2; //decreasing=0, increasing=1, stopped=2
	}

	getServices() {
		const service = new Service.AccessoryInformation();
		service.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, 'Vantage Controls')
			.setCharacteristic(Characteristic.Model, 'Blind')
			.setCharacteristic(Characteristic.SerialNumber, 'VID ' + this.address);

		this.blindService = new Service.WindowCovering(this.name);

		//console.log(this.lightBulbService); //here
		this.blindService.getCharacteristic(Characteristic.CurrentPosition)
			.on('get', (callback: (arg0: null, arg1: any) => void) => {
				this.log.debug(sprintf.sprintf('getPos %s = %s', this.address, this.pos));
				callback(null, this.pos);
			});

		this.blindService.getCharacteristic(Characteristic.TargetPosition)
			.on('set', (pos: any, callback: (arg0: null) => void) => {
				this.log.debug(sprintf.sprintf('setPos %s = %s', this.address, pos));
				this.pos = pos;
				this.parent.infusion.setBlindPos(this.address, this.pos);
				callback(null);
			})
			.on('get', (callback: (arg0: null, arg1: any) => void) => {
				this.log.debug(sprintf.sprintf('geTargetPos %s = %s', this.address, this.pos));
				callback(null, this.pos);
			});

		this.blindService.getCharacteristic(Characteristic.PositionState)
			.on('get', (callback: (arg0: null, arg1: any) => void) => {
				this.log.debug(sprintf.sprintf('getBlindState %s = %s', this.address, this.posState));
				callback(null, this.posState);
			});


		this.parent.infusion.getBlindPos(this.address);
		return [service, this.blindService];
	}
}


class VantageSwitch {
	displayName: any;
	UUID: any;
	name: any;
	parent: any;
	address: any;
	log: any;
	type: string;
	bri: number;
	power: boolean;
	switchService: any;
	constructor(log: any, parent: any, name: any, vid: any, type: string) {
		this.displayName = name;
		this.UUID = UUIDGen.generate(vid);
		this.name = name;
		this.parent = parent;
		this.address = vid;
		this.log = log;
		this.type = type;
		this.bri = 100;
		this.power = false;
	}

	getServices() {
		const service = new Service.AccessoryInformation();
		service.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, 'Vantage Controls')
			.setCharacteristic(Characteristic.Model, 'Switch')
			.setCharacteristic(Characteristic.SerialNumber, 'VID ' + this.address);

		this.switchService = new Service.Switch(this.name);

		//console.log(this.lightBulbService); //here
		this.switchService.getCharacteristic(Characteristic.On)
			.on('set', (level: number, callback: (arg0: null) => void) => {
				this.log.debug(sprintf.sprintf('setPower %s = %s', this.address, level));
				this.power = (level > 0);
				if (this.power && this.bri === 0) {
					this.bri = 100;
				}
				this.parent.infusion.setRelay(this.address, (this.power? 1 : 0) * this.bri);
				callback(null);
			})
			.on('get', (callback: (arg0: null, arg1: any) => void) => {
				this.log.debug(sprintf.sprintf('getPower %s = %s', this.address, this.power));
				callback(null, this.power);
			});

		this.parent.infusion.getLoadStatus(this.address);
		return [service, this.switchService];
	}
}

