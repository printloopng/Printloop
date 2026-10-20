import { type Request, type Response, type NextFunction } from 'express';
import { PrinterServiceExtensions } from '@/modules/saas/services/printerExtensions.service';
import { GroupSessionService } from '@/modules/customer/services/groupSession.service';
import { IppService, type PrintOptions } from '@/modules/kiosk/services/ipp.service';
import {
  evaluatePrintPolicy,
  ippConnectionPrefs,
  printDispatchMode,
} from '@/modules/saas/services/printPolicy.service';
import { AppDataSource } from '@/config/data-source';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { PrintJobItem } from '@/database/entities/printJobItem.entity';
import { File } from '@/database/entities/file.entity';
import { loadDocumentBytes } from '@/core/utils/fileStore';
import {
  ensurePdf,
  toGrayscale,
  fitToOrientation,
  UnsupportedDocumentError,
} from '@/modules/public/services/documentConvert.service';
import { settleShortfall } from '@/modules/saas/services/costReconciliation.service';
import { releaseJobToKiosk } from '@/modules/kiosk/services/release.service';

const printerExt = new PrinterServiceExtensions();
const groupSvc = new GroupSessionService();
const ipp = new IppService();

async function dispatchPrint(
  printerIp: string,
  source: any,
  jobName: string,
  opts: PrintOptions,
  transport: 'ipp' | 'raw9100' | 'lpr' | 'email',
  rawPort: number,
): Promise<any> {
  if (transport === 'raw9100') {
    return ipp.rawPrint(printerIp, source, jobName, opts, rawPort);
  }
  if (transport === 'lpr') {
    const lprPort = rawPort === 9100 ? 515 : rawPort;
    return ipp.lprPrint(printerIp, source, jobName, opts, lprPort);
  }
  if (transport === 'email') {
    return ipp.emailPrint(printerIp, source, jobName, opts);
  }
  return ipp.printJob(printerIp, source, jobName, opts);
}

async function maybeGrayscale(buffer: Buffer, color: string | undefined): Promise<Buffer> {
  return color && color !== 'color' ? toGrayscale(buffer) : buffer;
}

async function maybeOrient(buffer: Buffer, orientation: string | undefined): Promise<Buffer> {
  return orientation === 'landscape' || orientation === 'portrait'
    ? fitToOrientation(buffer, orientation)
    : buffer;
}

function parsePages(cfg: any): number[] | null {
  if (!cfg || cfg.pages !== 'range' || !cfg.pageRange) return null;
  const out: number[] = [];
  for (const chunk of String(cfg.pageRange).split(',')) {
    const m = chunk.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) for (let p = +m[1]; p <= +m[2]; p++) out.push(p);
    else if (/^\d+$/.test(chunk.trim())) out.push(+chunk.trim());
  }
  return out.length ? out : null;
}

export class KioskPrinterController {
  complete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const code = req.body.code || req.body.jobNumber;
      const { cost, totalPages } = req.body;
      const kiosk = (req as any).kiosk;
      if (!code) {
        res.status(400).json({ success: false, message: 'code is required' });
        return;
      }

      const dispatchMode = await printDispatchMode();
      if (dispatchMode === 'cloud-push' && !kiosk?.ipAddress) {
        res.status(409).json({
          success: false,
          message: 'This kiosk has no printer address configured.',
          code: 'KIOSK_NO_PRINTER',
        });
        return;
      }

