import { Request, Response, NextFunction } from 'express';
import { PrinterServiceExtensions } from '@/modules/saas/services/printerExtensions.service';

const printerExt = new PrinterServiceExtensions();

export class KioskPrinterExtensionsController {
  heartbeat = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const kiosk = (req as any).kiosk;
    res.json({
      success: true,
      message: 'Heartbeat received',
      data: {
        kioskId: kiosk?.id,
        timestamp: new Date().toISOString(),
        serverTime: Date.now(),
      },
    });
  };

  updateProgress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const code = req.body.code || req.body.jobNumber;
      const { pagesCompleted } = req.body;
      const kiosk = (req as any).kiosk;
      if (!code || pagesCompleted === undefined) {
        res.status(400).json({
          success: false,
          message: 'code and pagesCompleted are required',
        });
        return;
      }
      const result = await printerExt.updateProgress({
        code,
        pagesCompleted,
        kioskId: kiosk?.id,
        tenantId: kiosk?.tenantId,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  validateCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = req.body;
      if (!code) {
        res.status(400).json({ success: false, message: 'Code is required' });
        return;
      }
      const result = await printerExt.validateCode(code, req.kiosk?.tenantId);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  getJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = req.body;
      if (!code) {
        res.status(400).json({ success: false, message: 'Code is required' });
        return;
      }
      const result = await printerExt.getJob(code, req.kiosk?.tenantId);
      if (!result.success) {
        res.status(404).json(result);
        return;
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const kioskPrinterExtensionsController = new KioskPrinterExtensionsController();
