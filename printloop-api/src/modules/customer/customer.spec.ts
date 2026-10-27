import { startTestApi, newCustomer, paidJob, pdfBytes, pdfForm, paystackEvent, DEFAULT_CONFIG, DEMO_SHOP, type TestApi } from '@/test/harness';

jest.setTimeout(120_000);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('customer API', () => {
  let api: TestApi;
  let users: any;

  beforeAll(async () => {
    api = await startTestApi();
    const { AppDataSource } = await import('@/config/data-source');
    const { User } = await import('@/database/entities/user.entity');
    users = AppDataSource.getRepository(User);
  });

  afterAll(() => api.close());

  describe('accounts', () => {
    it('enforces the password minimum', async () => {
      const r = await api.call('POST', '/customer/auth/register', {
        body: { email: 'short@example.com', password: 'short9chr', firstName: 'A', lastName: 'B', phoneNumber: '+2348000000001' },
      });
      expect(r.status).toBe(400);
    });

    it('registers unverified and verifies with the emailed code', async () => {
      const email = `verify+${Date.now()}@example.com`;
      const r = await api.call('POST', '/customer/auth/register', {
        body: { email, password: 'Str0ng!Passw0rd', firstName: 'A', lastName: 'B', phoneNumber: '+2348000000002' },
      });
      expect(r.status).toBe(201);
      expect(r.body.data.user.isEmailVerified).toBe(false);
      expect(JSON.stringify(r.body)).not.toMatch(/totpSecret|printToken|passwordHash/);
      const stored = (await users.findOne({ where: { email } })).verificationToken as string;
      const code = stored.split('.')[0];
      const wrong = code === '000000' ? '111111' : '000000';
      expect((await api.call('POST', '/customer/auth/verify-email', { body: { email, code: wrong } })).status).toBe(400);
      const ok = await api.call('POST', '/customer/auth/verify-email', { body: { email, code } });
      expect(ok.body.data.user.isEmailVerified).toBe(true);
      expect((await api.call('POST', '/customer/auth/resend-verification', { body: { email: 'nobody@example.com' } })).status).toBe(200);
    });

    it('manages profile, password, print token and data export', async () => {
      const { token, email } = await newCustomer(api, 'acct');
      const updated = await api.call('PUT', '/customer/auth/me', { token, body: { firstName: 'Ada', lastName: 'Obi', phoneNumber: '+2348031234567' } });
      expect(updated.body.data.firstName).toBe('Ada');
      expect((await api.call('PUT', '/customer/auth/password', { token, body: { oldPassword: 'wrong-password', newPassword: 'N3w!Password99' } })).status).toBeGreaterThanOrEqual(400);
      expect((await api.call('PUT', '/customer/auth/password', { token, body: { oldPassword: 'Str0ng!Passw0rd', newPassword: 'N3w!Password99' } })).status).toBe(200);
      expect(await api.login(email, 'N3w!Password99')).toBeTruthy();
      const rotated = (await api.call('POST', '/customer/print-token/rotate', { token })).body.data.token as string;
      const status = (await api.call('GET', '/customer/print-token', { token })).body.data;
      expect(status).toEqual({ hasToken: true, hint: `…${rotated.slice(-4)}` });
      const exported = await api.call('POST', '/customer/auth/export', { token });
      expect(exported.status).toBe(200);
      expect(exported.text).toContain(email);
      expect(exported.text).not.toMatch(/passwordHash|authorizationCode|totpSecret|"printToken"/);
    });

    it('keeps secrets out of /me', async () => {
      const { token } = await newCustomer(api);
      const me = await api.call('GET', '/customer/auth/me', { token });
      expect(me.status).toBe(200);
      expect(me.text).not.toMatch(/totpSecret|printToken|passwordHash|resetToken/);
    });
  });

  describe('printing', () => {
    it('prices from the server page count and isolates customers', async () => {
      const a = await newCustomer(api);
      const b = await newCustomer(api);
      const r = await api.call('POST', '/customer/print-jobs', { token: a.token, form: pdfForm(await pdfBytes(3), 'x.pdf', { printConfiguration: DEFAULT_CONFIG }) });
      expect(r.status).toBe(201);
      expect(r.body.data.job.pageCount).toBe(3);
      const bad = new FormData();
      bad.append('file', new Blob([new Uint8Array(Buffer.from('MZ binary'))]), 'tool.exe');
      expect((await api.call('POST', '/customer/print-jobs', { token: a.token, form: bad })).status).toBe(415);
      expect((await api.call('GET', '/customer/print-jobs', { token: b.token })).body.data.jobs).toHaveLength(0);
      expect((await api.call('GET', '/saas/me', { token: a.token })).status).toBe(403);
      expect((await api.call('GET', '/platform/tenants', { token: a.token })).status).toBe(403);
    });

    it('asks a marketplace customer to choose a shop instead of guessing one', async () => {
      const { token } = await newCustomer(api, 'market', null);
      const upload = await api.call('POST', '/customer/print-jobs', { token, form: pdfForm(await pdfBytes(1), 'a.pdf', { printConfiguration: DEFAULT_CONFIG }) });
      expect(upload.status).toBe(400);
      expect(upload.body.code).toBe('TENANT_REQUIRED');
      const chosen = await api.call('POST', '/customer/print-jobs', {
        token,
        headers: { 'X-Tenant-Slug': DEMO_SHOP },
        form: pdfForm(await pdfBytes(1), 'a.pdf', { printConfiguration: DEFAULT_CONFIG }),
      });
      expect(chosen.status).toBe(201);
      expect((await api.call('GET', '/branding')).body.data).toEqual({ tenant: null, branding: null });
      expect((await api.call('GET', '/pricing')).body.data.configs).toEqual([]);
    });

    it("lists only the resolved shop's prices and its editing offer", async () => {
      const { token } = await newCustomer(api);
      const mine = (await api.call('GET', '/customer/pricing', { token })).body.data;
      const pub = (await api.call('GET', '/pricing', { headers: { 'X-Tenant-Slug': DEMO_SHOP } })).body.data;
      expect(mine.tenantSlug).toBe(DEMO_SHOP);
      expect(mine.configs).toEqual(pub.configs);
      expect(typeof mine.editing.enabled).toBe('boolean');
      expect(mine.configs.length).toBeGreaterThan(0);
    });

    it('lets a customer report a problem once and see it listed', async () => {
      const { token } = await newCustomer(api);
      const job = await paidJob(api, token);
      const other = await newCustomer(api);
      expect((await api.call('POST', '/customer/disputes', { token: other.token, body: { printJobId: job.id, reason: 'Not mine' } })).status).toBe(404);
      const filed = await api.call('POST', '/customer/disputes', { token, body: { printJobId: job.id, reason: 'Pages came out blank' } });
      expect(filed.status).toBe(201);
      expect((await api.call('POST', '/customer/disputes', { token, body: { printJobId: job.id, reason: 'Again' } })).status).toBe(409);
      const mine = (await api.call('GET', '/customer/disputes', { token })).body.data.disputes;
      expect(mine).toHaveLength(1);
      expect((await api.call('GET', '/customer/disputes', { token: other.token })).body.data.disputes).toHaveLength(0);
    });

    it('prices a batch per file and returns one job', async () => {
      const { token } = await newCustomer(api);
      const form = new FormData();
      form.append('files', new Blob([new Uint8Array(await pdfBytes(2))], { type: 'application/pdf' }), 'a.pdf');
      form.append('files', new Blob([new Uint8Array(await pdfBytes(3))], { type: 'application/pdf' }), 'b.pdf');
      form.append('items', JSON.stringify([{ printConfiguration: { copies: 1 } }, { printConfiguration: { copies: 2, sided: 'double' } }]));
      const res = await api.call('POST', '/customer/print-jobs/batch', { token, form });
      expect(res.status).toBe(201);
      expect(res.body.data.itemCount).toBe(2);
      expect(res.body.data.job.pageCount).toBe(5);
      const one = (await api.call('POST', '/customer/print-jobs/quote', { token, body: { pageCount: 2, printConfiguration: { copies: 1 } } })).body.data.cost;
      const two = (await api.call('POST', '/customer/print-jobs/quote', { token, body: { pageCount: 3, printConfiguration: { copies: 2, sided: 'double' } } })).body.data.cost;
      expect(res.body.data.job.cost).toBe(one + two);
    });

    it('bills and keeps only the selected page range', async () => {
      const { token } = await newCustomer(api);
      const ranged = JSON.stringify({ ...JSON.parse(DEFAULT_CONFIG), pages: 'range', pageRange: '2-3' });
      const quoteRange = await api.call('POST', '/customer/print-jobs/quote', {
        token,
        body: { pageCount: 5, printConfiguration: JSON.parse(ranged) },
      });
      const quoteTwo = await api.call('POST', '/customer/print-jobs/quote', {
        token,
        body: { pageCount: 2, printConfiguration: JSON.parse(DEFAULT_CONFIG) },
      });
      expect(quoteRange.body.data.pageCount).toBe(2);
      expect(quoteRange.body.data.cost).toBe(quoteTwo.body.data.cost);
      const job = (await api.call('POST', '/customer/print-jobs', { token, form: pdfForm(await pdfBytes(5), 'five.pdf', { printConfiguration: ranged }) })).body.data.job;
      expect(job.pageCount).toBe(5);
      expect(job.cost).toBe(quoteTwo.body.data.cost);
      expect(job.printConfiguration).toMatchObject({ pages: 'range', pageRange: '2-3' });
    });

    it('only marks a job paid when Paystack charged the full price', async () => {
      const { token } = await newCustomer(api);
      const up = await api.call('POST', '/customer/print-jobs', { token, form: pdfForm(await pdfBytes(2), 'x.pdf', { printConfiguration: DEFAULT_CONFIG }) });
      const job = up.body.data.job;
      const under = paystackEvent(job.id, `ref_under_${job.id}`, 100);
      await api.call('POST', '/webhooks/paystack', { raw: under.raw, headers: under.headers });
      const listed = async () => (await api.call('GET', '/customer/print-jobs', { token })).body.data.jobs.find((j: any) => j.id === job.id);
      expect((await listed()).status).toBe('pending');
      expect((await api.call('POST', '/webhooks/paystack', { raw: under.raw, headers: { 'x-paystack-signature': 'bad' } })).status).toBe(401);
      const full = paystackEvent(job.id, `ref_full_${job.id}`, Math.round(job.cost * 100));
      await api.call('POST', '/webhooks/paystack', { raw: full.raw, headers: full.headers });
      expect((await listed()).status).toBe('ready');
      const second = await api.call('POST', '/customer/print-jobs', { token, form: pdfForm(await pdfBytes(1), 'y.pdf', { printConfiguration: DEFAULT_CONFIG }) });
      const reuse = paystackEvent(second.body.data.job.id, `ref_full_${job.id}`, 1_000_000);
      await api.call('POST', '/webhooks/paystack', { raw: reuse.raw, headers: reuse.headers });
      const again = (await api.call('GET', '/customer/print-jobs', { token })).body.data.jobs.find((j: any) => j.id === second.body.data.job.id);
      expect(again.status).toBe('pending');
    });

    it("lists only the current shop's stations", async () => {
      const { token } = await newCustomer(api);
      const stations = (await api.call('GET', '/customer/stations', { token })).body.data.stations;
      expect(stations.length).toBeGreaterThan(0);
      for (const s of stations) expect(['online', 'maintenance', 'offline']).toContain(s.status);
    });

    it('lets a customer send their own paid job to a kiosk at that shop', async () => {
      const { token } = await newCustomer(api);
      const job = await paidJob(api, token);
      const kiosks = (await api.call('GET', `/customer/print-jobs/${job.id}/kiosks`, { token })).body.data.kiosks;
      expect(kiosks.length).toBeGreaterThan(0);
      expect((await api.call('POST', `/customer/print-jobs/${job.id}/release`, { token, body: { kioskId: '00000000-0000-4000-8000-000000000000' } })).status).toBe(400);
      const r = await api.call('POST', `/customer/print-jobs/${job.id}/release`, { token, body: { kioskId: kiosks[0].id } });
      expect(r.body.data.status).toBe('releasing');
      expect((await api.call('POST', `/customer/print-jobs/${job.id}/release`, { token, body: { kioskId: kiosks[0].id } })).status).toBe(409);
      const other = await newCustomer(api);
      expect((await api.call('POST', `/customer/print-jobs/${job.id}/release`, { token: other.token, body: { kioskId: kiosks[0].id } })).status).toBe(404);
    });
  });

  describe('preflight', () => {
    it('analyses a PDF before upload', async () => {
      const r = await api.call('POST', '/preflight/analyze', {
        form: pdfForm(await pdfBytes(2, ['Chapter one', 'Some body text for the preflight check.']), 'thesis.pdf', {
          printConfiguration: DEFAULT_CONFIG,
        }),
      });
      expect(r.status).toBe(200);
      expect(r.body.data.metadata?.pageCount ?? r.body.data.pageCount).toBe(2);
    });
  });

  describe('uploads and files', () => {
    it('issues purpose-bound upload tickets', async () => {
      const { token } = await newCustomer(api);
      const ticket = (await api.call('POST', '/uploads/ticket', { token, body: { purpose: 'review-photo' } })).body.data.ticket;
      expect((await api.call('GET', '/customer/print-jobs', { token: ticket })).status).toBe(401);
      const photo = new FormData();
      photo.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'p.png');
      const up = await api.call('POST', '/uploads/review-photo', { form: photo, headers: { 'X-Upload-Ticket': ticket } });
      expect(up.status).toBe(201);
      const wrong = new FormData();
      wrong.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'p.png');
      expect((await api.call('POST', '/uploads/edited-document', { form: wrong, headers: { 'X-Upload-Ticket': ticket } })).status).toBe(401);
      const docTicket = (await api.call('POST', '/uploads/ticket', { token, body: { purpose: 'print-document' } })).body.data.ticket;
      const job = await api.call('POST', '/customer/print-jobs', {
        form: pdfForm(await pdfBytes(1), 'z.pdf', { printConfiguration: DEFAULT_CONFIG }),
        headers: { 'X-Upload-Ticket': docTicket },
      });
      expect(job.status).toBe(201);
    });

    it('serves stored files only by their key', async () => {
      const { token } = await newCustomer(api);
      const ticket = (await api.call('POST', '/uploads/ticket', { token, body: { purpose: 'review-photo' } })).body.data.ticket;
      const photo = new FormData();
      photo.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'p.png');
      const url = (await api.call('POST', '/uploads/review-photo', { form: photo, headers: { 'X-Upload-Ticket': ticket } })).body.data.fileURL;
      const ok = await api.call('GET', url);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('cache-control')).toMatch(/no-store/);
      expect((await api.call('GET', '/files/not-a-key')).status).toBe(404);
      expect((await api.call('GET', '/files/..%2F..%2Fpackage.json')).status).toBe(404);
      expect((await api.call('GET', '/files/..%252F..%252Fpackage.json')).status).toBe(404);
    });
  });

  describe('group printing', () => {
    it('requires the real document and counts its pages', async () => {
      const { token } = await newCustomer(api);
      const session = await api.call('POST', '/groups', { token, body: { groupName: 'Study group', deadline: new Date(Date.now() + 2 * 864e5).toISOString() } });
      const shareId = session.body.data.shareId;
      const join = await api.call('POST', `/groups/${shareId}/join`, { body: { name: 'Pat', email: `pat+${Date.now()}@example.com` } });
      const uploadToken = join.body.data.uploadToken;
      const urlOnly = await api.call('POST', '/participant-upload/upload', {
        headers: { 'X-Upload-Token': uploadToken },
        body: { fileURL: 'file:///etc/hosts', fileName: 'x.pdf', pageCount: 1 },
      });
      expect(urlOnly.status).toBe(400);
      const real = await api.call('POST', '/participant-upload/upload', {
        headers: { 'X-Upload-Token': uploadToken },
        form: pdfForm(await pdfBytes(4), 'group.pdf', { fileName: 'group.pdf', pageCount: '1', printConfiguration: '{"copies":1}' }),
      });
      expect(real.status).toBe(200);
      expect(real.body.data.printJob.totalPages).toBe(4);
    });

    it('takes payment from participants and releases only paid documents to the kiosk', async () => {
      const host = await newCustomer(api, 'host');
      const created = await api.call('POST', '/groups', {
        token: host.token,
        body: { groupName: 'Thesis binding', deadline: new Date(Date.now() + 864e5).toISOString() },
      });
      const { session: { id: sessionId }, shareId } = created.body.data;
      const joinAs = async (name: string, email?: string) =>
        (await api.call('POST', `/groups/${shareId}/join`, { body: { name, ...(email ? { email } : { phoneNumber: '+2348031112222' }) } })).body.data.uploadToken as string;
      const payer = await joinAs('Ada', `ada+${Date.now()}@example.com`);
      const guest = await joinAs('Bayo');
      for (const t of [payer, guest]) {
        const up = await api.call('POST', '/participant-upload/upload', {
          headers: { 'X-Upload-Token': t },
          form: pdfForm(await pdfBytes(2), 'chapter.pdf', { fileName: 'chapter.pdf', printConfiguration: '{"copies":1}' }),
        });
        expect(up.status).toBe(200);
      }
      const hostView = await api.call('GET', `/groups/${sessionId}`, { token: host.token });
      expect(hostView.body.data.participants).toHaveLength(2);
      expect(hostView.text).not.toContain(payer);
      expect((await api.call('GET', `/groups/share/${shareId}`)).body.data.session.groupName).toBe('Thesis binding');
      expect((await api.call('GET', `/groups/${sessionId}`, { token: (await newCustomer(api)).token })).status).toBe(404);
      const before = (await api.call('GET', '/participant-upload/status', { headers: { 'X-Upload-Token': payer } })).body.data;
      expect([before.participant.status, before.printJob.status]).toEqual(['UPLOADED', 'pending']);
      const noEmail = await api.call('POST', '/participant-upload/pay', { headers: { 'X-Upload-Token': guest }, body: {} });
      expect([noEmail.status, noEmail.body.code]).toEqual([400, 'EMAIL_REQUIRED']);
      expect((await api.call('POST', '/participant-upload/pay', { headers: { 'X-Upload-Token': payer }, body: {} })).status).toBe(200);

      const paid = paystackEvent(before.printJob.id, `ref_grp_${before.printJob.id}`, Math.round(before.printJob.cost * 100));
      await api.call('POST', '/webhooks/paystack', { raw: paid.raw, headers: paid.headers });
      const after = (await api.call('GET', '/participant-upload/status', { headers: { 'X-Upload-Token': payer } })).body.data;
      expect(after.participant.status).toBe('PAID');
      expect((await api.call('POST', '/participant-upload/pay', { headers: { 'X-Upload-Token': payer }, body: {} })).body.code).toBe('ALREADY_PAID');

      const closed = await api.call('POST', `/groups/${sessionId}/close`, { token: host.token });
      const batchCode = closed.body.data.batchCode;
      expect(batchCode).toBeTruthy();
      const { AppDataSource } = await import('@/config/data-source');
      const { Kiosk } = await import('@/database/entities/kiosk.entity');
      const kiosk = (await AppDataSource.getRepository(Kiosk).find({ order: { name: 'ASC' } }))[0]!;
      const release = await api.call('POST', '/printer/complete-batch', { body: { code: batchCode }, headers: { 'X-Kiosk-Key': kiosk.apiKey } });
      expect(release.body.data).toMatchObject({ mode: 'kiosk-pull', released: 1, total: 1 });
    });
  });
});
