const path = require('node:path');
const crypto = require('node:crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (e) {
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const B = 'http://localhost:4000/api';

let sqlite3;
try { sqlite3 = require('sqlite3'); } catch { sqlite3 = null; }
const DB_PATH = path.resolve(__dirname, '..', 'data', 'printloop.sqlite');

function sqlRun(sql, params) {
  return new Promise((resolve, reject) => {
    if (!sqlite3) return resolve(null);
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);
    db.run(sql, params, function (err) { db.close(); err ? reject(err) : resolve(this.changes); });
  });
}

async function topUpWallet(userId, naira) {
  await sqlRun(`UPDATE wallets SET balance = ? WHERE userId = ?`, [naira, userId]);
}

async function j(method, url, body, headers) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d;
  try { d = await r.json(); } catch { d = null; }
  return { status: r.status, data: d };
}

async function fetchBytes(url, headers) {
  const r = await fetch(url, { headers: headers || {} });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get('content-type') };
}

(async () => {
  const pdf = await PDFDocument.create();
  const pg = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  pg.drawText('PrintLoop AGENT-PULL e2e', { x: 60, y: 760, size: 22, font });
  pg.drawText(`ts=${new Date().toISOString()}`, { x: 60, y: 720, size: 10 });
  const srcBytes = Buffer.from(await pdf.save());
  const srcHash = sha(srcBytes);
  console.log(`1. PDF ${srcBytes.length}B sha ${srcHash.slice(0, 12)}…`);

  const email = `pull${Date.now()}@printloop.test`;
  const reg = await j('POST', '/customer/auth/register', {
    firstName: 'Pull', lastName: 'Tester', email, phoneNumber: '+2348000000124', password: 'Passw0rd!',
  });
  const tok = reg.data?.data?.tokens?.accessToken;
  if (!tok) throw new Error(`register failed: ${reg.status}`);
  console.log(`2. Registered ${email} → JWT (${reg.status})`);

  const userId = reg.data?.data?.user?.id;
  if (!userId) throw new Error('register failed to return userId');
  await topUpWallet(userId, 1000);
  console.log(`   Topped up wallet for user ${userId} with ₦1000`);

  const fd = new FormData();
  fd.append('file', new Blob([srcBytes], { type: 'application/pdf' }), 'pull.pdf');
  fd.append('fileName', 'pull.pdf');
  fd.append('pageCount', '1');
  fd.append('paymentMethod', 'wallet');
  fd.append('jobType', 'single');
  fd.append('printConfiguration', JSON.stringify({ copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300 }));
  const cr = await fetch(B + '/customer/print-jobs', {
    method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd,
  });
  const cj = await cr.json().catch(() => null);
  const code = cj?.data?.job?.code;
  const jobId = cj?.data?.job?.id;
  if (!code || !jobId) throw new Error(`upload failed: ${cr.status} ${JSON.stringify(cj)}`);
  console.log(`3. PrintJob created — code=${code} id=${jobId.slice(0, 8)}… (${cr.status})`);

  const al = await j('POST', '/admin/auth/login', { email: 'admin@printloop.test', password: 'Admin1234!' });
  const AH = { Authorization: `Bearer ${al.data?.data?.tokens?.accessToken}` };
  const ks = await j('GET', '/admin/kiosks', null, AH);
  const k = (ks.data?.data?.kiosks || [])[0];
  const rk = await j('POST', `/admin/kiosks/${k.id}/regenerate-key`, {}, AH);
  const kioskKey = rk.data?.data?.kiosk?.apiKey;
  if (!kioskKey) throw new Error('no kiosk key');
  const patchRes = await j('PATCH', '/admin/settings/printDispatchMode', { value: 'kiosk-pull' }, AH);
  console.log(`PATCH /admin/settings/printDispatchMode status: ${patchRes.status}`, patchRes.data);
  console.log(`4. Kiosk "${k.name}" key=${kioskKey.slice(0, 10)}…, printDispatchMode=kiosk-pull`);

  await new Promise((r) => setTimeout(r, 21_000));

  const rel = await j('POST', '/printer/complete', { code }, { 'X-Kiosk-Key': kioskKey });
  console.log(`5. /printer/complete → ${rel.status} mode=${rel.data?.data?.mode} status=${rel.data?.data?.status}`);
  if (rel.status !== 200 || rel.data?.data?.status !== 'releasing') {
    console.log('   ❌ Expected status=releasing in kiosk-pull mode.');
  }

  const ready = await j('GET', '/agent/jobs/ready', null, { 'X-Kiosk-Key': kioskKey });
  const jobs = ready.data?.data?.jobs || [];
  const ours = jobs.find((x) => x.id === jobId);
  console.log(`6. /agent/jobs/ready → ${ready.status}  jobs=${jobs.length}  has-our-job=${!!ours}`);
  if (!ours) {
    console.log('   ❌ Our job not in the ready list.');
    await j('PATCH', '/admin/settings/printDispatchMode', { value: 'cloud-push' }, AH);
    process.exit(1);
  }
  const item = ours.items?.[0];
  console.log(`   item.fileName=${item?.fileName} downloadUrl?=${!!item?.downloadUrl}`);

  const claim = await j('POST', `/agent/jobs/${ours.id}/start`, {}, { 'X-Kiosk-Key': kioskKey });
  console.log(`7. /agent/start → ${claim.status}`);

  const dl = await fetchBytes(item.downloadUrl);
  const dlHash = sha(dl.bytes);
  const exact = dl.bytes.length === srcBytes.length && dlHash === srcHash;
  console.log(`8. download ${dl.bytes.length}B sha ${dlHash.slice(0, 12)}…  ${exact ? '✅ BYTE-EXACT' : '❌ MISMATCH'}`);

  const done = await j('POST', `/agent/jobs/${ours.id}/complete`, {}, { 'X-Kiosk-Key': kioskKey });
  console.log(`9. /agent/complete → ${done.status} success=${done.data?.success}`);

  const race = await j('POST', `/agent/jobs/${ours.id}/start`, {}, { 'X-Kiosk-Key': kioskKey });
  console.log(`10. second /agent/start → ${race.status}  ${race.status === 409 ? '✅ correctly rejected' : '❌ expected 409'}`);

  await j('PATCH', '/admin/settings/printDispatchMode', { value: 'cloud-push' }, AH);
  console.log('11. Restored printDispatchMode=cloud-push.');

  console.log('');
  console.log(exact && claim.status === 200 && done.status === 200 && race.status === 409
    ? '✅ KIOSK-PULL e2e PASSED'
    : '❌ KIOSK-PULL e2e FAILED — review output above.');
})().catch((e) => { console.error('E2E error:', e); process.exit(1); });
