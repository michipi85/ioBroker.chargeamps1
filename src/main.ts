import * as utils from "@iobroker/adapter-core";
import {
  ChargeAmpsApi,
  ChargeAmpsApiError,
  ChargePoint,
  ChargePointSettings,
  ConnectorSettings,
  Measurement,
} from "./chargeamps-api";

interface ConnectorRef {
  chargePointId: string;
  connectorId: number;
}

class ChargeampsHalo extends utils.Adapter {
  private api: ChargeAmpsApi | undefined;
  private pollTimer: ioBroker.Timeout | undefined;
  private readonly chargePointIds = new Map<string, string>();
  private readonly connectorIds = new Map<string, ConnectorRef>();
  private chargePointSettings = new Map<string, ChargePointSettings>();
  private connectorSettings = new Map<string, ConnectorSettings>();
  private polling = false;

  public constructor(options: Partial<utils.AdapterOptions> = {}) {
    super({
      ...options,
      name: "chargeamps1",
    });

    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }

  private async onReady(): Promise<void> {
    await this.ensureBaseObjects();
    await this.setState("info.connection", false, true);

    if (!this.config.email || !this.config.password || !this.config.apiKey) {
      this.log.warn("Please configure email, password and API key.");
      return;
    }

    this.api = new ChargeAmpsApi({
      email: this.config.email,
      password: this.config.password,
      apiKey: this.config.apiKey,
      apiBaseUrl: this.config.apiBaseUrl,
    });

    await this.subscribeStatesAsync("*");
    await this.poll();
  }

  private onUnload(callback: () => void): void {
    try {
      if (this.pollTimer) {
        this.clearTimeout(this.pollTimer);
        this.pollTimer = undefined;
      }
      void this.setState("info.connection", false, true);
      callback();
    } catch {
      callback();
    }
  }

  private schedulePoll(): void {
    if (this.pollTimer) {
      this.clearTimeout(this.pollTimer);
    }

    const intervalSeconds = Math.max(30, Number(this.config.pollInterval) || 60);
    this.pollTimer = this.setTimeout(() => void this.poll(), intervalSeconds * 1000);
  }

  private async poll(): Promise<void> {
    if (!this.api || this.polling) {
      return;
    }

    this.polling = true;
    try {
      const chargePoints = await this.api.getChargePoints();
      for (const chargePoint of chargePoints) {
        await this.ensureChargePointObjects(chargePoint);
        await this.updateChargePoint(chargePoint);
      }
      await this.setState("info.connection", true, true);
    } catch (error) {
      await this.setState("info.connection", false, true);
      this.log.warn(`Charge Amps polling failed: ${formatError(error)}`);
    } finally {
      this.polling = false;
      this.schedulePoll();
    }
  }

