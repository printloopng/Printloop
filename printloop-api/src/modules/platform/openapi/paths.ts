import {
  Schema, str, num, int, bool, uuid, date, en, arr, ref, nullable, anyObj, obj, page,
  PRINT_JOB_STATUSES, TENANT_ROLES, USER_ROLES, EDIT_STATUSES,
} from './schemas';

export type Auth = 'none' | 'user' | 'kiosk' | 'upload' | 'groupToken' | 'signature' | 'fileToken';

export interface Op {
  tag: string;
  summary: string;
  auth: Auth;
  body?: Schema;
  multipart?: Schema;
  query?: Record<string, Schema>;
  data?: Schema;
  status?: number;
  raw?: boolean;
  produces?: 'json' | 'csv' | 'markdown' | 'html' | 'file';
}

const pageQuery = { page: int({ minimum: 1 }), limit: int({ minimum: 1, maximum: 100 }) };
const cursorPage = (item: Schema) => obj({ items: arr(item), nextCursor: nullable(str()) }, ['items']);
const releaseBody = obj({ kioskId: uuid() }, ['kioskId']);
const printUpload = obj(
  {
    file: str({ format: 'binary' }),
    printConfiguration: str({ description: 'JSON-encoded PrintConfiguration' }),
    promotionCode: str(),
    editingRequired: en(['true', 'false']),
    editingInstructions: str(),
  },
  ['file'],
);
const kioskSummary = obj({
  id: uuid(),
  name: str(),
  location: nullable(str()),
  printerName: nullable(str()),
  status: str(),
  online: bool(),
  lastSeenAt: nullable(date()),
  testPrintPassedAt: nullable(date()),
  totalJobsPrinted: int(),
  capColor: nullable(bool()),
  capDuplex: nullable(bool()),
  capA3: nullable(bool()),
  capUpdatedAt: nullable(date()),
  createdAt: date(),
}, ['id', 'name', 'status', 'online', 'totalJobsPrinted']);
const pricingMatrix = obj(
  {
    currency: str(),
    floor: num(),
    officeConversion: bool(),
    tenantSlug: nullable(str()),
    tenantName: nullable(str()),
    editing: obj({ enabled: bool(), baseFee: num(), perPageFee: num() }, ['enabled', 'baseFee', 'perPageFee']),
    configs: arr(
      obj(
        {
          paperSize: str(),
          colorType: en(['BLACK_WHITE', 'COLOR']),
          pricePerPage: num(),
          duplexMultiplier: num(),
          highResolutionMultiplier: num(),
          price100Simplex: nullable(num()),
          price300Simplex: nullable(num()),
          price600Simplex: nullable(num()),
          price100Duplex: nullable(num()),
          price300Duplex: nullable(num()),
          price600Duplex: nullable(num()),
        },
        ['paperSize', 'colorType', 'pricePerPage'],
      ),
    ),
  },
  ['currency', 'officeConversion', 'editing', 'configs'],
);

