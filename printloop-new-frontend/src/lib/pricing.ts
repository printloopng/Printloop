
export type PricingRow = {
  paperSize: string;
  colorType: "BLACK_WHITE" | "COLOR";
  pricePerPage: number;
  duplexMultiplier: number;
  highResolutionMultiplier: number;
  price100Simplex: number | null;
  price300Simplex: number | null;
  price600Simplex: number | null;
  price100Duplex: number | null;
  price300Duplex: number | null;
  price600Duplex: number | null;
};

export type PriceableConfig = {
  copies?: number;
  color: "bw" | "color";
  sided: "single" | "double";
  paper: string;
  qualityDpi: 100 | 300 | 600;
  orientation?: "portrait" | "landscape";
};

const FLOOR = 5;

export function priceFromMatrix(
  pages: number,
  c: PriceableConfig,
  rows: PricingRow[] | undefined,
): number {
  const copies = Math.max(1, Number(c.copies) || 1);
  const pageCount = Math.max(1, Number(pages) || 1);
  const paper = String(c.paper || "A4").toUpperCase();
  const colorType = c.color === "color" ? "COLOR" : "BLACK_WHITE";
  const duplex = c.sided === "double";
  const dpi = c.qualityDpi;

  const cfg = rows?.find(
    (r) => r.paperSize === paper && r.colorType === colorType,
  );

  if (cfg) {
    const cell = duplex
      ? dpi === 100 ? cfg.price100Duplex
        : dpi === 600 ? cfg.price600Duplex
        : cfg.price300Duplex
      : dpi === 100 ? cfg.price100Simplex
        : dpi === 600 ? cfg.price600Simplex
        : cfg.price300Simplex;
    if (cell != null) {
      return Math.max(FLOOR, Math.ceil(Number(cell) * pageCount * copies));
    }
    const dupMult = duplex ? Number(cfg.duplexMultiplier) || 1 : 1;
    const hiMult = dpi === 600 ? Number(cfg.highResolutionMultiplier) || 1 : 1;
    const total = Number(cfg.pricePerPage) * pageCount * copies * dupMult * hiMult;
    return Math.max(FLOOR, Math.ceil(total));
  }

  const perPage = c.color === "color" ? 25 : 5;
  const duplexMult = c.sided === "double" ? 0.85 : 1;
  const quality = c.qualityDpi === 600 ? 1.2 : c.qualityDpi === 100 ? 0.8 : 1;
  return Math.max(
    FLOOR,
    Math.round(pageCount * copies * perPage * duplexMult * quality),
  );
}
