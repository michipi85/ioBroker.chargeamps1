"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChargeAmpsApi = exports.ChargeAmpsApiError = void 0;
class ChargeAmpsApiError extends Error {
    status;
    body;
    constructor(message, status, body) {
        super(message);
        this.name = "ChargeAmpsApiError";
        this.status = status;
        this.body = body;
    }
}
exports.ChargeAmpsApiError = ChargeAmpsApiError;
class ChargeAmpsApi {
    options;
    baseUrl;
    fetchImpl;
    now;
    token;
    refreshToken;
    tokenExpiresAt = 0;
    constructor(options) {
        this.options = options;
        this.baseUrl = (options.apiBaseUrl || "https://eapi.charge.space").replace(/\/$/, "");
        this.fetchImpl = options.fetchImpl || fetch;
        this.now = options.now || (() => Math.floor(Date.now() / 1000));
    }
    async getChargePoints() {
        return this.request("/api/v5/chargepoints/owned");
    }
    async getChargePointStatus(chargePointId) {
        return this.request(`/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/status`);
    }
    async getChargePointSettings(chargePointId) {
        return this.request(`/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/settings`);
    }
    async setChargePointSettings(settings) {
        await this.request(`/api/v5/chargepoints/${encodeURIComponent(settings.id)}/settings`, {
            method: "PUT",
            body: JSON.stringify(settings),
        });
    }
    async getConnectorSettings(chargePointId, connectorId) {
        return this.request(`/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/connectors/${connectorId}/settings`);
    }
    async setConnectorSettings(settings) {
        await this.request(`/api/v5/chargepoints/${encodeURIComponent(settings.chargePointId)}/connectors/${settings.connectorId}/settings`, {
            method: "PUT",
            body: JSON.stringify(settings),
        });
    }
    async remoteStart(chargePointId, connectorId, startAuth) {
        await this.request(`/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/connectors/${connectorId}/remotestart`, {
            method: "PUT",
            body: JSON.stringify(startAuth),
        });
    }
    async remoteStop(chargePointId, connectorId) {
        await this.request(`/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/connectors/${connectorId}/remotestop`, {
            method: "PUT",
            body: JSON.stringify({}),
        });
    }
    async reboot(chargePointId) {
        await this.request(`/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/reboot`, {
            method: "PUT",
            body: JSON.stringify({}),
        });
    }
    async ensureToken() {
        if (this.token && this.tokenExpiresAt - 30 > this.now()) {
            return;
        }
        if (this.token && this.refreshToken) {
            try {
                await this.authenticate("/api/v5/auth/refreshToken", {
                    token: this.token,
                    refreshToken: this.refreshToken,
                });
                return;
            }
            catch {
                this.token = undefined;
                this.refreshToken = undefined;
                this.tokenExpiresAt = 0;
            }
        }
        await this.authenticate("/api/v5/auth/login", {
            email: this.options.email,
            password: this.options.password,
        });
    }
    async authenticate(path, payload) {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apiKey: this.options.apiKey,
            },
            body: JSON.stringify(payload),
        });
        const body = await response.text();
        if (!response.ok) {
            throw new ChargeAmpsApiError(`Charge Amps authentication failed with HTTP ${response.status}`, response.status, body);
        }
        const auth = JSON.parse(body);
        this.token = auth.token;
        this.refreshToken = auth.refreshToken;
        this.tokenExpiresAt = readJwtExpiration(auth.token);
    }
    async request(path, init = {}) {
        await this.ensureToken();
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                apiKey: this.options.apiKey,
                Authorization: `Bearer ${this.token}`,
                ...(init.headers || {}),
            },
        });
        const body = await response.text();
        if (!response.ok) {
            throw new ChargeAmpsApiError(`Charge Amps request failed with HTTP ${response.status}`, response.status, body);
        }
        return body ? JSON.parse(body) : undefined;
    }
}
exports.ChargeAmpsApi = ChargeAmpsApi;
function readJwtExpiration(token) {
    const [, payload] = token.split(".");
    if (!payload) {
        return 0;
    }
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed.exp || 0;
}
//# sourceMappingURL=chargeamps-api.js.map