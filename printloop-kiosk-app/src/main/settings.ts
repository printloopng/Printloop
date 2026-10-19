import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

const SETTINGS_FILE = path.join(__dirname, '../../../kiosk-settings.json');

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
    if (raw[key] !== undefined) {
      (next as unknown as Record<string, unknown>)[key] = raw[key];
    }
  }
  // Floor of 3s keeps a mistyped value from hammering the API.
  next.pollInterval = Math.max(3000, Number(next.pollInterval) || DEFAULT_SETTINGS.pollInterval);
  return next;
}

export function loadSettings(): KioskSettings {
  if (settingsLoaded) return cachedSettings;

  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      cachedSettings = pickPersisted(JSON.parse(data) as Record<string, unknown>);
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

  const settings = loadSettings();
  const settingsRecord = settings as unknown as Record<string, unknown>;
  settingsRecord[key] =
    key === 'pollInterval'
      ? Math.max(3000, Number(value) || DEFAULT_SETTINGS.pollInterval)
      : typeof value === 'string'
        ? value
        : String(value);

  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    cachedSettings = settings;
    logger.info({ key }, 'Setting updated');
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to save setting');
    throw error;
  }
}

export async function saveSettings(settings: Partial<KioskSettings>): Promise<void> {
  const current = loadSettings();
  const merged = pickPersisted({ ...current, ...settings } as unknown as Record<string, unknown>);

  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2));
    cachedSettings = merged;
    logger.info('Settings saved');
  } catch (error) {
    logger.error({ err: error }, 'Failed to save settings');
    throw error;
  }
}

export function isConfigured(): boolean {
  const settings = loadSettings();
  return !!(settings.apiKey && settings.printerUri);
}
