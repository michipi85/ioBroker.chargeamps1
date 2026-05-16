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
    }
  }
}

export type AdapterConstructorOptions = Partial<AdapterOptions>;