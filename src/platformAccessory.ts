// src/platformAccessory.ts
import type { PlatformAccessory, Service, Characteristic } from 'homebridge';
import type { VantageDevice } from './types';
import { VantagePlatform } from './platform';

export class VantagePlatformAccessory {
  private Service: typeof Service;
  private Characteristic: typeof Characteristic;

  constructor(
    private readonly platform: VantagePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.Service = this.platform.api.hap.Service;
    this.Characteristic = this.platform.api.hap.Characteristic;
    this.registerServices();
  }

  /** Call this both on create and on restore */
  registerServices() {
    const device = this.accessory.context.device as VantageDevice | undefined;
    if (!device) {
      this.platform.log.warn(`No device context on ${this.accessory.displayName}; leaving as-is`);
      return;
    }

    // Accessory Info (always)
    const info =
      this.accessory.getService(this.Service.AccessoryInformation) ??
      this.accessory.addService(this.Service.AccessoryInformation);

    info.setCharacteristic(this.Characteristic.Manufacturer, 'Vantage Controls');
    info.setCharacteristic(this.Characteristic.Model, device.objectType ?? device.type);
    info.setCharacteristic(this.Characteristic.Name, device.name);
    info.setCharacteristic(this.Characteristic.SerialNumber, `VID ${device.vid}`);

    // Build the correct primary service for the type
    let primary: Service | undefined;

    if (device.type === 'relay') {
      primary =
        this.accessory.getService(this.Service.Switch) ??
        this.accessory.addService(this.Service.Switch, this.accessory.displayName);

      // REQUIRED characteristic
      const on = primary.getCharacteristic(this.Characteristic.On);
      on.removeAllListeners('set'); // avoid duplicate handlers on restore
      on.onSet(async (value) => this.platform.getInfusion().setRelay(device.address, !!value));

      // Category helps iOS
      this.accessory.category = this.platform.api.hap.Categories.SWITCH;
    }
  
    if (this.accessory.displayName.toLowerCase().indexOf('fan') != -1 ) {
      primary =
        this.accessory.getService(this.Service.Fan) ??
        this.accessory.addService(this.Service.Fan, this.accessory.displayName);
        //console.log('made a fan');

        const on = primary.getCharacteristic(this.Characteristic.On);
        on.removeAllListeners('set');
        on.onSet(async (value) => {
          (device as any).power = !!value;
          if ((device as any).power && (device as any).bri === 0) {
            (device as any).bri = 100;
          }
          const level = (device as any).power ? (device as any).bri : 0;
          this.platform.getInfusion().setBrightness(device.address, level);
        });

        const rotationSpeed = primary.getCharacteristic(this.Characteristic.RotationSpeed);
        rotationSpeed.setProps({ minValue: 0, maxValue: 100, minStep: 25 });
        rotationSpeed.removeAllListeners('set');
        rotationSpeed.onSet(async (value) => {
          (device as any).bri = Number(value);
          (device as any).power = (device as any).bri > 0;
          this.platform.getInfusion().setBrightness(device.address, (device as any).bri);
        });

        } else if (device.type === 'dimmer' || device.type === 'rgb') {
      primary =
        this.accessory.getService(this.Service.Lightbulb) ??
        this.accessory.addService(this.Service.Lightbulb, this.accessory.displayName);

      // On
      const on = primary.getCharacteristic(this.Characteristic.On);
      on.removeAllListeners('set');
      on.onSet(async (value) => {
        (device as any).power = !!value;
        if ((device as any).power && (device as any).bri === 0) {
          (device as any).bri = 100;
        }
        const level = (device as any).power ? (device as any).bri : 0;
        this.platform.getInfusion().setBrightness(device.address, level);
      });

      // Brightness (required for dimmer)
      const bri = primary.getCharacteristic(this.Characteristic.Brightness);
      bri.removeAllListeners('set');
      bri.onSet(async (value) => {
        (device as any).bri = Number(value);
        (device as any).power = (device as any).bri > 0;
        this.platform.getInfusion().setBrightness(device.address, (device as any).bri);
      });

      // RGB extras
      if (device.type === 'rgb') {
        const hue = primary.getCharacteristic(this.Characteristic.Hue);
        hue.removeAllListeners('set');
        hue.onSet((v) => this.platform.getInfusion().setHue(device.address, Number(v)));

        const sat = primary.getCharacteristic(this.Characteristic.Saturation);
        sat.removeAllListeners('set');
        sat.onSet((v) => this.platform.getInfusion().setSaturation(device.address, Number(v)));
      } else {
        // Ensure RGB chars aren’t lingering from a previous cache
        this.safeRemoveCharacteristic(primary, this.Characteristic.Hue);
        this.safeRemoveCharacteristic(primary, this.Characteristic.Saturation);
      }

      this.accessory.category = this.platform.api.hap.Categories.LIGHTBULB;
    }

    if (device.type === 'blind') {
      primary =
        this.accessory.getService(this.Service.WindowCovering) ??
        this.accessory.addService(this.Service.WindowCovering, this.accessory.displayName);

      const tgt = primary.getCharacteristic(this.Characteristic.TargetPosition);
      tgt.removeAllListeners('set');
      tgt.onSet((value) => this.platform.getInfusion().setBlindPosition(device.address, Number(value)));

      // Make sure required reads exist (they can be updated via events)
      primary.getCharacteristic(this.Characteristic.CurrentPosition);
      primary.getCharacteristic(this.Characteristic.PositionState);

      this.accessory.category = this.platform.api.hap.Categories.WINDOW_COVERING;
    }

    if (device.type === 'thermostat') {
      primary =
        this.accessory.getService(this.Service.Thermostat) ??
        this.accessory.addService(this.Service.Thermostat, this.accessory.displayName);

      // Target Temperature
      const tgt = primary.getCharacteristic(this.Characteristic.TargetTemperature);
      tgt.removeAllListeners('set');
      tgt.removeAllListeners('get');
      tgt.onSet((value) => {
        const dev = this.accessory.context.device as any;
        dev.targetTemp = Number(value);
        
        // Logic from original: determine mode based on temperature comparison
        if (dev.mode === 0) {
          if (dev.targetTemp > dev.temperature) {
            dev.mode = 1; // heat
          } else if (dev.targetTemp < dev.temperature) {
            dev.mode = 2; // cool
          }
          dev.current = dev.mode;
        }
        
        // Update heating/cooling thresholds based on mode
        if (dev.mode === 1) {
          dev.heating = Number(value);
        } else if (dev.mode === 2) {
          dev.cooling = Number(value);
        }
        
        this.platform.getInfusion().setThermostatTarget(device.address, Number(value), dev.mode, dev.heating, dev.cooling);
      });
      tgt.onGet(() => {
        const dev = this.accessory.context.device as any;
        return dev?.targetTemp ?? 20;
      });

      // Target Heating/Cooling State
      const mode = primary.getCharacteristic(this.Characteristic.TargetHeatingCoolingState);
      mode.removeAllListeners('set');
      mode.removeAllListeners('get');
      mode.onSet((value) => {
        const dev = this.accessory.context.device as any;
        dev.mode = Number(value);
        
        // Logic from original: update target temperature based on mode
        if (dev.mode === 1) {
          dev.targetTemp = dev.heating;
        } else if (dev.mode === 2) {
          dev.targetTemp = dev.cooling;
        } else if (dev.mode === 3) {
          dev.targetTemp = (dev.temperature <= dev.heating) ? dev.heating : dev.cooling;
        }
        
        this.platform.getInfusion().setThermostatMode(device.address, Number(value));
      });
      mode.onGet(() => {
        const dev = this.accessory.context.device as any;
        return dev?.mode ?? 0;
      });

      // Current Temperature
      const currentTemp = primary.getCharacteristic(this.Characteristic.CurrentTemperature);
      currentTemp.removeAllListeners('get');
      currentTemp.onGet(() => {
        const dev = this.accessory.context.device as any;
        const temp = dev?.temperature ?? 20;
        return Math.min(100, Math.max(-50, temp)); // Clamp to valid range
      });

      // Current Heating/Cooling State
      const currentState = primary.getCharacteristic(this.Characteristic.CurrentHeatingCoolingState);
      currentState.removeAllListeners('get');
      currentState.onGet(() => {
        const dev = this.accessory.context.device as any;
        return dev?.current ?? 0;
      });

      // Heating Threshold Temperature
      const heatingThreshold = primary.getCharacteristic(this.Characteristic.HeatingThresholdTemperature);
      heatingThreshold.removeAllListeners('get');
      heatingThreshold.onGet(() => {
        const dev = this.accessory.context.device as any;
        const heating = dev?.heating ?? 20;
        return Math.min(25, Math.max(10, heating)); // Clamp to valid range (10-25°C)
      });

      // Cooling Threshold Temperature
      const coolingThreshold = primary.getCharacteristic(this.Characteristic.CoolingThresholdTemperature);
      coolingThreshold.removeAllListeners('get');
      coolingThreshold.onGet(() => {
        const dev = this.accessory.context.device as any;
        return dev?.cooling ?? 25;
      });

      // Initialize thermostat state (from original code)
      this.platform.getInfusion().Thermostat_GetIndoorTemperature(device.address);
      this.platform.getInfusion().Thermostat_GetState(device.address);
      this.platform.getInfusion().Thermostat_GetHeating(device.address);
      this.platform.getInfusion().Thermostat_GetCooling(device.address);

      this.accessory.category = this.platform.api.hap.Categories.THERMOSTAT;
    }

    if (!primary) {
      this.platform.log.warn(`Unsupported device type ${device.type} for ${this.accessory.displayName}`);
      return;
    }

    primary.displayName = device.name;
    primary.setCharacteristic(this.Characteristic.Name, device.name);

    // Mark primary (helps Home app pick the right tile)
    try {
      (primary as any).setPrimaryService?.(true);
    } catch {}

    // PRUNE stale/incorrect services (keep AccessoryInformation + current primary)
    for (const s of [...this.accessory.services]) {
      if (s === primary) continue;
      if (s === info) continue;
      // Remove anything else (e.g., an old Switch lingering on a dimmer)
      this.accessory.removeService(s);
    }
  }

  private safeRemoveCharacteristic(svc: Service, C: any) {
    const c = svc.getCharacteristic(C);
    if (c) {
      try {
        svc.removeCharacteristic(c);
      } catch {
        // ignore if Homebridge version doesn’t support removal
      }
    }
  }
}
