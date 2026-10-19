import * as QRCode from 'qrcode';

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  darkColor?: string;
  lightColor?: string;
}

export class QRCodeService {
  async generateDataUrl(
    text: string,
    options: QRCodeOptions = {}
  ): Promise<string> {
    return QRCode.toDataURL(text, {
      width: options.width || 400,
      margin: options.margin || 2,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF',
      },
    });
  }

  async generateSvg(text: string, options: QRCodeOptions = {}): Promise<string> {
    return QRCode.toString(text, {
      type: 'svg',
      width: options.width || 400,
      margin: options.margin || 2,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF',
      },
    });
  }

  async generateBuffer(
    text: string,
    options: QRCodeOptions = {}
  ): Promise<Buffer> {
    return QRCode.toBuffer(text, {
      width: options.width || 400,
      margin: options.margin || 2,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF',
      },
    });
  }

  async generatePrintJobQR(jobCode: string): Promise<{
    dataUrl: string;
    svg: string;
    payload: string;
  }> {
    const payload = JSON.stringify({
      type: 'print_job',
      code: jobCode,
      v: 1,
    });

    const [dataUrl, svg] = await Promise.all([
      this.generateDataUrl(payload),
      this.generateSvg(payload),
    ]);

    return { dataUrl, svg, payload };
  }

  async generateGroupBatchQR(batchToken: string): Promise<{
    dataUrl: string;
    svg: string;
    payload: string;
  }> {
    const payload = JSON.stringify({
      type: 'group_batch',
      token: batchToken,
      v: 1,
    });

    const [dataUrl, svg] = await Promise.all([
      this.generateDataUrl(payload),
      this.generateSvg(payload),
    ]);

    return { dataUrl, svg, payload };
  }
}
