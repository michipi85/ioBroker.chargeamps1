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

export interface ChargingSession {
  id: number;
  chargePointId: string;
  connectorId: number;
  sessionType: string;
  totalConsumptionKwh: number;
  startTime?: string | null;
  endTime?: string | null;
}

export interface ChargeAmpsApiOptions {
  email: string;
  password: string;
  apiKey: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface AuthResponse {
  token: string;
  refreshToken: string;
}

export class ChargeAmpsApiError extends Error {
  public readonly status: number;
  public readonly body: string;

  public constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "ChargeAmpsApiError";
    this.status = status;
    this.body = body;
  }
}

export class ChargeAmpsApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private token: string | undefined;
  private refreshToken: string | undefined;
  private tokenExpiresAt = 0;

  public constructor(private readonly options: ChargeAmpsApiOptions) {
    this.baseUrl = (options.apiBaseUrl || "https://eapi.charge.space").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl || fetch;
    this.now = options.now || (() => Math.floor(Date.now() / 1000));
  }

  public async getChargePoints(): Promise<ChargePoint[]> {
    return this.request<ChargePoint[]>("/api/v5/chargepoints/owned");
  }

  public async getChargePointStatus(chargePointId: string): Promise<ChargePointStatus> {
    return this.request<ChargePointStatus>(`/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/status`);
  }

  public async getChargePointSettings(chargePointId: string): Promise<ChargePointSettings> {
    return this.request<ChargePointSettings>(`/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/settings`);
  }

  public async setChargePointSettings(settings: ChargePointSettings): Promise<void> {
    await this.request<void>(`/api/v5/chargepoints/${encodeURIComponent(settings.id)}/settings`, {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  }

  public async getConnectorSettings(chargePointId: string, connectorId: number): Promise<ConnectorSettings> {
    return this.request<ConnectorSettings>(
      `/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/connectors/${connectorId}/settings`,
    );
  }

  public async setConnectorSettings(settings: ConnectorSettings): Promise<void> {
    await this.request<void>(
      `/api/v5/chargepoints/${encodeURIComponent(settings.chargePointId)}/connectors/${settings.connectorId}/settings`,
      {
        method: "PUT",
        body: JSON.stringify(settings),
      },
    );
  }

  public async remoteStart(chargePointId: string, connectorId: number, startAuth: StartAuth): Promise<void> {
    await this.request<void>(
      `/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/connectors/${connectorId}/remotestart`,
      {
        method: "PUT",
        body: JSON.stringify(startAuth),
      },
    );
  }

  public async start(chargePointId: string, connectorId: number): Promise<ChargingSession> {
    return this.request<ChargingSession>(
      `/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/connectors/${connectorId}/start`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
  }

  public async stop(chargePointId: string, connectorId: number): Promise<ChargingSession> {
    return this.request<ChargingSession>(
      `/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/connectors/${connectorId}/stop`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
  }

  public async remoteStop(chargePointId: string, connectorId: number): Promise<void> {
    await this.request<void>(
      `/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/connectors/${connectorId}/remotestop`,
      {
        method: "PUT",
        body: JSON.stringify({}),
      },
    );
  }

  public async reboot(chargePointId: string): Promise<void> {
    await this.request<void>(`/api/v5/chargepoints/${encodeURIComponent(chargePointId)}/reboot`, {
      method: "PUT",
      body: JSON.stringify({}),
    });
  }

  private async ensureToken(): Promise<void> {
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
      } catch {
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

  private async authenticate(path: string, payload: unknown): Promise<void> {
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

    const auth = JSON.parse(body) as AuthResponse;
    this.token = auth.token;
    this.refreshToken = auth.refreshToken;
    this.tokenExpiresAt = readJwtExpiration(auth.token);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
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

    return body ? (JSON.parse(body) as T) : (undefined as T);
  }
}

function readJwtExpiration(token: string): number {
  const [, payload] = token.split(".");
  if (!payload) {
    return 0;
  }

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(normalized, "base64").toString("utf8");
  const parsed = JSON.parse(decoded) as { exp?: number };
  return parsed.exp || 0;
}
