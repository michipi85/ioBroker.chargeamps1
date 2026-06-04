"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const adapter_core_1 = require("@iobroker/adapter-core");
const path_1 = require("path");
const chargeamps_api_1 = require("./chargeamps-api");
class ChargeampsHalo extends adapter_core_1.Adapter {
    api;
    pollTimer;
    pvStartTimer;
    pvStopTimer;
    pvCompletionTimer;
    chargePointIds = new Map();
    connectorIds = new Map();
    chargePointSettings = new Map();
    connectorSettings = new Map();
    connectorStatuses = new Map();
    polling = false;
    pvEvaluating = false;
    constructor(options = {}) {
        super({
            ...options,
            name: "chargeamps1",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    async onReady() {
        // __dirname is /build, we need to go to /admin for i18n files
        const adminDir = (0, path_1.join)(__dirname, '..', 'admin');
        await adapter_core_1.I18n.init(adminDir, this);
        await this.ensureBaseObjects();
        await this.deleteObsoleteSessionObjects();
        await this.setState("info.connection", false, true);
        await this.setState("automation.pv.enabled", Boolean(this.config.pvAutomationEnabled), true);
        if (!this.config.email || !this.config.password || !this.config.apiKey) {
            this.log.warn("Please configure email, password and API key.");
            return;
        }
        this.api = new chargeamps_api_1.ChargeAmpsApi({
            email: this.config.email,
            password: this.config.password,
            apiKey: this.config.apiKey,
            apiBaseUrl: this.config.apiBaseUrl,
        });
        await this.subscribeStatesAsync("*");
        await this.subscribePvAutomationStates();
        await this.poll();
        await this.evaluatePvAutomation("startup");
    }
    onUnload(callback) {
        try {
            if (this.pollTimer) {
                this.clearTimeout(this.pollTimer);
                this.pollTimer = undefined;
            }
            this.clearPvTimers();
            void this.setState("info.connection", false, true);
            callback();
        }
        catch {
            callback();
        }
    }
    schedulePoll() {
        if (this.pollTimer) {
            this.clearTimeout(this.pollTimer);
        }
        const intervalSeconds = Math.max(30, Number(this.config.pollInterval) || 60);
        this.pollTimer = this.setTimeout(() => void this.poll(), intervalSeconds * 1000);
    }
    async poll() {
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
            await this.evaluatePvAutomation("poll");
        }
        catch (error) {
            await this.setState("info.connection", false, true);
            this.log.warn(`Charge Amps polling failed: ${formatError(error)}`);
        }
        finally {
            this.polling = false;
            this.schedulePoll();
        }
    }
    async updateChargePoint(chargePoint) {
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
            if (connectorStatus) {
                this.connectorStatuses.set(connectorKey(chargePoint.id, connector.connectorId), connectorStatus);
            }
            await this.setStateChangedAsync(`chargepoints.${cpId}.connectors.${connectorId}.info.type`, connector.type, true);
            await this.setStateChangedAsync(`chargepoints.${cpId}.connectors.${connectorId}.settings.mode`, connectorSettings.mode, true);
            await this.setStateChangedAsync(`chargepoints.${cpId}.connectors.${connectorId}.settings.rfidLock`, connectorSettings.rfidLock, true);
            await this.setStateChangedAsync(`chargepoints.${cpId}.connectors.${connectorId}.settings.cableLock`, connectorSettings.cableLock, true);
            await this.setStateChangedAsync(`chargepoints.${cpId}.connectors.${connectorId}.settings.maxCurrent`, connectorSettings.maxCurrent ?? null, true);
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
    async updateMeasurements(base, measurements) {
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
    async ensureBaseObjects() {
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
        await this.extendObjectAsync("automation", {
            type: "channel",
            common: { name: "Automation" },
            native: {},
        });
        await this.extendObjectAsync("automation.pv", {
            type: "channel",
            common: { name: "PV automation" },
            native: {},
        });
        await this.ensureState("automation.pv.enabled", "PV automation enabled", "boolean", "switch", undefined, true);
        await this.ensureState("automation.pv.active", "PV automation active", "boolean", "indicator", undefined, false);
        await this.ensureState("automation.pv.surplusPower", "Surplus power", "number", "value.power", "W", false);
        await this.ensureState("automation.pv.batterySoc", "Battery state of charge", "number", "value.battery", "%", false);
        await this.ensureState("automation.pv.calculatedCurrent", "Calculated current", "number", "value.current", "A", false);
        await this.ensureState("automation.pv.decision", "Decision", "string", "text", undefined, false);
        await this.ensureState("automation.pv.lastAction", "Last action", "string", "text", undefined, false);
        await this.ensureState("automation.pv.startPending", "Start pending", "boolean", "indicator", undefined, false);
        await this.ensureState("automation.pv.stopPending", "Stop pending", "boolean", "indicator", undefined, false);
        await this.ensureState("automation.pv.completionPending", "Completion standby pending", "boolean", "indicator", undefined, false);
    }
    async deleteObsoleteSessionObjects() {
        const objects = await this.getObjectListAsync({
            startkey: `${this.namespace}.chargepoints.`,
            endkey: `${this.namespace}.chargepoints.\u9999`,
        });
        const obsoleteChannels = new Set();
        const namespacePattern = escapeRegExp(this.namespace);
        const obsoleteSessionPattern = new RegExp(`^${namespacePattern}\\.(.+\\.last(?:Start|Stop)Session)(?:\\.|$)`);
        for (const row of objects.rows) {
            const match = row.id.match(obsoleteSessionPattern);
            if (match) {
                obsoleteChannels.add(match[1]);
            }
        }
        for (const id of [...obsoleteChannels].sort((a, b) => a.length - b.length)) {
            try {
                await this.delObjectAsync(id, { recursive: true });
                this.log.info(`Removed obsolete object ${id}`);
            }
            catch (error) {
                this.log.debug(`Could not remove obsolete object ${id}: ${formatError(error)}`);
            }
        }
    }
    async subscribePvAutomationStates() {
        const stateIds = [this.config.pvGridPowerState, this.config.pvBatterySocState]
            .map((id) => id?.trim())
            .filter((id) => Boolean(id));
        if (stateIds.length) {
            await this.subscribeForeignStatesAsync(stateIds);
        }
    }
    async ensureChargePointObjects(chargePoint) {
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
        await this.ensureState(`chargepoints.${cpId}.info.firmwareVersion`, "Firmware version", "string", "info.firmware", undefined, false);
        await this.ensureState(`chargepoints.${cpId}.info.hardwareVersion`, "Hardware version", "string", "info.hardware", undefined, false);
        await this.ensureState(`chargepoints.${cpId}.info.isLoadbalanced`, "Load balanced", "boolean", "indicator", undefined, false);
        await this.ensureState(`chargepoints.${cpId}.status`, "Status", "string", "value", undefined, false);
        await this.extendObjectAsync(`chargepoints.${cpId}.settings`, {
            type: "channel",
            common: { name: "Settings" },
            native: {},
        });
        await this.ensureState(`chargepoints.${cpId}.settings.dimmer`, "Dimmer", "string", "level.dimmer", undefined, true);
        await this.ensureState(`chargepoints.${cpId}.settings.downLight`, "Down light", "boolean", "switch.light", undefined, true);
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
            await this.ensureState(`${base}.status.totalConsumptionKwh`, "Total consumption", "number", "value.power.consumption", "kWh", false);
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
            await this.ensureState(`${base}.commands.disableCharging`, "Set wallbox to standby", "boolean", "button", undefined, true);
            await this.ensureState(`${base}.commands.useSchedule`, "Use schedule", "boolean", "button", undefined, true);
        }
    }
    async ensureState(id, name, type, role, unit, write) {
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
    async onStateChange(id, state) {
        if (!state || !this.api) {
            return;
        }
        const ownId = `${this.namespace}.`;
        if (!id.startsWith(ownId)) {
            if (this.isPvAutomationSourceState(id)) {
                await this.evaluatePvAutomation(`state ${id} changed`);
            }
            return;
        }
        if (state.ack) {
            return;
        }
        const relativeId = id.slice(ownId.length);
        try {
            let resetCommand = false;
            if (relativeId.endsWith(".commands.reboot") && state.val === true) {
                resetCommand = true;
                await this.handleReboot(relativeId);
            }
            else if (relativeId.endsWith(".commands.remoteStart") && state.val === true) {
                resetCommand = true;
                await this.handleRemoteStart(relativeId);
            }
            else if (relativeId.endsWith(".commands.remoteStop") && state.val === true) {
                resetCommand = true;
                await this.handleRemoteStop(relativeId);
            }
            else if (relativeId.endsWith(".commands.enableCharging") && state.val === true) {
                resetCommand = true;
                await this.handleConnectorModeCommand(relativeId, "On");
            }
            else if (relativeId.endsWith(".commands.disableCharging") && state.val === true) {
                resetCommand = true;
                await this.handleConnectorModeCommand(relativeId, "Off");
            }
            else if (relativeId.endsWith(".commands.useSchedule") && state.val === true) {
                resetCommand = true;
                await this.handleConnectorModeCommand(relativeId, "Schedule");
            }
            else if (relativeId === "automation.pv.enabled") {
                await this.handlePvAutomationEnabledChange(Boolean(state.val));
                return;
            }
            else if (relativeId.includes(".settings.")) {
                await this.handleSetting(relativeId, state.val);
            }
            await this.setStateAsync(relativeId, resetCommand ? false : state.val, true);
            await this.poll();
        }
        catch (error) {
            this.log.warn(`Command ${relativeId} failed: ${formatError(error)}`);
            if (relativeId.includes(".commands.") && state.val === true) {
                await this.setStateAsync(relativeId, false, true);
            }
        }
    }
    async handleReboot(relativeId) {
        const [, cpId] = relativeId.split(".");
        const chargePointId = this.chargePointIds.get(cpId);
        if (chargePointId) {
            await this.api?.reboot(chargePointId);
        }
    }
    async handlePvAutomationEnabledChange(enabled) {
        await this.setStateAsync("automation.pv.enabled", enabled, true);
        if (enabled) {
            await this.evaluatePvAutomation("enabled changed");
            return;
        }
        this.clearPvTimers();
        await this.setStateChangedAsync("automation.pv.active", false, true);
        await this.setStateChangedAsync("automation.pv.decision", adapter_core_1.I18n.t("disabled"), true);
        await this.setStateChangedAsync("automation.pv.lastAction", adapter_core_1.I18n.t("PV automation disabled manually"), true);
    }
    async handleConnectorModeCommand(relativeId, mode) {
        const ref = this.resolveConnector(relativeId);
        if (!ref) {
            return;
        }
        const parts = relativeId.split(".");
        await this.setConnectorMode(ref, mode, `command ${parts[5]}`);
    }
    async handleRemoteStart(relativeId) {
        const ref = this.resolveConnector(relativeId);
        if (!ref) {
            return;
        }
        await this.remoteStartConnector(ref);
    }
    async remoteStartConnector(ref) {
        if (!this.config.rfid) {
            this.log.warn("Remote start was skipped because the Charge Amps API requires an RFID for this command.");
            await this.setStateChangedAsync("automation.pv.lastAction", adapter_core_1.I18n.t("Remote start skipped: missing RFID"), true);
            return false;
        }
        await this.ensureConnectorOn(ref, "before remoteStart");
        await this.api?.remoteStart(ref.chargePointId, ref.connectorId, {
            rfid: this.config.rfid,
            rfidFormat: this.config.rfidFormat || "Hex",
            rfidLength: rfidLength(this.config.rfid, this.config.rfidFormat, Number(this.config.rfidLength)),
            externalTransactionId: `iobroker-${Date.now()}`,
        });
        return true;
    }
    async handleRemoteStop(relativeId) {
        const ref = this.resolveConnector(relativeId);
        if (ref) {
            await this.remoteStopConnector(ref);
        }
    }
    async remoteStopConnector(ref) {
        await this.api?.remoteStop(ref.chargePointId, ref.connectorId);
    }
    async ensureConnectorOn(ref, reason) {
        const settings = this.connectorSettings.get(connectorKey(ref.chargePointId, ref.connectorId));
        if (settings?.mode === "On") {
            return;
        }
        await this.setConnectorMode(ref, "On", reason);
    }
    async setConnectorMode(ref, mode, reason) {
        const key = connectorKey(ref.chargePointId, ref.connectorId);
        const settings = this.connectorSettings.get(key);
        if (!settings) {
            throw new Error(`Connector settings for ${key} are not available yet`);
        }
        const changed = { ...settings, mode };
        await this.api?.setConnectorSettings(changed);
        this.connectorSettings.set(key, changed);
        const ids = this.connectorObjectIds(ref);
        if (ids) {
            await this.setStateChangedAsync(`chargepoints.${ids.cpId}.connectors.${ids.connectorId}.settings.mode`, mode, true);
        }
        await this.setStateChangedAsync("automation.pv.lastAction", `${adapter_core_1.I18n.t("Set mode")} ${mode} (${reason})`, true);
    }
    isPvAutomationSourceState(id) {
        return [this.config.pvGridPowerState, this.config.pvBatterySocState]
            .map((stateId) => stateId?.trim())
            .some((stateId) => stateId === id);
    }
    async evaluatePvAutomation(reason) {
        if (!this.api || this.pvEvaluating) {
            return;
        }
        this.pvEvaluating = true;
        try {
            const state = await this.readPvAutomationState();
            await this.publishPvAutomationState(state);
            if (!state.enabled) {
                this.clearPvTimers();
                await this.setStateChangedAsync("automation.pv.active", false, true);
                await this.setStateChangedAsync("automation.pv.decision", adapter_core_1.I18n.t("disabled"), true);
                return;
            }
            const ref = this.resolvePvConnector();
            if (!ref) {
                this.clearPvTimers();
                await this.setStateChangedAsync("automation.pv.active", false, true);
                await this.setStateChangedAsync("automation.pv.decision", adapter_core_1.I18n.t("target connector not ready"), true);
                return;
            }
            await this.setStateChangedAsync("automation.pv.active", true, true);
            const socOk = state.batterySoc === null || state.batterySoc >= pvNumber(this.config.pvMinBatterySoc, 20);
            const startSurplus = pvNumber(this.config.pvStartSurplusWatts, 4500);
            const stopSurplus = pvNumber(this.config.pvStopSurplusWatts, 500);
            const connectorStatus = this.connectorStatuses.get(connectorKey(ref.chargePointId, ref.connectorId));
            const isCharging = connectorStatus?.status === "Charging";
            if (this.isChargingComplete(connectorStatus?.status)) {
                this.clearPvStartTimer();
                this.clearPvStopTimer();
                this.schedulePvCompletionStandby(ref, connectorStatus?.status || "complete");
                await this.setStateChangedAsync("automation.pv.decision", `${adapter_core_1.I18n.t("completion standby pending")} (${connectorStatus?.status})`, true);
                return;
            }
            this.clearPvCompletionTimer();
            await this.ensureConnectorOn(ref, "PV automation active");
            if (state.surplusPower >= startSurplus && socOk) {
                this.clearPvStopTimer();
                await this.applyPvCurrent(ref, state.calculatedCurrent, reason);
                if (!isCharging) {
                    this.schedulePvStart(ref, state.calculatedCurrent);
                    await this.setStateChangedAsync("automation.pv.decision", adapter_core_1.I18n.t("start pending"), true);
                }
                else {
                    this.clearPvStartTimer();
                    await this.setStateChangedAsync("automation.pv.decision", adapter_core_1.I18n.t("charging with PV surplus"), true);
                }
                return;
            }
            if (state.surplusPower <= stopSurplus || !socOk) {
                this.clearPvStartTimer();
                if (isCharging) {
                    this.schedulePvStop(ref, socOk ? "surplus too low" : "battery SOC too low");
                }
                else {
                    this.clearPvStopTimer();
                }
                await this.setStateChangedAsync("automation.pv.decision", socOk ? adapter_core_1.I18n.t("waiting for surplus") : adapter_core_1.I18n.t("waiting for battery SOC"), true);
                return;
            }
            this.clearPvTimers();
            await this.setStateChangedAsync("automation.pv.decision", adapter_core_1.I18n.t("surplus between start and stop thresholds"), true);
        }
        catch (error) {
            this.log.warn(`PV automation failed: ${formatError(error)}`);
            await this.setStateChangedAsync("automation.pv.decision", `error: ${formatError(error)}`, true);
        }
        finally {
            this.pvEvaluating = false;
        }
    }
    async readPvAutomationState() {
        const enabledState = await this.getStateAsync("automation.pv.enabled");
        const enabled = Boolean(enabledState?.val) && Boolean(this.config.pvAutomationEnabled);
        const gridPowerStateId = this.config.pvGridPowerState?.trim();
        if (!enabled || !gridPowerStateId) {
            return {
                enabled: false,
                surplusPower: 0,
                batterySoc: null,
                calculatedCurrent: pvNumber(this.config.pvMinCurrent, 6),
                decision: gridPowerStateId ? adapter_core_1.I18n.t("disabled") : adapter_core_1.I18n.t("missing grid power state"),
            };
        }
        const gridPower = await this.readForeignNumber(gridPowerStateId);
        const exportIsNegative = this.config.pvGridPowerExportIsNegative !== false;
        const surplusPower = exportIsNegative ? -gridPower : gridPower;
        const batterySocStateId = this.config.pvBatterySocState?.trim();
        const batterySoc = batterySocStateId ? await this.readForeignNumber(batterySocStateId) : null;
        const calculatedCurrent = this.calculatePvCurrent(surplusPower);
        return {
            enabled,
            surplusPower,
            batterySoc,
            calculatedCurrent,
            decision: "evaluating",
        };
    }
    async publishPvAutomationState(state) {
        await this.setStateChangedAsync("automation.pv.surplusPower", state.surplusPower, true);
        await this.setStateChangedAsync("automation.pv.batterySoc", state.batterySoc, true);
        await this.setStateChangedAsync("automation.pv.calculatedCurrent", state.calculatedCurrent, true);
        await this.setStateChangedAsync("automation.pv.decision", state.decision, true);
    }
    async readForeignNumber(id) {
        const state = await this.getForeignStateAsync(id);
        const value = Number(state?.val);
        if (!Number.isFinite(value)) {
            throw new Error(`State ${id} does not contain a numeric value`);
        }
        return value;
    }
    calculatePvCurrent(surplusPower) {
        const minCurrent = pvNumber(this.config.pvMinCurrent, 6);
        const maxCurrent = Math.max(minCurrent, pvNumber(this.config.pvMaxCurrent, 16));
        const wattsPerAmp = Math.max(1, pvNumber(this.config.pvVoltage, 240) * pvNumber(this.config.pvPhases, 3));
        return clamp(Math.floor(surplusPower / wattsPerAmp), minCurrent, maxCurrent);
    }
    resolvePvConnector() {
        const connectorId = objectId(String(Number(this.config.pvConnectorId) || 1));
        const configuredChargePointId = this.config.pvChargePointId?.trim();
        if (configuredChargePointId) {
            const cpId = objectId(configuredChargePointId);
            return this.connectorIds.get(`${cpId}.${connectorId}`);
        }
        if (this.connectorIds.size === 1) {
            return [...this.connectorIds.values()][0];
        }
        return undefined;
    }
    schedulePvStart(ref, current) {
        if (this.pvStartTimer) {
            return;
        }
        this.pvStartTimer = this.setTimeout(() => {
            this.pvStartTimer = undefined;
            void (async () => {
                const state = await this.readPvAutomationState();
                const freshRef = this.resolvePvConnector() || ref;
                const freshCurrent = state.calculatedCurrent || current;
                await this.applyPvCurrent(freshRef, freshCurrent, "PV surplus stable");
                const started = await this.remoteStartConnector(freshRef);
                await this.setStateChangedAsync("automation.pv.lastAction", started
                    ? `${adapter_core_1.I18n.t("Remote start with")} ${freshCurrent} A (${adapter_core_1.I18n.t("PV surplus stable")})`
                    : `${adapter_core_1.I18n.t("Remote start skipped with")} ${freshCurrent} A (${adapter_core_1.I18n.t("missing RFID")})`, true);
                await this.setStateChangedAsync("automation.pv.startPending", false, true);
                await this.poll();
            })();
        }, pvNumber(this.config.pvStartDelaySeconds, 180) * 1000);
        void this.setStateChangedAsync("automation.pv.startPending", true, true);
        void this.setStateChangedAsync("automation.pv.lastAction", adapter_core_1.I18n.t("Start timer scheduled"), true);
    }
    schedulePvStop(ref, reason) {
        if (this.pvStopTimer) {
            return;
        }
        this.pvStopTimer = this.setTimeout(() => {
            this.pvStopTimer = undefined;
            void (async () => {
                await this.remoteStopConnector(ref);
                await this.setStateChangedAsync("automation.pv.lastAction", `${adapter_core_1.I18n.t("Remote stop")} (${reason})`, true);
                await this.setStateChangedAsync("automation.pv.stopPending", false, true);
                await this.poll();
            })();
        }, pvNumber(this.config.pvStopDelaySeconds, 90) * 1000);
        void this.setStateChangedAsync("automation.pv.stopPending", true, true);
        void this.setStateChangedAsync("automation.pv.lastAction", `${adapter_core_1.I18n.t("Stop timer scheduled")}: ${reason}`, true);
    }
    schedulePvCompletionStandby(ref, status) {
        if (this.pvCompletionTimer) {
            return;
        }
        this.pvCompletionTimer = this.setTimeout(() => {
            this.pvCompletionTimer = undefined;
            void this.applyPvStandby(ref, `charging completed: ${status}`);
        }, pvNumber(this.config.pvCompletionStandbyDelaySeconds, 60) * 1000);
        void this.setStateChangedAsync("automation.pv.completionPending", true, true);
        void this.setStateChangedAsync("automation.pv.lastAction", `${adapter_core_1.I18n.t("Standby timer scheduled")}: ${status}`, true);
    }
    async applyPvCurrent(ref, current, reason) {
        const settings = this.connectorSettings.get(connectorKey(ref.chargePointId, ref.connectorId));
        if (!settings || settings.maxCurrent === current) {
            return;
        }
        const normalizedCurrent = normalizeCurrent(current);
        const changed = { ...settings, maxCurrent: normalizedCurrent };
        await this.api?.setConnectorSettings(changed);
        this.connectorSettings.set(connectorKey(ref.chargePointId, ref.connectorId), changed);
        const ids = this.connectorObjectIds(ref);
        if (ids) {
            await this.setStateChangedAsync(`chargepoints.${ids.cpId}.connectors.${ids.connectorId}.settings.maxCurrent`, normalizedCurrent, true);
        }
        await this.setStateChangedAsync("automation.pv.lastAction", `${adapter_core_1.I18n.t("Set current to")} ${normalizedCurrent} A (${reason})`, true);
    }
    async applyPvStandby(ref, reason) {
        const settings = this.connectorSettings.get(connectorKey(ref.chargePointId, ref.connectorId));
        if (!settings) {
            return;
        }
        const changed = { ...settings, mode: "Off" };
        await this.api?.setConnectorSettings(changed);
        this.connectorSettings.set(connectorKey(ref.chargePointId, ref.connectorId), changed);
        const ids = this.connectorObjectIds(ref);
        if (ids) {
            await this.setStateChangedAsync(`chargepoints.${ids.cpId}.connectors.${ids.connectorId}.settings.mode`, "Off", true);
        }
        await this.setStateChangedAsync("automation.pv.completionPending", false, true);
        await this.setStateChangedAsync("automation.pv.lastAction", `${adapter_core_1.I18n.t("Set wallbox to standby")} (${reason})`, true);
        await this.setStateAsync("automation.pv.enabled", false, true);
        await this.setStateChangedAsync("automation.pv.active", false, true);
        await this.setStateChangedAsync("automation.pv.decision", adapter_core_1.I18n.t("charging completed, automation disabled"), true);
        this.clearPvTimers();
        await this.poll();
    }
    connectorObjectIds(ref) {
        const cpId = objectId(ref.chargePointId);
        const connectorId = objectId(String(ref.connectorId));
        return this.connectorIds.has(`${cpId}.${connectorId}`) ? { cpId, connectorId } : undefined;
    }
    clearPvTimers() {
        this.clearPvStartTimer();
        this.clearPvStopTimer();
        this.clearPvCompletionTimer();
    }
    clearPvStartTimer() {
        if (this.pvStartTimer) {
            this.clearTimeout(this.pvStartTimer);
            this.pvStartTimer = undefined;
        }
        void this.setStateChangedAsync("automation.pv.startPending", false, true);
    }
    clearPvStopTimer() {
        if (this.pvStopTimer) {
            this.clearTimeout(this.pvStopTimer);
            this.pvStopTimer = undefined;
        }
        void this.setStateChangedAsync("automation.pv.stopPending", false, true);
    }
    clearPvCompletionTimer() {
        if (this.pvCompletionTimer) {
            this.clearTimeout(this.pvCompletionTimer);
            this.pvCompletionTimer = undefined;
        }
        void this.setStateChangedAsync("automation.pv.completionPending", false, true);
    }
    isChargingComplete(status) {
        return status === "Finishing" || status === "SuspendedEV";
    }
    async handleSetting(relativeId, value) {
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
            }
            else if (parts[3] === "downLight") {
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
        }
        else if (field === "rfidLock") {
            changed.rfidLock = Boolean(value);
        }
        else if (field === "cableLock") {
            changed.cableLock = Boolean(value);
        }
        else if (field === "maxCurrent") {
            if (value === null || value === "") {
                changed.maxCurrent = null;
            }
            else {
                const maxCurrent = Number(value);
                if (!Number.isFinite(maxCurrent)) {
                    throw new Error(`Invalid maxCurrent value: ${String(value)}`);
                }
                changed.maxCurrent = normalizeCurrent(maxCurrent);
            }
        }
        await this.api?.setConnectorSettings(changed);
        this.connectorSettings.set(connectorKey(ref.chargePointId, ref.connectorId), changed);
    }
    resolveConnector(relativeId) {
        const parts = relativeId.split(".");
        return this.connectorIds.get(`${parts[1]}.${parts[3]}`);
    }
}
function objectId(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
function connectorKey(chargePointId, connectorId) {
    return `${chargePointId}:${connectorId}`;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function pvNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function normalizeCurrent(value) {
    if (!Number.isFinite(value)) {
        throw new Error(`Invalid maxCurrent value: ${String(value)}`);
    }
    return Math.trunc(value);
}
function rfidLength(rfid, format, configuredLength) {
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
function formatError(error) {
    if (error instanceof chargeamps_api_1.ChargeAmpsApiError) {
        const body = error.body ? `: ${error.body.slice(0, 500)}` : "";
        return `${error.message}${body}`;
    }
    return error instanceof Error ? error.message : String(error);
}
if (require.main !== module) {
    module.exports = (options) => new ChargeampsHalo(options);
}
else {
    (() => new ChargeampsHalo())();
}
//# sourceMappingURL=main.js.map