import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { logger } from '../utils/logger';

const settingsFile = () => path.join(app.getPath('userData'), 'kiosk-settings.json');
const LEGACY_SETTINGS_FILE = path.join(__dirname, '../../../kiosk-settings.json');

export interface KioskSettings {
  apiKey: string;
  printerUri: string;
  pollInterval: number;
  kioskName: string;
}

const DEFAULT_SETTINGS: KioskSettings = {
  apiKey: '',
  printerUri: '',
  pollInterval: 10000,
  kioskName: 'PrintLoop Kiosk',
};

const PERSISTED_KEYS = new Set<keyof KioskSettings>([
  'apiKey',
  'printerUri',
  'pollInterval',
  'kioskName',
]);

let cachedSettings: KioskSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

function pickPersisted(raw: Record<string, unknown>): KioskSettings {
  const next: KioskSettings = { ...DEFAULT_SETTINGS };
  for (const key of PERSISTED_KEYS) {
    if (raw[key] !== undefined && raw[key] !== '') {
      (next as unknown as Record<string, unknown>)[key] = raw[key];
    }
  }
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
  record[key] =
    key === 'pollInterval'
      ? Math.max(3000, Number(value) || DEFAULT_SETTINGS.pollInterval)
      : String(value ?? '').trim();

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
  return !!(settings.apiKey && settings.printerUri);
}