  private async updateChargePoint(chargePoint: ChargePoint): Promise<void> {
    if (!this.api) {
      return;
    }

    const cpId = objectId(chargePoint.id);
    this.chargePointIds.set(cpId, chargePoint.id);

    await this.setStateChangedAsync(`chargepoints.${cpId}.info.name`, chargePoint.name, true);
    await this.setStateChangedAsync(`chargepoints.${cpId}.info.type`, chargePoint.type, true);
    await this.setStateChangedAsync(`chargepoints.${cpId}.info.firmwareVersion`, chargePoint.firmwareVersion, true);
    await this.setStateChangedAsync(`chargepoints.${cpId}.info.hardwareVersion`, chargePoint.hardwareVersion, true);
    await this.setStateChangedAsync(`chargepoints.${cpId}.info.isLoadbalanced`, chargePoint.isLoadbalanced, true);

    const [status, settings] = await Promise.all([
      this.api.getChargePointStatus(chargePoint.id),
      this.api.getChargePointSettings(chargePoint.id),
    ]);
    this.chargePointSettings.set(chargePoint.id, settings);

    await this.setStateChangedAsync(`chargepoints.${cpId}.status`, status.status, true);
    await this.setStateChangedAsync(`chargepoints.${cpId}.settings.dimmer`, settings.dimmer, true);
    await this.setStateChangedAsync(`chargepoints.${cpId}.settings.downLight`, settings.downLight, true);

    for (const connector of chargePoint.connectors) {
      const connectorId = objectId(String(connector.connectorId));
      this.connectorIds.set(`${cpId}.${connectorId}`, {
        chargePointId: chargePoint.id,
        connectorId: connector.connectorId,
      });

      const connectorSettings = await this.api.getConnectorSettings(chargePoint.id, connector.connectorId);
      this.connectorSettings.set(connectorKey(chargePoint.id, connector.connectorId), connectorSettings);
      const connectorStatus = status.connectorStatuses.find((item) => item.connectorId === connector.connectorId);

      await this.setStateChangedAsync(
        `chargepoints.${cpId}.connectors.${connectorId}.info.type`,
        connector.type,
        true,
      );
      await this.setStateChangedAsync(
        `chargepoints.${cpId}.connectors.${connectorId}.settings.mode`,
        connectorSettings.mode,
        true,
      );
      await this.setStateChangedAsync(
        `chargepoints.${cpId}.connectors.${connectorId}.settings.rfidLock`,
        connectorSettings.rfidLock,
        true,
      );
      await this.setStateChangedAsync(
        `chargepoints.${cpId}.connectors.${connectorId}.settings.cableLock`,
        connectorSettings.cableLock,
        true,
      );
      await this.setStateChangedAsync(
        `chargepoints.${cpId}.connectors.${connectorId}.settings.maxCurrent`,
        connectorSettings.maxCurrent ?? null,
        true,
      );

      if (connectorStatus) {
        const base = `chargepoints.${cpId}.connectors.${connectorId}.status`;
        await this.setStateChangedAsync(`${base}.status`, connectorStatus.status, true);
        await this.setStateChangedAsync(`${base}.totalConsumptionKwh`, connectorStatus.totalConsumptionKwh, true);
        await this.setStateChangedAsync(`${base}.sessionId`, connectorStatus.sessionId ?? null, true);
        await this.setStateChangedAsync(`${base}.startTime`, connectorStatus.startTime ?? "", true);
        await this.setStateChangedAsync(`${base}.endTime`, connectorStatus.endTime ?? "", true);
        await this.updateMeasurements(`${base}.measurements`, connectorStatus.measurements || []);
      }
    }
  }

  private async updateMeasurements(base: string, measurements: Measurement[]): Promise<void> {
    await this.extendObjectAsync(base, {
      type: "channel",
      common: { name: "Measurements" },
      native: {},
    });

    for (const measurement of measurements) {
      const phase = objectId(measurement.phase);
      await this.extendObjectAsync(`${base}.${phase}`, {
        type: "channel",
        common: { name: measurement.phase },
        native: {},
      });
      await this.ensureState(`${base}.${phase}.current`, "Current", "number", "value.current", "A", false);
      await this.ensureState(`${base}.${phase}.voltage`, "Voltage", "number", "value.voltage", "V", false);
      await this.setStateChangedAsync(`${base}.${phase}.current`, measurement.current, true);
      await this.setStateChangedAsync(`${base}.${phase}.voltage`, measurement.voltage, true);
    }
  }

  private async ensureBaseObjects(): Promise<void> {
    await this.extendObjectAsync("info", {
      type: "channel",
      common: { name: "Information" },
      native: {},
    });
    await this.ensureState("info.connection", "Connected", "boolean", "indicator.connected", undefined, false);
    await this.extendObjectAsync("chargepoints", {
      type: "channel",
      common: { name: "Charge points" },
      native: {},
    });
  }

