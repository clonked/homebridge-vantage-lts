import {
  API,
  APIEvent,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { VantageInfusion } from './vantageInfusion';
import type { VantageDevice } from './types';
import { VantagePlatformAccessory } from './platformAccessory';

export class VantagePlatform implements DynamicPlatformPlugin {
  public readonly accessories: PlatformAccessory[] = [];

  private infusion!: VantageInfusion;
  private syncedOnce = false; // prevent double-sync when both event + promise fire
  private accessoriesByVid = new Map<string, PlatformAccessory>();
  private realtimeWired = false;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (!config || !config.ipaddress) {
      this.log.error(`[${PLATFORM_NAME}] Missing required config "ipaddress" — plugin will not start.`);
      return;
    }

    // Construct infusion
    this.infusion = new VantageInfusion({
      ipaddress: String(config.ipaddress),
      username: (config as any).username ?? '',
      password: (config as any).password ?? '',
      usecache: (config as any).usecache ?? true,
      omit: (config as any).omit ?? '',
      range: (config as any).range ?? '0,999999999',
      forceSSL: (config as any).forceSSL ?? false,
      log: this.log,
    });

    // ----- Standard HB boot path -----
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, async () => {
      try {
        await this.infusion.start();
        if (!this.syncedOnce) {
          const devices = await this.infusion.discoverDevices();
          await this.syncAccessories(devices);
          this.finalizeLogs();
        }
      } catch (e: any) {
        this.log.error(`Startup failed: ${e?.message ?? String(e)}`);
      }
    });
  }

  // Cache any restored accessories
  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  // Reconcile cached accessories with current device list
  private async syncAccessories(devices: VantageDevice[]) {
    const uuidFor = (d: VantageDevice) => this.api.hap.uuid.generate(String(d.vid));

    // Map current devices
    const wanted = new Map<string, VantageDevice>();
    for (const d of devices) wanted.set(uuidFor(d), d);

    // Update existing / mark seen
    const seen = new Set<string>();
    const toUpdate: PlatformAccessory[] = [];

    for (const acc of this.accessories) {
      const d = wanted.get(acc.UUID);
      if (d) {
        // Update name/context and re-bind
        acc.displayName = d.name.replace(/[^\w ]/g, '');
        acc.context.device = d;
        new VantagePlatformAccessory(this, acc);
        seen.add(acc.UUID);
        toUpdate.push(acc);

        if (d.vid) this.accessoriesByVid.set(String(d.vid), acc);
      }
    }

    if (toUpdate.length) {
      this.api.updatePlatformAccessories(toUpdate);
      this.log.info(`Updated ${toUpdate.length} existing accessories`);
    }

    // Register new
    const toRegister: PlatformAccessory[] = [];
    for (const d of devices) {
      const uuid = uuidFor(d);
      if (seen.has(uuid)) continue;

      const acc = new this.api.platformAccessory(d.name, uuid);
      acc.context.device = d;
      new VantagePlatformAccessory(this, acc);
      toRegister.push(acc);
      this.accessories.push(acc);

      if (d.vid) this.accessoriesByVid.set(String(d.vid), acc);
    }
    if (toRegister.length) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toRegister);
      this.log.info(`Registered ${toRegister.length} new accessories`);
    }

    // Unregister stale
    const toUnregister = this.accessories.filter((acc) => !wanted.has(acc.UUID));
    if (toUnregister.length) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toUnregister);
      this.log.info(`Unregistered ${toUnregister.length} stale accessories`);
      // Remove from local cache & VID map
      for (const acc of toUnregister) {
        const vid = acc?.context?.device?.vid;
        if (vid) this.accessoriesByVid.delete(String(vid));
        const idx = this.accessories.findIndex((a) => a.UUID === acc.UUID);
        if (idx >= 0) this.accessories.splice(idx, 1);
      }
    }

    // Arm realtime listeners once we know the VID→accessory map
    this.wireRealtimeListeners();

    this.syncedOnce = true;
  }

  private wireRealtimeListeners() {
    if (this.realtimeWired) return;
    this.realtimeWired = true;

    const S = this.api.hap.Service;
    const C = this.api.hap.Characteristic;

    // LIGHTS (relay / dimmer / rgb)
    this.infusion.on('loadStatusChange', (vid: number, value: number, command?: number) => {
      const acc = this.accessoriesByVid.get(String(vid));
      if (!acc) return;

      const dev = acc.context.device as VantageDevice;
      if (!dev) return;
      this.log.info("loadStatusChange (VID=%s, Name=%s, Bri:%d)", vid, dev.name, value)

      if (dev.type === 'relay' || dev.type === 'dimmer' || dev.type === 'rgb') {
        (dev as any).bri = Number(value);
        (dev as any).power = (dev as any).bri > 0;
      }

      if (dev.type === 'relay') {
        acc.getService(S.Switch)?.updateCharacteristic(C.On, (dev as any).power);
        return;
      }

      if (dev.type === 'dimmer' || dev.type === 'rgb') {
        const lb = acc.getService(S.Lightbulb);
        lb?.updateCharacteristic(C.On, (dev as any).power);
        
        // Update brightness value without triggering UI updates (modern approach)
        const brightnessChar = lb?.getCharacteristic(C.Brightness);
        if (brightnessChar) {
          brightnessChar.value = (dev as any).bri;
        }

        // RGB incremental HSL feedback
        if (dev.type === 'rgb' && typeof command === 'number') {
          if (command === 0) (dev as any).hue = Number(value);
          if (command === 1) (dev as any).sat = Number(value);
          if (command === 2) (dev as any).bri = Number(value);

          const hueChar = lb?.getCharacteristic(C.Hue);
          const satChar = lb?.getCharacteristic(C.Saturation);
          const briChar = lb?.getCharacteristic(C.Brightness);
          
          if (hueChar) hueChar.value = (dev as any).hue ?? 0;
          if (satChar) satChar.value = (dev as any).sat ?? 0;
          if (briChar) briChar.value = (dev as any).bri ?? 0;
        }
      }
    });

    // BLINDS
    this.infusion.on('blindStatusChange', (vid: number, value: number) => {
      const acc = this.accessoriesByVid.get(String(vid));
      if (!acc) return;

      const dev = acc.context.device as VantageDevice;
      if (!dev) return;
      this.log.info("blindStatusChange (VID=%s, Name=%s, Pos:%d)", vid, dev.name, value);

      (dev as any).pos = Number(value);
      const wc = acc.getService(S.WindowCovering);
      wc?.updateCharacteristic(C.CurrentPosition, (dev as any).pos);
      wc?.updateCharacteristic(C.PositionState, 2); // Stopped
    });

    // THERMOSTATS — temp (legacy event) - loops through ALL thermostats like original
    this.infusion.on('thermostatDidChange', (value: number) => {
      // Loop through all thermostat accessories and refresh their state
      for (const [vid, acc] of this.accessoriesByVid) {
        const dev = acc.context.device as VantageDevice;
        if (dev && dev.type === 'thermostat') {
          const svc = acc.getService(S.Thermostat);
          if (svc) {
            // Refresh thermostat state (from original code)
            this.infusion.Thermostat_GetIndoorTemperature(vid);
            this.infusion.Thermostat_GetState(vid);
            this.infusion.Thermostat_GetHeating(vid);
            this.infusion.Thermostat_GetCooling(vid);
          }
        }
      }
    });

    // THERMOSTATS — temp
    this.infusion.on('thermostatIndoorTemperatureChange', (vid: number, temp: number) => {
      const acc = this.accessoriesByVid.get(String(vid));
      if (!acc) return;

      const dev = acc.context.device as VantageDevice;
      let temperature = Number(temp);
      
      // Validate temperature range (from original code)
      if (temperature > 100) {
        temperature = 100;
        this.log.warn(`Thermostat ${vid} reported invalid temperature ${temp}°C, capping at 100°C`);
      }
      
      (dev as any).temperature = temperature;
      this.log.info(`thermostatIndoorTemperatureChange (VID=${vid}, Name=${dev.name}, Temp=${temperature})`);

      acc.getService(S.Thermostat)
        ?.updateCharacteristic(C.CurrentTemperature, temperature);
    });

    // THERMOSTATS — mode/targets
    this.infusion.on('thermostatIndoorModeChange', (vid: number, mode: number, targetTemp: number) => {
      const acc = this.accessoriesByVid.get(String(vid));
      if (!acc) return;

      const dev = acc.context.device as any;
      const svc = acc.getService(S.Thermostat);
      if (!svc || !dev) return;

      this.log.debug(`thermostatIndoorModeChange (VID=${vid}, Name=${dev.name}, Mode=${mode}, TargetTemp=${targetTemp})`);
      // this.log.info(`Before update - dev.mode=${dev.mode}, dev.targetTemp=${dev.targetTemp}, dev.heating=${dev.heating}, dev.cooling=${dev.cooling}`);

      if (targetTemp === -1) {
        // Only update mode when targetTemp is -1 (mode change without temperature)
        (dev as any).mode = mode;
        // compute current state from thresholds + mode
        let current = 0;
        if ((dev as any).temperature <= (dev as any).heating && mode === 1) current = 1;
        else if ((dev as any).temperature >= (dev as any).cooling && mode === 2) current = 2;
        else if (mode === 3) {
          if ((dev as any).temperature <= (dev as any).heating) current = 1;
          else if ((dev as any).temperature >= (dev as any).cooling) current = 2;
        }
        (dev as any).current = current; // Store the calculated current state
        svc.updateCharacteristic(C.CurrentHeatingCoolingState, current);
        svc.updateCharacteristic(C.TargetHeatingCoolingState, mode);
      } else {
        (dev as any).targetTemp = Math.min(38, targetTemp);
        if (mode === 1) {
          (dev as any).heating = Math.min(25, targetTemp); // HomeKit max is 25°C
          svc.updateCharacteristic(C.HeatingThresholdTemperature, (dev as any).heating);
        } else if (mode === 2) {
          (dev as any).cooling = Math.min(35, targetTemp);
          svc.updateCharacteristic(C.CoolingThresholdTemperature, (dev as any).cooling);
        }

        // Update target temperature based on mode (from original logic)
        if ((dev as any).mode === 1) (dev as any).targetTemp = (dev as any).heating;
        else if ((dev as any).mode === 2) (dev as any).targetTemp = (dev as any).cooling;
        else if ((dev as any).mode === 3) (dev as any).targetTemp = ((dev as any).temperature <= (dev as any).heating) ? (dev as any).heating : (dev as any).cooling;

        svc.updateCharacteristic(C.TargetTemperature, (dev as any).targetTemp);
        svc.updateCharacteristic(C.TargetHeatingCoolingState, (dev as any).mode);
        
        // this.log.info(`After update - dev.mode=${dev.mode}, dev.targetTemp=${dev.targetTemp}, dev.heating=${dev.heating}, dev.cooling=${dev.cooling}`);
      }
    });
  }

  private finalizeLogs() {
    // Legacy “store/open for business” logs
    this.log.warn('VantagePlatform for InFusion Controller (end configuration store)');
    this.log.warn('VantagePlatform for InFusion Controller (is open for business)');
  }

  // Exposed for accessory class
  public getInfusion(): VantageInfusion {
    return this.infusion;
  }

  public getApi(): API {
    return this.api;
  }
}
