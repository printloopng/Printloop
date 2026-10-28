process.env.GEOCODER = 'fixture';

import { startTestApi, pdfBytes, pdfForm, paystackEvent, DEFAULT_CONFIG, type TestApi } from '@/test/harness';
import { EmailService } from '@/core/services/email.service';

jest.setTimeout(180_000);

describe('journey: shop onboarding, student order, kiosk print', () => {
  let api: TestApi;
  const sentCodes: Record<string, string> = {};
  const sentTokens: Record<string, string> = {};
  const stamp = Date.now() % 1_000_000;
  const shopSlug = `journey-${stamp}`;
  const ownerEmail = `owner.${stamp}@example.com`;
  const studentEmail = `student.${stamp}@example.com`;
  const ownerPassword = 'Str0ng!Passw0rd';

  let owner = '';
  let student = '';
  let shopId = '';
  let kioskA = { id: '', key: '' };
  let kioskB = { id: '', key: '' };
  let jobId = '';

  const kiosk = (key: string) => ({ 'X-Kiosk-Key': key });
  const poll = (key: string, body: object = { inFlight: [], max: 1 }) => api.call('POST', '/agent/poll', { body, headers: kiosk(key) });
  const asStudent = { 'X-Tenant-Slug': shopSlug };

  beforeAll(async () => {
    jest.spyOn(EmailService.prototype, 'send').mockImplementation(async (opts: any) => {
      const code = /\b(\d{6})\b/.exec(String(opts.text ?? ''))?.[1];
      if (code) sentCodes[String(opts.to).toLowerCase()] = code;
      return undefined as any;
    });
    jest.spyOn(EmailService.prototype, 'sendTenantOwnerVerification').mockImplementation(async (opts: any) => {
      sentTokens[String(opts.to).toLowerCase()] = String(opts.token);
      return undefined as any;
    });
    api = await startTestApi();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await api.close();
  });

  describe('1. a student registers and verifies their email', () => {
    it('creates the account with no shop, then confirms it with the emailed code', async () => {
      const reg = await api.call('POST', '/customer/auth/register', {
        body: { email: studentEmail, password: 'Str0ng!Passw0rd', firstName: 'Ada', lastName: 'Student', phoneNumber: '+2348031112222' },
      });
      expect(reg.status).toBe(201);
      expect(reg.body.data.user.isEmailVerified).toBe(false);
      expect(reg.body.data.user.tenantId).toBeNull();
      expect(sentCodes[studentEmail]).toMatch(/^\d{6}$/);

      expect((await api.call('POST', '/customer/auth/verify-email', { body: { email: studentEmail, code: '000000' } })).status).toBe(400);
      const ok = await api.call('POST', '/customer/auth/verify-email', { body: { email: studentEmail, code: sentCodes[studentEmail] } });
      expect(ok.status).toBe(200);
      expect(ok.body.data.user.isEmailVerified).toBe(true);

      student = await api.login(studentEmail, 'Str0ng!Passw0rd');
      expect((await api.call('GET', '/customer/auth/me', { token: student })).body.data.email).toBe(studentEmail);
    });

    it('has no shop yet, and is told to choose one rather than being put in a default', async () => {
      const upload = await api.call('POST', '/customer/print-jobs', { token: student, form: pdfForm(await pdfBytes(1), 'a.pdf', { printConfiguration: DEFAULT_CONFIG }) });
      expect([upload.status, upload.body.code]).toEqual([400, 'TENANT_REQUIRED']);
    });
  });

  describe('2. a shop owner signs up and verifies their email', () => {
    it('creates the shop in trial with the owner as its only team member', async () => {
      const signup = await api.call('POST', '/saas/signup', {
        body: { businessName: 'Journey Print', slug: shopSlug, ownerFirstName: 'Ola', ownerLastName: 'Owner', ownerEmail, ownerPhone: '+2348033334444', ownerPassword, address: 'Yaba, Lagos' },
      });
      expect(signup.status).toBe(201);
      shopId = signup.body.data.tenantId;
      await new Promise((r) => setTimeout(r, 200));
      expect(sentTokens[ownerEmail]).toBeTruthy();

      expect((await api.call('POST', '/saas/verify-email', { body: { email: ownerEmail, token: 'wrong' } })).body.data?.verified).toBeFalsy();
      const verified = await api.call('POST', '/saas/verify-email', { body: { email: ownerEmail, token: sentTokens[ownerEmail] } });
      expect(verified.body.data.verified).toBe(true);

      owner = await api.login(ownerEmail, ownerPassword);
      const me = (await api.call('GET', '/saas/me', { token: owner })).body.data;
      expect([me.slug, me.status, me.myRole]).toEqual([shopSlug, 'trial', 'owner']);
      expect(me.onboarding.locationSet).toBe(true);
      expect(me.onboarding.bankAccountSet).toBe(false);
    });

    it('starts with a price list and one kiosk, and the owner cannot go public yet', async () => {
      expect((await api.call('GET', '/saas/pricing', { token: owner })).body.data.configs.length).toBeGreaterThan(0);
      const kiosks = (await api.call('GET', '/saas/kiosks', { token: owner })).body.data.kiosks;
      expect(kiosks).toHaveLength(1);
      const blocked = await api.call('PATCH', '/saas/me/location', { token: owner, body: { isDiscoverable: true } });
      expect([blocked.status, blocked.body.code, blocked.body.reason]).toEqual([400, 'LIVE_GATE_NOT_MET', 'TENANT_NOT_ACTIVE']);
    });
  });

  describe('3. the owner onboards two kiosks', () => {
    it('gets a key for each kiosk and the kiosks can connect with it', async () => {
      const list = (await api.call('GET', '/saas/kiosks', { token: owner })).body.data.kiosks;
      kioskA.id = list[0].id;
      kioskA.key = (await api.call('POST', `/saas/kiosks/${kioskA.id}/regenerate-key`, { token: owner })).body.data.apiKey;
      const second = await api.call('POST', '/saas/kiosks', { token: owner, body: { name: 'Library counter', location: 'Main library' } });
      expect(second.status).toBe(201);
      kioskB = { id: second.body.data.kiosk.id, key: second.body.data.kiosk.apiKey };
      expect(kioskA.key).toMatch(/^KSK_/);
      expect(kioskB.key).toMatch(/^KSK_/);

      expect((await poll('not-a-real-key')).status).toBe(401);
      for (const k of [kioskA, kioskB]) {
        const first = await poll(k.key);
        expect(first.status).toBe(200);
        expect(first.body.data.jobs).toEqual([]);
        expect(first.body.data.nextPollMs).toBe(10_000);
      }
    });

    it('records what each kiosk says its printer can do', async () => {
      const a = await api.call('POST', '/agent/printer/capabilities', { body: { color: true, duplex: true, a3: false, media: ['iso_a4_210x297mm'] }, headers: kiosk(kioskA.key) });
      const b = await api.call('POST', '/agent/printer/capabilities', { body: { color: false, duplex: false, a3: true }, headers: kiosk(kioskB.key) });
      expect([a.status, b.status]).toEqual([200, 200]);
      const list = (await api.call('GET', '/saas/kiosks', { token: owner })).body.data.kiosks;
      expect(list.find((k: any) => k.id === kioskA.id).capA3).toBe(false);
      expect(list.find((k: any) => k.id === kioskB.id).capA3).toBe(true);
      expect(list.every((k: any) => k.online)).toBe(true);
    });
  });

  describe('4. the shop goes live', () => {
    it('needs a PrintLoop operator to activate it, then a confirmed test print, then it is listed', async () => {
      const staff = await api.login('admin@printloop.test', 'Admin1234!');
      const activated = await api.call('POST', `/platform/tenants/${shopId}/reactivate`, { token: staff });
      expect(activated.body.data.status).toBe('active');

      const noTest = await api.call('PATCH', '/saas/me/location', { token: owner, body: { isDiscoverable: true } });
      expect(noTest.body.reason).toBe('TEST_PRINT_MISSING');
      expect((await api.call('POST', `/saas/kiosks/${kioskA.id}/test-print-pass`, { token: owner })).status).toBe(200);

      const live = await api.call('PATCH', '/saas/me/location', { token: owner, body: { isDiscoverable: true } });
      expect(live.status).toBe(200);
      expect(live.body.data.isDiscoverable).toBe(true);
    });
  });

  describe('5. the student finds the shop and its kiosks', () => {
    it('sees the shop on the map, with prices, and picks it', async () => {
      const nearby = (await api.call('GET', '/discovery/shops/nearby?lat=6.5095&lng=3.3711&radiusKm=10')).body.data.shops;
      const found = nearby.find((s: any) => s.slug === shopSlug);
      expect(found).toBeTruthy();
      expect([found.agentOnline, found.availability]).toEqual([true, 'open']);
      const detail = (await api.call('GET', `/discovery/shops/${shopSlug}`)).body.data;
      expect(detail.pricing.length).toBeGreaterThan(0);

      const prices = (await api.call('GET', '/customer/pricing', { token: student, headers: asStudent })).body.data;
      expect(prices.tenantSlug).toBe(shopSlug);
    });

    it('lists that shop\'s kiosks and no one else\'s', async () => {
      const stations = (await api.call('GET', '/customer/stations', { token: student, headers: asStudent })).body.data.stations;
      expect(stations.map((s: any) => s.name).sort()).toEqual(['Library counter', 'Main Kiosk']);
    });
  });

  describe('6. the student places an order and pays', () => {
    it('uploads a document, is quoted the shop\'s price, and pays', async () => {
      const upload = await api.call('POST', '/customer/print-jobs', {
        token: student,
        headers: asStudent,
        form: pdfForm(await pdfBytes(3), 'assignment.pdf', { printConfiguration: DEFAULT_CONFIG }),
      });
      expect(upload.status).toBe(201);
      const job = upload.body.data.job;
      jobId = job.id;
      expect([job.status, job.totalPages ?? job.pageCount]).toEqual(['pending', 3]);

      const event = paystackEvent(jobId, `ref_${jobId}`, Math.round(Number(job.cost) * 100));
      await api.call('POST', '/webhooks/paystack', { raw: event.raw, headers: event.headers });
      const mine = (await api.call('GET', '/customer/print-jobs', { token: student })).body.data.jobs.find((j: any) => j.id === jobId);
      expect(['awaiting_accept', 'ready']).toContain(mine.status);
      expect(mine.code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('waits for the shop to accept an order that came through the marketplace', async () => {
      const before = (await api.call('GET', '/customer/print-jobs', { token: student })).body.data.jobs.find((j: any) => j.id === jobId);
      if (before.status === 'awaiting_accept') {
        expect((await api.call('POST', `/saas/jobs/${jobId}/release`, { token: owner })).status).toBe(409);
        expect((await api.call('POST', `/saas/jobs/${jobId}/accept`, { token: owner })).status).toBe(200);
      }
      const after = (await api.call('GET', '/customer/print-jobs', { token: student })).body.data.jobs.find((j: any) => j.id === jobId);
      expect(after.status).toBe('ready');
    });
  });

  describe('7. the student sends the job to one particular kiosk', () => {
    it('chooses the Library counter, and cannot choose a kiosk of another shop', async () => {
      const options = (await api.call('GET', `/customer/print-jobs/${jobId}/kiosks`, { token: student })).body.data.kiosks;
      expect(options.map((k: any) => k.name).sort()).toEqual(['Library counter', 'Main Kiosk']);
      expect(options.every((k: any) => k.online)).toBe(true);

      const { AppDataSource } = await import('@/config/data-source');
      const { Kiosk } = await import('@/database/entities/kiosk.entity');
      const other = (await AppDataSource.getRepository(Kiosk).find()).find((k) => k.tenantId !== shopId);
      expect(other).toBeTruthy();
      const wrong = await api.call('POST', `/customer/print-jobs/${jobId}/release`, { token: student, body: { kioskId: other!.id } });
      expect([wrong.status, wrong.body.code]).toEqual([400, 'KIOSK_NOT_AT_SHOP']);

      const sent = await api.call('POST', `/customer/print-jobs/${jobId}/release`, { token: student, body: { kioskId: kioskB.id } });
      expect(sent.status).toBe(200);
      expect(sent.body.data).toMatchObject({ status: 'releasing', kioskName: 'Library counter' });
    });
  });

  describe('8. the kiosk pulls the job and prints it', () => {
    it('hands the job only to the chosen kiosk', async () => {
      const other = await poll(kioskA.key);
      expect(other.body.data.jobs).toEqual([]);
      const claim = await poll(kioskB.key);
      expect(claim.body.data.jobs).toHaveLength(1);
      const item = claim.body.data.jobs[0];
      expect(item.id).toBe(jobId);
      expect(item.items[0]).toMatchObject({ fileName: 'assignment.pdf', totalPages: 3 });
      expect(item.items[0].printConfiguration).toMatchObject({ paper: 'A4', color: 'bw', sided: 'single' });

      const file = await api.call('GET', new URL(item.items[0].downloadUrl).pathname.replace(/^\/api/, '') + new URL(item.items[0].downloadUrl).search);
      expect(file.status).toBe(200);
      expect(file.text.startsWith('%PDF-')).toBe(true);

      expect((await poll(kioskB.key, { inFlight: [jobId], max: 0 })).body.data.jobs).toEqual([]);
    });

    it('reports progress and completion, and everyone sees it as done', async () => {
      expect((await api.call('POST', `/agent/jobs/${jobId}/progress`, { body: { pagesCompleted: 2 }, headers: kiosk(kioskB.key) })).status).toBe(200);
      expect((await api.call('POST', `/agent/jobs/${jobId}/progress`, { body: { pagesCompleted: 2 }, headers: kiosk(kioskA.key) })).status).toBeGreaterThanOrEqual(400);
      const done = await api.call('POST', `/agent/jobs/${jobId}/complete`, { body: { confirmation: 'unconfirmed', method: 'none', detail: '1 file(s) accepted by printer' }, headers: kiosk(kioskB.key) });
      expect(done.status).toBe(200);

      const mine = (await api.call('GET', '/customer/print-jobs', { token: student })).body.data.jobs.find((j: any) => j.id === jobId);
      expect(mine.status).toBe('done');
      const queue = (await api.call('GET', '/saas/jobs?status=done', { token: owner })).body.data.jobs;
      expect(queue.some((j: any) => j.id === jobId)).toBe(true);
      expect((await poll(kioskB.key)).body.data.jobs).toEqual([]);
    });
  });
});
