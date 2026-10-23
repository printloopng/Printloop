import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { startTestApi, newCustomer, paidJob, type TestApi } from '@/test/harness';

jest.setTimeout(120_000);

describe('shop console API', () => {
  let api: TestApi;
  let ops: string;
  let customer: string;
  let ds: any;
  let legacyId: string;

  beforeAll(async () => {
    api = await startTestApi();
    ds = (await import('@/config/data-source')).AppDataSource;
    const { Tenant } = await import('@/database/entities/tenant.entity');
    legacyId = (await ds.getRepository(Tenant).findOne({ where: { slug: 'legacy' } })).id;
    ops = await api.login('ops@printloop.test', 'Admin1234!');
    customer = (await newCustomer(api, 'shopcust')).token;
  });

  afterAll(() => api.close());

  async function addMember(role: 'staff' | 'admin'): Promise<string> {
    const { User } = await import('@/database/entities/user.entity');
    const { TenantMember } = await import('@/database/entities/tenantMember.entity');
    const email = `${role}+${Date.now()}@example.com`;
    const user = await ds.getRepository(User).save(
      ds.getRepository(User).create({
        id: crypto.randomUUID(),
        tenantId: legacyId,
        firstName: 'Team',
        lastName: role,
        email,
        phoneNumber: '+2348000000099',
        passwordHash: bcrypt.hashSync('Team!Passw0rd1', 12),
        salt: 'bcrypt',
        isEmailVerified: true,
        role: 'admin',
        adminPrivileges: [],
      }),
    );
    await ds.getRepository(TenantMember).save(ds.getRepository(TenantMember).create({ tenantId: legacyId, userId: user.id, role }));
    return api.login(email, 'Team!Passw0rd1');
  }

  it('serves the console overview, availability, domains and webhooks', async () => {
    const me = (await api.call('GET', '/saas/me', { token: ops })).body.data;
    expect(me.slug).toBe('legacy');
    expect(me.myRole).toBe('admin');
    expect((await api.call('GET', '/saas/ops/summary', { token: ops })).body.data.kioskCount).toBeGreaterThan(0);
    expect((await api.call('GET', '/saas/dashboard/stats', { token: ops })).status).toBe(200);
    expect((await api.call('PATCH', '/saas/me/availability', { token: ops, body: { availability: 'busy' } })).body.data.availability).toBe('busy');
    await api.call('PATCH', '/saas/me/availability', { token: ops, body: { availability: 'open' } });
    const domain = await api.call('POST', '/saas/me/domains', { token: ops, body: { domain: `print-${Date.now()}.example.edu.ng` } });
    expect(domain.status).toBe(201);
    expect(domain.body.data.dns.txt.value).toBeTruthy();
    expect((await api.call('GET', '/saas/me/domains', { token: ops })).body.data.length).toBeGreaterThan(0);
    expect((await api.call('POST', '/saas/me/webhooks', { token: ops, body: { name: 'local', url: 'http://127.0.0.1/hook' } })).status).toBe(400);
    const hooks = (await api.call('GET', '/saas/me/webhooks', { token: ops })).body.data;
    for (const h of hooks) expect(h.secret).toBe('***');
  });

  it('updates branding and shop photos through an upload ticket', async () => {
    const branding = await api.call('PUT', '/saas/me/branding', { token: ops, body: { wordmark: 'Legacy Print', primaryColor: '#D14B2C' } });
    expect(branding.status).toBe(200);
    expect(branding.body.data.primaryColor).toBe('#D14B2C');
    expect((await api.call('PUT', '/saas/me/branding', { token: ops, body: { primaryColor: 'red' } })).status).toBe(400);
    const ticket = (await api.call('POST', '/uploads/ticket', { token: ops, body: { purpose: 'branding-photo' } })).body.data.ticket;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData();
    form.append('photo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'front.png');
    const up = await api.call('POST', '/saas/me/photos', { form, headers: { 'X-Upload-Ticket': ticket } });
    expect(up.status).toBe(200);
    const url = up.body.data.photos.at(-1);
    expect((await api.call('GET', '/saas/me', { token: ops })).body.data.photos).toContain(url);
    const del = await api.call('DELETE', '/saas/me/photos', { token: ops, body: { url } });
    expect(del.body.data.photos).not.toContain(url);
  });

  it('runs the queue: list, release to the kiosk, collect, requeue', async () => {
    const job = await paidJob(api, customer);
    const list = await api.call('GET', '/saas/jobs', { token: ops });
    expect(list.body.data.jobs.some((j: any) => j.id === job.id)).toBe(true);
    expect((await api.call('GET', '/saas/jobs', { token: customer })).status).toBe(403);
    const rel = await api.call('POST', `/saas/jobs/${job.id}/release`, { token: ops });
    expect(rel.body.data.status).toBe('releasing');
    expect((await api.call('POST', `/saas/jobs/${job.id}/release`, { token: ops })).status).toBe(409);
    expect((await api.call('PATCH', `/saas/jobs/${job.id}/status`, { token: ops, body: { status: 'done' } })).status).toBe(200);
    const failed = await paidJob(api, customer);
    const { PrintJob } = await import('@/database/entities/printJob.entity');
    await ds.getRepository(PrintJob).update({ id: failed.id }, { status: 'failed' });
    expect((await api.call('PATCH', `/saas/jobs/${failed.id}/requeue`, { token: ops })).status).toBe(200);
    expect((await api.call('PATCH', `/saas/jobs/${failed.id}/requeue`, { token: ops })).status).toBe(409);
  });

  it('manages pricing and promotions with protected fields ignored', async () => {
    expect((await api.call('GET', '/saas/pricing', { token: ops })).body.data.configs).toBeInstanceOf(Array);
    const promo = await api.call('POST', '/saas/promotions', {
      token: ops,
      body: { code: `pl${Date.now() % 100000}`, name: 'Test', discountType: 'percentage', discountValue: 10, usageCount: 999, tenantId: crypto.randomUUID() },
    });
    expect(promo.status).toBe(201);
    expect(promo.body.data.promotion.usageCount).toBe(0);
    expect(promo.body.data.promotion.tenantId).toBe(legacyId);
    expect(promo.body.data.promotion.code).toBe(promo.body.data.promotion.code.toUpperCase());
  });

  it('serves reports and audit logs scoped to the shop, with numeric values', async () => {
    const revenue = await api.call('GET', '/saas/reports/revenue?days=365', { token: ops });
    expect(revenue.status).toBe(200);
    for (const row of revenue.body.data.rows) expect(typeof row.revenue).toBe('number');
    expect((await api.call('GET', '/saas/reports/revenue?format=csv', { token: ops })).text.startsWith('Date,Transactions,Revenue')).toBe(true);
    const kiosks = await api.call('GET', '/saas/reports/kiosks', { token: ops });
    for (const k of kiosks.body.data.kiosks) expect(typeof k.totalJobs).toBe('number');
    const logs = (await api.call('GET', '/saas/audit-logs', { token: ops })).body.data.logs;
    expect(logs.every((l: any) => l.tenantId === legacyId)).toBe(true);
    expect((await api.call('GET', '/saas/customers', { token: ops })).text).not.toMatch(/passwordHash/);
  });

  it('manages kiosks: only owners and admins add, edit, rotate and remove', async () => {
    const staff = await addMember('staff');
    expect((await api.call('POST', '/saas/kiosks', { token: staff, body: { name: 'Nope' } })).status).toBe(403);
    const created = await api.call('POST', '/saas/kiosks', { token: ops, body: { name: 'Library annex', location: 'Main library' } });
    expect(created.status).toBe(201);
    const kiosk = created.body.data.kiosk;
    expect(kiosk.apiKey).toBeTruthy();
    const read = (await api.call('GET', `/saas/kiosks/${kiosk.id}`, { token: staff })).body.data.kiosk;
    expect(read.apiKey).toBeUndefined();
    expect((await api.call('PATCH', `/saas/kiosks/${kiosk.id}`, { token: ops, body: { name: 'Library annex 2' } })).body.data.kiosk.name).toBe('Library annex 2');
    expect((await api.call('POST', `/saas/kiosks/${kiosk.id}/regenerate-key`, { token: staff })).status).toBe(403);
    const rotated = (await api.call('POST', `/saas/kiosks/${kiosk.id}/regenerate-key`, { token: ops })).body.data.apiKey;
    expect(rotated).not.toBe(kiosk.apiKey);
    expect((await api.call('POST', `/saas/kiosks/${kiosk.id}/test-print-pass`, { token: ops })).status).toBe(200);
    expect((await api.call('DELETE', `/saas/kiosks/${kiosk.id}`, { token: staff })).status).toBe(403);
    expect((await api.call('DELETE', `/saas/kiosks/${kiosk.id}`, { token: ops })).status).toBe(200);

    const { Tenant } = await import('@/database/entities/tenant.entity');
    const { Kiosk } = await import('@/database/entities/kiosk.entity');
    const other = await ds.getRepository(Tenant).save(ds.getRepository(Tenant).create({ name: 'Other Shop', slug: `other-${Date.now() % 100000}`, status: 'active' }));
    const foreign = await ds.getRepository(Kiosk).save(ds.getRepository(Kiosk).create({ name: 'Foreign', tenantId: other.id, apiKey: crypto.randomBytes(24).toString('hex') }));
    expect((await api.call('PATCH', `/saas/kiosks/${foreign.id}`, { token: ops, body: { name: 'Hijacked' } })).status).toBe(404);
    expect((await api.call('PATCH', `/saas/kiosks/${foreign.id}/status`, { token: ops, body: { status: 'DISABLED' } })).status).toBe(404);
    expect((await api.call('POST', `/saas/kiosks/${foreign.id}/regenerate-key`, { token: ops })).status).toBe(404);
    expect((await api.call('DELETE', `/saas/kiosks/${foreign.id}`, { token: ops })).status).toBe(404);
    expect((await ds.getRepository(Kiosk).findOne({ where: { id: foreign.id } }))?.name).toBe('Foreign');
  });

  it('applies team roles: only owners add admins, staff cannot manage', async () => {
    const email = `invite+${Date.now()}@example.com`;
    expect((await api.call('POST', '/saas/team', { token: ops, body: { email, role: 'admin' } })).status).toBe(403);
    const invite = await api.call('POST', '/saas/team', { token: ops, body: { email, role: 'staff', firstName: 'Sam' } });
    expect(invite.status).toBe(201);
    expect(invite.body.data.invited).toBe(true);
    expect((await api.call('POST', '/saas/team', { token: ops, body: { email, role: 'staff' } })).status).toBe(409);
    const staff = await addMember('staff');
    expect((await api.call('GET', '/saas/me', { token: staff })).body.data.myRole).toBe('staff');
    expect((await api.call('GET', '/saas/pricing', { token: staff })).status).toBe(200);
    expect((await api.call('POST', '/saas/pricing', { token: staff, body: { paperSize: 'A3', colorType: 'COLOR', pricePerPage: 50 } })).status).toBe(403);
    expect((await api.call('POST', '/saas/payouts/instant', { token: staff })).status).toBe(403);
    expect((await api.call('POST', '/saas/me/webhooks', { token: staff, body: { name: 'x', url: 'https://example.com/hook' } })).status).toBe(403);
  });

  it('guards payouts: bank account required, never double-pays split-settled shops', async () => {
    const noBank = await api.call('POST', '/saas/payouts/instant', { token: ops });
    expect([noBank.status, noBank.body.code]).toEqual([409, 'NO_BANK_ACCOUNT']);
    const { Tenant } = await import('@/database/entities/tenant.entity');
    await ds.getRepository(Tenant).update({ id: legacyId }, { paystackSubaccountCode: 'ACCT_test' });
    const split = await api.call('POST', '/saas/payouts/instant', { token: ops });
    expect([split.status, split.body.code]).toEqual([409, 'SPLIT_SETTLED']);
    await ds.getRepository(Tenant).update({ id: legacyId }, { paystackSubaccountCode: null });
  });
});
