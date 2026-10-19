import { kioskApi, unwrap, apiErrorMessage } from './api';
import { pollNow } from './jobPoller';

/*
 * Walk-up flow: the customer types their pickup code, sees the job, taps
 * Print. "Print" releases the job to this kiosk (READY → RELEASING); the
 * job poller then claims and prints it like any other released job.
 */

export interface PrintJobData {
  jobId: string;
  code: string;
  fileName: string | null;
  totalPages: number;
  cost: number;
  printConfig: {
    copies?: number;
    paper?: string;
    color?: 'bw' | 'color';
    sided?: 'single' | 'double';
  };
}

export async function fetchPrintJob(code: string): Promise<PrintJobData> {
  try {
    const api = kioskApi();
    // validate-code enforces READY + pickup limits; get-job returns details.
    await api.post('/printer/validate-code', { code });
    const res = await api.post('/printer/get-job', { code });
    const data = unwrap<any>(res.data);
    if (!data?.jobId) {
      throw new Error('Group batch codes are not supported at this kiosk yet');
    }
    return { ...data, cost: Number(data.cost) || 0 };
  } catch (err) {
    throw new Error(apiErrorMessage(err));
  }
}

export async function releasePrintJob(code: string): Promise<{ mode: 'kiosk-pull' | 'cloud-push' }> {
  try {
    const res = await kioskApi().post('/printer/complete', { code });
    const data = unwrap<any>(res.data);
    // cloud-push: the API already sent it to the printer and marked it done.
    if (data?.mode !== 'kiosk-pull') return { mode: 'cloud-push' };
    pollNow();
    return { mode: 'kiosk-pull' };
  } catch (err) {
    throw new Error(apiErrorMessage(err));
  }
}
