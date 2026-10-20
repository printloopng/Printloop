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

  it('serves fleet, disputes, payouts, audit and summary reports', async () => {
    for (const p of ['/platform/kiosks', '/platform/disputes', '/platform/payouts', '/platform/audit-logs', '/platform/reliability', '/platform/tenants']) {
      expect((await api.call('GET', p, { token: admin })).status).toBe(200);
    }
    const summary = (await api.call('GET', '/platform/reports/summary?days=365', { token: admin })).body.data;
    expect(typeof summary.gmv).toBe('number');
    for (const row of summary.jobsByStatus) expect(typeof row.count).toBe('number');
  });
});
