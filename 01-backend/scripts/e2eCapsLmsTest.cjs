const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const PORT = 5000 + Math.floor(Math.random() * 4000);
const B = `http://localhost:${PORT}/api`;
const DB_FILE = path.resolve(__dirname, '..', 'data', `capslms-e2e-${process.pid}.sqlite`);
const SERVER = path.resolve(__dirname, '..', 'server.ts');

let sqlite3;
try { sqlite3 = require('sqlite3'); } catch { sqlite3 = null; }

function ok(m) { process.stdout.write(`ok   ${m}\n`); }
function fail(m) { process.stdout.write(`FAIL: ${m}\n`); process.exit(1); }
function assert(c, m) { c ? ok(m) : fail(m); }

function sqlRun(sql, params) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE);
    db.run(sql, params, function (err) { db.close(); err ? reject(err) : resolve(this.changes); });
  });
}

async function jr(method, url, body, headers) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  let d = null;
  try { d = await r.json(); } catch { }
  return { status: r.status, data: d, headers: r.headers };
}

async function waitFor(url, timeoutMs = 25_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  if (!sqlite3) fail('sqlite3 module unavailable (needed for pricing seed)');
  try { fs.unlinkSync(DB_FILE); } catch { }

  const env = {
    ...process.env,
    DATABASE_FILE: DB_FILE,
    PORT: String(PORT),
    SEED_DEMO: '1',
    DISABLE_RATE_LIMIT: '1',
    GEOCODER: 'fixture',
    SMTP_HOST: '',
  };
  const server = spawn('npx', ['tsx', SERVER], {
    env, cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'], shell: true,
  });
  let log = '';
  server.stdout.on('data', (c) => (log += c.toString()));
  server.stderr.on('data', (c) => (log += c.toString()));
  const cleanup = () => {
    try { server.kill('SIGKILL'); } catch { }
    setTimeout(() => { try { fs.unlinkSync(DB_FILE); } catch { } }, 500);
  };

  try {
    if (!(await waitFor(`http://localhost:${PORT}/health`))) {
      process.stdout.write(log);
      fail(`server did not boot on :${PORT}`);
    }
    ok('server up');

    const slug = 'truth-shop';
    const email = 'owner-truth@example.test';
    const signup = await jr('POST', '/saas/signup', {
      businessName: 'Truth Shop', slug,
      ownerFirstName: 'Owner', ownerLastName: 'Truth',
      ownerEmail: email, ownerPhone: '+2348000000000',
      ownerPassword: 'OwnerPass2026!', address: 'Yaba, Lagos',
    });
    assert(signup.status === 201, `signup → 201 (got ${signup.status})`);
    await new Promise((r) => setTimeout(r, 300));
    const code = (log.match(
      new RegExp(`\\[email:disabled\\] to=${email.replace(/[.@]/g, '\\$&')} subject="?Verify your email — code (\\d{6})"?`),
    ) || [])[1];
    assert(!!code, 'verify code scraped');
    assert((await jr('POST', '/saas/verify-email', { email, token: code })).status === 200, 'verify-email → 200');
    const login = await jr('POST', '/admin/auth/login', { email, password: 'OwnerPass2026!' });
    assert(login.status === 200, 'owner login → 200');
    const H = { Authorization: `Bearer ${login.data.data.tokens.accessToken}`, 'X-Tenant-Slug': slug };

    const loc = await jr('PATCH', '/saas/me/location', { address: 'UNILAG, Akoka, Lagos' }, H);
    assert(loc.status === 200, `set location → 200 (got ${loc.status})`);

    const create = await jr('POST', '/saas/kiosks', { name: 'Truth Front Desk' }, H);
    assert(create.status === 201, 'create printer → 201');
    const kioskId = create.data.data.kiosk.id;
    const kioskKey = create.data.data.kiosk.apiKey;

    await sqlRun(`UPDATE tenants SET status='active', isDiscoverable=1 WHERE slug=?`, [slug]);
    const tRow = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READONLY);
      db.get(`SELECT id, lat, lng FROM tenants WHERE slug=?`, [slug], (err, row) => {
        db.close(); err ? reject(err) : resolve(row);
      });
    });
    assert(tRow && tRow.lat != null, 'tenant has coords (fixture geocoder)');
    for (const [paper, color] of [['A4', 'BLACK_WHITE'], ['A4', 'COLOR'], ['A3', 'BLACK_WHITE']]) {
      await sqlRun(
        `INSERT INTO pricing_configs (id, tenantId, paperSize, colorType, pricePerPage, price300Simplex, isActive, currency)
         VALUES (?, ?, ?, ?, 10, 10, 1, 'NGN')
         ON CONFLICT(tenantId, paperSize, colorType)
         DO UPDATE SET isActive=1, price300Simplex=10, pricePerPage=10`,
        [randomUUID(), tRow.id, paper, color],
      );
    }
    ok('tenant activated + colour/A3 pricing seeded');

    const findShop = async () => {
      const r = await jr('GET', `/discovery/shops/nearby?lat=${tRow.lat}&lng=${tRow.lng}&radius=5`);
      return (r.data?.data?.shops || []).find((s) => s.slug === slug) || null;
    };

    let shop = await findShop();
    assert(!!shop, 'shop appears on /find');
    assert(shop.hasColor === true, 'caps UNKNOWN → hasColor true (pricing-derived)');
    assert(shop.paperSizes.includes('A3'), 'caps UNKNOWN → A3 offered (pricing-derived)');

    const capPost = await jr('POST', '/agent/printer/capabilities',
      { color: false, duplex: true, a3: false, media: ['iso_a4_210x297mm'] },
      { 'X-Kiosk-Key': kioskKey });
    assert(capPost.status === 200, `capabilities POST → 200 (got ${capPost.status})`);

    const kList = await jr('GET', '/saas/kiosks', undefined, H);
    const k = kList.data.data.kiosks.find((x) => x.id === kioskId);
    assert(k && k.capColor === false && k.capDuplex === true && k.capA3 === false,
      'operator console shows auto-detected caps (colour=false duplex=true a3=false)');

    shop = await findShop();
    assert(shop.hasColor === false, 'HW says no colour → hasColor=false despite colour pricing');
    assert(!shop.paperSizes.includes('A3'), 'HW says no A3 → A3 dropped from paperSizes');
    assert(shop.paperSizes.includes('A4'), 'A4 stays');

    await jr('POST', '/agent/printer/capabilities',
      { color: true, duplex: true, a3: true, media: ['iso_a4_210x297mm', 'iso_a3_297x420mm'] },
      { 'X-Kiosk-Key': kioskKey });
    shop = await findShop();
    assert(shop.hasColor === true, 'caps true again → hasColor restored');
    assert(shop.paperSizes.includes('A3'), 'A3 restored');

    const lms0 = await jr('GET', '/saas/me/lms', undefined, H);
    assert(lms0.status === 200 && lms0.data.data.keySet === false, 'LMS status starts keySet=false');

    const gen = await jr('POST', '/saas/me/lms/regenerate', undefined, H);
    assert(gen.status === 200 && gen.data.data.key && gen.data.data.url, 'regenerate discloses key + URL once');
    const key1 = gen.data.data.key;

    const lms1 = await jr('GET', '/saas/me/lms', undefined, H);
    assert(lms1.data.data.keySet === true, 'LMS status now keySet=true (key not re-disclosed)');
    assert(!JSON.stringify(lms1.data).includes(key1), 'status read never leaks the key');

    const hand = await jr('GET', `/integrations/lms/handoff?slug=${slug}&key=${key1}&email=stu@uni.edu.ng&format=json`);
    assert(hand.status === 200 && hand.data.data.token, 'handoff (json) → 200 + token');
    const redir = await jr('GET', `/integrations/lms/handoff?slug=${slug}&key=${key1}`);
    assert(redir.status === 302, `handoff (default) → 302 redirect (got ${redir.status})`);
    assert(String(redir.headers.get('location') || '').includes('handoff='), 'redirect carries handoff token');

    const bad = await jr('GET', `/integrations/lms/handoff?slug=${slug}&key=${'0'.repeat(48)}&format=json`);
    assert(bad.status === 401, `wrong key → 401 (got ${bad.status})`);

    const v1 = await jr('GET', `/discovery/handoff/verify?token=${encodeURIComponent(hand.data.data.token)}`);
    assert(v1.status === 200 && v1.data.data.email === 'stu@uni.edu.ng',
      'token verifies once, email pre-fill intact');
    const v2 = await jr('GET', `/discovery/handoff/verify?token=${encodeURIComponent(hand.data.data.token)}`);
    assert(v2.status === 401 && v2.data.code === 'TOKEN_USED', `replay → 401 TOKEN_USED (got ${v2.status})`);

    const mkt = await jr('POST', '/discovery/handoff', { slug });
    const mv1 = await jr('GET', `/discovery/handoff/verify?token=${encodeURIComponent(mkt.data.data.token)}`);
    const mv2 = await jr('GET', `/discovery/handoff/verify?token=${encodeURIComponent(mkt.data.data.token)}`);
    assert(mv1.status === 200 && mv2.status === 200, 'marketplace handoff (no jti) still re-verifiable');

    await jr('POST', '/saas/me/lms/regenerate', undefined, H);
    const oldKey = await jr('GET', `/integrations/lms/handoff?slug=${slug}&key=${key1}&format=json`);
    assert(oldKey.status === 401, 'rotated → old key 401 everywhere it was pasted');

    process.stdout.write('\nALL CAPS + LMS CHECKS PASSED\n');
    cleanup();
    process.exit(0);
  } catch (err) {
    process.stdout.write(`uncaught: ${err && err.stack ? err.stack : err}\n`);
    process.stdout.write('\n--- server log (tail) ---\n' + log.slice(-2500) + '\n');
    cleanup();
    process.exit(1);
  }
}

main();
