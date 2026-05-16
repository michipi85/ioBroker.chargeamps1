export interface ChargePointConnector {
    chargePointId: string;
    connectorId: number;
    type: string;
}
export interface ChargePoint {
    id: string;
    name: string;
    password?: string;
    type: string;
    isLoadbalanced: boolean;
    firmwareVersion: string;
    hardwareVersion: string;
    connectors: ChargePointConnector[];
}
export interface Measurement {
    phase: string;
    current: number;
    voltage: number;
}
export interface ConnectorStatus {
    chargePointId: string;
    connectorId: number;
    totalConsumptionKwh: number;
    status: string;
    measurements?: Measurement[] | null;
    startTime?: string | null;
    endTime?: string | null;
    sessionId?: number | null;
}
export interface ChargePointStatus {
    id: string;
    status: string;
    connectorStatuses: ConnectorStatus[];
}
export interface ChargePointSettings {
    id: string;
    dimmer: string;
    downLight: boolean;
}
export interface ConnectorSettings {
    chargePointId: string;
    connectorId: number;
    mode: string;
    rfidLock: boolean;
    cableLock: boolean;
    maxCurrent?: number | null;
}
export interface StartAuth {
    rfidLength: number;
    rfidFormat: string;
    rfid: string;
    externalTransactionId: string;
}
export interface ChargeAmpsApiOptions {
    email: string;
    password: string;
    apiKey: string;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
    now?: () => number;
}
export declare class ChargeAmpsApiError extends Error {
    readonly status: number;
    readonly body: string;
    constructor(message: string, status: number, body: string);
}
export declare class ChargeAmpsApi {
    private readonly options;
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly now;
    private token;
    private refreshToken;
    private tokenExpiresAt;
    constructor(options: ChargeAmpsApiOptions);
    getChargePoints(): Promise<ChargePoint[]>;
    getChargePointStatus(chargePointId: string): Promise<ChargePointStatus>;
    getChargePointSettings(chargePointId: string): Promise<ChargePointSettings>;
    setChargePointSettings(settings: ChargePointSettings): Promise<void>;
    getConnectorSettings(chargePointId: string, connectorId: number): Promise<ConnectorSettings>;
    setConnectorSettings(settings: ConnectorSettings): Promise<void>;
    remoteStart(chargePointId: string, connectorId: number, startAuth: StartAuth): Promise<void>;
    remoteStop(chargePointId: string, connectorId: number): Promise<void>;
    reboot(chargePointId: string): Promise<void>;
    private ensureToken;
    private authenticate;
    private request;
}
