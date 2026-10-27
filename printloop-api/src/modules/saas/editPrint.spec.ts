import { startTestApi, newCustomer, pdfBytes, pdfForm, paystackEvent, DEFAULT_CONFIG, DEMO_SHOP, type TestApi } from '@/test/harness';

jest.setTimeout(120_000);

describe('Edit & Print', () => {
  let api: TestApi;
  let ops: string;

  beforeAll(async () => {
    api = await startTestApi();
    ops = await api.login('ops@printloop.test', 'Admin1234!');
  });

  afterAll(() => api.close());

  const requestEdit = async (token: string) =>
    api.call('POST', '/customer/print-jobs', {
      token,
      form: pdfForm(await pdfBytes(3), 'thesis.pdf', {
        printConfiguration: DEFAULT_CONFIG,
        editingRequired: 'true',
        editingInstructions: 'Fix the title page',
      }),
    });

  const uploadEdited = async (jobId: string, pages: number) => {
    const ticket = (await api.call('POST', '/uploads/ticket', { token: ops, body: { purpose: 'edited-document' } })).body.data.ticket;
    const up = await api.call('POST', '/uploads/edited-document', { form: pdfForm(await pdfBytes(pages), 'edited.pdf'), headers: { 'X-Upload-Ticket': ticket } });
    return api.call('POST', `/saas/edit/${jobId}/upload`, { token: ops, body: { documentUrl: up.body.data.fileURL } });
  };

  it('refuses edit requests when the shop does not offer editing', async () => {
    await api.call('POST', '/saas/edit-pricing', { token: ops, body: { editingEnabled: false } });
    const { token } = await newCustomer(api, 'edit');
    const r = await requestEdit(token);
    expect([r.status, r.body.code]).toEqual([409, 'EDITING_NOT_OFFERED']);
  });

  it('runs request → edit → revise → approve → pay → print the edited file', async () => {
    expect((await api.call('POST', '/saas/edit-pricing', { token: ops, body: { editingEnabled: true, baseFee: 500, perPageFee: 100 } })).status).toBe(200);
    const { token } = await newCustomer(api, 'edit');
    const job = (await requestEdit(token)).body.data.job;
    expect(job.status).toBe('awaiting_edit');

    const queue = await api.call('GET', '/saas/edit-queue', { token: ops });
    expect(queue.body.data.items.some((i: any) => i.printJobId === job.id)).toBe(true);
    expect(queue.body.data.items.find((i: any) => i.printJobId === job.id).printJob.originalDocumentUrl).toContain('/api/files/');
    const detail = await api.call('GET', `/saas/edit/${job.id}`, { token: ops });
    expect(detail.body.data.printJob.documentUrl).toBeTruthy();
    const nosy = await newCustomer(api, 'nosy');
    expect((await api.call('GET', `/saas/edit/${job.id}`, { token: nosy.token, headers: { 'X-Tenant-Slug': DEMO_SHOP } })).status).toBe(403);
    expect((await api.call('GET', `/saas/edit/${job.id}`, { token })).status).toBe(200);
    expect((await api.call('POST', `/saas/edit/${job.id}/start`, { token: ops })).body.data.status).toBe('in_progress');
    expect((await api.call('POST', `/saas/edit/${job.id}/upload`, { token: ops, body: { documentUrl: 'https://example.com/x.pdf' } })).status).toBe(400);
    expect((await uploadEdited(job.id, 4)).body.data.pageCount).toBe(4);

    expect((await api.call('POST', `/saas/edit/${job.id}/reject`, { token, body: { reason: 'Wrong font' } })).body.data.status).toBe('rejected');
    expect((await api.call('POST', `/saas/edit/${job.id}/start`, { token: ops })).status).toBe(200);
    expect((await uploadEdited(job.id, 5)).body.data.pageCount).toBe(5);

    const stranger = await newCustomer(api, 'stranger');
    expect([403, 404]).toContain((await api.call('POST', `/saas/edit/${job.id}/confirm`, { token: stranger.token })).status);
    const approved = await api.call('POST', `/saas/edit/${job.id}/confirm`, { token });
    expect(approved.body.data.printJobStatus).toBe('pending');
    const due = approved.body.data.amountDue;
    expect(due).toBeGreaterThan(1000);

    const partial = paystackEvent(job.id, `ref_part_${job.id}`, Math.round((due - 500) * 100));
    await api.call('POST', '/webhooks/paystack', { raw: partial.raw, headers: partial.headers });
    const mine = async () => (await api.call('GET', '/customer/print-jobs', { token })).body.data.jobs.find((j: any) => j.id === job.id);
    expect((await mine()).status).toBe('pending');
    const full = paystackEvent(job.id, `ref_full_${job.id}`, Math.round(due * 100));
    await api.call('POST', '/webhooks/paystack', { raw: full.raw, headers: full.headers });
    const paid = await mine();
    expect([paid.status, paid.pageCount, Boolean(paid.code)]).toEqual(['ready', 5, true]);
    expect((await api.call('POST', `/saas/jobs/${job.id}/release`, { token: ops })).status).toBe(200);
    expect((await api.call('POST', `/saas/edit/${job.id}/confirm-payment`, { token: ops })).status).toBe(410);
  });
});
