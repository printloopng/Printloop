
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { UserRole } from '../entities/user.entity';
import {
  isPrintableDocument,
  isPdf,
  renderToPrinterLanguage,
  ghostscriptAvailable,
  rasterRenderAvailable,
  type PrinterLang,
} from '../services/documentConvert.service';
import {
  convertOfficeAvailable,
  conversionEnabled,
} from '../services/documentConversion.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user || user.role !== UserRole.SUPER_ADMIN) {
    res.status(403).json({ success: false, message: 'Super admin only' });
    return;
  }
  next();
}

router.get('/diag', requireSuperAdmin, async (_req: Request, res: Response) => {
  const [ghostscript, rasterRender, officeConvert] = await Promise.all([
    ghostscriptAvailable(),
    rasterRenderAvailable(),
    convertOfficeAvailable(),
  ]);
  res.json({
    success: true,
    data: {
      ghostscript,
      rasterRender,
      officeConvertEnabled: conversionEnabled(),
      officeConvert,
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
    },
  });
});

router.post('/render', requireSuperAdmin, upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file || !isPdf(file.buffer) || !isPrintableDocument(file.originalname || 'x.pdf', file.mimetype)) {
    res.status(400).json({ success: false, message: 'Attach a PDF as form field `file`.' });
    return;
  }
  const lang: PrinterLang = req.query.lang === 'ps' ? 'ps' : 'pcl';
  const color = req.query.color === 'color' ? 'color' : 'bw';
  const dpi = Number(req.query.dpi) || 600;
  const duplex = req.query.duplex === '1' || req.query.duplex === 'true';
  const copies = Number(req.query.copies) || 1;

  const out = await renderToPrinterLanguage(file.buffer, { lang, color, dpi, duplex, copies });
  if (!out) {
    res.status(500).json({
      success: false,
      message: 'Render failed — is Ghostscript installed? Check GET /api/admin/spike/diag.',
    });
    return;
  }

  const base = (file.originalname || 'document').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 60);
  res.setHeader('Content-Type', lang === 'ps' ? 'application/postscript' : 'application/vnd.hp-pcl');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${base}-${color}-${dpi}${duplex ? '-duplex' : ''}.${lang}"`,
  );
  res.send(out);
});

export default router;
