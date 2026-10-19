import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { logger } from '../utils/logger';

// Per-user app-data folder: writable without admin rights, survives updates.
// (Next to the app files is Program Files on Windows — read-only.)
const settingsFile = () => path.join(app.getPath('userData'), 'kiosk-settings.json');
const LEGACY_SETTINGS_FILE = path.join(__dirname, '../../../kiosk-settings.json');

export interface KioskSettings {
  apiUrl: string;
  apiKey: string;
  printerUri: string;
  pollInterval: number;
  kioskName: string;
}

const DEFAULT_SETTINGS: KioskSettings = {
  // Installers ship without .env, so the server address is a setting;
  // API_URL only pre-fills it in development.
  apiUrl: process.env.API_URL?.trim() || '',
  apiKey: '',
  printerUri: '',
  pollInterval: 10000,
  kioskName: 'PrintLoop Kiosk',
};

const PERSISTED_KEYS = new Set<keyof KioskSettings>([
  'apiUrl',
  'apiKey',
  'printerUri',
  'pollInterval',
  'kioskName',
]);

let cachedSettings: KioskSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

export function normalizeApiUrl(raw: unknown): string {
  const url = String(raw ?? '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
  return /^https?:\/\/[^\s/]+/i.test(url) ? url : '';
}

function pickPersisted(raw: Record<string, unknown>): KioskSettings {
  const next: KioskSettings = { ...DEFAULT_SETTINGS };
  for (const key of PERSISTED_KEYS) {
    if (raw[key] !== undefined && raw[key] !== '') {
      (next as unknown as Record<string, unknown>)[key] = raw[key];
    }
  }
  next.apiUrl = normalizeApiUrl(next.apiUrl);
  // Floor of 3s keeps a mistyped value from hammering the API.
  next.pollInterval = Math.max(3000, Number(next.pollInterval) || DEFAULT_SETTINGS.pollInterval);
  return next;
}

function readFile(file: string): KioskSettings | null {
  if (!fs.existsSync(file)) return null;
  return pickPersisted(JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>);
}

function writeFile(settings: KioskSettings): void {
  const file = settingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

export function loadSettings(): KioskSettings {
  if (settingsLoaded) return cachedSettings;

  try {
    const current = readFile(settingsFile());
    if (current) {
      cachedSettings = current;
    } else {
      const legacy = readFile(LEGACY_SETTINGS_FILE);
      if (legacy) {
        cachedSettings = legacy;
        writeFile(legacy);
        logger.info('Migrated kiosk settings to the app-data folder');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to load settings, using defaults');
    cachedSettings = { ...DEFAULT_SETTINGS };
  }

  settingsLoaded = true;
  return cachedSettings;
}

export function getSettings(): KioskSettings {
  return loadSettings();
}

export async function setSetting(key: keyof KioskSettings, value: unknown): Promise<void> {
  if (!PERSISTED_KEYS.has(key)) {
    throw new Error(`Unknown or non-persisted setting: ${String(key)}`);
  }

  const settings = { ...loadSettings() };
  const record = settings as unknown as Record<string, unknown>;
  if (key === 'pollInterval') {
    record[key] = Math.max(3000, Number(value) || DEFAULT_SETTINGS.pollInterval);
  } else if (key === 'apiUrl') {
    const url = normalizeApiUrl(value);
    if (value && !url) throw new Error('Server address must start with https:// (or http:// on a LAN)');
    record[key] = url;
  } else {
    record[key] = String(value ?? '').trim();
  }

  try {
    writeFile(settings);
    cachedSettings = settings;
    logger.info({ key }, 'Setting updated');
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to save setting');
    throw error;
  }
}

export function isConfigured(): boolean {
  const settings = loadSettings();
  return !!(settings.apiUrl && settings.apiKey && settings.printerUri);
}
