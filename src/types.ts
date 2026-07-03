export type VantageType = 'relay' | 'dimmer' | 'rgb' | 'blind' | 'thermostat';

export interface VantageDeviceBase {
  name: string;
  address: string; // VID as string
  vid: string;
  objectType: string;
  type: VantageType;
}

export interface VantageRelay extends VantageDeviceBase {
  type: 'relay';
  bri: number;
  power: boolean;
  loadType?: string;
}

export interface VantageDimmer extends VantageDeviceBase {
  type: 'dimmer';
  bri: number;
  power: boolean;
  loadType?: string;
}

export interface VantageRGB extends VantageDeviceBase {
  type: 'rgb';
  bri: number;
  power: boolean;
  hue: number;
  sat: number;
  loadType?: string;
}

export interface VantageBlind extends VantageDeviceBase {
  type: 'blind';
  pos: number;
  posState: number; // 0=decreasing,1=increasing,2=stopped
}

export interface VantageThermostat extends VantageDeviceBase {
  type: 'thermostat';
  temperature: number;
  targetTemp: number;
  heating: number;
  cooling: number;
  mode: number; // 0 off, 1 heat, 2 cool, 3 auto
  current: number; // 0 off, 1 heat, 2 cool
  units: 0 | 1; // 0 C, 1 F
}

export type VantageDevice = VantageRelay | VantageDimmer | VantageRGB | VantageBlind | VantageThermostat;

export interface VantageConfig {
  platform: 'VantageControls';
  ipaddress: string;
  username?: string;
  password?: string;
  usecache?: boolean;
  omit?: string;
  range?: string;
  forceSSL?: boolean;
}
