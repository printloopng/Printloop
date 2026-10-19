import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { getSettings } from './settings';
import { downloadFromS3 } from '../utils/s3';
import { printPwgToIpp } from './ipp';
import { getApiUrl } from '../config';

export interface PrintJobData {
  id: string;
  code: string;
  artifactKey: string;
  pageCount: number;
  colorPages: number;
  monoPages: number;
  cost: number;
  customerName: string;
  fileName: string;
}

export async function fetchPrintJob(apiKey: string, code: string): Promise<PrintJobData> {
  const apiUrl = getApiUrl();
  const response = await axios.post(
    `${apiUrl}/api/printer/get-job`,
    { code },
    {
      headers: {
        'X-Kiosk-Key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    },
  );

  const payload = response.data?.data ?? response.data;
  return payload;
}

export async function printJob(
  printerUri: string,
  artifactKey: string,
): Promise<{ success: boolean; jobId: string; error?: string }> {
  const settings = getSettings();

  if (!settings.apiKey) {
    throw new Error('Kiosk not configured');
  }

  const pwgBuffer = await downloadFromS3(artifactKey);
  logger.info({ size: pwgBuffer.length, artifactKey }, 'Downloaded PWG artifact from S3');

  const tempDir = path.join(__dirname, '../../../tmp');
  await fs.mkdir(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `${Date.now()}.pwg`);
  await fs.writeFile(tempFile, pwgBuffer);

  try {
    const result = await printPwgToIpp(printerUri, tempFile);
    logger.info({ jobId: result.jobId }, 'Print job submitted to IPP printer');
    return result;
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
}