  private async ensureChargePointObjects(chargePoint: ChargePoint): Promise<void> {
    const cpId = objectId(chargePoint.id);
    await this.extendObjectAsync(`chargepoints.${cpId}`, {
      type: "device",
      common: { name: chargePoint.name },
      native: { chargePointId: chargePoint.id },
    });
    await this.extendObjectAsync(`chargepoints.${cpId}.info`, {
      type: "channel",
      common: { name: "Information" },
      native: {},
    });
    await this.ensureState(`chargepoints.${cpId}.info.name`, "Name", "string", "info.name", undefined, false);
    await this.ensureState(`chargepoints.${cpId}.info.type`, "Type", "string", "info.type", undefined, false);
    await this.ensureState(
      `chargepoints.${cpId}.info.firmwareVersion`,
      "Firmware version",
      "string",
      "info.firmware",
      undefined,
      false,
    );
    await this.ensureState(
      `chargepoints.${cpId}.info.hardwareVersion`,
      "Hardware version",
      "string",
      "info.hardware",
      undefined,
      false,
    );
    await this.ensureState(
      `chargepoints.${cpId}.info.isLoadbalanced`,
      "Load balanced",
      "boolean",
      "indicator",
      undefined,
      false,
    );
    await this.ensureState(`chargepoints.${cpId}.status`, "Status", "string", "value", undefined, false);

    await this.extendObjectAsync(`chargepoints.${cpId}.settings`, {
      type: "channel",
      common: { name: "Settings" },
      native: {},
    });
    await this.ensureState(`chargepoints.${cpId}.settings.dimmer`, "Dimmer", "string", "level.dimmer", undefined, true);
    await this.ensureState(
      `chargepoints.${cpId}.settings.downLight`,
      "Down light",
      "boolean",
      "switch.light",
      undefined,
      true,
    );

    await this.extendObjectAsync(`chargepoints.${cpId}.commands`, {
      type: "channel",
      common: { name: "Commands" },
      native: {},
    });
    await this.ensureState(`chargepoints.${cpId}.commands.reboot`, "Reboot", "boolean", "button", undefined, true);

    await this.extendObjectAsync(`chargepoints.${cpId}.connectors`, {
      type: "channel",
      common: { name: "Connectors" },
      native: {},
    });

    for (const connector of chargePoint.connectors) {
      const connectorId = objectId(String(connector.connectorId));
      const base = `chargepoints.${cpId}.connectors.${connectorId}`;
      await this.extendObjectAsync(base, {
        type: "channel",
        common: { name: `Connector ${connector.connectorId}` },
        native: { chargePointId: chargePoint.id, connectorId: connector.connectorId },
      });
      await this.extendObjectAsync(`${base}.info`, {
        type: "channel",
        common: { name: "Information" },
        native: {},
      });
      await this.ensureState(`${base}.info.type`, "Type", "string", "info.type", undefined, false);

      await this.extendObjectAsync(`${base}.status`, {
        type: "channel",
        common: { name: "Status" },
        native: {},
      });
      await this.ensureState(`${base}.status.status`, "Status", "string", "value", undefined, false);
      await this.ensureState(
        `${base}.status.totalConsumptionKwh`,
        "Total consumption",
        "number",
        "value.power.consumption",
        "kWh",
        false,
      );
      await this.ensureState(`${base}.status.sessionId`, "Session ID", "number", "value", undefined, false);
      await this.ensureState(`${base}.status.startTime`, "Start time", "string", "date", undefined, false);
      await this.ensureState(`${base}.status.endTime`, "End time", "string", "date", undefined, false);

      await this.extendObjectAsync(`${base}.settings`, {
        type: "channel",
        common: { name: "Settings" },
        native: {},
      });
      await this.ensureState(`${base}.settings.mode`, "Mode", "string", "value", undefined, true);
      await this.ensureState(`${base}.settings.rfidLock`, "RFID lock", "boolean", "switch.lock", undefined, true);
      await this.ensureState(`${base}.settings.cableLock`, "Cable lock", "boolean", "switch.lock", undefined, true);
      await this.ensureState(`${base}.settings.maxCurrent`, "Maximum current", "number", "level.current", "A", true);

      await this.extendObjectAsync(`${base}.commands`, {
        type: "channel",
        common: { name: "Commands" },
        native: {},
      });
      await this.ensureState(`${base}.commands.remoteStart`, "Remote start", "boolean", "button", undefined, true);
      await this.ensureState(`${base}.commands.remoteStop`, "Remote stop", "boolean", "button", undefined, true);
      await this.ensureState(`${base}.commands.enableCharging`, "Switch wallbox on", "boolean", "button", undefined, true);
      await this.ensureState(
        `${base}.commands.disableCharging`,
        "Set wallbox to standby",
        "boolean",
        "button",
        undefined,
        true,
      );
      await this.ensureState(`${base}.commands.useSchedule`, "Use schedule", "boolean", "button", undefined, true);
    }
  }

