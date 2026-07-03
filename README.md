# Homebridge Vantage Controls
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=flat)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

A [Homebridge](https://homebridge.io/) plugin for Vantage Controls InFusion system. 
This plugin replaces the one sold on smarterhome.io allowing anyone to download on the platform of their choice.

## Features

- **Lighting Control**: Supports dimmers, RGB lights, and relays
- **Thermostat Control**: Full HVAC control with heating/cooling modes
- **Blind Control**: Window covering automation
- **Real-time Updates**: Live status updates from your InFusion controller
- **SSL Support**: Secure connections to your controller
- **Device Filtering**: Include/exclude specific devices by VID range

## Installation

1. Install Homebridge:
```bash
npm install -g homebridge
```

2. Install this plugin:
```bash
npm install -g homebridge-vantage-lts
```

3. Add the platform to your `config.json`:
```json
{
  "platforms": [
    {
      "platform": "VantageControls",
      "name": "Vantage Controls",
      "ipaddress": "192.168.1.100",
      "username": "your_username",
      "password": "your_password",
      "usecache": true,
      "omit": "1234,5678",
      "range": "1000,2000"
    }
  ]
}
```

## Configuration

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | string | Yes | Must be "VantageControls" |
| `name` | string | Yes | Display name for the platform |
| `ipaddress` | string | Yes | IP address of your InFusion controller |
| `username` | string | No | Username for authentication |
| `password` | string | No | Password for authentication |
| `usecache` | boolean | No | Use cached configuration (default: true) |
| `omit` | string | No | Comma-separated list of VIDs to exclude |
| `range` | string | No | Comma-separated VID range (min,max) |

## Supported Devices

### Lighting
- **Dimmers**: Variable brightness control
- **RGB Lights**: Full color control with HSL values
- **Relays**: On/off switches for non-dimmable loads

### HVAC
- **Thermostats**: Temperature control with heating/cooling modes
- **Auto Mode**: Automatic temperature regulation
- **Temperature Units**: Celsius/Fahrenheit support

### Window Coverings
- **Blinds**: Position control (0-100%)
- **Shades**: Motorized window coverings

## Development

1. Clone the repository:
```bash
git clone https://github.com/smarterhomeapp/homebridge-vantage.git
cd homebridge-vantage
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Link for development:
```bash
npm run dev
```

## Troubleshooting

### Connection Issues
- Verify the IP address is correct
- Check if SSL is required (ports 3010/2010 vs 3001/2001)
- Ensure username/password are correct if authentication is enabled

### Device Not Appearing
- Check the `omit` and `range` parameters
- Verify the device VID is within the specified range
- Check Homebridge logs for discovery errors

### Performance Issues
- Reduce the number of devices by using the `omit` parameter
- Disable cache if configuration changes frequently
- Consider using device ranges to limit discovery

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- [GitHub Issues](https://github.com/smarterhomeapp/homebridge-vantage/issues)
- [Homebridge Community](https://github.com/homebridge/homebridge) 
