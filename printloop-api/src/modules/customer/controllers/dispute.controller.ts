import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { Dispute, DisputeStatus } from '@/database/entities/dispute.entity';
import { resolveDisputeBodySchema } from '@/modules/customer/validation/dispute.validation';

export class DisputeController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenant!.id;
      const disputes = await AppDataSource.getRepository(Dispute).find({
        where: { tenantId },
        relations: ['user', 'printJob'],
        order: { createdAt: 'DESC' },
      });
      res.json({ success: true, data: disputes });
    } catch (error) {
      next(error);
    }
  };

  resolve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenant!.id;
      const disputeId = req.params.id;
      const parsed = resolveDisputeBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ success: false, message: 'Status must be resolved or rejected.' });
        return;
      }
      const { status, resolutionNotes } = parsed.data;

      const disputeRepo = AppDataSource.getRepository(Dispute);
      const dispute = await disputeRepo.findOne({
        where: { id: disputeId, tenantId },
        relations: ['printJob'],
      });
      if (!dispute) {
        res.status(404).json({ success: false, message: 'Dispute not found.' });
        return;
      }
      if (dispute.status !== DisputeStatus.PENDING) {
        res.status(400).json({
          success: false,
          message: 'Dispute has already been resolved or rejected.',
        });
        return;
      }
      dispute.status = status;
      dispute.resolutionNotes =
        resolutionNotes ||
        (status === DisputeStatus.RESOLVED ? 'Resolved by admin' : 'Dispute rejected by admin');
      await disputeRepo.save(dispute);
      res.json({ success: true, data: dispute });
    } catch (error) {
      next(error);
    }
  };
}

export const disputeController = new DisputeController();