  private async ensureState(
    id: string,
    name: string,
    type: ioBroker.CommonType,
    role: string,
    unit: string | undefined,
    write: boolean,
  ): Promise<void> {
    await this.extendObjectAsync(id, {
      type: "state",
      common: {
        name,
        type,
        role,
        read: true,
        write,
        unit,
      },
      native: {},
    });
  }

  private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
    if (!state || state.ack || !this.api) {
      return;
    }

    const ownId = `${this.namespace}.`;
    if (!id.startsWith(ownId)) {
      return;
    }

    const relativeId = id.slice(ownId.length);
    try {
      let resetCommand = false;
      if (relativeId.endsWith(".commands.reboot") && state.val === true) {
        resetCommand = true;
        await this.handleReboot(relativeId);
      } else if (relativeId.endsWith(".commands.remoteStart") && state.val === true) {
        resetCommand = true;
        await this.handleRemoteStart(relativeId);
      } else if (relativeId.endsWith(".commands.remoteStop") && state.val === true) {
        resetCommand = true;
        await this.handleRemoteStop(relativeId);
      } else if (relativeId.endsWith(".commands.enableCharging") && state.val === true) {
        resetCommand = true;
        await this.handleConnectorModeCommand(relativeId, "On");
      } else if (relativeId.endsWith(".commands.disableCharging") && state.val === true) {
        resetCommand = true;
        await this.handleConnectorModeCommand(relativeId, "Off");
      } else if (relativeId.endsWith(".commands.useSchedule") && state.val === true) {
        resetCommand = true;
        await this.handleConnectorModeCommand(relativeId, "Schedule");
      } else if (relativeId.includes(".settings.")) {
        await this.handleSetting(relativeId, state.val);
      }
      await this.setStateAsync(relativeId, resetCommand ? false : state.val, true);
      await this.poll();
    } catch (error) {
      this.log.warn(`Command ${relativeId} failed: ${formatError(error)}`);
      if (relativeId.includes(".commands.") && state.val === true) {
        await this.setStateAsync(relativeId, false, true);
      }
    }
  }

  private async handleReboot(relativeId: string): Promise<void> {
    const [, cpId] = relativeId.split(".");
    const chargePointId = this.chargePointIds.get(cpId);
    if (chargePointId) {
      await this.api?.reboot(chargePointId);
    }
  }

  private async handleConnectorModeCommand(relativeId: string, mode: string): Promise<void> {
    const ref = this.resolveConnector(relativeId);
    if (!ref) {
      return;
    }

    const key = connectorKey(ref.chargePointId, ref.connectorId);
    const settings = this.connectorSettings.get(key);
    if (!settings) {
      return;
    }

    const changed = { ...settings, mode };
    await this.api?.setConnectorSettings(changed);
    this.connectorSettings.set(key, changed);

    const parts = relativeId.split(".");
    await this.setStateChangedAsync(`chargepoints.${parts[1]}.connectors.${parts[3]}.settings.mode`, mode, true);
  }

  private async handleRemoteStart(relativeId: string): Promise<void> {
    const ref = this.resolveConnector(relativeId);
    if (!ref) {
      return;
    }

    if (!this.config.rfid) {
      this.log.warn("Remote start was skipped because the Charge Amps API requires an RFID for this command.");
      return;
    }

    await this.api?.remoteStart(ref.chargePointId, ref.connectorId, {
      rfid: this.config.rfid,
      rfidFormat: this.config.rfidFormat || "Hex",
      rfidLength: rfidLength(this.config.rfid, this.config.rfidFormat, Number(this.config.rfidLength)),
      externalTransactionId: `iobroker-${Date.now()}`,
    });
  }

  private async handleRemoteStop(relativeId: string): Promise<void> {
    const ref = this.resolveConnector(relativeId);
    if (ref) {
      await this.api?.remoteStop(ref.chargePointId, ref.connectorId);
    }
  }

  private async handleSetting(relativeId: string, value: ioBroker.StateValue): Promise<void> {
    const parts = relativeId.split(".");
    const cpId = parts[1];
    const chargePointId = this.chargePointIds.get(cpId);
    if (!chargePointId) {
      return;
    }

    if (parts[2] === "settings") {
      const settings = this.chargePointSettings.get(chargePointId);
      if (!settings) {
        return;
      }
      const changed = { ...settings };
      if (parts[3] === "dimmer") {
        changed.dimmer = String(value);
      } else if (parts[3] === "downLight") {
        changed.downLight = Boolean(value);
      }
      await this.api?.setChargePointSettings(changed);
      this.chargePointSettings.set(chargePointId, changed);
      return;
    }

    const ref = this.resolveConnector(relativeId);
    if (!ref) {
      return;
    }
    const settings = this.connectorSettings.get(connectorKey(ref.chargePointId, ref.connectorId));
    if (!settings) {
      return;
    }

    const changed = { ...settings };
    const field = parts[5];
    if (field === "mode") {
      changed.mode = String(value);
    } else if (field === "rfidLock") {
      changed.rfidLock = Boolean(value);
    } else if (field === "cableLock") {
      changed.cableLock = Boolean(value);
    } else if (field === "maxCurrent") {
      if (value === null || value === "") {
        changed.maxCurrent = null;
      } else {
        const maxCurrent = Number(value);
        if (!Number.isFinite(maxCurrent)) {
          throw new Error(`Invalid maxCurrent value: ${String(value)}`);
        }
        changed.maxCurrent = maxCurrent;
      }
    }

    await this.api?.setConnectorSettings(changed);
    this.connectorSettings.set(connectorKey(ref.chargePointId, ref.connectorId), changed);
  }

  private resolveConnector(relativeId: string): ConnectorRef | undefined {
    const parts = relativeId.split(".");
    return this.connectorIds.get(`${parts[1]}.${parts[3]}`);
  }
}

function objectId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function connectorKey(chargePointId: string, connectorId: number): string {
  return `${chargePointId}:${connectorId}`;
}

function rfidLength(rfid: string, format: string | undefined, configuredLength: number): number {
  const normalizedFormat = (format || "Hex").toLowerCase();
  const hex = rfid.replace(/[^a-fA-F0-9]/g, "");

  if (normalizedFormat === "hex" && Number.isFinite(configuredLength) && configuredLength > 0) {
    return configuredLength === hex.length && hex.length % 2 === 0 ? hex.length / 2 : configuredLength;
  }

  if (Number.isFinite(configuredLength) && configuredLength > 0) {
    return configuredLength;
  }

  return normalizedFormat === "hex" ? Math.ceil(hex.length / 2) : rfid.length;
}

function formatError(error: unknown): string {
  if (error instanceof ChargeAmpsApiError) {
    const body = error.body ? `: ${error.body.slice(0, 500)}` : "";
    return `${error.message}${body}`;
  }
  return error instanceof Error ? error.message : String(error);
}

if (require.main !== module) {
  module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new ChargeampsHalo(options);
} else {
  (() => new ChargeampsHalo())();
}
