import { startTestApi, type TestApi } from '@/test/harness';
import { EmailService } from '@/core/services/email.service';

jest.setTimeout(120_000);

describe('team invites and the shop logo', () => {
  let api: TestApi;
  let owner = '';
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  let emailWorks = true;
  const email = `newhire.${Date.now() % 1_000_000}@example.com`;

  beforeAll(async () => {
    jest.spyOn(EmailService.prototype, 'send').mockImplementation(async (opts: any) => {
      sent.push({ to: String(opts.to).toLowerCase(), subject: String(opts.subject), text: String(opts.text ?? '') });
      return emailWorks;
    });
    api = await startTestApi();
    owner = await api.login('owner@printloop.ng', 'Password1!');
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await api.close();
  });

  const tokenFrom = (text: string) => {
    const link = /(https?:\/\/\S+reset-password\S+)/.exec(text)![1];
    const url = new URL(link);
    return { token: url.searchParams.get('token')!, email: url.searchParams.get('email')! };
  };

  it('emails a new team member a link to confirm their address and set a password', async () => {
    const res = await api.call('POST', '/saas/team', { token: owner, body: { email, role: 'staff', firstName: 'Ngozi', lastName: 'Hire' } });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ invited: true, emailSent: true });
    const mail = sent.find((m) => m.to === email)!;
    expect(mail.subject).toContain('added to');
    expect(mail.text).toContain('Confirm your email and set your password');
  });

  it('lists them as pending until they accept', async () => {
    const team = (await api.call('GET', '/saas/team', { token: owner })).body.data.members;
    expect(team.find((m: any) => m.email === email).pending).toBe(true);
    expect(team.find((m: any) => m.email === 'owner@printloop.ng').pending).toBe(false);
  });

  it('lets them sign in after setting a password, which also confirms their email', async () => {
    const { token } = tokenFrom(sent.find((m) => m.to === email)!.text);
    expect((await api.call('POST', '/customer/auth/login', { body: { email, password: 'Team!Passw0rd1' } })).status).not.toBe(200);
    const reset = await api.call('POST', '/auth/reset-password', { body: { email, token, password: 'Team!Passw0rd1' } });
    expect(reset.status).toBe(200);
    const token2 = await api.login(email, 'Team!Passw0rd1');
    const me = await api.call('GET', '/saas/me', { token: token2 });
    expect(me.status).toBe(200);
    const team = (await api.call('GET', '/saas/team', { token: owner })).body.data.members;
    expect(team.find((m: any) => m.email === email).pending).toBe(false);
  });

  it('says so when the invite email could not be sent, and lets the owner resend it', async () => {
    emailWorks = false;
    const second = `second.${Date.now() % 1_000_000}@example.com`;
    const res = await api.call('POST', '/saas/team', { token: owner, body: { email: second, role: 'staff' } });
    expect(res.status).toBe(201);
    expect(res.body.data.emailSent).toBe(false);

    emailWorks = true;
    const userId = res.body.data.userId;
    const again = await api.call('POST', `/saas/team/${userId}/resend-invite`, { token: owner });
    expect(again.status).toBe(200);
    expect(again.body.data.emailSent).toBe(true);
    const mails = sent.filter((m) => m.to === second);
    expect(mails.length).toBeGreaterThanOrEqual(2);

    const { token } = tokenFrom(mails[mails.length - 1].text);
    expect((await api.call('POST', '/auth/reset-password', { body: { email: second, token, password: 'Team!Passw0rd1' } })).status).toBe(200);
    expect((await api.call('POST', `/saas/team/${userId}/resend-invite`, { token: owner })).status).toBe(409);
  });

  it('uploads a logo straight from a file and shows it in the branding', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const ticket = (await api.call('POST', '/uploads/ticket', { token: owner, body: { purpose: 'branding-photo' } })).body.data.ticket;
    const form = new FormData();
    form.append('logo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'logo.png');
    const up = await api.call('POST', '/saas/me/logo', { form, headers: { 'X-Upload-Ticket': ticket } });
    expect(up.status).toBe(200);
    expect(up.body.data.logoUrl).toMatch(/^https?:\/\//);
    const branding = await api.call('GET', '/saas/me/branding', { token: owner });
    expect(branding.body.data.logoUrl).toBe(up.body.data.logoUrl);
    const file = await fetch(up.body.data.logoUrl);
    expect(file.status).toBe(200);
  });

  it('refuses a logo that is not an image', async () => {
    const ticket = (await api.call('POST', '/uploads/ticket', { token: owner, body: { purpose: 'branding-photo' } })).body.data.ticket;
    const form = new FormData();
    form.append('logo', new Blob(['not an image'], { type: 'text/plain' }), 'logo.txt');
    expect((await api.call('POST', '/saas/me/logo', { form, headers: { 'X-Upload-Ticket': ticket } })).status).toBe(400);
  });
});
