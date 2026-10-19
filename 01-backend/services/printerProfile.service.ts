import { AppDataSource } from '../config/database';
import { PrinterProfile, type PrinterCapabilities } from '../entities/printerProfile.entity';
import type { PrintConfiguration } from './pricing.service';

export interface ResolvedRenderOpts {
  dpi: number;
  color: boolean;
  paperSize: string | null;
}

const DPI_VALUES = [100, 300, 600];

function clampDpi(dpi: number | null | undefined): number | null {
  const n = Number(dpi);
  return DPI_VALUES.includes(n) ? (n as 100 | 300 | 600) : null;
}

export function resolveProfileRenderOpts(
  profile: { capabilities: PrinterCapabilities } | null | undefined,
  config: Partial<PrintConfiguration> | null | undefined,
): ResolvedRenderOpts {
  const caps = profile?.capabilities;
  const customerDpi = clampDpi(config?.qualityDpi);
  const profileDpi = caps ? clampDpi(caps.maxDpi) : null;

  const dpi = [customerDpi, profileDpi].filter((d): d is number => d != null);
  const effectiveDpi = dpi.length ? Math.min(...dpi) : 300;

  const customerWantsColor = config?.color !== 'bw';
  const color = caps ? caps.colorMode !== 'bw' && customerWantsColor : customerWantsColor;

  return {
    dpi: effectiveDpi,
    color,
    paperSize: caps?.paperSize ?? null,
  };
}

export async function resolveProfileForJob(opts: {
  tenantId: string | null;
  printerProfileId?: string | null;
}): Promise<PrinterProfile | null> {
  if (!opts.tenantId) return null;

  const repo = AppDataSource.getRepository(PrinterProfile);
  if (opts.printerProfileId) {
    const pinned = await repo.findOne({
      where: { id: opts.printerProfileId, tenantId: opts.tenantId, isActive: true },
    });
    if (pinned) return pinned;
  }

  return repo.findOne({
    where: { tenantId: opts.tenantId, isDefault: true, isActive: true },
  });
}
