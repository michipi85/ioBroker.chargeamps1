![Logo](admin/chargeamps.png)

# Charge Amps for ioBroker

### ioBroker adapter for Charge Amps Halo wallboxes via the Charge Amps External REST API.

This adapter uses the official Charge Amps External API at https://eapi.charge.space. You need a Charge Amps account and an External API key. Charge Amps documents the API at https://eapi.charge.space/swagger/index.html; according to the public Python reference client, the current API version used here is v5.

## Features

- Login with email, password and External API key
- Poll owned charge points and connector status
- Expose current, voltage, total consumption, session and wallbox metadata
- Change wallbox settings: dimmer and down light
- Change connector settings: mode, RFID lock, cable lock and maximum current
- Commands for remote start, remote stop and reboot
- Convenience commands for connector mode: switch wallbox on, set wallbox to standby and use schedule
- Optional PV surplus automation for connector mode and maximum current

## Configuration

Create an instance of the adapter and configure:

- email: Charge Amps account email
- password: Charge Amps account password
- apiKey: External API key from Charge Amps
- pollInterval: polling interval in seconds, minimum 30

- rfid, rfidFormat, rfidLength: optional values used for remoteStart.
  For HEX RFID values, rfidLength is the byte length, not the number of HEX characters. Example: 8 HEX characters are 4 bytes. Set rfidLength to 0 to calculate it automatically.

### PV automation

The PV automation is optional and disabled by default. It controls the configured connector by writing `maxCurrent` and by using `remoteStart` / `remoteStop`. It does not switch the wallbox mode to `Off`.

- `pvAutomationEnabled`: enables the feature in the adapter configuration
- `automation.pv.enabled`: runtime switch in the object tree
- `pvGridPowerState`: external state with grid power in W
- `pvGridPowerExportIsNegative`: enabled when negative grid power means feed-in/export
- `pvBatterySocState`: optional external state with battery SOC in %
- `pvMinBatterySoc`: prevents PV charging when battery SOC is below this value
- `pvMinCurrent` / `pvMaxCurrent`: current limits in A
- `pvVoltage` / `pvPhases`: used to calculate current from surplus power
- `pvStartSurplusWatts`: surplus required before switching the connector to `On`
- `pvStopSurplusWatts`: surplus threshold for switching the connector to `Off`
- `pvStartDelaySeconds` / `pvStopDelaySeconds`: debounce delays before changing mode
- `pvCompletionStandbyDelaySeconds`: delay before switching the wallbox to standby after connector status `Finishing` or `SuspendedEV`

With the default values, the automation expects negative grid power for feed-in, starts the charging session after stable surplus of 4500 W, pauses it when surplus drops to 500 W or less, and regulates between 6 A and 16 A. Because Charge Amps requires RFID for `remoteStart`, configure RFID when PV automation should be able to resume charging automatically.
When charging is completed (`Finishing`) or ended by the car (`SuspendedEV`), the automation sets `settings.mode` to `Off` after the configured standby delay.

## Funktion

**The convenience commands change the connector mode:**

- enableCharging sets mode to On and switches the wallbox/connector on.
- disableCharging sets mode to Off and puts the wallbox/connector into standby.
- useSchedule sets mode to Schedule.

**Writable setting states:**

- settings.dimmer
- settings.downLight
- connectors.<connectorId>.settings.mode
- connectors.<connectorId>.settings.rfidLock
- connectors.<connectorId>.settings.cableLock
- connectors.<connectorId>.settings.maxCurrent

**PV automation states:**

- automation.pv.enabled
- automation.pv.active
- automation.pv.surplusPower
- automation.pv.batterySoc
- automation.pv.calculatedCurrent
- automation.pv.decision
- automation.pv.lastAction
- automation.pv.startPending
- automation.pv.stopPending
- automation.pv.completionPending

## ToDo

- implement the Schedule function

## Changelog

<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**

### v0.2.0 (2026-05-31)

- implement PV surplus

### v0.1.8 (2026-05-17)

- stable release

### v0.1.0 (2026-05-16)

- complete change from js to ts

### v0.0.1 (2025-05-07)

- initial release

## License

MIT License
