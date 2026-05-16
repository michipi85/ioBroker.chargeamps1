"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const chargeamps_api_1 = require("../src/chargeamps-api");
function token(exp) {
    return `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;
}
(0, node_test_1.test)("logs in and requests owned chargepoints", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url: String(url), init: init || {} });
        if (String(url).endsWith("/api/v5/auth/login")) {
            return new Response(JSON.stringify({ token: token(9999), refreshToken: "refresh" }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
    };
    const api = new chargeamps_api_1.ChargeAmpsApi({
        email: "mail@example.test",
        password: "secret",
        apiKey: "api-key",
        apiBaseUrl: "https://example.test/",
        fetchImpl: fetchImpl,
        now: () => 100,
    });
    await api.getChargePoints();
    strict_1.default.equal(calls[0].url, "https://example.test/api/v5/auth/login");
    strict_1.default.equal(calls[1].url, "https://example.test/api/v5/chargepoints/owned");
    strict_1.default.equal(calls[1].init.headers.Authorization, `Bearer ${token(9999)}`);
});
(0, node_test_1.test)("uses refresh token when access token expires", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
        urls.push(String(url));
        if (String(url).endsWith("/api/v5/auth/login")) {
            return new Response(JSON.stringify({ token: token(101), refreshToken: "refresh-1" }), { status: 200 });
        }
        if (String(url).endsWith("/api/v5/auth/refreshToken")) {
            return new Response(JSON.stringify({ token: token(9999), refreshToken: "refresh-2" }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
    };
    const api = new chargeamps_api_1.ChargeAmpsApi({
        email: "mail@example.test",
        password: "secret",
        apiKey: "api-key",
        apiBaseUrl: "https://example.test",
        fetchImpl: fetchImpl,
        now: () => 100,
    });
    await api.getChargePoints();
    await api.getChargePoints();
    strict_1.default.deepEqual(urls, [
        "https://example.test/api/v5/auth/login",
        "https://example.test/api/v5/chargepoints/owned",
        "https://example.test/api/v5/auth/refreshToken",
        "https://example.test/api/v5/chargepoints/owned",
    ]);
});
(0, node_test_1.test)("starts connector charging session", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url: String(url), init: init || {} });
        if (String(url).endsWith("/api/v5/auth/login")) {
            return new Response(JSON.stringify({ token: token(9999), refreshToken: "refresh" }), { status: 200 });
        }
        return new Response(JSON.stringify({
            id: 4711,
            chargePointId: "cp-1",
            connectorId: 1,
            sessionType: "External",
            totalConsumptionKwh: 0,
            startTime: "2026-05-16T12:00:00Z",
            endTime: null,
        }), { status: 200 });
    };
    const api = new chargeamps_api_1.ChargeAmpsApi({
        email: "mail@example.test",
        password: "secret",
        apiKey: "api-key",
        apiBaseUrl: "https://example.test",
        fetchImpl: fetchImpl,
        now: () => 100,
    });
    const session = await api.start("cp-1", 1);
    strict_1.default.equal(calls[1].url, "https://example.test/api/v5/chargepoints/cp-1/connectors/1/start");
    strict_1.default.equal(calls[1].init.method, "POST");
    strict_1.default.equal(session.id, 4711);
    strict_1.default.equal(session.sessionType, "External");
});
(0, node_test_1.test)("stops connector charging session", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url: String(url), init: init || {} });
        if (String(url).endsWith("/api/v5/auth/login")) {
            return new Response(JSON.stringify({ token: token(9999), refreshToken: "refresh" }), { status: 200 });
        }
        return new Response(JSON.stringify({
            id: 4711,
            chargePointId: "cp-1",
            connectorId: 1,
            sessionType: "External",
            totalConsumptionKwh: 3.2,
            startTime: "2026-05-16T12:00:00Z",
            endTime: "2026-05-16T13:00:00Z",
        }), { status: 200 });
    };
    const api = new chargeamps_api_1.ChargeAmpsApi({
        email: "mail@example.test",
        password: "secret",
        apiKey: "api-key",
        apiBaseUrl: "https://example.test",
        fetchImpl: fetchImpl,
        now: () => 100,
    });
    const session = await api.stop("cp-1", 1);
    strict_1.default.equal(calls[1].url, "https://example.test/api/v5/chargepoints/cp-1/connectors/1/stop");
    strict_1.default.equal(calls[1].init.method, "POST");
    strict_1.default.equal(session.id, 4711);
    strict_1.default.equal(session.totalConsumptionKwh, 3.2);
});
//# sourceMappingURL=chargeamps-api.test.js.map