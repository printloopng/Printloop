import { In } from 'typeorm';
import { AppDataSource } from '@/config/data-source';
import { SystemSetting } from '@/database/entities/systemSetting.entity';
import { User } from '@/database/entities/user.entity';
import { Tenant } from '@/database/entities/tenant.entity';
import { TenantMember, TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { EmailService } from '@/core/services/email.service';
import { SMSService } from '@/core/services/sms.service';

async function settingEnabled(key: string, fallback: boolean): Promise<boolean> {
  try {
    const row = await AppDataSource.getRepository(SystemSetting).findOne({ where: { key } });
    if (!row) return fallback;
    return row.value === 'true' || row.value === '1';
  } catch {
    return fallback;
  }
}

async function shopStaff(shopId: string): Promise<User[]> {
  const members = await AppDataSource.getRepository(TenantMember).find({
    where: {
      tenantId: shopId,
      role: In([TenantMemberRole.OWNER, TenantMemberRole.ADMIN, TenantMemberRole.STAFF]),
    },
    select: ['userId'],
  });
  if (!members.length) return [];
  return AppDataSource.getRepository(User).find({
    where: { id: In(members.map((m) => m.userId)) },
    select: ['id', 'email', 'phoneNumber', 'firstName'],
  });
}

async function userById(userId: string | undefined | null): Promise<User | null> {
  if (!userId) return null;
  return AppDataSource.getRepository(User).findOne({
    where: { id: userId },
    select: ['id', 'email', 'phoneNumber', 'firstName', 'lastName'],
  });
}

/** Process one notification job. Returns false only when a required send failed. */
export async function processNotification(name: string, data: any): Promise<boolean> {
  const email = new EmailService();
  const sms = new SMSService();

  switch (name) {
    case 'email': {
      if (!(await settingEnabled('emailNotificationsEnabled', true)) && data?.force !== true) {
        return true;
      }
      return email.send({
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text,
      });
    }

    case 'sms': {
      if (!(await settingEnabled('smsNotificationsEnabled', false)) && data?.force !== true) {
        return true;
      }
      return sms.send(data.phoneNumber, data.message);
    }

    case 'customer-verification': {
      return email.send({
        to: data.to,
        subject: 'Your PrintLoop verification code',
        text: `Your PrintLoop verification code is ${data.code}. It expires in 30 minutes.`,
        html: `<p>Your PrintLoop verification code is</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${data.code}</p><p>It expires in 30 minutes.</p>`,
      });
    }

    case 'password-reset': {
      return email.sendPasswordReset({
        to: data.to,
        firstName: data.firstName || '',
        resetUrl: data.resetUrl,
        token: data.token,
        tenantId: data.tenantId,
      });
    }

    case 'tenant-owner-verification': {
      const ok = await email.sendTenantOwnerVerification({
        to: data.to,
        firstName: data.firstName,
        businessName: data.businessName,
        token: data.token,
        verifyUrl: data.verifyUrl,
        tenantId: data.tenantId,
      });
      if (data.phoneNumber) {
        await sms.sendOTP(data.phoneNumber, data.token).catch((err) =>
          console.error('[notification] owner verification SMS failed:', err),
        );
      }
      return ok;
    }

    case 'team-invite': {
      return email.send({
        to: data.to,
        subject: data.subject,
        text: data.text,
        html: data.html,
      });
    }

    case 'print-job-code': {
      let ok = true;
      if (data.email && (await settingEnabled('emailNotificationsEnabled', true))) {
        const message = `Your PrintLoop code is: ${data.code}. Release your print at the kiosk.`;
        const sent = await email.send({
          to: data.email,
          subject: 'Your PrintLoop Release Code',
          text: message,
          html: `<p>Your PrintLoop code is: <strong>${data.code}</strong>.</p><p>Release your print at the kiosk.</p>`,
        });
        if (!sent) ok = false;
      }
      if (data.phoneNumber && (await settingEnabled('smsNotificationsEnabled', false))) {
        const sent = await sms.sendPrintJobCode({
          phoneNumber: data.phoneNumber,
          jobCode: data.code,
          fileName: data.fileName || 'Document',
          cost: Number(data.cost) || 0,
        });
        if (!sent) ok = false;
      }
      return ok;
    }

    case 'kiosk-offline-alert': {
      const emailOk =
        !(await settingEnabled('emailNotificationsEnabled', true)) ||
        (await email.send({
          to: data.to,
          subject: data.subject,
          html: data.html,
          text: data.text,
        }));
      if (data.phoneNumber && (await settingEnabled('smsNotificationsEnabled', false))) {
        await sms.send(data.phoneNumber, data.smsMessage).catch((err) =>
          console.error('[notification] kiosk offline SMS failed:', err),
        );
      }
      return emailOk;
    }

    case 'new-edit-job': {
      if (!(await settingEnabled('emailNotificationsEnabled', true))) return true;
      const staff = await shopStaff(data.shopId);
      const tenant = await AppDataSource.getRepository(Tenant).findOne({
        where: { id: data.shopId },
        select: ['name'],
      });
      const shopName = tenant?.name || 'your shop';
      let ok = true;
      for (const u of staff) {
        const sent = await email.send({
          to: u.email,
          subject: `New Edit & Print request — ${shopName}`,
          text: `${data.customerName || 'A customer'} (${data.customerEmail || 'no email'}) submitted a document for editing.`,
          html: `<p>Hi ${u.firstName || 'there'},</p><p><strong>${data.customerName || 'A customer'}</strong>${data.customerEmail ? ` (${data.customerEmail})` : ''} submitted a document for Edit &amp; Print at <strong>${shopName}</strong>.</p><p>Open your shop dashboard to start the edit.</p>`,
        });
        if (!sent) ok = false;
      }
      return ok;
    }

    case 'edit-started': {
      if (!(await settingEnabled('emailNotificationsEnabled', true))) return true;
      const user = await userById(data.userId);
      if (!user?.email) return true;
      return email.send({
        to: user.email,
        subject: `${data.shopName || 'Your print shop'} started editing your document`,
        text: `Hi ${user.firstName || 'there'}, ${data.shopName || 'the shop'} has started editing your print job.`,
        html: `<p>Hi ${user.firstName || 'there'},</p><p><strong>${data.shopName || 'Your print shop'}</strong> has started editing your document. We'll email you when it's ready to review.</p>`,
      });
    }

    case 'edit-complete': {
      if (!(await settingEnabled('emailNotificationsEnabled', true))) return true;
      const user = await userById(data.userId);
      if (!user?.email) return true;
      const fee = data.totalEditFee != null ? ` Edit fee: ₦${Number(data.totalEditFee).toLocaleString()}.` : '';
      return email.send({
        to: user.email,
        subject: `Your edited document is ready — ${data.shopName || 'PrintLoop'}`,
        text: `Hi ${user.firstName || 'there'}, your edited document is ready to review.${fee}`,
        html: `<p>Hi ${user.firstName || 'there'},</p><p>Your edited document from <strong>${data.shopName || 'your print shop'}</strong> is ready to review.${fee ? ` <strong>${fee.trim()}</strong>` : ''}</p><p>Open the customer app to approve or request changes.</p>`,
      });
    }

    case 'edit-rejected': {
      if (!(await settingEnabled('emailNotificationsEnabled', true))) return true;
      const staff = await shopStaff(data.shopId);
      let ok = true;
      for (const u of staff) {
        const sent = await email.send({
          to: u.email,
          subject: 'Customer requested changes on an edit',
          text: `A customer asked for changes on an Edit & Print job.${data.reason ? ` Reason: ${data.reason}` : ''}`,
          html: `<p>Hi ${u.firstName || 'there'},</p><p>A customer asked for changes on an Edit &amp; Print job.</p>${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}<p>Open your shop dashboard to continue.</p>`,
        });
        if (!sent) ok = false;
      }
      return ok;
    }

    case 'edit-approved': {
      if (!(await settingEnabled('emailNotificationsEnabled', true))) return true;
      const staff = await shopStaff(data.shopId);
      let ok = true;
      for (const u of staff) {
        const sent = await email.send({
          to: u.email,
          subject: 'Customer approved an edited document',
          text: `${data.customerName || 'A customer'} approved their edited document and can now pay.`,
          html: `<p>Hi ${u.firstName || 'there'},</p><p><strong>${data.customerName || 'A customer'}</strong> approved their edited document and can now pay for printing.</p>`,
        });
        if (!sent) ok = false;
      }
      return ok;
    }

    default:
      console.warn(`[notification] unknown job "${name}"`);
      return true;
  }
}
