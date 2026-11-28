import WebSocket from "ws";
type OcppPayload = Record<string, unknown>;
export declare class OcppClientConnection {
    private readonly ws;
    readonly chargePointId: string;
    private readonly adapter;
    private readonly pendingCalls;
    private sendQueue;
    onRequest?: (action: string, payload: OcppPayload) => Promise<OcppPayload>;
    onClose?: () => void;
    onError?: (action: string | undefined, error: Error) => void;
    constructor(ws: WebSocket, chargePointId: string, adapter: Pick<ioBroker.Adapter, "setTimeout" | "clearTimeout">);
    isOpen(): boolean;
    sendCommand(action: string, payload: OcppPayload): Promise<OcppPayload>;
    close(): void;
    private sendCall;
    private handleMessage;
    private rejectPending;
}
export declare class OcppServer {
    private readonly adapter;
    private readonly clients;
    private readonly httpServer;
    private readonly wss;
    onRequest?: (client: OcppClientConnection, action: string, payload: OcppPayload) => Promise<OcppPayload>;
    onClientConnect?: (client: OcppClientConnection) => void;
    onClientDisconnect?: (chargePointId: string) => void;
    onClientError?: (client: OcppClientConnection, action: string | undefined, error: Error) => void;
    constructor(adapter: Pick<ioBroker.Adapter, "setTimeout" | "clearTimeout">);
    getClient(chargePointId: string): OcppClientConnection | undefined;
    hasClients(): boolean;
    listen(port: number): Promise<void>;
    close(): Promise<void>;
    private handleUpgrade;
}
export {};
