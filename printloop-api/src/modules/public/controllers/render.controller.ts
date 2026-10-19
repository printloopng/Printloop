import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import {
  applyRenderResult,
  applyRenderFailure,
} from '@/modules/public/services/renderEnqueue.service';
import {
  renderCallbackBodySchema,
  renderFailureBodySchema,
} from '@/modules/public/validation/render.validation';

function verifySignature(req: Request): boolean {
  const secret = process.env.RENDER_CALLBACK_SECRET;
  if (!secret) return false;
  const raw: Buffer | undefined = (req as any).rawBody;
  if (!raw) return false;
  const sig = req.header('x-render-signature') || '';
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export class RenderCallbackController {
  callback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!verifySignature(req)) {
        res.status(401).json({ success: false, message: 'Invalid signature' });
        return;
      }
      const parsed = renderCallbackBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message:
            'printJobId, renderedKey, renderedPdfUrl, previewImageUrls, pageCount are required',
        });
        return;
      }
      const {
        printJobId,
        renderedKey,
        renderedPdfUrl,
        previewImageUrls,
        pageCount,
        bytes,
        durationMs,
      } = parsed.data;
      const result = await applyRenderResult({
        printJobId,
        renderedKey,
        renderedPdfUrl,
        previewImageUrls,
        pageCount,
        bytes: Number(bytes || 0),
        durationMs: durationMs ? Number(durationMs) : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  };

  failure = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!verifySignature(req)) {
        res.status(401).json({ success: false, message: 'Invalid signature' });
        return;
      }
      const parsed = renderFailureBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'printJobId is required',
        });
        return;
      }
      const { printJobId, errorMessage } = parsed.data;
      const result = await applyRenderFailure({
        printJobId,
        errorMessage: String(errorMessage || 'Unknown render error'),
      });
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  };
}

export const renderCallbackController = new RenderCallbackController();
