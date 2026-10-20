import axios from 'axios';
import crypto from 'node:crypto';
import { Tenant } from '@/database/entities/tenant.entity';
import {
  computeCommissionSplit,
  commissionInKobo,
} from '@/modules/saas/services/commission.service';
import { applyTransferWebhook } from '@/modules/saas/services/payout.service';

export class PaystackService {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || '';
  }

  async initializeJobPayment(
    userId: string,
    jobId: string,
    amountNaira: number,
    email: string,
    tenant?: Tenant,
    callbackUrl?: string,
  ): Promise<any> {
    if (!this.secretKey) throw new Error('Paystack secret key is missing');

    const amountKobo = Math.round(amountNaira * 100);
    const reference = `JOB_${jobId}_${Date.now()}`;

    const split = tenant
      ? computeCommissionSplit(tenant, amountNaira)
      : null;
    const useSplit = Boolean(tenant?.paystackSubaccountCode);

    const body: Record<string, unknown> = {
      email,
      amount: amountKobo,
      reference,
      metadata: {
        userId,
        jobId,
        type: 'print_job_payment',
        tenantId: tenant?.id ?? null,
        commissionAmount: split?.commissionAmount ?? 0,
        rateUsed: split?.rateUsed ?? 0,
      },
    };
    if (callbackUrl) body.callback_url = callbackUrl;
    if (useSplit && split) {
      body.subaccount = tenant!.paystackSubaccountCode;
      body.transaction_charge = commissionInKobo(split);
      body.bearer = 'account';
    }

    const response = await axios.post(
      `${this.baseUrl}/transaction/initialize`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.data;
  }

  async chargeAuthorization(opts: {
    authorizationCode: string;
    amountNaira: number;
    email: string;
    reference: string;
    tenant?: Tenant | null;
    metadata?: Record<string, unknown>;
  }): Promise<any> {
    if (!this.secretKey) throw new Error('Paystack secret key is missing');
    const amountKobo = Math.round(opts.amountNaira * 100);
    if (amountKobo <= 0) throw new Error('Amount must be positive');

    const split = opts.tenant
      ? computeCommissionSplit(opts.tenant, opts.amountNaira)
      : null;
    const useSplit = Boolean(opts.tenant?.paystackSubaccountCode);

    const body: Record<string, unknown> = {
      authorization_code: opts.authorizationCode,
      email: opts.email,
      amount: amountKobo,
      reference: opts.reference,
      metadata: {
        type: 'print_delta',
        ...(opts.metadata || {}),
        commissionAmount: split?.commissionAmount ?? 0,
        rateUsed: split?.rateUsed ?? 0,
      },
    };
    if (useSplit && split) {
      body.subaccount = opts.tenant!.paystackSubaccountCode;
      body.transaction_charge = commissionInKobo(split);
      body.bearer = 'account';
    }

    const response = await axios.post(
      `${this.baseUrl}/transaction/charge_authorization`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.data;
  }

  async verifyTransaction(reference: string): Promise<any> {
    if (!this.secretKey) throw new Error('Paystack secret key is missing');
    const response = await axios.get(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      },
    );
    return response.data?.data;
  }

  async createSubaccount(opts: {
    businessName: string;
    settlementBank: string;
    accountNumber: string;
    percentageCharge?: number;
  }): Promise<{ subaccountCode: string; accountName: string }> {
    if (!this.secretKey) throw new Error('Paystack secret key is missing');
    const response = await axios.post(
      `${this.baseUrl}/subaccount`,
      {
        business_name: opts.businessName,
        settlement_bank: opts.settlementBank,
        account_number: opts.accountNumber,
        percentage_charge: opts.percentageCharge ?? 1.5,
      },
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    const data = response.data?.data || {};
    return {
      subaccountCode: data.subaccount_code,
      accountName: data.account_name,
    };
  }

  async createTransferRecipient(opts: {
    name: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<{ recipientCode: string }> {
    if (!this.secretKey) throw new Error('Paystack secret key is missing');
    const response = await axios.post(
      `${this.baseUrl}/transferrecipient`,
      {
        type: 'nuban',
        name: opts.name,
        account_number: opts.accountNumber,
        bank_code: opts.bankCode,
        currency: 'NGN',
      },
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return { recipientCode: response.data?.data?.recipient_code };
  }

  async initiateTransfer(opts: {
    amountKobo: number;
    recipientCode: string;
    reason?: string;
    reference?: string;
  }): Promise<{ reference: string; status: string }> {
    if (!this.secretKey) throw new Error('Paystack secret key is missing');
    const response = await axios.post(
      `${this.baseUrl}/transfer`,
      {
        source: 'balance',
        amount: opts.amountKobo,
        recipient: opts.recipientCode,
        reason: opts.reason || 'PrintLoop payout',
        reference: opts.reference,
      },
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return {
      reference: response.data?.data?.reference,
      status: response.data?.data?.status,
    };
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
    if (!signature) return false;
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET || this.secretKey;
    if (!secret) return false;
    const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    const a = Buffer.from(hash, 'utf8');
    const b = Buffer.from(String(signature), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async handleWebhook(event: any): Promise<{ handled: boolean; action?: string }> {
    const type = event?.event;
    const data = event?.data || {};

    if (
      type === 'transfer.success' ||
      type === 'transfer.failed' ||
      type === 'transfer.reversed'
    ) {
      const ref: string | undefined = data.reference;
      if (!ref) return { handled: false };
      const failureReason = data.reason || data.gateway_response;
      const result = await applyTransferWebhook({
        type,
        reference: ref,
        failureReason,
      });
      return {
        handled: true,
        action: result.updated ? `transfer-${type.split('.')[1]}` : 'transfer-noop',
      };
    }

    const reference: string | undefined = data.reference;
    const metadata = data.metadata || {};
    if (!reference) return { handled: false };

    if (metadata.type === 'print_job_payment') {
      if (type === 'charge.success') {
        const { completePrintJobPayment } = await import(
          '@/modules/customer/services/payments.service'
        );
        const authorizationCode: string | null =
          data.authorization?.authorization_code ?? null;
        const res = await completePrintJobPayment(metadata.jobId, reference, {
          authorizationCode,
          paidKobo: Number(data.amount),
          currency: data.currency ?? null,
        });
        return {
          handled: true,
          action: res.success ? 'print-job-paid' : 'print-job-payment-failed',
        };
      }
      return { handled: true, action: 'print-job-charge-status-ignored' };
    }

    return { handled: false };
  }

  async initializePayment(opts: {
    amountNaira: number;
    email: string;
    reference: string;
    metadata?: Record<string, unknown>;
    callbackUrl?: string;
    tenant?: Tenant | null;
  }): Promise<{ authorizationUrl: string; reference: string; accessCode: string }> {
    if (!this.secretKey) throw new Error('Paystack secret key is missing');

    const amountKobo = Math.round(opts.amountNaira * 100);
    if (amountKobo <= 0) throw new Error('Amount must be positive');

    const body: Record<string, unknown> = {
      email: opts.email,
      amount: amountKobo,
      reference: opts.reference,
      metadata: {
        ...opts.metadata,
        amountNaira: opts.amountNaira,
      },
    };

    if (opts.callbackUrl) {
      body.callback_url = opts.callbackUrl;
    }

    if (opts.tenant?.paystackSubaccountCode) {
      const { computeCommissionSplit, commissionInKobo } = await import(
        '@/modules/saas/services/commission.service'
      );
      const split = computeCommissionSplit(opts.tenant, opts.amountNaira);
      body.subaccount = opts.tenant.paystackSubaccountCode;
      body.transaction_charge = commissionInKobo(split);
      body.bearer = 'account';
    }

    const response = await axios.post(
      `${this.baseUrl}/transaction/initialize`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.data;
  }
}

export const paystackService = new PaystackService();
