"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OcppServer = exports.OcppClientConnection = void 0;
const node_crypto_1 = require("node:crypto");
const http = __importStar(require("node:http"));
const ws_1 = __importDefault(require("ws"));
class OcppClientConnection {
    ws;
    chargePointId;
    adapter;
    pendingCalls = new Map();
    sendQueue = Promise.resolve();
    onRequest;
    onClose;
    onError;
    constructor(ws, chargePointId, adapter) {
        this.ws = ws;
        this.chargePointId = chargePointId;
        this.adapter = adapter;
        ws.on("message", data => void this.handleMessage(data));
        ws.on("error", error => this.onError?.(undefined, error));
        ws.on("close", () => {
            this.rejectPending(new Error(`OCPP connection to ${chargePointId} was closed`));
            this.onClose?.();
        });
    }
    isOpen() {
        return this.ws.readyState === ws_1.default.OPEN;
    }
    sendCommand(action, payload) {
        const task = this.sendQueue.then(() => this.sendCall(action, payload), () => this.sendCall(action, payload));
        this.sendQueue = task.then(() => undefined, () => undefined);
        return task;
    }
    close() {
        this.rejectPending(new Error(`OCPP connection to ${this.chargePointId} was closed by the server`));
        this.ws.close();
    }
    sendCall(action, payload) {
        if (!this.isOpen()) {
            return Promise.reject(new Error(`OCPP charge point ${this.chargePointId} is offline`));
        }
        const messageId = (0, node_crypto_1.randomUUID)();
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
    async handleMessage(data) {
        let frame;
        try {
            frame = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : data.toString());
        }
        catch {
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
            }
            else {
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.onError?.(action, error instanceof Error ? error : new Error(message));
            this.ws.send(JSON.stringify([4, messageId, "InternalError", message, {}]));
        }
    }
    rejectPending(error) {
        for (const [messageId, pending] of this.pendingCalls) {
            this.adapter.clearTimeout(pending.timeout);
            pending.reject(error);
            this.pendingCalls.delete(messageId);
        }
    }
}
exports.OcppClientConnection = OcppClientConnection;
class OcppServer {
    adapter;
    clients = new Map();
    httpServer = http.createServer();
    wss = new ws_1.default.Server({ noServer: true, handleProtocols: protocols => protocols.has("ocpp1.6") ? "ocpp1.6" : "ocpp1.6" });
    onRequest;
    onClientConnect;
    onClientDisconnect;
    onClientError;
    constructor(adapter) {
        this.adapter = adapter;
        this.httpServer.on("upgrade", (request, socket, head) => this.handleUpgrade(request, socket, head));
    }
    getClient(chargePointId) {
        return this.clients.get(chargePointId);
    }
    async listen(port) {
        await new Promise((resolve, reject) => {
            this.httpServer.once("error", reject);
            this.httpServer.listen(port, () => {
                this.httpServer.removeListener("error", reject);
                resolve();
            });
        });
    }
    async close() {
        for (const client of this.clients.values()) {
            client.close();
        }
        this.clients.clear();
        await new Promise(resolve => this.wss.close(() => resolve()));
        await new Promise(resolve => this.httpServer.close(() => resolve()));
    }
    handleUpgrade(request, socket, head) {
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
exports.OcppServer = OcppServer;
function toPayload(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
//# sourceMappingURL=ocpp-server.js.map