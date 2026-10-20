import { Request, Response, NextFunction } from 'express';
import { shopPriceList } from '@/modules/public/services/priceList.service';

export class PublicPricingController {
  getMatrix = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: await shopPriceList(req.tenant) });
    } catch (err) {
      next(err);
    }
  };
}

export const publicPricingController = new PublicPricingController();
