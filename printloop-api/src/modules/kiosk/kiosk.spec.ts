import { startTestApi, newCustomer, paidJob, type TestApi } from '@/test/harness';

jest.setTimeout(120_000);

describe('kiosk job queue', () => {
  let api: TestApi;
  let keyA: string;
  let keyB: string;
  let kioskA: string;
  let customer: string;
  let repo: any;

  beforeAll(async () => {
    api = await startTestApi();
    const { AppDataSource } = await import('@/config/data-source');
    const { Kiosk } = await import('@/database/entities/kiosk.entity');
    const { PrintJob } = await import('@/database/entities/printJob.entity');
    repo = AppDataSource.getRepository(PrintJob);
    const kiosks = await AppDataSource.getRepository(Kiosk).find({ order: { name: 'ASC' } });
    [kioskA, keyA, keyB] = [kiosks[0].id, kiosks[0].apiKey, kiosks[1].apiKey];
    customer = (await newCustomer(api, 'kiosk')).token;
  });

  afterAll(() => api.close());

  const poll = (key: string, body: object = {}) => api.call('POST', '/agent/poll', { body, headers: { 'X-Kiosk-Key': key } });
  const release = (key: string, code: string) => api.call('POST', '/printer/complete', { body: { code }, headers: { 'X-Kiosk-Key': key } });

  it('claims a released job once, for the releasing kiosk only', async () => {
    const job = await paidJob(api, customer);
    expect(job.code).toBeTruthy();
    const idle = await poll(keyA, { max: 1 });
    expect(idle.body.data.nextPollMs).toBe(10_000);
    expect((await release(keyA, job.code)).body.data.mode).toBe('kiosk-pull');
    expect((await poll(keyB, { max: 1 })).body.data.jobs).toHaveLength(0);
    const claim = await poll(keyA, { max: 1 });
    expect(claim.body.data.jobs[0].id).toBe(job.id);
    expect(claim.body.data.jobs[0].items[0].downloadUrl).toMatch(/\/api\/agent\/jobs\/.+\/file\?t=/);
    expect((await repo.findOne({ where: { id: job.id } })).status).toBe('printing');
    const again = await poll(keyA, { max: 1, inFlight: [job.id] });
    expect(again.body.data.jobs).toHaveLength(0);
    expect(again.body.data.revoked).toHaveLength(0);
  });

  it('records progress, completes idempotently and revokes settled jobs', async () => {
    const job = await paidJob(api, customer);
    await release(keyA, job.code);
    await poll(keyA, { max: 1 });
    const headers = { 'X-Kiosk-Key': keyA };
    expect((await api.call('POST', `/agent/jobs/${job.id}/progress`, { body: { pagesCompleted: 1 }, headers })).status).toBe(200);
    expect((await api.call('POST', `/agent/jobs/${job.id}/progress`, { body: { pagesCompleted: 2 }, headers: { 'X-Kiosk-Key': keyB } })).status).toBe(409);
    expect((await api.call('POST', `/agent/jobs/${job.id}/complete`, { body: {}, headers })).status).toBe(200);
    expect((await api.call('POST', `/agent/jobs/${job.id}/complete`, { body: {}, headers })).status).toBe(200);
    expect((await repo.findOne({ where: { id: job.id } })).status).toBe('done');
    expect((await poll(keyA, { inFlight: [job.id], max: 0 })).body.data.revoked).toContain(job.id);
  });

  it('requeues a claim the kiosk lost and lets another kiosk take a retryable failure', async () => {
    const job = await paidJob(api, customer);
    await release(keyA, job.code);
    await poll(keyA, { max: 1 });
    await repo.update({ id: job.id }, { updatedAt: new Date(Date.now() - 5 * 60_000) });
    const lost = await poll(keyA, { inFlight: [], max: 0 });
    expect(lost.body.data.counts.requeued).toBe(1);
    expect(lost.body.data.nextPollMs).toBe(2_000);
    expect((await poll(keyA, { max: 1 })).body.data.jobs[0]?.id).toBe(job.id);
    const fail = await api.call('POST', `/agent/jobs/${job.id}/failed`, { body: { reason: 'offline', retryable: true }, headers: { 'X-Kiosk-Key': keyA } });
    expect(fail.status).toBe(200);
    const row = await repo.findOne({ where: { id: job.id } });
    expect([row.status, row.kioskId]).toEqual(['releasing', null]);
    expect((await poll(keyB, { max: 1 })).body.data.jobs[0]?.id).toBe(job.id);
  });

  it('revokes a refunded job mid-print and rejects bad input', async () => {
    const job = await paidJob(api, customer);
    await release(keyA, job.code);
    await poll(keyA, { max: 1 });
    await repo.update({ id: job.id }, { status: 'refunded' });
    expect((await poll(keyA, { inFlight: [job.id], max: 0 })).body.data.revoked).toContain(job.id);
    expect((await poll(keyA, { max: 99 })).status).toBe(400);
    expect((await poll('not-a-key')).status).toBe(401);
  });

  it('refuses a kiosk file token used as a login token', async () => {
    const job = await paidJob(api, customer);
    await release(keyA, job.code);
    const url: string = (await poll(keyA, { max: 1 })).body.data.jobs[0].items[0].downloadUrl;
    const fileToken = new URL(url).searchParams.get('t');
    expect((await api.call('GET', '/customer/auth/me', { token: fileToken })).status).toBe(401);
    expect(kioskA).toBeTruthy();
  });
});
