import { Request, Response, Router } from 'express';
import crypto from 'node:crypto';
import {
  applyRenderResult,
  applyRenderFailure,
} from '../services/renderEnqueue.service';

const router = Router();

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

router.post('/callback', async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    res.status(401).json({ success: false, message: 'Invalid signature' });
    return;
  }
  const { printJobId, renderedKey, renderedPdfUrl, previewImageUrls, pageCount, bytes, durationMs } =
    req.body || {};
  if (!printJobId || !renderedKey || !renderedPdfUrl || !Array.isArray(previewImageUrls) || typeof pageCount !== 'number') {
    res.status(400).json({
      success: false,
      message: 'printJobId, renderedKey, renderedPdfUrl, previewImageUrls, pageCount are required',
    });
    return;
  }
  try {
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
  } catch (err: any) {
    console.error('Render callback error:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Callback failed' });
  }
});

router.post('/failure', async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    res.status(401).json({ success: false, message: 'Invalid signature' });
    return;
  }
  const { printJobId, errorMessage } = req.body || {};
  if (!printJobId) {
    res.status(400).json({
      success: false,
      message: 'printJobId is required',
    });
    return;
  }
  try {
    const result = await applyRenderFailure({
      printJobId,
      errorMessage: String(errorMessage || 'Unknown render error'),
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Render failure callback error:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Callback failed' });
  }
});

export default router;
