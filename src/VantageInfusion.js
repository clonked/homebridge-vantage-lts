import net from 'net';
import libxmljs from 'libxmljs2';
import sleep from 'sleep';
import events from 'events';
import util from 'util';
import fs from 'fs';
import { Buffer } from 'buffer';
import { sprintf } from 'sprintf-js';
import parser from 'xml2json';

// eslint-disable-next-line @typescript-eslint/no-use-before-define
if (typeof console === 'undefined') {
    var console = {
        log: function() {},
        warn: function() {},
        error: function() {},
    };
}

export class VantageInfusion {
    constructor(ipaddress, accessories, usecache, omit, range, username, password) {
        util.inherits(VantageInfusion, events.EventEmitter);
        this.ipaddress = ipaddress;
        this.usecache = usecache || true;
        this.accessories = accessories || [];
        this.omit = omit;
        this.range = range;
        this.username = username;
        this.password = password;
        this.command = {};
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
            this.command.on('data', (data) => {
                /* Data received */
                //console.log('data received', data);
                var lines = data.toString().split('\n');
                console.log(lines);
                for (var i = 0; i < lines.length; i++) {

                    var dataItem = lines[i].split(' ');

                    //console.log(dataItem);
                    if (lines[i].startsWith('S:BLIND') || lines[i].startsWith('R:GETBLIND')) {
                        /* Live update about load level (even if it's a RGB load') */
                        this.emit('blindStatusChange', parseInt(dataItem[1]), parseInt(dataItem[2]));
                    }
                    if (lines[i].startsWith('S:LOAD ') || lines[i].startsWith('R:GETLOAD ')) {
                        /* Live update about load level (even if it's a RGB load') */
                        this.emit('loadStatusChange', parseInt(dataItem[1]), parseInt(dataItem[2]));
                    }
                    if (dataItem[0] === 'S:TEMP') {
                        //console.log("now lets set the temp!" + parseInt(dataItem[2]));
                        this.emit(sprintf('thermostatDidChange'), parseInt(dataItem[2]));
                        // this.emit(sprintf("thermostatIndoorTemperatureChange"), parseInt(dataItem[2]));
                    } else if (dataItem[0] === 'R:INVOKE' && dataItem[3].includes('Thermostat.GetIndoorTemperature')) {
                        //console.log("lets get the indoor temp!")
                        this.emit(sprintf('thermostatIndoorTemperatureChange'), parseInt(dataItem[1]), parseFloat(dataItem[2]));
                    } else if (dataItem[0] === 'S:THERMOP' || dataItem[0] === 'R:GETTHERMOP' || dataItem[0] === 'R:THERMTEMP') {
                        var modeVal = 0;
                    }

                    if (dataItem[2] !== undefined) {

                        if (dataItem[2].includes('OFF')) {
                            modeVal = 0;
                        } else if (dataItem[2].includes('HEAT')){
                            modeVal = 1;
                        } else if (dataItem[2].includes('COOL')) {
                            modeVal = 2;
                        } else {
                            modeVal = 3;
                        }
                    }

                    if (dataItem[0] === 'S:THERMOP' || dataItem[0] === 'R:GETTHERMOP') {
                        this.emit(sprintf('thermostatIndoorModeChange'),
                            parseInt(dataItem[1]),
                            parseInt(modeVal),
                            -1);
                    } else {
                        this.emit(sprintf('thermostatIndoorModeChange'),
                            parseInt(dataItem[1]),
                            parseInt(modeVal),
                            parseFloat(dataItem[3]));
                    }
                }

                var lineStart = lines[i] ?? ''; 
                /* Non-state feedback */
                	if (lineStart.startsWith('R:INVOKE') && lineStart.indexOf('Object.IsInterfaceSupported')) {
                    this.emit(sprintf('isInterfaceSupportedAnswer-%d-%d', parseInt(dataItem[1]), parseInt(dataItem[4])), parseInt(dataItem[2]));
                }
            });

            if (this.username !== '' && this.password !== '') {
                this.command.write(sprintf('Login %s %s\n', this.username, this.password));
            }
            this.command.write(sprintf('STATUS ALL\n'));
            this.command.write(sprintf('ELENABLE 1 AUTOMATION ON\n'));
            this.command.write(sprintf('ELENABLE 1 EVENT ON\n'));
            this.command.write(sprintf('ELENABLE 1 STATUS ON\n'));
            this.command.write(sprintf('ELENABLE 1 STATUSEX ON\n'));
            this.command.write(sprintf('ELENABLE 1 SYSTEM ON\n'));
            this.command.write(sprintf('ELLOG AUTOMATION ON\n'));
            this.command.write(sprintf('ELLOG EVENT ON\n'));
            this.command.write(sprintf('ELLOG STATUS ON\n'));
            this.command.write(sprintf('ELLOG STATUSEX ON\n'));
            this.command.write(sprintf('ELLOG SYSTEM ON\n'));
        });
    }

    getLoadStatus(vid) {
        this.command.write(sprintf('GETLOAD %s\n', vid));
    }

    /**
	 * Send the IsInterfaceSupported request to the InFusion controller,
	 * it needs the VID of the object and the IID (InterfaceId) taken 
	 * previously with the configuration session
	 * @return true, false or a promise!
	 */
    isInterfaceSupported(item, interfaceName) {
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
            var interfaceId = this.interfaces[interfaceName];

            return new Promise((resolve) => {
                this.once(sprintf('isInterfaceSupportedAnswer-%d-%d', parseInt(item.VID), parseInt(interfaceId)), (_support) => {
                    resolve({ 'item': item, 'interface': interfaceName, 'support': _support });
                },
                );
                sleep.usleep(5000);
                this.command.write(sprintf('INVOKE %s Object.IsInterfaceSupported %s\n', item.VID, interfaceId));
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
        var configuration = net.connect({ host: this.ipaddress, port: 2001 }, () => {
            /**
			 * List interfaces, list configuration and then check if a specific interface 
			 * is supported by the recognized devices. 
			 */
            console.log('load dc file');

            var buffer = '';
            var xmlResult = '';
            var readObjects = [];
            var writeCount = 0;
            var objectDict = {};
            var types = ['Area', 'Load', 'Thermostat', 'Blind', 'RelayBlind', 'Lutron.Shade_x2F_Blind_Child_CHILD', 'QubeBlind'];
            configuration.on('data', (data) => {
                buffer = buffer + data.toString().replace('\ufeff', '');

                try {
                    buffer = buffer.replace('<?File Encode="Base64" /', '<File>');
                    buffer = buffer.replace('?>', '</File>');

                    if (buffer.includes('</File>')) {
                        console.log('end');
                        var start = buffer.split('<File>');
                        var end = buffer.split('</File>');

                        buffer = buffer.match('<File>' + '(.*?)' + '</File>');
                        buffer = buffer[1];
                        var newtext = Buffer.from(buffer, 'base64');
                        newtext = newtext.toString();
                        newtext = newtext.replace(/[\r\n]/g, '');
                        var init = newtext.split('<Objects>');
                        newtext = newtext.match('<Objects>' + '(.*?)' + '</Objects>');
                        if (newtext == null) {
                            console.log('null');
                        }
                        xmlResult = Buffer.from(init[0] + '<Objects>' + newtext[1] + '</Objects></Project>', 'base64');
                        xmlResult = xmlResult.toString('base64');
                        buffer = '<smarterHome>' + start[0] + '<File>' + xmlResult + '</File>' + end[end.length - 1] + '</smarterHome>';
                    }
                    libxmljs.parseXml(buffer);
                } catch {
                    return false;
                }
                if(writeCount < types.length) {
                    console.log('parse Json: ' + types[writeCount]);
                }
                var parsed = JSON.parse(parser.toJson(buffer));
                if (parsed.smarterHome !== undefined) {
                    if (parsed.smarterHome.IIntrospection !== undefined) {
                        var interfaces = parsed.smarterHome.IIntrospection.GetInterfaces.return.Interface;
                        for (var i = 0; i < interfaces.length; i++) {
                            this.interfaces[interfaces[i].Name] = interfaces[i].IID;
                        }
                    }
                    if (parsed.smarterHome.IBackup !== undefined) {
                        var xmlconfiguration = Buffer.from(parsed.smarterHome.IBackup.GetFile.return.File, 'base64').toString('ascii'); // Ta-da
                        fs.writeFileSync('/tmp/vantage.dc', xmlconfiguration); /* TODO: create a platform-independent temp file */
                        this.emit('endDownloadConfiguration', xmlconfiguration);
                        configuration.destroy();
                    }
                } else if (parsed.IConfiguration !== undefined) {
                    if (parsed.IConfiguration.OpenFilter !== undefined) {
                        var objectValue = parsed.IConfiguration.OpenFilter.return;
                        if (objectDict[objectValue] === undefined) {
                            buffer = '';
                            objectDict[objectValue] = objectValue;
                            writeCount++;
                            configuration.write(
                                '<IConfiguration><GetFilterResults><call><Count>1000</Count>' +
                                '<WholeObject>true</WholeObject><hFilter>' + objectValue +
                                '</hFilter></call></GetFilterResults></IConfiguration>\n',
                            );
                        }

                    } else if (parsed.IConfiguration.GetFilterResults !== undefined) {
                        var elements = parsed.IConfiguration.GetFilterResults.return.Object;
                        if (elements !== undefined) {
                            for (var j = 0; j < elements.length; j++) {
                                var element = elements[j][types[writeCount - 1]];
                                element.ObjectType = types[writeCount - 1];
                                var elemDict = {};
                                elemDict[types[writeCount - 1]] = element;
                                readObjects.push(elemDict);
                            }
                        }

                        buffer = '';
                        if (writeCount >= types.length) {
                            var result = {};
                            result.Project = {};
                            result.Project.Objects = {};
                            result.Project.Objects.Object = readObjects;
                            var options = { sanitize: true };
                            result = parser.toXml(result, options);
                            fs.writeFileSync('/tmp/vantage.dc', result); /* TODO: create a platform-independent temp file */
                            this.emit('endDownloadConfiguration', result);
                            configuration.destroy();
                        } else {
                            configuration.write(
                                '<IConfiguration><OpenFilter><call><Objects><ObjectType>' +
                                types[writeCount] +
                                '</ObjectType></Objects></call></OpenFilter></IConfiguration>\n',
                            );
                        }
                    }
                } else if (parsed.ILogin !== undefined) {
                    if (parsed.ILogin.Login !== undefined) {
                        if (parsed.ILogin.Login.return === 'true') {
                            console.log('Login successful');
                        } else {
                            console.log('Login failed trying to get data anyways');
                        }
                        buffer = '';
                        configuration.write(
                            '<IConfiguration><OpenFilter><call><Objects><ObjectType>' +
                            types[0] +
                            '</ObjectType></Objects></call></OpenFilter></IConfiguration>\n',
                        );
                    }
                }
                buffer = '';
            });

            /* Aehm, async method becomes sync... */
            //configuration.write("<IIntrospection><GetInterfaces><call></call></GetInterfaces></IIntrospection>\n");

            if (fs.existsSync('/tmp/vantage.dc') && this.usecache) {
                fs.readFile('/tmp/vantage.dc', 'utf8', (err, data) => {
                    if (!err) {
                        this.emit('endDownloadConfiguration', data);
                    }
                });
            } else if (fs.existsSync('/home/pi/vantage.dc') && this.usecache) {
                fs.readFile('/home/pi/vantage.dc', 'utf8', (err, data) => {
                    if (!err) {
                        this.emit('endDownloadConfiguration', data);
                    }
                });
            } else {
                if (this.username !== '' && this.password !== '') {
                    const loginXml = '<ILogin><Login><call><User>' + this.username + '</User>' +
                        '<Password>' + this.password + '</Password></call></Login></ILogin>\n';
                    configuration.write(loginXml);
                } else {
                    const openFilterXml =
                        '<IConfiguration><OpenFilter><call><Objects><ObjectType>' +
                        types[0] +
                        '</ObjectType></Objects></call></OpenFilter></IConfiguration>\n';
                    configuration.write(openFilterXml);
                }
                //configuration.write("<IBackup><GetFile><call>Backup\\Project.dc</call></GetFile></IBackup>\n");
            }
        });
    }

    /**
	 * Send the set HSL color request to the controller 
	 */
    RGBLoad_DissolveHSL(vid, h, s, l, time) {
        var thisTime = time || 500;
        this.command.write(sprintf('INVOKE %s RGBLoad.DissolveHSL %s %s %s %s\n', vid, h, s, l * 1000, thisTime));
    }

    Thermostat_GetOutdoorTemperature(vid) {
        this.command.write(sprintf('INVOKE %s Thermostat.GetOutdoorTemperature\n', vid));
    }

    Thermostat_GetIndoorTemperature(vid) {
        this.command.write(sprintf('INVOKE %s Thermostat.GetIndoorTemperature\n', vid));
    }

    Thermostat_SetTargetState(vid, mode) {
        if (mode === 0) {
            this.command.write(sprintf('THERMOP %s OFF\n', vid));
        } else if (mode === 1) {
            this.command.write(sprintf('THERMOP %s HEAT\n', vid));
        } else if (mode === 2) {
            this.command.write(sprintf('THERMOP %s COOL\n', vid));
        } else {
            this.command.write(sprintf('THERMOP %s AUTO\n', vid));
        }
    }

    Thermostat_GetState(vid) {
        this.command.write(sprintf('GETTHERMOP %s\n', vid));
    }

    Thermostat_GetHeating(vid) {
        this.command.write(sprintf('GETTHERMTEMP %s HEAT\n', vid));
    }

    Thermostat_GetCooling(vid) {
        this.command.write(sprintf('GETTHERMTEMP %s COOL\n', vid));
    }

    Thermostat_SetIndoorTemperature(vid, value, mode, heating, cooling) {
    // console.log("lets set this shit!!!");
    // console.log(mode)
        if (mode === 1) {
            this.command.write(sprintf('THERMTEMP %s HEAT %s\n', vid, value));
        } else if (mode === 2) {
            this.command.write(sprintf('THERMTEMP %s COOL %s\n', vid, value));
        } else if (mode === 3) {
            if (value > cooling) {
                this.command.write(sprintf('THERMTEMP %s COOL %s\n', vid, value));
            } else if (value < heating) {
                this.command.write(sprintf('THERMTEMP %s HEAT %s\n', vid, value));
            }
        }
    }

    /**
	 * Send the set light level to the controller
	 */
    Load_Dim(vid, level, time) {
    // TODO: reduce feedback (or command) rate
        var thisTime = time || 1;
        this.command.write(sprintf('INVOKE %s Load.Ramp 6 %s %s\n', vid, thisTime, level));
    }

    /** blind commands*/
    setBlindPos(vid, pos) {
    // TODO: reduce feedback (or command) rate
        this.command.write(sprintf('BLIND %s POS %s\n', vid, pos));
    }
    getBlindPos(vid) {
    // TODO: reduce feedback (or command) rate
        this.command.write(sprintf('GETBLIND %s \n', vid));
    }

    /** relay commands*/
    setRelay(vid, level) {
    // TODO: reduce feedback (or command) rate
        this.command.write(sprintf('LOAD %s %s\n', vid, level));
    }
}

