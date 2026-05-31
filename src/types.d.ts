import type { AdapterOptions } from "@iobroker/adapter-core";

declare global {
  namespace ioBroker {
    interface AdapterConfig {
      email: string;
      password: string;
      apiKey: string;
      apiBaseUrl: string;
      pollInterval: number;
      rfid: string;
      rfidFormat: string;
      rfidLength: number;
      pvAutomationEnabled: boolean;
      pvChargePointId: string;
      pvConnectorId: number;
      pvGridPowerState: string;
      pvGridPowerExportIsNegative: boolean;
      pvBatterySocState: string;
      pvMinBatterySoc: number;
      pvMinCurrent: number;
      pvMaxCurrent: number;
      pvVoltage: number;
      pvPhases: number;
      pvStartSurplusWatts: number;
      pvStopSurplusWatts: number;
      pvStartDelaySeconds: number;
      pvStopDelaySeconds: number;
      pvCompletionStandbyDelaySeconds: number;
    }
  }
}

export type AdapterConstructorOptions = Partial<AdapterOptions>;
