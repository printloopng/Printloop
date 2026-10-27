import { startTestApi, type TestApi } from '@/test/harness';

jest.setTimeout(120_000);

describe('backoffice API', () => {
  let api: TestApi;
  let admin: string;
  let ops: string;

  beforeAll(async () => {
    api = await startTestApi();
    admin = await api.login('admin@printloop.test', 'Admin1234!');
    ops = await api.login('ops@printloop.test', 'Admin1234!');
  });

  afterAll(() => api.close());

  it('is limited to super admins', async () => {
    expect((await api.call('GET', '/platform/users', { token: ops })).status).toBe(403);
    expect((await api.call('GET', '/platform/users')).status).toBe(401);
  });

  it('searches users and protects the last super admin', async () => {
    const users = await api.call('GET', '/platform/users?search=printloop.test', { token: admin });
    expect(users.body.data.users.length).toBeGreaterThan(0);
    expect(users.text).not.toMatch(/passwordHash|totpSecret/);
    const me = (await api.call('GET', '/customer/auth/me', { token: admin })).body.data;
    expect((await api.call('PATCH', `/platform/users/${me.id}/role`, { token: admin, body: { role: 'user' } })).status).toBe(409);
    expect((await api.call('PATCH', `/platform/users/${me.id}/block`, { token: admin, body: { isBlocked: true } })).status).toBe(409);
  });

  it('type-checks global settings', async () => {
    const settings = (await api.call('GET', '/platform/settings', { token: admin })).body.data.settings;
    const numeric = settings.find((s: any) => s.valueType === 'number' && !s.isReadOnly);
    expect(numeric).toBeTruthy();
    expect((await api.call('PATCH', `/platform/settings/${numeric.key}`, { token: admin, body: { value: 'abc' } })).status).toBe(400);
    expect((await api.call('PATCH', `/platform/settings/${numeric.key}`, { token: admin, body: { value: numeric.value } })).status).toBe(200);
  });

  it('publishes blog posts to the public blog', async () => {
    const post = await api.call('POST', '/platform/blog', { token: admin, body: { title: `Launch ${Date.now()}`, content: 'Hello', status: 'published' } });
    expect(post.status).toBe(201);
    expect((await api.call('GET', `/blog/${post.body.data.slug}`)).status).toBe(200);
    expect((await api.call('PATCH', `/platform/blog/${post.body.data.id}`, { token: admin, body: { status: 'draft' } })).status).toBe(200);
    expect((await api.call('GET', `/blog/${post.body.data.slug}`)).status).toBe(404);
  });

  it('runs a shop lifecycle: detail, suspend, impersonate, reactivate, delete', async () => {
    const email = `closer+${Date.now()}@example.com`;
    const signup = await api.call('POST', '/saas/signup', {
      body: { businessName: 'Lifecycle Print', slug: `life-${Date.now() % 1e6}`, ownerFirstName: 'Lee', ownerLastName: 'Cycle', ownerEmail: email, ownerPhone: '+2348031234567', ownerPassword: 'Str0ng!Passw0rd', address: 'Yaba' },
    });
    expect(signup.status).toBe(201);
    const tenants = (await api.call('GET', '/platform/tenants?limit=200', { token: admin })).body.data.items;
    const shop = tenants.find((t: any) => t.name === 'Lifecycle Print');
    expect(shop).toBeTruthy();

    const detail = (await api.call('GET', `/platform/tenants/${shop.id}`, { token: admin })).body.data;
    expect(detail.tenant.slug).toBe(shop.slug);
    expect(detail.members.some((m: any) => m.role === 'owner' && m.email === email)).toBe(true);
    expect(JSON.stringify(detail)).not.toMatch(/lmsKey|passwordHash/);

    const suspended = await api.call('POST', `/platform/tenants/${shop.id}/suspend`, { token: admin, body: { reason: 'Chargeback review' } });
    expect(suspended.body.data.status).toBe('suspended');
    expect((await api.call('POST', `/platform/tenants/${shop.id}/suspend`, { token: admin, body: {} })).status).toBe(409);
    expect((await api.call('GET', '/branding', { headers: { 'X-Tenant-Slug': shop.slug } })).status).toBe(200);
    expect((await api.call('POST', '/customer/print-jobs', { token: admin, headers: { 'X-Tenant-Slug': shop.slug } })).status).toBe(403);

    const reactivated = await api.call('POST', `/platform/tenants/${shop.id}/reactivate`, { token: admin });
    expect(reactivated.body.data.status).toBe('active');

    const imp = (await api.call('POST', `/platform/tenants/${shop.id}/impersonate?ttl=120`, { token: admin })).body.data;
    expect(imp.tenant.slug).toBe(shop.slug);
    expect(imp.ttlSeconds).toBe(120);
    const seen = (await api.call('GET', '/saas/me', { token: imp.token })).body.data;
    expect(seen.slug).toBe(shop.slug);
    expect(seen.myRole).toBe('owner');
    const hop = { token: imp.token, headers: { 'X-Tenant-Slug': 'campus-print' } };
    expect((await api.call('GET', '/saas/me', hop)).body.data.slug).toBe(shop.slug);
    expect((await api.call('GET', '/platform/users', { token: imp.token })).status).toBe(403);
    expect((await api.call('GET', '/metrics', { token: imp.token })).status).toBe(403);
    for (const [method, path] of [['POST', '/saas/me/2fa/setup'], ['PUT', '/customer/auth/password'], ['DELETE', '/saas/me'], ['POST', '/saas/payouts/instant'], ['POST', '/saas/setup/bank-account']]) {
      const blocked = await api.call(method, path, { token: imp.token, body: {} });
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('SUPPORT_SESSION_RESTRICTED');
    }

    expect((await api.call('DELETE', `/platform/tenants/${shop.id}`, { token: admin })).status).toBe(400);
    const gone = await api.call('DELETE', `/platform/tenants/${shop.id}?force=true`, { token: admin });
    expect(gone.status).toBe(200);
    expect((await api.call('GET', `/platform/tenants/${shop.id}`, { token: admin })).status).toBe(404);
  });

  it('serves fleet, disputes, payouts, audit and summary reports', async () => {
    for (const p of ['/platform/kiosks', '/platform/disputes', '/platform/payouts', '/platform/audit-logs', '/platform/reliability', '/platform/tenants']) {
      expect((await api.call('GET', p, { token: admin })).status).toBe(200);
    }
    const summary = (await api.call('GET', '/platform/reports/summary?days=365', { token: admin })).body.data;
    expect(typeof summary.gmv).toBe('number');
    for (const row of summary.jobsByStatus) expect(typeof row.count).toBe('number');
  });
});
