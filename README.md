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
