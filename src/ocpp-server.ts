import { randomUUID } from "node:crypto";
import * as http from "node:http";
import type { Socket } from "node:net";
import WebSocket from "ws";

type OcppPayload = Record<string, unknown>;

interface PendingCall {
  resolve: (payload: OcppPayload) => void;
  reject: (error: Error) => void;
  timeout: ioBroker.Timeout | undefined;
}

export class OcppClientConnection {
  private readonly pendingCalls = new Map<string, PendingCall>();
  private sendQueue: Promise<unknown> = Promise.resolve();

  public onRequest?: (action: string, payload: OcppPayload) => Promise<OcppPayload>;
  public onClose?: () => void;
  public onError?: (action: string | undefined, error: Error) => void;

  public constructor(
    private readonly ws: WebSocket,
    public readonly chargePointId: string,
    private readonly adapter: Pick<ioBroker.Adapter, "setTimeout" | "clearTimeout">,
  ) {
    ws.on("message", data => void this.handleMessage(data));
    ws.on("error", error => this.onError?.(undefined, error));
    ws.on("close", () => {
      this.rejectPending(new Error(`OCPP connection to ${chargePointId} was closed`));
      this.onClose?.();
    });
  }

  public isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  public sendCommand(action: string, payload: OcppPayload): Promise<OcppPayload> {
    const task = this.sendQueue.then(
      () => this.sendCall(action, payload),
      () => this.sendCall(action, payload),
    );
    this.sendQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  public close(): void {
    this.rejectPending(new Error(`OCPP connection to ${this.chargePointId} was closed by the server`));
    this.ws.close();
  }

  private sendCall(action: string, payload: OcppPayload): Promise<OcppPayload> {
    if (!this.isOpen()) {
      return Promise.reject(new Error(`OCPP charge point ${this.chargePointId} is offline`));
    }

    const messageId = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = this.adapter.setTimeout(() => {
        this.pendingCalls.delete(messageId);
        reject(new Error(`Timeout waiting for OCPP ${action} response from ${this.chargePointId}`));
      }, 30_000);
      this.pendingCalls.set(messageId, { resolve, reject, timeout });
      this.ws.send(JSON.stringify([2, messageId, action, payload]), error => {
        if (!error) {
          return;
        }
        this.adapter.clearTimeout(timeout);
        this.pendingCalls.delete(messageId);
        reject(error);
      });
    });
  }

  private async handleMessage(data: WebSocket.Data): Promise<void> {
    let frame: unknown;
    try {
      frame = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : data.toString());
    } catch {
      this.onError?.(undefined, new Error(`Invalid OCPP JSON from ${this.chargePointId}`));
      return;
    }
    if (!Array.isArray(frame) || frame.length < 3) {
      this.onError?.(undefined, new Error(`Invalid OCPP frame from ${this.chargePointId}`));
      return;
    }

    const messageType = frame[0];
    const messageId = String(frame[1]);
    if (messageType === 3 || messageType === 4) {
      const pending = this.pendingCalls.get(messageId);
      if (!pending) {
        return;
      }
      this.adapter.clearTimeout(pending.timeout);
      this.pendingCalls.delete(messageId);
      if (messageType === 3) {
        pending.resolve(toPayload(frame[2]));
      } else {
        pending.reject(new Error(`${String(frame[2])}: ${String(frame[3] || "OCPP command rejected")}`));
      }
      return;
    }
    if (messageType !== 2) {
      this.onError?.(undefined, new Error(`Unsupported OCPP message type from ${this.chargePointId}`));
      return;
    }

    const action = String(frame[2]);
    try {
      const response = (await this.onRequest?.(action, toPayload(frame[3]))) || {};
      this.ws.send(JSON.stringify([3, messageId, response]));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.onError?.(action, error instanceof Error ? error : new Error(message));
      this.ws.send(JSON.stringify([4, messageId, "InternalError", message, {}]));
    }
  }

  private rejectPending(error: Error): void {
    for (const [messageId, pending] of this.pendingCalls) {
      this.adapter.clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingCalls.delete(messageId);
    }
  }
}

export class OcppServer {
  private readonly clients = new Map<string, OcppClientConnection>();
  private readonly httpServer = http.createServer();
  private readonly wss = new WebSocket.Server({ noServer: true, handleProtocols: protocols => protocols.has("ocpp1.6") ? "ocpp1.6" : "ocpp1.6" });

  public onRequest?: (client: OcppClientConnection, action: string, payload: OcppPayload) => Promise<OcppPayload>;
  public onClientConnect?: (client: OcppClientConnection) => void;
  public onClientDisconnect?: (chargePointId: string) => void;
  public onClientError?: (client: OcppClientConnection, action: string | undefined, error: Error) => void;

  public constructor(private readonly adapter: Pick<ioBroker.Adapter, "setTimeout" | "clearTimeout">) {
    this.httpServer.on("upgrade", (request, socket, head) => this.handleUpgrade(request, socket as Socket, head));
  }

  public getClient(chargePointId: string): OcppClientConnection | undefined {
    return this.clients.get(chargePointId);
  }

  public async listen(port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(port, () => {
        this.httpServer.removeListener("error", reject);
        resolve();
      });
    });
  }

  public async close(): Promise<void> {
    for (const client of this.clients.values()) {
      client.close();
    }
    this.clients.clear();
    await new Promise<void>(resolve => this.wss.close(() => resolve()));
    await new Promise<void>(resolve => this.httpServer.close(() => resolve()));
  }

  private handleUpgrade(request: http.IncomingMessage, socket: Socket, head: Buffer): void {
    const path = request.url?.split("?")[0] || "/";
    const chargePointId = decodeURIComponent(path.replace(/^\/+/, ""));
    if (!chargePointId) {
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(request, socket, head, ws => {
      const oldClient = this.clients.get(chargePointId);
      oldClient?.close();
      const client = new OcppClientConnection(ws, chargePointId, this.adapter);
      client.onRequest = (action, payload) => this.onRequest?.(client, action, payload) || Promise.resolve({});
      client.onError = (action, error) => this.onClientError?.(client, action, error);
      client.onClose = () => {
        if (this.clients.get(chargePointId) === client) {
          this.clients.delete(chargePointId);
          this.onClientDisconnect?.(chargePointId);
        }
      };
      this.clients.set(chargePointId, client);
      this.onClientConnect?.(client);
    });
  }
}

function toPayload(value: unknown): OcppPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as OcppPayload) : {};
}
