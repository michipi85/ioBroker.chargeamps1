import * as utils from "@iobroker/adapter-core";
import {
  ChargeAmpsApi,
  ChargePoint,
  ChargePointSettings,
  ChargingSession,
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
      this.log.warn(`Charge Amps polling failed: ${error instanceof Error ? error.message : String(error)}`);
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

      await this.extendObjectAsync(`${base}.lastStartSession`, {
        type: "channel",
        common: { name: "Last start session" },
        native: {},
      });
      await this.ensureState(`${base}.lastStartSession.id`, "Session ID", "number", "value", undefined, false);
      await this.ensureState(`${base}.lastStartSession.type`, "Session type", "string", "value", undefined, false);
      await this.ensureState(
        `${base}.lastStartSession.totalConsumptionKwh`,
        "Total consumption",
        "number",
        "value.power.consumption",
        "kWh",
        false,
      );
      await this.ensureState(`${base}.lastStartSession.startTime`, "Start time", "string", "date", undefined, false);
      await this.ensureState(`${base}.lastStartSession.endTime`, "End time", "string", "date", undefined, false);

      await this.extendObjectAsync(`${base}.lastStopSession`, {
        type: "channel",
        common: { name: "Last stop session" },
        native: {},
      });
      await this.ensureState(`${base}.lastStopSession.id`, "Session ID", "number", "value", undefined, false);
      await this.ensureState(`${base}.lastStopSession.type`, "Session type", "string", "value", undefined, false);
      await this.ensureState(
        `${base}.lastStopSession.totalConsumptionKwh`,
        "Total consumption",
        "number",
        "value.power.consumption",
        "kWh",
        false,
      );
      await this.ensureState(`${base}.lastStopSession.startTime`, "Start time", "string", "date", undefined, false);
      await this.ensureState(`${base}.lastStopSession.endTime`, "End time", "string", "date", undefined, false);

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
      await this.ensureState(`${base}.commands.start`, "Start", "boolean", "button", undefined, true);
      await this.ensureState(`${base}.commands.stop`, "Stop", "boolean", "button", undefined, true);
      await this.ensureState(`${base}.commands.remoteStart`, "Remote start", "boolean", "button", undefined, true);
      await this.ensureState(`${base}.commands.remoteStop`, "Remote stop", "boolean", "button", undefined, true);
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
        await this.handleReboot(relativeId);
        resetCommand = true;
      } else if (relativeId.endsWith(".commands.start") && state.val === true) {
        await this.handleStart(relativeId);
        resetCommand = true;
      } else if (relativeId.endsWith(".commands.stop") && state.val === true) {
        await this.handleStop(relativeId);
        resetCommand = true;
      } else if (relativeId.endsWith(".commands.remoteStart") && state.val === true) {
        await this.handleRemoteStart(relativeId);
        resetCommand = true;
      } else if (relativeId.endsWith(".commands.remoteStop") && state.val === true) {
        await this.handleRemoteStop(relativeId);
        resetCommand = true;
      } else if (relativeId.includes(".settings.")) {
        await this.handleSetting(relativeId, state.val);
      }
      await this.setStateAsync(relativeId, resetCommand ? false : state.val, true);
      await this.poll();
    } catch (error) {
      this.log.warn(`Command ${relativeId} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleReboot(relativeId: string): Promise<void> {
    const [, cpId] = relativeId.split(".");
    const chargePointId = this.chargePointIds.get(cpId);
    if (chargePointId) {
      await this.api?.reboot(chargePointId);
    }
  }

  private async handleStart(relativeId: string): Promise<void> {
    const ref = this.resolveConnector(relativeId);
    if (!ref) {
      return;
    }

    const session = await this.api?.start(ref.chargePointId, ref.connectorId);
    if (session) {
      await this.updateSession(relativeId, "lastStartSession", session);
    }
  }

  private async handleStop(relativeId: string): Promise<void> {
    const ref = this.resolveConnector(relativeId);
    if (!ref) {
      return;
    }

    const session = await this.api?.stop(ref.chargePointId, ref.connectorId);
    if (session) {
      await this.updateSession(relativeId, "lastStopSession", session);
    }
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
      rfidLength: Number(this.config.rfidLength) || this.config.rfid.length,
      externalTransactionId: `iobroker-${Date.now()}`,
    });
  }

  private async handleRemoteStop(relativeId: string): Promise<void> {
    const ref = this.resolveConnector(relativeId);
    if (ref) {
      await this.api?.remoteStop(ref.chargePointId, ref.connectorId);
    }
  }

  private async updateSession(relativeId: string, channel: "lastStartSession" | "lastStopSession", session: ChargingSession): Promise<void> {
    const parts = relativeId.split(".");
    const base = `chargepoints.${parts[1]}.connectors.${parts[3]}.${channel}`;
    await this.setStateChangedAsync(`${base}.id`, session.id, true);
    await this.setStateChangedAsync(`${base}.type`, session.sessionType, true);
    await this.setStateChangedAsync(`${base}.totalConsumptionKwh`, session.totalConsumptionKwh, true);
    await this.setStateChangedAsync(`${base}.startTime`, session.startTime ?? "", true);
    await this.setStateChangedAsync(`${base}.endTime`, session.endTime ?? "", true);
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

if (require.main !== module) {
  module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new ChargeampsHalo(options);
} else {
  (() => new ChargeampsHalo())();
}
