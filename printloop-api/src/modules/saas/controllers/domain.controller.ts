import { Request, Response } from 'express';
import { claimDomainBodySchema } from '@/modules/saas/validation/domain.validation';

export class DomainController {
  listDomains = async (req: Request, res: Response) => {
    const { listDomains } = await import('@/modules/saas/services/customDomain.service');
    const rows = await listDomains(req.tenant!.id);
    res.json({ success: true, data: rows });
  };

  claimDomain = async (req: Request, res: Response) => {
    try {
      claimDomainBodySchema.safeParse(req.body ?? {});
      const { claimDomain } = await import('@/modules/saas/services/customDomain.service');
      const result = await claimDomain(req.tenant!.id, req.body?.domain);
      res.status(201).json({
        success: true,
        data: {
          id: result.row.id,
          domain: result.row.domain,
          status: result.row.status,
          dns: {
            txt: result.txtRecord,
            cname: { name: result.row.domain, value: result.cname },
          },
        },
      });
    } catch (err: any) {
      if (err?.name === 'DomainError') {
        res
          .status(err.httpStatus || 400)
          .json({ success: false, message: err.message, code: err.code });
        return;
      }
      console.error('Domain claim error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Claim failed' });
    }
  };

  verifyDomain = async (req: Request, res: Response) => {
    try {
      const { verifyDomain } = await import('@/modules/saas/services/customDomain.service');
      const result = await verifyDomain(req.tenant!.id, req.params.id);
      if (!result.verified) {
        res.status(422).json({
          success: false,
          message: result.reason || 'Verification failed',
          code: 'DOMAIN_NOT_VERIFIED',
        });
        return;
      }
      res.json({ success: true, data: { verified: true } });
    } catch (err: any) {
      if (err?.name === 'DomainError') {
        res
          .status(err.httpStatus || 400)
          .json({ success: false, message: err.message, code: err.code });
        return;
      }
      console.error('Domain verify error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Verify failed' });
    }
  };

  removeDomain = async (req: Request, res: Response) => {
    try {
      const { removeDomain } = await import('@/modules/saas/services/customDomain.service');
      await removeDomain(req.tenant!.id, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.name === 'DomainError') {
        res
          .status(err.httpStatus || 400)
          .json({ success: false, message: err.message, code: err.code });
        return;
      }
      console.error('Domain delete error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Delete failed' });
    }
  };
}