      const jobRepo = AppDataSource.getRepository(PrintJob);
      const job = await jobRepo.findOne({
        where: kiosk?.tenantId ? { code, tenantId: kiosk.tenantId } : { code },
      });
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }

      if (dispatchMode === 'kiosk-pull') {
        const result = await releaseJobToKiosk(job, kiosk.id, { totalPagesHint: Number(totalPages) || undefined });
        if (!result.ok) {
          res.status(result.status).json({
            success: false,
            message: result.message,
            code: result.code,
            ...(result.amountDue != null ? { amountDue: result.amountDue } : {}),
          });
          return;
        }
        res.json({
          success: true,
          message: 'Released to on-site agent. The kiosk will dispatch to the printer shortly.',
          data: { mode: 'kiosk-pull', status: PrintJobStatus.RELEASING, batch: result.batch, total: result.total },
        });
        return;
      }

      if (job.status !== PrintJobStatus.READY) {
        res.status(409).json({
          success: false,
          message: `This job is ${job.status} and can't be sent to the printer.`,
          code: 'JOB_NOT_RELEASABLE',
        });
        return;
      }

      const settlement = await settleShortfall(job.id);
      if (
        settlement.reason === 'charge-failed' ||
        settlement.reason === 'no-card-on-file'
      ) {
        res.status(402).json({
          success: false,
          message: `Final price is ₦${settlement.shortfall} more than what you paid, and the saved card could not be charged. Please contact the shop to settle the difference.`,
          code: 'PAYMENT_DUE',
          amountDue: settlement.shortfall,
        });
        return;
      }

      const cfg: any = job.printConfiguration || {};

      const items = await AppDataSource.getRepository(PrintJobItem).find({
        where: { printJobId: job.id },
        order: { order: 'ASC' },
      });
      if (items.length) {
        const prefs = await ippConnectionPrefs();
        const collate = cfg.collate !== false;
        const fileRepo = AppDataSource.getRepository(File);

        const planned: Array<{ it: PrintJobItem; pol: any }> = [];
        for (const it of items) {
          const ic: any = it.printConfiguration || {};
          const pol = await evaluatePrintPolicy({
            totalPages: it.totalPages || 1,
            copies: ic.copies || 1,
            color: ic.color === 'color' ? 'color' : 'bw',
            sided: ic.sided === 'double' ? 'double' : 'single',
            paper: ic.paper || 'A4',
            fileName: it.fileName,
            jobType: job.jobType,
          });
          if (!pol.allow) {
            res.status(403).json({
              success: false,
              message: `${it.fileName}: ${pol.deniedReason || 'Blocked by print policy.'}`,
              code: 'PRINT_POLICY_DENIED',
            });
            return;
          }
          planned.push({ it, pol });
        }

        let printed = 0;
        for (const { it, pol } of planned) {
          const f = await fileRepo.findOne({ where: { id: it.fileId } });
          const url = f?.fileURL;
          if (!url) continue;
          let src: any = { url };
          try {
            const b = await loadDocumentBytes(url);
            if (b) {
              const pdf = await ensurePdf(b, f?.fileName || it.fileName || 'doc.pdf');
              src = {
                buffer: await maybeOrient(
                  await maybeGrayscale(pdf.buffer, pol.mutated.color),
                  (it.printConfiguration as any)?.orientation,
                ),
              };
            }
          } catch (e: any) {
            if (e instanceof UnsupportedDocumentError) {
              res.status(415).json({ success: false, message: e.message, code: e.code });
              return;
            }
            res.status(422).json({
              success: false,
              message: `${it.fileName} could not be prepared for printing.`,
              code: 'CONVERT_FAILED',
            });
            return;
          }
          const opts: PrintOptions = {
            copies: pol.mutated.copies,
            sided: pol.mutated.sided,
            color: pol.mutated.color,
            paper: pol.mutated.paper || 'A4',
            orientation:
              (it.printConfiguration as any)?.orientation === 'landscape'
                ? 'landscape'
                : 'portrait',
            qualityDpi: (it.printConfiguration as any)?.qualityDpi,
            collate,
            requestingUser: 'PrintLoop-Kiosk',
            secure: prefs.secure,
            port: prefs.port,
            tlsRejectUnauthorized: prefs.rejectUnauthorized,
            path: prefs.path,
            version: prefs.version,
          };
          try {
            await dispatchPrint(
              kiosk.ipAddress,
              src,
              `${job.code} · ${it.fileName}`,
              opts,
              prefs.transport,
              prefs.rawPort,
            );
            printed++;
          } catch (e: any) {
            console.error(`[printer/complete batch] IPP error for ${it.fileName}:`, e?.message);
          }
        }

        const result = await printerExt.completePrintJob({
          code,
          kioskId: kiosk.id,
          kioskName: kiosk.name,
          cost: Number(job.cost) || 0,
          totalPages: job.totalPages || 0,
        });
        res.status(result.success ? 200 : 404).json({
          ...result,
          data: {
            ...(result.data || {}),
            batch: true,
            printed,
            total: items.length,
            transport: prefs.secure ? 'ipps' : 'ipp',
            policyNotes: planned[0]?.pol?.notes,
          },
        });
        return;
      }

      const policy = await evaluatePrintPolicy({
        totalPages: job.totalPages || Number(totalPages) || 1,
        copies: cfg.copies || 1,
        color: cfg.color === 'color' ? 'color' : 'bw',
        sided: cfg.sided === 'double' ? 'double' : 'single',
        paper: cfg.paper || 'A4',
        fileName: job.fileName,
        jobType: job.jobType,
      });
      if (!policy.allow) {
        res.status(403).json({
          success: false,
          message: policy.deniedReason || 'Blocked by print policy.',
          code: 'PRINT_POLICY_DENIED',
        });
        return;
      }

      const file = job.fileId
        ? await AppDataSource.getRepository(File).findOne({ where: { id: job.fileId } })
        : null;
      const fileUrl =
        file?.fileURL || `local://${encodeURIComponent(job.fileName || job.code || '')}.pdf`;

      const prefs = await ippConnectionPrefs();
      const opts: PrintOptions = {
        copies: policy.mutated.copies,
        sided: policy.mutated.sided,
        color: policy.mutated.color,
        paper: policy.mutated.paper || 'A4',
        orientation: cfg.orientation === 'landscape' ? 'landscape' : 'portrait',
        qualityDpi: cfg.qualityDpi,
        collate: cfg.collate !== false,
        pages: parsePages(cfg),
        requestingUser: 'PrintLoop-Kiosk',
        secure: prefs.secure,
        port: prefs.port,
        tlsRejectUnauthorized: prefs.rejectUnauthorized,
        path: prefs.path,
        version: prefs.version,
      };

      let source: any = { url: fileUrl };
      try {
        const bytes = await loadDocumentBytes(fileUrl);
        if (bytes) {
          const pdf = await ensurePdf(bytes, file?.fileName || job.fileName || `${job.code}.pdf`);
          source = {
            buffer: await maybeOrient(
              await maybeGrayscale(pdf.buffer, policy.mutated.color),
              opts.orientation,
            ),
          };
        }
      } catch (e: any) {
        if (e instanceof UnsupportedDocumentError) {
          res.status(415).json({ success: false, message: e.message, code: e.code });
          return;
        }
        console.error(`[printer/complete] convert error for ${code}:`, e?.message);
        res.status(422).json({
          success: false,
          message: 'This document could not be prepared for printing.',
          code: 'CONVERT_FAILED',
        });
        return;
      }

      let dispatch: any;
      try {
        dispatch = await dispatchPrint(
          kiosk.ipAddress,
          source,
          job.fileName || job.code || '',
          opts,
          prefs.transport,
          prefs.rawPort,
        );
      } catch (e: any) {
        console.error(`[printer/complete] IPP error for ${code}:`, e?.message);
        res.status(502).json({
          success: false,
          message: 'The printer did not accept the job. Try again or use another kiosk.',
          code: 'PRINTER_ERROR',
        });
        return;
      }

      const result = await printerExt.completePrintJob({
        code,
        kioskId: kiosk.id,
        kioskName: kiosk.name,
        cost: Number(cost) || Number(job.cost) || 0,
        totalPages: Number(totalPages) || job.totalPages || 0,
      });

      res.status(result.success ? 200 : 404).json({
        ...result,
        data: {
          ...(result.data || {}),
          transport: prefs.secure ? 'ipps' : 'ipp',
          mock: !!dispatch?.mock,
          policyNotes: policy.notes,
        },
      });
    } catch (error: any) {
      console.error('Complete print job error:', error);
      next(error);
    }
  };

  completeBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const code = req.body.code;
      const kiosk = (req as any).kiosk;
      if (!code) {
        res.status(400).json({ success: false, message: 'code is required' });
        return;
      }

      const dispatchMode = await printDispatchMode();
      if (dispatchMode === 'kiosk-pull') {
        const batch = await groupSvc.paidBatchJobs(String(code).trim());
        if (!batch) {
          res.status(404).json({ success: false, message: 'Batch code not found, or the group is still open.', code: 'BATCH_NOT_FOUND' });
          return;
        }
        if (batch.session.tenantId && kiosk?.tenantId && batch.session.tenantId !== kiosk.tenantId) {
          res.status(403).json({ success: false, message: 'This group printed at a different shop.', code: 'WRONG_SHOP' });
          return;
        }
        const skipped: Array<{ jobId: string; code: string; message: string }> = [];
        let released = 0;
        for (const job of batch.jobs) {
          const result = await releaseJobToKiosk(job, kiosk.id);
          if (result.ok) released++;
          else skipped.push({ jobId: job.id, code: result.code, message: result.message });
        }
        res.json({
          success: true,
          data: { mode: 'kiosk-pull', groupName: batch.session.groupName, released, total: batch.jobs.length, skipped },
        });
        return;
      }

      if (!kiosk?.ipAddress) {
        res.status(409).json({
          success: false,
          message: 'This kiosk has no printer address configured.',
          code: 'KIOSK_NO_PRINTER',
        });
        return;
      }

      const data = await groupSvc.getBatchPrintData(code);
      if (!data) {
        res.status(404).json({ success: false, message: 'Batch code not found or session not closed.' });
        return;
      }

      const prefs = await ippConnectionPrefs();
      const sessDefaults: any = data.session.defaultOptions || {};

      const planned: Array<{ f: any; pol: any }> = [];
      for (const f of data.files) {
        const ic: any = f.printConfig || sessDefaults || {};
        const pol = await evaluatePrintPolicy({
          totalPages: f.totalPages || 1,
          copies: ic.copies || 1,
          color: ic.color === 'color' ? 'color' : 'bw',
          sided: ic.sided === 'double' ? 'double' : 'single',
          paper: ic.paper || 'A4',
          fileName: f.participantName,
          jobType: 'group_batch',
        });
        if (!pol.allow) {
          res.status(403).json({
            success: false,
            message: `${f.participantName}: ${pol.deniedReason || 'Blocked by print policy.'}`,
            code: 'PRINT_POLICY_DENIED',
          });
          return;
        }
        planned.push({ f, pol });
      }

      let printed = 0;
      for (const { f, pol } of planned) {
        const opts: PrintOptions = {
          copies: pol.mutated.copies,
          sided: pol.mutated.sided,
          color: pol.mutated.color,
          paper: pol.mutated.paper || 'A4',
          orientation:
            (f.printConfig as any)?.orientation === 'landscape' ? 'landscape' : 'portrait',
          qualityDpi: (f.printConfig as any)?.qualityDpi,
          collate: true,
          requestingUser: 'PrintLoop-Kiosk',
          secure: prefs.secure,
          port: prefs.port,
          tlsRejectUnauthorized: prefs.rejectUnauthorized,
          path: prefs.path,
        };
        console.log(
          `[printer/complete-batch] ${f.participantName}: ${opts.color}/${opts.sided}/${opts.paper} x${opts.copies}`,
        );
        try {
          let src: any = { url: f.fileURL };
          const bytes = await loadDocumentBytes(f.fileURL);
          if (bytes) {
            const pdf = await ensurePdf(bytes, `${f.participantName || 'document'}.pdf`);
            src = {
              buffer: await maybeOrient(
                await maybeGrayscale(pdf.buffer, pol.mutated.color),
                opts.orientation,
              ),
            };
          }
          await dispatchPrint(
            kiosk.ipAddress,
            src,
            `${f.participantName} · ${data.session.groupName || 'batch'}`,
            opts,
            prefs.transport,
            prefs.rawPort,
          );
          printed++;
        } catch (e: any) {
          console.error(`[printer/complete-batch] error for ${f.participantName}:`, e?.message);
        }
      }

      res.json({
        success: true,
        message: `Batch dispatched (${printed}/${data.files.length}).`,
        data: {
          printed,
          total: data.files.length,
          transport: prefs.secure ? 'ipps' : 'ipp',
          policyNotes: planned[0]?.pol?.notes,
        },
      });
    } catch (error: any) {
      console.error('Complete batch error:', error);
      next(error);
    }
  };
}

export const kioskPrinterController = new KioskPrinterController();
