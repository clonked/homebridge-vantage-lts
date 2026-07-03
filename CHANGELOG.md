# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2025-09-11

### Fixed
- Correct plugin identifier registration by setting `PLUGIN_NAME` to `homebridge-vantage-lts`.
- Resolved false negatives in port detection by probing 3001 and 2001 sequentially with backoff.
- Addressed TypeScript error when assigning `Promise.all` results; now using local results with boolean coercion.

### Changed
- Standardized XML parsing on `xml2js` to match implementation and dependencies.
- Minor logging improvements for port probing and connection lifecycle.

## [1.0.1] - 2025-09-27

### Fixed
- Fixed 1% brightness issue where lights would be set to 1% even when turned off or set to other percentages
- Removed redundant `setRelayOrDim` function that was causing inconsistent brightness behavior
- Improved brightness state management to match original implementation
- Updated real-time status updates to use modern Homebridge API (replaced deprecated `getValue()`)

### Changed
- Simplified brightness control logic by using `setBrightness` and `setRelay` functions directly
- Updated status update handling to prevent UI conflicts during slider interactions
- Real-time status updates
- SSL/TLS support
- Device filtering and range selection
- Configuration caching
- TypeScript implementation
- Modern Homebridge plugin architecture

### Features
- **Lighting**: Full control of dimmers, RGB lights, and relays
- **HVAC**: Complete thermostat control with auto mode
- **Window Coverings**: Position control for blinds and shades
- **Security**: SSL/TLS encrypted connections
- **Performance**: Configuration caching for faster discovery
- **Flexibility**: Device filtering and range selection

### Technical
- Converted from legacy JavaScript to TypeScript
- Updated to modern Homebridge plugin format
- Improved error handling and logging
- Better type safety and code organization
- Comprehensive documentation 