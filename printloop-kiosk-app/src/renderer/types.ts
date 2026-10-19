export interface KioskSettings {
  apiKey: string;
  printerUri: string;
  pollInterval: number;
  kioskName: string;
}

export interface PrintJobData {
  jobId: string;
  code: string;
  fileName: string | null;
  totalPages: number;
  cost: number;
  printConfig: {
    copies?: number;
    paper?: string;
    color?: 'bw' | 'color';
    sided?: 'single' | 'double';
  };
}

export interface ReleaseResult {
  mode: 'kiosk-pull' | 'cloud-push';
}

export interface JobUpdate {
  jobId: string;
  code: string | null;
  state: 'printing' | 'done' | 'failed' | 'requeued';
  item?: number;
  totalItems?: number;
  pagesCompleted?: number;
  totalPages?: number;
  error?: string;
}

export interface QueueStatus {
  online: boolean;
  printer: 'idle' | 'processing' | 'stopped' | 'unreachable' | 'unknown';
  printerReasons?: string;
  queued: number;
  waitingForPickup: number;
  current: JobUpdate | null;
  lastPollAt: string | null;
  error?: string;
}

export interface PrinterInfo {
  uri: string;
  name: string;
  makeAndModel: string;
  state: string;
  isDefault: boolean;
}

export interface TestPrintResult {
  success: boolean;
  error?: string;
}

declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      quit: () => void;
      restart: () => void;
      onKioskEvent: (callback: (event: string, data: unknown) => void) => () => void;
      printJob: {
        fetch: (code: string) => Promise<PrintJobData>;
        release: (code: string) => Promise<ReleaseResult>;
      };
      queue: {
        status: () => Promise<QueueStatus>;
      };
      settings: {
        get: () => Promise<KioskSettings>;
        set: (key: string, value: unknown) => Promise<void>;
      };
      printer: {
        list: () => Promise<PrinterInfo[]>;
        test: (printerUri: string) => Promise<TestPrintResult>;
      };
    };
  }
}
