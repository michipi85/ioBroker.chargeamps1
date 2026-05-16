import assert from "node:assert/strict";
import { test } from "node:test";
import { ChargeAmpsApi } from "../src/chargeamps-api";

function token(exp: number): string {
  return `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;
}

test("logs in and requests owned chargepoints", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init || {} });
    if (String(url).endsWith("/api/v5/auth/login")) {
      return new Response(JSON.stringify({ token: token(9999), refreshToken: "refresh" }), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };

  const api = new ChargeAmpsApi({
    email: "mail@example.test",
    password: "secret",
    apiKey: "api-key",
    apiBaseUrl: "https://example.test/",
    fetchImpl: fetchImpl as typeof fetch,
    now: () => 100,
  });

  await api.getChargePoints();

  assert.equal(calls[0].url, "https://example.test/api/v5/auth/login");
  assert.equal(calls[1].url, "https://example.test/api/v5/chargepoints/owned");
  assert.equal((calls[1].init.headers as Record<string, string>).Authorization, `Bearer ${token(9999)}`);
});

test("uses refresh token when access token expires", async () => {
  const urls: string[] = [];
  const fetchImpl = async (url: string | URL | Request): Promise<Response> => {
    urls.push(String(url));
    if (String(url).endsWith("/api/v5/auth/login")) {
      return new Response(JSON.stringify({ token: token(101), refreshToken: "refresh-1" }), { status: 200 });
    }
    if (String(url).endsWith("/api/v5/auth/refreshToken")) {
      return new Response(JSON.stringify({ token: token(9999), refreshToken: "refresh-2" }), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };

  const api = new ChargeAmpsApi({
    email: "mail@example.test",
    password: "secret",
    apiKey: "api-key",
    apiBaseUrl: "https://example.test",
    fetchImpl: fetchImpl as typeof fetch,
    now: () => 100,
  });

  await api.getChargePoints();
  await api.getChargePoints();

  assert.deepEqual(urls, [
    "https://example.test/api/v5/auth/login",
    "https://example.test/api/v5/chargepoints/owned",
    "https://example.test/api/v5/auth/refreshToken",
    "https://example.test/api/v5/chargepoints/owned",
  ]);
});
