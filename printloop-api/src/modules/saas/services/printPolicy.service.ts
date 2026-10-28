import { Config } from '@/config';
import { repos } from '@/config/repos';

export interface PolicyJob {
  totalPages: number;
  copies: number;
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  paper: string;
  fileName?: string;
  jobType?: string;
}

export interface PolicyResult {
  allow: boolean;
  deniedReason?: string;
  mutated: PolicyJob;
  notes: string[];
}

let cache: { at: number; map: Record<string, string> } = { at: 0, map: {} };
const TTL_MS = 20_000;

async function settingsMap(): Promise<Record<string, string>> {
  if (Date.now() - cache.at < TTL_MS) return cache.map;
  try {
    const rows = await repos.systemSetting().find();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    cache = { at: Date.now(), map };
  } catch {
    
  }
  return cache.map;
}

const num = (v: string | undefined, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const bool = (v: string | undefined) => v === 'true' || v === '1';

export async function evaluatePrintPolicy(job: PolicyJob): Promise<PolicyResult> {
  const s = await settingsMap();
  const notes: string[] = [];
  const mutated: PolicyJob = { ...job };

  if (!bool(s.policyEnabled)) {
    return { allow: true, mutated, notes: ['policy disabled'] };
  }

  const sheets = Math.max(1, mutated.totalPages) * Math.max(1, mutated.copies);

  const maxPages = num(s.policyMaxPagesPerJob, 0);
  if (maxPages > 0 && mutated.totalPages > maxPages) {
    return {
      allow: false,
      deniedReason: `Job exceeds the ${maxPages}-page limit (${mutated.totalPages}).`,
      mutated,
      notes,
    };
  }

  const blocked = (s.policyBlockedFileTypes || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (blocked.length && mutated.fileName) {
    const ext = mutated.fileName.split('.').pop()?.toLowerCase() || '';
    if (blocked.includes(ext)) {
      return { allow: false, deniedReason: `.${ext} files are not allowed at kiosks.`, mutated, notes };
    }
  }

  if (bool(s.policyDenyColor) && mutated.color === 'color') {
    return { allow: false, deniedReason: 'Colour printing is currently disabled by policy.', mutated, notes };
  }

  const maxCopies = num(s.policyMaxCopiesPerJob, 0);
  if (maxCopies > 0 && mutated.copies > maxCopies) {
    notes.push(`copies clamped ${mutated.copies}→${maxCopies}`);
    mutated.copies = maxCopies;
  }

  const monoOver = num(s.policyForceMonochromeOverPages, 0);
  if (monoOver > 0 && mutated.color === 'color' && sheets >= monoOver) {
    notes.push(`forced monochrome (≥${monoOver} sheets)`);
    mutated.color = 'bw';
  }

  const duplexOver = num(s.policyForceDuplexOverPages, 0);
  if (duplexOver > 0 && mutated.sided === 'single' && mutated.totalPages >= duplexOver) {
    notes.push(`forced duplex (≥${duplexOver} pages)`);
    mutated.sided = 'double';
  }

  return { allow: true, mutated, notes };
}

export async function ippConnectionPrefs(): Promise<{
  secure: boolean;
  port?: number;
  rejectUnauthorized: boolean;
  path: string;
  version: '1.0' | '1.1' | '2.0';
  
  transport: 'ipp' | 'raw9100' | 'lpr' | 'email';
  
  rawPort: number;
}> {
  const s = await settingsMap();
  const secure = bool(s.ippSecure) || Config.ipp.secure;
  const port =
    num(s.ippPort, 0) || Config.ipp.port || undefined;
  const rejectUnauthorized =
    bool(s.ippTlsRejectUnauthorized) || Config.ipp.tlsRejectUnauthorized;
  const rawPath = (s.ippPath && String(s.ippPath).trim()) || Config.ipp.path;
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const versionRaw = String(s.ippVersion || Config.ipp.version).trim();
  const version: '1.0' | '1.1' | '2.0' =
    versionRaw === '1.0' ? '1.0' : versionRaw === '1.1' ? '1.1' : '2.0';
  const transportRaw = String(s.ippTransport || Config.ipp.transport).trim();
  const transport: 'ipp' | 'raw9100' | 'lpr' | 'email' =
    transportRaw === 'raw9100'
      ? 'raw9100'
      : transportRaw === 'lpr'
      ? 'lpr'
      : transportRaw === 'email'
      ? 'email'
      : 'ipp';
  const rawPort = num(s.ippRawPort, 0) || Config.ipp.rawPort;
  return { secure, port, rejectUnauthorized, path, version, transport, rawPort };
}

export async function printDispatchMode(): Promise<'cloud-push' | 'kiosk-pull'> {
  const s = await settingsMap();
  const raw = String(Config.printDispatchMode || s.printDispatchMode || 'cloud-push').trim();
  return raw === 'kiosk-pull' ? 'kiosk-pull' : 'cloud-push';
}
