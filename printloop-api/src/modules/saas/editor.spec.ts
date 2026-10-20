import { io, type Socket } from 'socket.io-client';
import { startTestApi, newCustomer, pdfBytes, pdfForm, DEFAULT_CONFIG, type TestApi } from '@/test/harness';

jest.setTimeout(120_000);

const LINES = ['Dear Committee,', 'Thank you for considering my thesis on solar microgrids.', 'Yours faithfully.'];

function connect(api: TestApi, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(api.base, { path: '/editor-socket', transports: ['websocket'], auth: { token }, reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

function nextEvent<T = any>(socket: Socket, event: string, ms = 1500): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('live editor', () => {
  let api: TestApi;
  let ops: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    api = await startTestApi();
    ops = await api.login('ops@printloop.test', 'Admin1234!');
    await api.call('POST', '/saas/edit-pricing', { token: ops, body: { editingEnabled: true, baseFee: 500, perPageFee: 100 } });
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await api.close();
  });

  it('imports the document, syncs live, saves, exports and hands over for approval', async () => {
    const { token: customer } = await newCustomer(api, 'live');
    const upload = await api.call('POST', '/customer/print-jobs', {
      token: customer,
      form: pdfForm(await pdfBytes(1, LINES), 'letter.pdf', {
        printConfiguration: DEFAULT_CONFIG,
        editingRequired: 'true',
        editingInstructions: 'Change microgrids to mini-grids',
      }),
    });
    const jobId = upload.body.data.job.id;
    const queue = await api.call('GET', '/saas/edit-queue', { token: ops });
    const editId = queue.body.data.items.find((i: any) => i.printJobId === jobId).id;

    const opened = await api.call('POST', '/saas/editor/session', { token: ops, body: { editId } });
    expect(opened.status).toBe(201);
    const { sessionId, token: shopToken } = opened.body.data;
    expect((await api.call('POST', '/saas/editor/session', { token: ops, body: { editId } })).body.data.sessionId).toBe(sessionId);

    let shopView: any;
    for (let i = 0; i < 40; i++) {
      shopView = (await api.call('GET', `/saas/editor/session/${sessionId}`, { token: ops })).body.data;
      if (shopView.conversionStatus === 'completed' || shopView.conversionStatus === 'failed') break;
      await new Promise((r) => setTimeout(r, 150));
    }
    expect([shopView.conversionStatus, shopView.conversionError]).toEqual(["completed", null]);
    expect(shopView.role).toBe('shop');
    expect(shopView.document.body.dataStream).toContain('solar microgrids');
    expect(shopView.version).toBe(1);

    const stranger = await newCustomer(api, 'peek');
    expect((await api.call('GET', `/saas/editor/session/${sessionId}`, { token: stranger.token })).status).toBe(404);
    const customerView = (await api.call('GET', `/saas/editor/session/${sessionId}`, { token: customer })).body.data;
    expect([customerView.role, customerView.readOnly]).toEqual(['customer', true]);

    await expect(connect(api, 'not-a-token')).rejects.toBeTruthy();
    const shopSocket = await connect(api, shopToken);
    const customerSocket = await connect(api, customerView.token);
    sockets.push(shopSocket, customerSocket);

    const received = nextEvent(customerSocket, 'snapshot');
    shopSocket.emit('snapshot', { sessionId: 'someone-else', snapshot: { hello: 1 }, version: 2 });
    expect(await received).toMatchObject({ snapshot: { hello: 1 }, version: 2, fromRole: 'shop' });
    const ignored = nextEvent(shopSocket, 'snapshot', 600);
    customerSocket.emit('snapshot', { snapshot: { evil: 1 }, version: 99 });
    expect(await ignored).toBeNull();

    const edited = JSON.parse(JSON.stringify(shopView.document));
    edited.body.dataStream = edited.body.dataStream.replace('microgrids', 'mini-grids');
    const saved = await api.call('POST', `/saas/editor/session/${sessionId}/snapshot`, { token: ops, body: { document: edited, version: 1 } });
    expect(saved.body.data.version).toBe(2);
    const stale = await api.call('POST', `/saas/editor/session/${sessionId}/snapshot`, { token: ops, body: { document: edited, version: 1 } });
    expect([stale.status, stale.body.code]).toEqual([409, 'VERSION_CONFLICT']);
    expect((await api.call('POST', `/saas/editor/session/${sessionId}/snapshot`, { token: customer, body: { document: edited } })).status).toBe(404);
    expect((await api.call('POST', `/saas/editor/session/${sessionId}/snapshot`, { token: ops, body: { document: { nope: true } } })).status).toBe(400);

    const exported = await api.call('POST', `/saas/editor/session/${sessionId}/export`, { token: ops, body: {} });
    expect(exported.status).toBe(200);
    expect(exported.body.data.renderer).toBe('builtin');
    expect(exported.body.data.pageCount).toBeGreaterThanOrEqual(1);
    const pdf = await api.call('GET', exported.body.data.documentUrl, { token: customer });
    expect(pdf.text.startsWith('%PDF-')).toBe(true);

    const mine = (await api.call('GET', '/customer/print-jobs', { token: customer })).body.data.jobs.find((j: any) => j.id === jobId);
    expect(mine.status).toBe('edit_complete');
    const byJob = (await api.call('GET', `/saas/editor/by-job/${jobId}`, { token: customer })).body.data;
    expect(byJob.session.readOnly).toBe(true);
    expect(byJob.session.token).toBeNull();

    const approved = await api.call('POST', `/saas/editor/session/${sessionId}/approve`, { token: customer });
    expect(approved.status).toBe(200);
    expect(approved.body.data.amountDue).toBeGreaterThan(500);
  });
});