export const routes: Array<[string, string, Op]> = [
  ['GET', '/', { tag: 'System', summary: 'Service banner', auth: 'none', raw: true, data: anyObj() }],
  ['GET', '/health', { tag: 'System', summary: 'Health check (DB, Redis)', auth: 'none', raw: true, data: anyObj() }],
  ['GET', '/metrics', { tag: 'System', summary: 'Request metrics (admins)', auth: 'user', data: anyObj() }],
  ['GET', '/openapi.json', { tag: 'System', summary: 'This OpenAPI document', auth: 'none', raw: true, data: anyObj() }],
  ['GET', '/docs', { tag: 'System', summary: 'API reference UI', auth: 'none', produces: 'html' }],
  ['GET', '/files/{key}', { tag: 'Files', summary: 'Download a stored upload by its key', auth: 'none', produces: 'file' }],

  ['POST', '/customer/auth/register', {
    tag: 'Customer auth', summary: 'Create a customer account (sends an email verification code)', auth: 'none', status: 201,
    body: obj({ firstName: str(), lastName: str(), email: str({ format: 'email' }), phoneNumber: str(), password: str({ minLength: 10 }) }, ['firstName', 'lastName', 'email', 'phoneNumber', 'password']),
    data: ref('AuthSession'),
  }],
  ['POST', '/customer/auth/login', {
    tag: 'Customer auth', summary: 'Sign in (customers, shop staff and platform admins)', auth: 'none',
    body: obj({ email: str(), password: str(), totpCode: str() }, ['email', 'password']),
    data: ref('AuthSession'),
  }],
  ['POST', '/customer/auth/verify-email', {
    tag: 'Customer auth', summary: 'Confirm the 6-digit email verification code', auth: 'none',
    body: obj({ email: str(), code: str({ pattern: '^\\d{6}$' }) }, ['email', 'code']),
    data: obj({ user: ref('PublicUser') }),
  }],
  ['POST', '/customer/auth/resend-verification', {
    tag: 'Customer auth', summary: 'Send a new verification code (never reveals whether the email exists)', auth: 'none',
    body: obj({ email: str() }, ['email']),
  }],
  ['GET', '/customer/auth/me', { tag: 'Customer auth', summary: 'Current user', auth: 'user', data: ref('PublicUser') }],
  ['PUT', '/customer/auth/me', {
    tag: 'Customer auth', summary: 'Update profile', auth: 'user',
    body: obj({ firstName: str(), lastName: str(), phoneNumber: str() }), data: ref('PublicUser'),
  }],
  ['PUT', '/customer/auth/password', {
    tag: 'Customer auth', summary: 'Change password', auth: 'user',
    body: obj({ oldPassword: str(), newPassword: str({ minLength: 10 }) }, ['oldPassword', 'newPassword']),
  }],
  ['POST', '/customer/auth/export', { tag: 'Customer auth', summary: 'Download all my data (JSON file)', auth: 'user', produces: 'file' }],
  ['DELETE', '/customer/auth/me', { tag: 'Customer auth', summary: 'Delete my account', auth: 'user' }],
  ['POST', '/auth/forgot-password', {
    tag: 'Customer auth', summary: 'Email a password-reset link', auth: 'none', body: obj({ email: str() }, ['email']),
  }],
  ['POST', '/auth/reset-password', {
    tag: 'Customer auth', summary: 'Set a new password with a reset or invite token', auth: 'none',
    body: obj({ email: str(), token: str(), password: str({ minLength: 10 }) }, ['email', 'token', 'password']),
  }],

  ['GET', '/customer/print-jobs', {
    tag: 'Printing', summary: 'My print jobs across every shop (scope=shop limits to the current shop)', auth: 'user',
    query: { scope: en(['all', 'shop']), status: str() },
    data: obj({ jobs: arr(ref('CustomerJob')), total: int() }, ['jobs']),
  }],
  ['POST', '/customer/print-jobs', {
    tag: 'Printing', summary: 'Upload a document and create a print job (bearer or print-document upload ticket)', auth: 'upload', status: 201,
    multipart: printUpload, data: obj({ job: ref('CustomerJob') }, ['job']),
  }],
  ['POST', '/customer/print-jobs/batch', {
    tag: 'Printing', summary: 'Upload several documents as one batch job', auth: 'upload', status: 201,
    multipart: obj(
      {
        files: arr(str({ format: 'binary' })),
        items: str({ description: 'JSON array, one { printConfiguration } per file in the same order' }),
        collate: en(['true', 'false']),
        promotionCode: str(),
      },
      ['files'],
    ),
    data: obj({ job: ref('CustomerJob'), itemCount: int() }, ['job', 'itemCount']),
  }],
  ['POST', '/customer/print-jobs/quote', {
    tag: 'Printing', summary: 'Price a print before uploading', auth: 'user',
    body: obj({ pageCount: int(), printConfiguration: ref('PrintConfiguration'), promotionCode: str() }, ['pageCount']),
    data: obj(
      {
        baseCost: num(),
        cost: num(),
        discount: num(),
        promoCode: nullable(str()),
        promoReason: nullable(en(['not_found', 'inactive', 'not_started', 'expired', 'exhausted', 'no_code'])),
        config: obj({ paper: str(), color: en(['bw', 'color']), sided: en(['single', 'double']), qualityDpi: int(), copies: int() }),
        pageCount: int({ description: 'Pages billed after any range is applied' }),
      },
      ['baseCost', 'cost', 'discount', 'pageCount'],
    ),
  }],
  ['GET', '/customer/print-jobs/options', {
    tag: 'Printing', summary: 'Selectable print options', auth: 'user',
    data: obj({ paperSizes: arr(str()), colors: arr(str()), sides: arr(str()), qualityOptions: arr(int()), paymentMethods: arr(str()) }),
  }],
  ['GET', '/customer/print-jobs/{id}/kiosks', {
    tag: 'Printing', summary: "Printers at the shop where this job was paid for", auth: 'user',
    data: obj({ kiosks: arr(obj({ id: uuid(), name: str(), location: nullable(str()), online: bool() })) }, ['kiosks']),
  }],
  ['POST', '/customer/print-jobs/{id}/release', {
    tag: 'Printing', summary: 'Send my paid job to a printer at the shop', auth: 'user', body: releaseBody,
    data: obj({ status: en(['releasing']), kioskId: uuid(), kioskName: str() }),
  }],
  ['GET', '/customer/pricing', { tag: 'Printing', summary: "The current shop's price list", auth: 'user', data: pricingMatrix }],
  ['GET', '/customer/stations', {
    tag: 'Printing', summary: 'Printers at the current shop', auth: 'user',
    data: obj(
      {
        stations: arr(
          obj(
            {
              id: uuid(),
              name: str(),
              area: str(),
              campus: nullable(str()),
              status: en(['online', 'maintenance', 'offline']),
              mapsUrl: nullable(str()),
              queue: int(),
              lastSeenAt: nullable(date()),
            },
            ['id', 'name', 'status', 'queue'],
          ),
        ),
      },
      ['stations'],
    ),
  }],
  ['GET', '/customer/print-token', {
    tag: 'Printing', summary: 'Whether I have a desktop print-driver token (the token itself is only shown when rotated)', auth: 'user',
    data: obj({ hasToken: bool(), hint: nullable(str()) }, ['hasToken', 'hint']),
  }],
  ['POST', '/customer/print-token/rotate', {
    tag: 'Printing', summary: 'Issue a new desktop print-driver token (shown once)', auth: 'user', data: obj({ token: str() }),
  }],
  ['POST', '/customer/shops/{slug}/reviews', {
    tag: 'Marketplace', summary: 'Review a shop I printed at', auth: 'user', status: 201,
    body: obj({ rating: int({ minimum: 1, maximum: 5 }), comment: str(), photoUrl: str() }, ['rating']),
  }],
  ['GET', '/customer/disputes', {
    tag: 'Printing', summary: 'Problems I have reported', auth: 'user',
    data: obj({ disputes: arr(ref('Dispute')) }, ['disputes']),
  }],
  ['POST', '/customer/disputes', {
    tag: 'Printing', summary: 'Report a problem with a print job', auth: 'user', status: 201,
    body: obj({ printJobId: uuid(), reason: str() }, ['printJobId', 'reason']), data: ref('Dispute'),
  }],

  ['POST', '/payments/initialize-job-payment', {
    tag: 'Payments', summary: 'Start Paystack checkout for a pending job', auth: 'user',
    body: obj({ jobId: uuid(), callbackUrl: str({ format: 'uri' }) }, ['jobId']), data: obj({ authorizationUrl: str(), reference: str(), accessCode: str() }),
  }],
  ['POST', '/webhooks/paystack', { tag: 'Webhooks', summary: 'Paystack webhook (HMAC-SHA512 signed)', auth: 'signature', body: anyObj(), raw: true, data: obj({ success: bool(), handled: bool(), action: str() }) }],
  ['POST', '/render/callback', { tag: 'Webhooks', summary: 'Render-worker success callback (HMAC signed)', auth: 'signature', body: anyObj() }],
  ['POST', '/render/failure', { tag: 'Webhooks', summary: 'Render-worker failure callback (HMAC signed)', auth: 'signature', body: anyObj() }],

  ['POST', '/uploads/ticket', {
    tag: 'Uploads', summary: 'Short-lived ticket for uploading a file straight to the API', auth: 'user',
    body: obj({ purpose: en(['print-document', 'review-photo', 'edited-document', 'branding-photo']) }, ['purpose']),
    data: ref('UploadTicket'),
  }],
  ['POST', '/uploads/review-photo', {
    tag: 'Uploads', summary: 'Upload a review photo (PNG/JPEG/WebP, 10 MB)', auth: 'upload', status: 201,
    multipart: obj({ file: str({ format: 'binary' }) }, ['file']), data: ref('StoredFile'),
  }],
  ['POST', '/uploads/edited-document', {
    tag: 'Uploads', summary: 'Upload an edited document for Edit & Print (shop staff)', auth: 'upload', status: 201,
    multipart: obj({ file: str({ format: 'binary' }) }, ['file']), data: ref('StoredFile'),
  }],

  ['GET', '/groups', {
    tag: 'Groups', summary: 'Group print sessions I host', auth: 'user',
    data: obj({ sessions: arr(ref('GroupSession')), count: int() }, ['sessions']),
  }],
  ['POST', '/groups', {
    tag: 'Groups', summary: 'Create a group print session', auth: 'user', status: 201,
    body: obj({ groupName: str(), deadline: date(), defaultOptions: anyObj(), watermarkPrefix: str() }, ['groupName', 'deadline']),
    data: obj({ session: ref('GroupSession'), shareId: str(), shareUrl: str(), hostId: uuid() }, ['session', 'shareId']),
  }],
  ['GET', '/groups/{id}', {
    tag: 'Groups', summary: 'Session detail with participants (host only)', auth: 'user',
    data: obj(
      {
        session: ref('GroupSession'),
        participants: arr(ref('GroupParticipant')),
        summary: obj(
          { totalParticipants: int(), uploaded: int(), paid: int(), totalPages: int(), totalAmountPaid: num() },
          ['totalParticipants', 'uploaded', 'paid', 'totalPages', 'totalAmountPaid'],
        ),
      },
      ['session', 'participants', 'summary'],
    ),
  }],
  ['POST', '/groups/{id}/close', {
    tag: 'Groups', summary: 'Close a session and issue its batch code', auth: 'user',
    data: obj({ session: ref('GroupSession'), batchToken: str(), batchCode: str(), qrCode: obj({ dataUrl: str(), svg: str() }) }, ['session', 'batchCode']),
  }],
  ['GET', '/groups/share/{shareId}', {
    tag: 'Groups', summary: 'Public view of a session for joiners', auth: 'none',
    data: obj(
      {
        session: obj(
          { id: uuid(), groupName: str(), deadline: date(), defaultOptions: anyObj(), status: en(['open', 'closed']) },
          ['id', 'groupName', 'deadline', 'status'],
        ),
      },
      ['session'],
    ),
  }],
  ['POST', '/groups/{shareId}/join', {
    tag: 'Groups', summary: 'Join a session; returns the upload token', auth: 'none',
    body: obj({ name: str(), email: str(), phoneNumber: str() }, ['name']),
    data: obj(
      {
        uploadToken: str(),
        participant: obj({ id: uuid(), name: str(), watermarkId: nullable(str()), status: str() }),
        session: obj({ id: uuid(), groupName: str(), deadline: date(), defaultOptions: anyObj() }),
      },
      ['uploadToken', 'participant', 'session'],
    ),
  }],
  ['POST', '/participant-upload/upload', {
    tag: 'Groups', summary: "Upload a participant's document (X-Upload-Token)", auth: 'groupToken',
    multipart: obj({ file: str({ format: 'binary' }), fileName: str(), mimeType: str(), printConfiguration: str(), promotionCode: str() }, ['file']),
    data: obj({ printJob: obj({ id: uuid(), code: str(), cost: num(), totalPages: int() }), nextStep: str() }),
  }],
  ['GET', '/participant-upload/status', {
    tag: 'Groups', summary: "A participant's upload and payment status (X-Upload-Token)", auth: 'groupToken',
    data: obj({
      participant: obj({ id: uuid(), name: str(), status: en(['INVITED', 'JOINED', 'UPLOADED', 'PAID', 'CANCELLED']) }),
      session: obj({ groupName: str(), status: en(['open', 'closed']), deadline: date() }),
      printJob: nullable(obj({ id: uuid(), code: nullable(str()), cost: num(), status: en(PRINT_JOB_STATUSES), totalPages: int() })),
    }, ['participant', 'session', 'printJob']),
  }],
  ['POST', '/participant-upload/pay', {
    tag: 'Groups', summary: 'Start Paystack checkout for a participant document (X-Upload-Token)', auth: 'groupToken',
    body: obj({ email: str({ format: 'email' }), callbackUrl: str({ format: 'uri' }) }),
    data: obj({ authorizationUrl: str(), reference: str(), accessCode: str(), mock: bool() }, ['authorizationUrl']),
  }],

  ['GET', '/discovery/shops', {
    tag: 'Marketplace', summary: 'Shops in the marketplace', auth: 'none',
    query: { q: str(), campus: str() }, data: obj({ count: int(), shops: arr(ref('ShopSummary')) }, ['shops']),
  }],
  ['GET', '/discovery/shops/nearby', {
    tag: 'Marketplace', summary: 'Shops near a location', auth: 'none',
    query: { lat: num(), lng: num(), radiusKm: num(), limit: int() },
    data: obj({ origin: obj({ lat: num(), lng: num() }), radiusKm: num(), count: int(), shops: arr(ref('ShopSummary')) }, ['shops']),
  }],
  ['GET', '/discovery/shops/{slug}', {
    tag: 'Marketplace', summary: 'Public shop profile with prices and recent reviews', auth: 'none',
    query: { lat: num(), lng: num() }, data: ref('ShopDetail'),
  }],
  ['GET', '/discovery/shops/{slug}/reviews', {
    tag: 'Marketplace', summary: 'Shop reviews', auth: 'none',
    data: arr(ref('ShopReview')),
  }],
  ['POST', '/discovery/handoff', {
    tag: 'Marketplace', summary: 'Short-lived token for continuing into a shop', auth: 'none',
    body: obj({ tenantSlug: str(), email: str() }, ['tenantSlug']), data: obj({ token: str(), expiresIn: int() }),
  }],
  ['GET', '/discovery/handoff/verify', {
    tag: 'Marketplace', summary: 'Verify a handoff token', auth: 'none', query: { token: str() },
    data: obj({ tenantSlug: str(), email: nullable(str()), expiresAt: nullable(date()) }, ['tenantSlug']),
  }],
  ['POST', '/discovery/shops/seed-demo-nearby', { tag: 'Marketplace', summary: 'Seed demo shops (demo mode only)', auth: 'none', body: obj({ lat: num(), lng: num() }) }],
  ['GET', '/integrations/lms/handoff', { tag: 'Marketplace', summary: 'LMS deep-link handoff', auth: 'none', query: { key: str(), email: str() }, produces: 'html' }],
  ['GET', '/branding', {
    tag: 'Public', summary: 'Branding for the shop resolved from host or X-Tenant-Slug (both null when no shop is chosen)', auth: 'none',
    data: obj({ tenant: nullable(obj({ id: uuid(), name: str(), slug: str() }, ['id', 'name', 'slug'])), branding: nullable(ref('Branding')) }, ['tenant', 'branding']),
  }],
  ['GET', '/pricing', { tag: 'Public', summary: 'Public price list for the resolved shop', auth: 'none', data: pricingMatrix }],
  ['GET', '/blog', {
    tag: 'Public', summary: 'Published blog posts', auth: 'none', query: { limit: int(), offset: int(), tag: str() },
    data: obj({ posts: arr(ref('BlogPost')), total: int(), limit: int(), offset: int() }, ['posts']),
  }],
  ['GET', '/blog/{slug}', { tag: 'Public', summary: 'One published post', auth: 'none', data: ref('BlogPost') }],
  ['GET', '/legal/terms', { tag: 'Public', summary: 'Terms of service (Markdown)', auth: 'none', produces: 'markdown' }],
  ['GET', '/legal/privacy', { tag: 'Public', summary: 'Privacy policy (Markdown)', auth: 'none', produces: 'markdown' }],
  ['GET', '/legal/dpa', { tag: 'Public', summary: 'Data processing agreement (Markdown)', auth: 'none', produces: 'markdown' }],
  ['GET', '/preflight/capabilities', {
    tag: 'Public', summary: 'Document checks and fixes the preflight can run', auth: 'none',
    data: arr(obj({ type: str(), label: str(), description: str(), icon: str(), autoApplicable: bool() })),
  }],
  ['POST', '/preflight/analyze', {
    tag: 'Public', summary: 'Inspect a document before upload', auth: 'none',
    multipart: obj({ file: str({ format: 'binary' }) }, ['file']), data: anyObj(),
  }],
  ['POST', '/preflight/fix', { tag: 'Public', summary: 'Apply preflight fixes to an uploaded file', auth: 'none', multipart: obj({ file: str({ format: 'binary' }), fixes: str() }), produces: 'file' }],
  ['POST', '/preflight/apply-fix', { tag: 'Public', summary: 'Apply one preflight fix', auth: 'none', body: anyObj(), data: anyObj() }],
  ['POST', '/preflight/quote', { tag: 'Public', summary: 'Quote from preflight results', auth: 'none', body: anyObj(), data: anyObj() }],

  ['POST', '/agent/poll', {
    tag: 'Kiosk', summary: 'The kiosk tick: claim released jobs, report held jobs, get queue counts', auth: 'kiosk',
    body: obj({ inFlight: arr(uuid()), max: int({ minimum: 0, maximum: 5 }) }), data: ref('KioskPoll'),
  }],
  ['GET', '/agent/jobs/ready', { tag: 'Kiosk', summary: 'Released jobs waiting for this kiosk', auth: 'kiosk', data: obj({ jobs: arr(ref('KioskJob')) }) }],
  ['GET', '/agent/jobs/{id}/file', { tag: 'Kiosk', summary: 'Download a job file (signed URL from poll)', auth: 'fileToken', query: { t: str(), item: uuid() }, produces: 'file' }],
  ['POST', '/agent/jobs/{id}/start', { tag: 'Kiosk', summary: 'Claim one released job', auth: 'kiosk' }],
  ['POST', '/agent/jobs/{id}/progress', { tag: 'Kiosk', summary: 'Report pages printed', auth: 'kiosk', body: obj({ pagesCompleted: int({ minimum: 0 }) }, ['pagesCompleted']) }],
  ['POST', '/agent/jobs/{id}/complete', {
    tag: 'Kiosk', summary: 'Mark a job printed (idempotent)', auth: 'kiosk',
    body: obj({ confirmation: en(['confirmed', 'unconfirmed']), method: en(['ipp-job-state', 'queue-drain', 'none']), detail: str() }),
    data: anyObj(),
  }],
  ['POST', '/agent/jobs/{id}/failed', {
    tag: 'Kiosk', summary: 'Report a failed print; retryable faults go back to the queue', auth: 'kiosk',
    body: obj({ reason: str(), retryable: bool() }),
    data: obj({ requeued: bool() }),
  }],
  ['POST', '/agent/printer/capabilities', {
    tag: 'Kiosk', summary: "Report the printer's capabilities", auth: 'kiosk',
    body: obj({ color: bool(), duplex: bool(), a3: bool(), media: arr(str()) }),
  }],
  ['GET', '/printer/heartbeat', { tag: 'Kiosk', summary: 'Kiosk heartbeat', auth: 'kiosk', data: obj({ kioskId: uuid(), timestamp: date(), serverTime: int() }) }],
  ['POST', '/printer/validate-code', { tag: 'Kiosk', summary: 'Check a pickup code at the kiosk', auth: 'kiosk', body: obj({ code: str() }, ['code']), data: anyObj() }],
  ['POST', '/printer/get-job', { tag: 'Kiosk', summary: 'Job details for a pickup code', auth: 'kiosk', body: obj({ code: str() }, ['code']), data: anyObj() }],
  ['POST', '/printer/complete', {
    tag: 'Kiosk', summary: 'Release a pickup code to this kiosk (kiosk-pull) or print it (cloud-push)', auth: 'kiosk',
    body: obj({ code: str() }, ['code']), data: obj({ mode: en(['kiosk-pull', 'cloud-push']), status: str(), batch: bool(), total: int() }),
  }],
  ['POST', '/printer/complete-batch', { tag: 'Kiosk', summary: 'Release a group batch code', auth: 'kiosk', body: obj({ code: str() }, ['code']), data: anyObj() }],
  ['PATCH', '/printer/progress', { tag: 'Kiosk', summary: 'Report pages printed by code', auth: 'kiosk', body: obj({ code: str(), pagesCompleted: int() }, ['code', 'pagesCompleted']) }],
  ['POST', '/cups/print', {
    tag: 'Kiosk', summary: 'Desktop print driver submission (print token)', auth: 'none',
    multipart: obj({ file: str({ format: 'binary' }), title: str(), options: str() }, ['file']), produces: 'json',
  }],

  ['POST', '/saas/signup', {
    tag: 'Shop onboarding', summary: 'Create a shop and its owner account', auth: 'none', status: 201,
    body: obj({
      businessName: str(), slug: str(), ownerFirstName: str(), ownerLastName: str(), ownerEmail: str(), ownerPhone: str(), ownerPassword: str({ minLength: 10 }),
    }, ['businessName', 'slug', 'ownerFirstName', 'ownerLastName', 'ownerEmail', 'ownerPhone', 'ownerPassword']),
    data: obj(
      { tenantId: uuid(), tenantSlug: str(), ownerUserId: uuid(), ownerEmail: str(), loginUrl: str() },
      ['tenantId', 'tenantSlug', 'ownerUserId', 'ownerEmail', 'loginUrl'],
    ),
  }],
  ['POST', '/saas/check-slug', { tag: 'Shop onboarding', summary: 'Is a shop slug available?', auth: 'none', body: obj({ slug: str() }, ['slug']), data: obj({ available: bool(), suggestion: str() }) }],
  ['POST', '/saas/verify-email', { tag: 'Shop onboarding', summary: 'Verify the shop owner email', auth: 'none', body: obj({ email: str(), token: str() }),
    data: obj({ verified: bool(), userId: uuid(), tenantSlug: str() }, ['verified']),
  }],
  ['POST', '/saas/resend-verification', { tag: 'Shop onboarding', summary: 'Resend the owner verification email', auth: 'none', body: obj({ email: str() }) }],
  ['POST', '/saas/setup/paystack-subaccount', {
    tag: 'Shop onboarding', summary: 'Set up Paystack split settlement (owner/admin)', auth: 'user',
    body: obj({ bankCode: str(), accountNumber: str({ pattern: '^[0-9]{10}$' }), businessName: str() }, ['bankCode', 'accountNumber']),
    data: obj({ subaccountCode: str(), accountName: nullable(str()) }, ['subaccountCode']),
  }],
  ['POST', '/saas/setup/bank-account', {
    tag: 'Shop onboarding', summary: 'Set the payout bank account (owner/admin)', auth: 'user',
    body: obj({ accountName: str(), bankCode: str(), accountNumber: str({ pattern: '^[0-9]{10}$' }) }, ['accountName', 'bankCode', 'accountNumber']),
    data: obj({ recipientCode: nullable(str()), accountName: str(), bankCode: str() }, ['accountName', 'bankCode']),
  }],

  ['GET', '/saas/me', { tag: 'Shop', summary: 'My shop, onboarding progress and payout schedule', auth: 'user', data: ref('ShopProfile') }],
  ['DELETE', '/saas/me', { tag: 'Shop', summary: 'Close and delete my shop (owner)', auth: 'user' }],
  ['POST', '/saas/me/export', { tag: 'Shop', summary: "Export my shop's data (owner/admin)", auth: 'user', produces: 'file' }],
  ['GET', '/saas/me/statement', { tag: 'Shop', summary: 'Monthly statement (CSV)', auth: 'user', query: { month: str({ example: '2026-10' }) }, produces: 'csv' }],
  ['GET', '/saas/me/lms', { tag: 'Shop', summary: 'LMS integration status', auth: 'user', data: obj({ keySet: bool() }) }],
  ['POST', '/saas/me/lms/regenerate', { tag: 'Shop', summary: 'Rotate the LMS key (shown once)', auth: 'user', data: obj({ key: str() }) }],
  ['PATCH', '/saas/me/location', {
    tag: 'Shop', summary: 'Set the shop address (geocoded) and marketplace listing', auth: 'user',
    body: obj({ address: nullable(str()), isDiscoverable: bool() }),
    data: obj({ address: nullable(str()), lat: nullable(num()), lng: nullable(num()), isDiscoverable: bool() }, ['address', 'lat', 'lng', 'isDiscoverable']),
  }],
  ['PATCH', '/saas/me/availability', {
    tag: 'Shop', summary: 'Open, mark busy or close the shop', auth: 'user',
    body: obj({ availability: en(['open', 'busy', 'closed']) }, ['availability']),
    data: obj({ availability: en(['open', 'busy', 'closed']) }, ['availability']),
  }],
  ['POST', '/saas/me/2fa/setup', { tag: 'Shop', summary: 'Start two-factor setup (returns QR URL)', auth: 'user', data: obj({ otpauthUrl: str(), secret: str() }, ['otpauthUrl', 'secret']) }],
  ['POST', '/saas/me/2fa/enable', { tag: 'Shop', summary: 'Confirm two-factor with a code', auth: 'user', body: obj({ code: str() }, ['code']), data: obj({ enabled: bool() }, ['enabled']) }],
  ['POST', '/saas/me/2fa/disable', { tag: 'Shop', summary: 'Turn off two-factor', auth: 'user', body: obj({ code: str() }, ['code']), data: obj({ enabled: bool() }, ['enabled']) }],
  ['GET', '/saas/me/branding', { tag: 'Shop', summary: 'Shop branding', auth: 'user', data: ref('Branding') }],
  ['PUT', '/saas/me/branding', { tag: 'Shop', summary: 'Update shop branding', auth: 'user', body: ref('BrandingInput'), data: ref('Branding') }],
  ['POST', '/saas/me/photos', {
    tag: 'Shop', summary: 'Add a shop photo (bearer or branding-photo ticket)', auth: 'upload',
    multipart: obj({ photo: str({ format: 'binary' }) }, ['photo']), data: obj({ photos: arr(str()) }),
  }],
  ['DELETE', '/saas/me/photos', { tag: 'Shop', summary: 'Remove a shop photo', auth: 'user', body: obj({ url: str() }, ['url']), data: obj({ photos: arr(str()) }) }],
  ['GET', '/saas/me/domains', { tag: 'Shop', summary: 'Custom domains', auth: 'user', data: arr(ref('TenantDomain')) }],
  ['POST', '/saas/me/domains', {
    tag: 'Shop', summary: 'Add a custom domain', auth: 'user', status: 201, body: obj({ domain: str() }, ['domain']),
    data: obj(
      {
        id: uuid(),
        domain: str(),
        status: en(['pending', 'verified', 'failed']),
        dns: obj({ txt: obj({ name: str(), value: str() }), cname: obj({ name: str(), value: str() }) }),
      },
      ['id', 'domain', 'status', 'dns'],
    ),
  }],
  ['POST', '/saas/me/domains/{id}/verify', { tag: 'Shop', summary: 'Check DNS for a custom domain', auth: 'user', data: obj({ verified: bool() }, ['verified']) }],
  ['DELETE', '/saas/me/domains/{id}', { tag: 'Shop', summary: 'Remove a custom domain', auth: 'user' }],
  ['GET', '/saas/me/webhooks', { tag: 'Shop', summary: 'Outbound webhooks', auth: 'user', data: arr(ref('TenantWebhook')) }],
  ['POST', '/saas/me/webhooks', {
    tag: 'Shop', summary: 'Add an outbound webhook (https, public hosts only)', auth: 'user', status: 201,
    body: obj({ name: str(), url: str(), events: arr(str()) }, ['name', 'url']), data: ref('TenantWebhook'),
  }],
  ['PATCH', '/saas/me/webhooks/{id}', { tag: 'Shop', summary: 'Update a webhook', auth: 'user', body: obj({ name: str(), events: arr(str()), isActive: bool() }), data: ref('TenantWebhook') }],
  ['DELETE', '/saas/me/webhooks/{id}', { tag: 'Shop', summary: 'Delete a webhook', auth: 'user' }],
  ['GET', '/saas/ops/summary', { tag: 'Shop', summary: 'Live operations summary and go-live checklist', auth: 'user', data: ref('OpsSummary') }],
  ['GET', '/saas/dashboard/stats', { tag: 'Shop', summary: 'Dashboard statistics', auth: 'user', data: ref('DashboardStats') }],
  ['GET', '/saas/balance', {
    tag: 'Shop money', summary: 'Available balance and commission totals', auth: 'user',
    data: obj({ currency: str(), availableBalance: num(), pendingPayout: num(), lifetimeCommissionPaidToPlatform: num(), commissionPct: num() }),
  }],
  ['GET', '/saas/transactions', {
    tag: 'Shop money', summary: 'Ledger transactions', auth: 'user', query: { cursor: str(), limit: int() },
    data: cursorPage(obj({ id: uuid(), type: str(), amount: num(), commissionAmount: num(), description: str(), balanceAfter: num(), reference: str(), createdAt: date() })),
  }],
  ['GET', '/saas/payouts', { tag: 'Shop money', summary: 'Payout history', auth: 'user', query: { cursor: str(), limit: int() }, data: cursorPage(ref('Payout')) }],
  ['POST', '/saas/payouts/instant', { tag: 'Shop money', summary: 'Pay out the available balance now (owner/admin)', auth: 'user', status: 201,
    data: obj({ id: uuid(), amount: num(), feeAmount: num(), status: str(), reference: nullable(str()) }, ['id', 'amount', 'status']),
  }],
  ['GET', '/saas/payments', {
    tag: 'Shop money', summary: 'Customer payments', auth: 'user',
    query: { ...pageQuery, method: str(), status: str(), userId: uuid(), fromDate: date(), toDate: date() }, data: page('payments', ref('Payment')),
  }],

  ['GET', '/saas/jobs', {
    tag: 'Shop queue', summary: 'Live job queue', auth: 'user', query: { ...pageQuery, status: en(PRINT_JOB_STATUSES), search: str() },
    data: obj({ jobs: arr(ref('ShopJob')), total: int(), page: int(), limit: int() }, ['jobs']),
  }],
  ['POST', '/saas/jobs/{id}/accept', { tag: 'Shop queue', summary: 'Accept a marketplace job', auth: 'user', data: obj({ status: str() }) }],
  ['POST', '/saas/jobs/{id}/release', { tag: 'Shop queue', summary: "Send a ready job to the shop's printer", auth: 'user', data: obj({ status: str(), kioskId: nullable(uuid()) }) }],
  ['PATCH', '/saas/jobs/{id}/requeue', { tag: 'Shop queue', summary: 'Requeue a failed paid job', auth: 'user', data: obj({ status: str() }) }],
  ['PATCH', '/saas/jobs/{id}/status', { tag: 'Shop queue', summary: 'Mark a job collected', auth: 'user', body: obj({ status: en(['done']) }, ['status']), data: obj({ status: str() }) }],
  ['GET', '/saas/group-sessions', { tag: 'Shop queue', summary: "Group sessions at this shop", auth: 'user', data: obj({ sessions: arr(ref('GroupSession')) }) }],

  ['GET', '/saas/kiosks', { tag: 'Shop kiosks', summary: 'Kiosks', auth: 'user', data: obj({ kiosks: arr(kioskSummary) }, ['kiosks']) }],
  ['POST', '/saas/kiosks', {
    tag: 'Shop kiosks', summary: 'Add a kiosk (returns its API key once)', auth: 'user', status: 201,
    body: obj({ name: str(), location: str(), campus: str(), printerName: str(), ipAddress: str() }, ['name']), data: obj({ kiosk: ref('Kiosk') }, ['kiosk']),
  }],
  ['GET', '/saas/kiosks/offline', {
    tag: 'Shop kiosks', summary: 'Kiosks that stopped checking in', auth: 'user',
    data: obj({ kiosks: arr(obj({ id: uuid(), name: str(), location: nullable(str()), campus: nullable(str()), status: str(), lastSeenAt: nullable(date()), minutesSinceLastSeen: int() })), count: int() }),
  }],
  ['GET', '/saas/kiosks/{id}', { tag: 'Shop kiosks', summary: 'Kiosk detail', auth: 'user', data: obj({ kiosk: ref('Kiosk') }, ['kiosk']) }],
  ['PATCH', '/saas/kiosks/{id}', { tag: 'Shop kiosks', summary: 'Update a kiosk', auth: 'user', body: anyObj(), data: obj({ kiosk: ref('Kiosk') }, ['kiosk']) }],
  ['PATCH', '/saas/kiosks/{id}/status', {
    tag: 'Shop kiosks', summary: 'Change kiosk status', auth: 'user',
    body: obj({ status: en(['ACTIVE', 'MAINTENANCE', 'OFFLINE', 'DISABLED']) }, ['status']), data: obj({ kiosk: ref('Kiosk') }, ['kiosk']),
  }],
  ['DELETE', '/saas/kiosks/{id}', { tag: 'Shop kiosks', summary: 'Remove a kiosk', auth: 'user' }],
  ['POST', '/saas/kiosks/{id}/regenerate-key', { tag: 'Shop kiosks', summary: 'Rotate the kiosk API key (shown once)', auth: 'user', data: obj({ id: uuid(), apiKey: str() }, ['apiKey']) }],
  ['POST', '/saas/kiosks/{id}/test-connection', { tag: 'Shop kiosks', summary: 'Check the kiosk is reachable', auth: 'user', data: anyObj() }],
  ['POST', '/saas/kiosks/{id}/test-print', { tag: 'Shop kiosks', summary: 'Send a test page', auth: 'user', data: anyObj() }],
  ['POST', '/saas/kiosks/{id}/test-print-pass', { tag: 'Shop kiosks', summary: 'Confirm the test page printed', auth: 'user', data: anyObj() }],

  ['GET', '/saas/pricing', { tag: 'Shop catalogue', summary: 'Price list', auth: 'user', data: obj({ configs: arr(ref('PricingConfig')) }, ['configs']) }],
  ['POST', '/saas/pricing', { tag: 'Shop catalogue', summary: 'Add a price row (owner/admin)', auth: 'user', status: 201, body: ref('PricingInput'), data: obj({ config: ref('PricingConfig') }) }],
  ['PATCH', '/saas/pricing/{id}', { tag: 'Shop catalogue', summary: 'Update a price row (owner/admin)', auth: 'user', body: ref('PricingInput'), data: obj({ config: ref('PricingConfig') }) }],
  ['DELETE', '/saas/pricing/{id}', { tag: 'Shop catalogue', summary: 'Remove a price row (owner/admin)', auth: 'user' }],
  ['GET', '/saas/promotions', { tag: 'Shop catalogue', summary: 'Promotions', auth: 'user', data: obj({ promotions: arr(ref('Promotion')) }, ['promotions']) }],
  ['POST', '/saas/promotions', { tag: 'Shop catalogue', summary: 'Create a promotion (owner/admin)', auth: 'user', status: 201, body: ref('PromotionInput'), data: obj({ promotion: ref('Promotion') }) }],
  ['PATCH', '/saas/promotions/{id}', { tag: 'Shop catalogue', summary: 'Update a promotion (owner/admin)', auth: 'user', body: ref('PromotionInput'), data: obj({ promotion: ref('Promotion') }) }],
  ['DELETE', '/saas/promotions/{id}', { tag: 'Shop catalogue', summary: 'Delete a promotion (owner/admin)', auth: 'user' }],
  ['GET', '/saas/printer-profiles', { tag: 'Shop catalogue', summary: 'Printer profiles', auth: 'user', data: arr(ref('PrinterProfile')) }],
  ['POST', '/saas/printer-profiles', {
    tag: 'Shop catalogue', summary: 'Add a printer profile (owner/admin)', auth: 'user', status: 201,
    body: obj({ displayName: str(), ippUri: nullable(str()), driverKind: str(), isDefault: bool(), capabilities: ref('PrinterCapabilities') }, ['displayName', 'capabilities']),
    data: ref('PrinterProfile'),
  }],
  ['PATCH', '/saas/printer-profiles/{id}', {
    tag: 'Shop catalogue', summary: 'Update a printer profile (owner/admin)', auth: 'user',
    body: obj({ displayName: str(), ippUri: nullable(str()), driverKind: str(), isDefault: bool(), isActive: bool(), capabilities: ref('PrinterCapabilities') }),
    data: ref('PrinterProfile'),
  }],
  ['DELETE', '/saas/printer-profiles/{id}', { tag: 'Shop catalogue', summary: 'Delete a printer profile (owner/admin)', auth: 'user' }],

  ['GET', '/saas/disputes', { tag: 'Shop customers', summary: 'Disputes raised at this shop', auth: 'user', data: arr(ref('Dispute')) }],
  ['POST', '/saas/disputes/{id}/resolve', {
    tag: 'Shop customers', summary: 'Resolve or reject a dispute (owner/admin)', auth: 'user',
    body: obj({ status: en(['resolved', 'rejected']), resolutionNotes: str() }, ['status']), data: ref('Dispute'),
  }],
  ['GET', '/saas/customers', { tag: 'Shop customers', summary: 'Customers of this shop', auth: 'user', query: { ...pageQuery, search: str() }, data: page('customers', ref('PublicUser')) }],
  ['GET', '/saas/customers/{id}', {
    tag: 'Shop customers', summary: 'Customer detail and recent jobs', auth: 'user',
    data: obj({ customer: ref('PublicUser'), stats: obj({ totalJobs: int(), totalSpent: num() }), recentJobs: arr(anyObj()) }),
  }],
  ['PATCH', '/saas/customers/{id}/block', {
    tag: 'Shop customers', summary: 'Block or unblock a customer registered with this shop (owner/admin)', auth: 'user',
    body: obj({ isBlocked: bool(), reason: str() }, ['isBlocked']),
  }],
  ['GET', '/saas/reports/revenue', {
    tag: 'Shop customers', summary: 'Revenue by day (JSON or CSV; owner/admin)', auth: 'user',
    query: { days: int(), fromDate: date(), toDate: date(), format: en(['json', 'csv']) },
    data: obj({ rows: arr(obj({ date: str(), transactions: int(), revenue: num() })), summary: obj({ totalRevenue: num(), totalTransactions: int() }) }),
  }],
  ['GET', '/saas/reports/kiosks', {
    tag: 'Shop customers', summary: 'Jobs, pages and revenue per kiosk (owner/admin)', auth: 'user',
    data: obj({ kiosks: arr(obj({ kioskId: uuid(), kioskName: nullable(str()), totalJobs: int(), totalPages: int(), revenue: num() })) }),
  }],
  ['GET', '/saas/audit-logs', {
    tag: 'Shop customers', summary: "This shop's audit log (owner/admin)", auth: 'user',
    query: { ...pageQuery, actorId: uuid(), action: str(), fromDate: date(), toDate: date() }, data: page('logs', ref('AuditLog')),
  }],
  ['GET', '/saas/team', { tag: 'Shop team', summary: 'Team members and roles', auth: 'user', data: obj({ members: arr(ref('TeamMember')) }, ['members']) }],
  ['POST', '/saas/team', {
    tag: 'Shop team', summary: 'Add a team member; new people get a set-password email (owner/admin)', auth: 'user', status: 201,
    body: obj({ email: str(), role: en(['admin', 'staff']), firstName: str(), lastName: str(), phoneNumber: str() }, ['email', 'role']),
    data: obj({ userId: uuid(), email: str(), role: en(TENANT_ROLES), invited: bool() }),
  }],
  ['PATCH', '/saas/team/{userId}', { tag: 'Shop team', summary: "Change a member's role (owner)", auth: 'user', body: obj({ role: en(['admin', 'staff']) }, ['role']), data: obj({ userId: uuid(), role: str() }) }],
  ['DELETE', '/saas/team/{userId}', { tag: 'Shop team', summary: 'Remove a team member (owner/admin)', auth: 'user' }],

  ['GET', '/saas/edit-pricing', { tag: 'Edit & Print', summary: 'Editing fees and whether editing is offered', auth: 'user', data: ref('EditPricing') }],
  ['POST', '/saas/edit-pricing', {
    tag: 'Edit & Print', summary: 'Set editing fees', auth: 'user',
    body: obj({ baseFee: num(), perPageFee: num(), complexityTierFees: anyObj(), maxShopAdjustmentPct: num(), editingEnabled: bool() }), data: ref('EditPricing'),
  }],
  ['GET', '/saas/edit-queue', { tag: 'Edit & Print', summary: 'Edit requests waiting for the shop', auth: 'user', query: { status: str(), limit: int() }, data: obj({ items: arr(ref('EditQueueItem')) }, ['items']) }],
  ['GET', '/saas/edit/{jobId}', { tag: 'Edit & Print', summary: 'Edit detail (shop or the customer)', auth: 'user', data: ref('EditJob') }],
  ['POST', '/saas/edit/{jobId}/start', { tag: 'Edit & Print', summary: 'Start (or restart after rejection) an edit', auth: 'user', data: obj({ editId: uuid(), status: str() }) }],
  ['POST', '/saas/edit/{jobId}/upload', {
    tag: 'Edit & Print', summary: 'Attach the edited document (uploaded via /uploads/edited-document)', auth: 'user',
    body: obj({ documentUrl: str(), shopNotes: nullable(str()), editOperations: arr(anyObj()) }, ['documentUrl']),
    data: obj({ editId: uuid(), status: str(), pageCount: int() }),
  }],
  ['POST', '/saas/edit/{jobId}/complete', { tag: 'Edit & Print', summary: 'Send the edited document to the customer', auth: 'user', data: obj({ editId: uuid(), status: str(), documentUrl: nullable(str()) }) }],
  ['POST', '/saas/edit/{jobId}/confirm', {
    tag: 'Edit & Print', summary: 'Customer approves the edit; the job becomes payable', auth: 'user',
    data: obj({ editId: uuid(), status: str(), printJobStatus: str(), amountDue: num(), pageCount: int() }),
  }],
  ['POST', '/saas/edit/{jobId}/reject', { tag: 'Edit & Print', summary: 'Customer asks for changes', auth: 'user', body: obj({ reason: str() }), data: obj({ editId: uuid(), status: str() }) }],
  ['POST', '/saas/edit/{jobId}/confirm-payment', { tag: 'Edit & Print', summary: 'Retired: edit fees are paid at checkout (410)', auth: 'user' }],
  ['POST', '/saas/editor/session', {
    tag: 'Edit & Print', summary: 'Open a live editor session for an edit', auth: 'user', status: 201,
    body: obj({ editId: uuid() }, ['editId']), data: obj({ sessionId: uuid(), token: str(), editorUrl: str(), conversionStatus: str(), iceServers: arr(anyObj()) }),
  }],
  ['GET', '/saas/editor/session/{id}', { tag: 'Edit & Print', summary: 'Editor session with the document (shop staff or the customer)', auth: 'user', data: ref('EditorSessionView') }],
  ['POST', '/saas/editor/session/{id}/snapshot', { tag: 'Edit & Print', summary: 'Save the editor document', auth: 'user', body: obj({ document: anyObj(), version: int() }, ['document']), data: obj({ saved: bool(), version: int() }) }],
  ['POST', '/saas/editor/session/{id}/export', {
    tag: 'Edit & Print', summary: 'Export the editor document to PDF and send it for review', auth: 'user',
    data: obj({ documentUrl: str(), pageCount: int(), fileSize: int(), renderer: en(['external', 'converter', 'builtin']) }),
  }],
  ['GET', '/saas/editor/session/{id}/conversion-status', {
    tag: 'Edit & Print', summary: 'Document conversion progress', auth: 'user',
    data: obj({ status: en(['pending', 'processing', 'completed', 'failed']), error: nullable(str()) }, ['status']),
  }],
  ['POST', '/saas/editor/session/{id}/approve', {
    tag: 'Edit & Print', summary: 'Customer approves from the editor; the job becomes payable', auth: 'user',
    data: obj({ printJobId: uuid(), amountDue: num(), pageCount: int() }),
  }],
  ['POST', '/saas/editor/session/{id}/reject', { tag: 'Edit & Print', summary: 'Customer asks for changes from the editor', auth: 'user', body: obj({ reason: str() }), data: anyObj() }],
  ['GET', '/saas/editor/by-job/{jobId}', {
    tag: 'Edit & Print', summary: "Customer's view of an edit and its latest editor session", auth: 'user',
    data: obj(
      { editId: uuid(), status: en(EDIT_STATUSES), editedDocumentUrl: nullable(str()), totalEditFee: num(), session: nullable(ref('EditorSessionView')) },
      ['editId', 'status', 'totalEditFee', 'session'],
    ),
  }],
  ['GET', '/saas/editor/active-sessions', { tag: 'Edit & Print', summary: 'Live editor sessions', auth: 'user', data: obj({ activeSessions: int() }) }],

  ['GET', '/platform/tenants', {
    tag: 'Platform', summary: 'All shops', auth: 'user', query: { status: str(), limit: int(), before: date() }, data: cursorPage(ref('Tenant')),
  }],
  ['GET', '/platform/tenants/{id}', {
    tag: 'Platform', summary: 'Shop detail with usage and team', auth: 'user',
    data: obj(
      {
        tenant: ref('Tenant'),
        stats: obj({ kioskCount: int(), onlineKiosks: int(), jobCount: int(), customerCount: int(), gmv: num() }, ['kioskCount', 'onlineKiosks', 'jobCount', 'customerCount', 'gmv']),
        members: arr(obj({ userId: uuid(), role: en(TENANT_ROLES), email: str(), name: str() }, ['userId', 'role', 'email', 'name'])),
      },
      ['tenant', 'stats', 'members'],
    ),
  }],
  ['POST', '/platform/tenants/{id}/suspend', {
    tag: 'Platform', summary: 'Suspend a shop', auth: 'user', body: obj({ reason: str() }),
    data: obj({ id: uuid(), status: en(['trial', 'active', 'suspended', 'closed']), suspendedAt: nullable(date()), suspendReason: nullable(str()) }, ['id', 'status']),
  }],
  ['POST', '/platform/tenants/{id}/reactivate', {
    tag: 'Platform', summary: 'Reactivate a shop', auth: 'user',
    data: obj({ id: uuid(), status: en(['trial', 'active', 'suspended', 'closed']) }, ['id', 'status']),
  }],
  ['POST', '/platform/tenants/{id}/impersonate', {
    tag: 'Platform', summary: "Short-lived token to act as a shop's owner", auth: 'user', query: { ttl: int() },
    data: obj({ token: str(), ttlSeconds: int(), tenant: obj({ id: uuid(), slug: str(), name: str() }, ['id', 'slug', 'name']) }, ['token', 'ttlSeconds', 'tenant']),
  }],
  ['DELETE', '/platform/tenants/{id}', {
    tag: 'Platform', summary: 'Hard-delete a closed shop (force=true overrides the safety checks)', auth: 'user', query: { force: str({ enum: ['true', 'false'] }) },
    data: anyObj(),
  }],
  ['GET', '/platform/reliability', {
    tag: 'Platform', summary: 'Kiosk uptime and job success rates', auth: 'user',
    data: obj(
      {
        agentUptime: obj({ totalActiveKiosks: int(), onlineKiosksCount: int(), onlineRatePct: num() }, ['totalActiveKiosks', 'onlineKiosksCount', 'onlineRatePct']),
        jobSuccessRate: obj({ completedJobsCount: int(), failedJobsCount: int(), successRatePct: num(), failureRatePct: num() }, ['completedJobsCount', 'failedJobsCount', 'successRatePct', 'failureRatePct']),
        paidUnredeemed: obj({ readyCount: int(), renderingCount: int(), releasingCount: int(), printingCount: int(), totalPaidUnredeemed: int() }, ['readyCount', 'renderingCount', 'releasingCount', 'printingCount', 'totalPaidUnredeemed']),
      },
      ['agentUptime', 'jobSuccessRate', 'paidUnredeemed'],
    ),
  }],
  ['GET', '/platform/users', {
    tag: 'Platform', summary: 'Search all users', auth: 'user', query: { ...pageQuery, search: str(), role: en(USER_ROLES), tenantId: uuid() }, data: page('users', ref('PublicUser')),
  }],
  ['GET', '/platform/users/{id}', {
    tag: 'Platform', summary: 'User detail, spend and shop memberships', auth: 'user',
    data: obj({ user: ref('PublicUser'), stats: obj({ totalJobs: int(), totalSpent: num() }), recentJobs: arr(anyObj()), memberships: arr(obj({ tenantId: uuid(), tenantName: str(), role: en(TENANT_ROLES) })) }),
  }],
  ['PATCH', '/platform/users/{id}/block', { tag: 'Platform', summary: 'Block or unblock a user', auth: 'user', body: obj({ isBlocked: bool(), reason: str() }, ['isBlocked']) }],
  ['PATCH', '/platform/users/{id}/role', { tag: 'Platform', summary: "Change a user's platform role", auth: 'user', body: obj({ role: en(USER_ROLES) }, ['role']), data: obj({ user: ref('PublicUser') }) }],
  ['GET', '/platform/settings', { tag: 'Platform', summary: 'Global settings', auth: 'user', data: obj({ settings: arr(ref('SystemSetting')) }, ['settings']) }],
  ['PATCH', '/platform/settings/{key}', { tag: 'Platform', summary: 'Update a global setting (type-checked)', auth: 'user', body: obj({ value: {} }, ['value']), data: obj({ setting: ref('SystemSetting') }) }],
  ['GET', '/platform/blog', { tag: 'Platform', summary: 'All blog posts including drafts', auth: 'user', data: arr(ref('BlogPost')) }],
  ['POST', '/platform/blog', { tag: 'Platform', summary: 'Create a blog post', auth: 'user', status: 201, body: ref('BlogPostInput'), data: ref('BlogPost') }],
  ['PATCH', '/platform/blog/{id}', { tag: 'Platform', summary: 'Update a blog post', auth: 'user', body: ref('BlogPostInput'), data: ref('BlogPost') }],
  ['DELETE', '/platform/blog/{id}', { tag: 'Platform', summary: 'Delete a blog post', auth: 'user' }],
  ['GET', '/platform/disputes', {
    tag: 'Platform', summary: 'Disputes across all shops', auth: 'user', query: { ...pageQuery, status: str(), tenantId: uuid() }, data: page('disputes', ref('Dispute')),
  }],
  ['POST', '/platform/disputes/{id}/resolve', {
    tag: 'Platform', summary: 'Resolve or reject any dispute', auth: 'user',
    body: obj({ status: en(['resolved', 'rejected']), resolutionNotes: str() }, ['status']), data: ref('Dispute'),
  }],
  ['GET', '/platform/reports/summary', {
    tag: 'Platform', summary: 'GMV, commission, jobs and payouts for a period', auth: 'user', query: { days: int({ minimum: 1, maximum: 365 }) },
    data: obj({
      days: int(), gmv: num(), transactions: int(), commission: num(),
      shops: arr(obj({ tenantId: uuid(), name: nullable(str()), slug: nullable(str()), transactions: int(), gmv: num(), commission: num() })),
      jobsByStatus: arr(obj({ status: str(), count: int() })),
      payoutsByStatus: arr(obj({ status: str(), count: int(), amount: num() })),
    }),
  }],
  ['GET', '/platform/audit-logs', {
    tag: 'Platform', summary: 'Audit log across all shops', auth: 'user',
    query: { ...pageQuery, actorId: uuid(), action: str(), tenantId: uuid(), fromDate: date(), toDate: date() }, data: page('logs', ref('AuditLog')),
  }],
  ['GET', '/platform/kiosks', {
    tag: 'Platform', summary: 'Kiosk fleet across all shops', auth: 'user',
    data: obj({ kiosks: arr(obj({ id: uuid(), name: str(), location: nullable(str()), status: str(), lastSeenAt: nullable(date()), online: bool(), tenant: nullable(obj({ id: uuid(), name: str(), slug: str() })) })) }),
  }],
  ['GET', '/platform/payouts', {
    tag: 'Platform', summary: 'Payouts across all shops', auth: 'user', query: { ...pageQuery, status: str(), tenantId: uuid() }, data: page('payouts', ref('Payout')),
  }],
];
