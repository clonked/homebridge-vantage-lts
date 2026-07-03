# Migration Guide: Old to New Homebridge Plugin Format

This guide helps you migrate from the old `index.js` format to the new modern Homebridge plugin format.

## What Changed

### File Structure
**Old Structure:**
```
homebridge-vantage/
├── index.js
```

**New Structure:**
```
homebridge-vantage/
├── src/
│   ├── index.ts
│   ├── platform.ts
│   ├── platformAccessory.ts
│   ├── vantageInfusion.ts
│   ├── types.ts
│   └── settings.ts
├── package.json
├── tsconfig.json
├── .eslintrc.js
├── README.md
└── ... (other files)
```

### Configuration
**Old config.json:**
```json
{
  "platforms": [
    {
      "platform": "homebridge-vantage",
      "name": "VantageControls",
      "ipaddress": "192.168.1.100"
    }
  ]
}
```

**New config.json:**
```json
{
  "platforms": [
    {
      "platform": "VantageControls",
      "name": "Vantage Controls",
      "ipaddress": "192.168.1.100"
    }
  ]
}
```

## Migration Steps

### 1. Backup Your Configuration
```bash
cp ~/.homebridge/config.json ~/.homebridge/config.json.backup
```

### 2. Update Your Configuration
Change your `config.json`:
- Update `"platform": "homebridge-vantage"` to `"platform": "VantageControls"`
- The `"name"` field is now required and should be descriptive

### 3. Install the New Plugin
```bash
npm uninstall -g homebridge-vantage
npm install -g homebridge-vantage@latest
```

### 4. Restart Homebridge
```bash
sudo systemctl restart homebridge
# or
sudo systemctl restart homebridge@youruser
```

## New Features

### Enhanced Type Safety
- Full TypeScript implementation
- Better error handling
- Improved code organization

### Better Configuration
- Web UI configuration support
- Validation of configuration parameters
- Clearer error messages

### Improved Performance
- Better memory management
- Optimized device discovery
- Enhanced caching

### Modern Architecture
- Dynamic platform plugin format
- Proper accessory lifecycle management
- Better event handling

## Troubleshooting

### Plugin Not Found
If you see "Plugin not found" errors:
1. Verify the platform name is `"VantageControls"`
2. Check that the plugin is properly installed
3. Restart Homebridge completely

### Devices Not Appearing
If your devices don't appear:
1. Check the Homebridge logs for errors
2. Verify your IP address is correct
3. Ensure your controller is accessible
4. Check the `omit` and `range` parameters

### Configuration Errors
If you get configuration errors:
1. Validate your JSON syntax
2. Check that all required fields are present
3. Verify IP address format

## Rollback

If you need to rollback to the old version:
```bash
npm uninstall -g homebridge-vantage
npm install -g homebridge-vantage@0.x.x
```

Then restore your old configuration format.

## Support

If you encounter issues during migration:
1. Check the [README.md](README.md) for detailed documentation
2. Review the [CHANGELOG.md](CHANGELOG.md) for changes
3. Open an issue on GitHub with your error logs
4. Join the Homebridge community for help

## Breaking Changes

- Platform name changed from `"homebridge-vantage"` to `"VantageControls"`
- Some internal APIs have changed (for developers)
- Configuration format is more strict
- Node.js 18+ is now required

## Benefits of Migration

- **Better Performance**: Optimized code and memory usage
- **Enhanced Reliability**: Better error handling and recovery
- **Future-Proof**: Modern plugin architecture
- **Better Support**: Active development and community support
- **Type Safety**: Reduced bugs and better development experience 