import { repos } from '@/config/repos';
import { PricingConfig, PaperSize, ColorType } from '@/database/entities/pricingConfig.entity';

export interface PrintConfiguration {
  copies: number;
  paper: string;
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  qualityDpi: 100 | 300 | 600;
  
  orientation?: 'portrait' | 'landscape';
}

export function priceOf(pages: number, c: PrintConfiguration): number {
  const copies = Math.max(1, Number(c.copies) || 1);
  const perPage = c.color === 'color' ? 25 : 5;
  const duplex = c.sided === 'double' ? 0.85 : 1;
  const quality = c.qualityDpi === 600 ? 1.2 : c.qualityDpi === 100 ? 0.8 : 1;
  return Math.max(5, Math.round(Math.max(1, pages) * copies * perPage * duplex * quality));
}

const PAPER_MAP: Record<string, PaperSize> = {
  A3: PaperSize.A3,
  LETTER: PaperSize.LETTER,
  LEGAL: PaperSize.LEGAL,
  A4: PaperSize.A4,
};
function mapPaper(paper: string): PaperSize {
  return PAPER_MAP[String(paper || 'A4').toUpperCase()] ?? PaperSize.A4;
}

function pickCell(cfg: PricingConfig, dpi: number, duplex: boolean): number | null {
  const f =
    duplex
      ? dpi === 100 ? cfg.price100Duplex
        : dpi === 600 ? cfg.price600Duplex
        : cfg.price300Duplex
      : dpi === 100 ? cfg.price100Simplex
        : dpi === 600 ? cfg.price600Simplex
        : cfg.price300Simplex;
  return f == null ? null : Number(f);
}

export async function computeCost(opts: {
  pageCount: number;
  paper: string;
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  qualityDpi: 100 | 300 | 600;
  copies?: number;
}): Promise<number> {
  const pages = Math.max(1, Number(opts.pageCount) || 1);
  const copies = Math.max(1, Number(opts.copies) || 1);
  const colorType = opts.color === 'color' ? ColorType.COLOR : ColorType.BLACK_WHITE;
  const duplex = opts.sided === 'double';
  const cfg = await repos.pricingConfig().findOne({
    where: { paperSize: mapPaper(opts.paper), colorType, isActive: true },
  });

  if (!cfg) {
    return priceOf(pages, {
      copies,
      paper: opts.paper,
      color: opts.color,
      sided: opts.sided,
      qualityDpi: opts.qualityDpi,
    });
  }

  const cell = pickCell(cfg, Number(opts.qualityDpi), duplex);
  if (cell != null) {
    return Math.max(5, Math.ceil(cell * pages * copies));
  }

  const perPage = Number(cfg.pricePerPage);
  const duplexMult = Number(cfg.duplexMultiplier);
  const hiResMult = Number(cfg.highResolutionMultiplier);
  let total = perPage * pages * copies;
  if (duplex) total *= duplexMult;
  if (Number(opts.qualityDpi) === 600) total *= hiResMult;
  return Math.max(5, Math.ceil(total));
}
