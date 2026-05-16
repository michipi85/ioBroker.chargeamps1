![Logo](admin/chargeamps.png)
ioBroker.chargeamps1
ioBroker adapter for Charge Amps Halo wallboxes via the Charge Amps External REST API.

This adapter uses the official Charge Amps External API at https://eapi.charge.space. You need a Charge Amps account and an External API key. Charge Amps documents the API at https://eapi.charge.space/swagger/index.html; according to the public Python reference client, the current API version used here is v5.

Features
Login with email, password and External API key
Poll owned charge points and connector status
Expose current, voltage, total consumption, session and wallbox metadata
Change wallbox settings: dimmer and down light
Change connector settings: mode, RFID lock, cable lock and maximum current
Commands for remote start, remote stop and reboot
Configuration
Create an instance of the adapter and configure:

email: Charge Amps account email
password: Charge Amps account password
apiKey: External API key from Charge Amps
pollInterval: polling interval in seconds, minimum 30
rfid, rfidFormat, rfidLength: optional values used for remoteStart
The password and API key are marked as encrypted/protected native settings in io-package.json.

State Structure
The adapter creates states under:

chargeamps-halo.0.chargepoints.<chargePointId>
Connector states are placed below:

chargepoints.<chargePointId>.connectors.<connectorId>
Writable command states:

commands.reboot
connectors.<connectorId>.commands.remoteStart
connectors.<connectorId>.commands.remoteStop
Writable setting states:

settings.dimmer
settings.downLight
connectors.<connectorId>.settings.mode
connectors.<connectorId>.settings.rfidLock
connectors.<connectorId>.settings.cableLock
connectors.<connectorId>.settings.maxCurrent

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**
* (michipi85) initial release

## License
MIT License

Copyright (c) 2025 michipi85 <sammer.michael.ms@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.