const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 5000 + Math.floor(Math.random() * 4000);
const B = `http://localhost:${PORT}/api`;
const DB_FILE = path.resolve(
  __dirname,
  '..',
  'data',
  `polish-e2e-${process.pid}.sqlite`,
);
const SERVER = path.resolve(__dirname, '..', 'server.ts');

function ok(msg) {
  process.stdout.write(`ok   ${msg}\n`);
}
function fail(msg) {
  process.stdout.write(`FAIL: ${msg}\n`);
  process.exit(1);
}
function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

async function jr(method, url, body, headers) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d = null;
  try {
    d = await r.json();
  } catch {
  }
  return { status: r.status, data: d };
}

async function waitFor(url, timeoutMs = 25_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  try {
    fs.unlinkSync(DB_FILE);
  } catch {
  }

  const env = {
    ...process.env,
    DATABASE_FILE: DB_FILE,
    PORT: String(PORT),
    SEED_DEMO: '1',
    DISABLE_RATE_LIMIT: '1',
    GEOCODER: 'fixture',
    SMTP_HOST: '',
    JWT_SECRET: 'polish-e2e-signing-secret-32chars!',
  };

  const server = spawn('npx', ['tsx', SERVER], {
    env,
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  let serverLog = '';
  server.stdout.on('data', (c) => (serverLog += c.toString()));
  server.stderr.on('data', (c) => (serverLog += c.toString()));

  const cleanup = () => {
    try {
      server.kill('SIGKILL');
    } catch {
    }
    setTimeout(() => {
      try {
        fs.unlinkSync(DB_FILE);
      } catch {
      }
    }, 500);
  };

  try {
    const up = await waitFor(`http://localhost:${PORT}/health`);
    if (!up) {
      process.stdout.write(serverLog);
      fail(`server failed to come up on :${PORT}`);
    }
    ok('server up on test port');

    const signup = await jr('POST', '/saas/signup', {
      businessName: 'Polish Shop',
      slug: 'polish-shop',
      ownerFirstName: 'Polish',
      ownerLastName: 'Owner',
      ownerEmail: 'polish-owner@example.test',
      ownerPhone: '+2348011111110',
      ownerPassword: 'TenantOwner2026!',
      address: 'Yaba, Lagos',
    });
    assert(signup.status === 201, `signup → 201 (got ${signup.status})`);
    const tenantId = signup.data.data.tenantId;

    await new Promise((r) => setTimeout(r, 300));
    const m = serverLog.match(/\[email:disabled\] to=polish-owner@example\.test subject="?Verify your email — code (\d{6})"?/);
    assert(m && m[1], 'verify token logged');
    const verify = await jr('POST', '/saas/verify-email', {
      email: 'polish-owner@example.test',
      token: m[1],
    });
    assert(verify.status === 200, `verify → 200 (got ${verify.status})`);

    const login = await jr('POST', '/admin/auth/login', {
      email: 'polish-owner@example.test',
      password: 'TenantOwner2026!',
    });
    assert(login.status === 200, 'tenant owner login → 200');
    const tenantAuth = {
      Authorization: `Bearer ${login.data.data.tokens.accessToken}`,
      'X-Tenant-Slug': 'polish-shop',
    };

    const gateTrial = await jr(
      'PATCH',
      '/saas/me/location',
      { isDiscoverable: true },
      tenantAuth,
    );
    assert(
      gateTrial.status === 400 &&
        gateTrial.data.code === 'LIVE_GATE_NOT_MET' &&
        gateTrial.data.reason === 'TENANT_NOT_ACTIVE',
      `gate refuses TRIAL with reason TENANT_NOT_ACTIVE (got ${gateTrial.status}/${gateTrial.data?.reason})`,
    );

    const adminLogin = await jr('POST', '/admin/auth/login', {
      email: 'admin@printloop.test',
      password: 'Admin1234!',
    });
    assert(adminLogin.status === 200, 'platform admin login → 200');
    const platformAuth = {
      Authorization: `Bearer ${adminLogin.data.data.tokens.accessToken}`,
    };
    const reactivate = await jr(
      'POST',
      `/platform/tenants/${tenantId}/reactivate`,
      {},
      platformAuth,
    );
    assert(reactivate.status === 200, 'reactivate → 200');

    const gateNoKiosk = await jr(
      'PATCH',
      '/saas/me/location',
      { isDiscoverable: true },
      tenantAuth,
    );
    assert(
      gateNoKiosk.status === 400 &&
        gateNoKiosk.data.reason === 'TEST_PRINT_MISSING',
      `gate refuses no-kiosks with TEST_PRINT_MISSING (got ${gateNoKiosk.data?.reason})`,
    );

    const adminAsTenant = {
      ...platformAuth,
      'X-Tenant-Slug': 'polish-shop',
    };
    const newKiosk = await jr(
      'POST',
      '/admin/kiosks',
      {
        name: 'Polish Kiosk #1',
        location: 'Yaba',
        printerName: 'HP LaserJet',
      },
      adminAsTenant,
    );
    assert(newKiosk.status === 201 || newKiosk.status === 200, `kiosk created (got ${newKiosk.status})`);
    const kioskId =
      newKiosk.data?.data?.id ||
      newKiosk.data?.id ||
      newKiosk.data?.data?.kiosk?.id ||
      newKiosk.data?.kiosk?.id;
    if (typeof kioskId !== 'string') {
      process.stdout.write(`kiosk create body: ${JSON.stringify(newKiosk.data)}\n`);
    }
    assert(typeof kioskId === 'string', 'kiosk has an id');

    const gateBefore = await jr(
      'PATCH',
      '/saas/me/location',
      { isDiscoverable: true },
      tenantAuth,
    );
    assert(
      gateBefore.status === 400 &&
        gateBefore.data.reason === 'TEST_PRINT_MISSING',
      `gate still TEST_PRINT_MISSING pre-mark (got ${gateBefore.data?.reason})`,
    );

    const mark = await jr(
      'POST',
      `/admin/kiosks/${kioskId}/test-print-pass`,
      {},
      adminAsTenant,
    );
    assert(mark.status === 200, `test-print-pass → 200 (got ${mark.status})`);

    const gateOffline = await jr(
      'PATCH',
      '/saas/me/location',
      { isDiscoverable: true },
      tenantAuth,
    );
    assert(
      gateOffline.status === 400 &&
        gateOffline.data.reason === 'NO_KIOSK_ONLINE',
      `gate refuses without recent heartbeat (got ${gateOffline.data?.reason})`,
    );

    const kioskDetail = await jr(
      'GET',
      `/admin/kiosks/${kioskId}`,
      undefined,
      adminAsTenant,
    );
    const apiKey = newKiosk.data?.data?.kiosk?.apiKey;
    assert(typeof apiKey === 'string' && apiKey.length > 0, 'kiosk has an apiKey');

    const beat = await fetch(`http://localhost:${PORT}/api/printer/heartbeat`, {
      headers: { 'X-Kiosk-Key': apiKey },
    });
    assert(beat.status === 200, `kiosk heartbeat → 200 (got ${beat.status})`);

    const gateOk = await jr(
      'PATCH',
      '/saas/me/location',
      { isDiscoverable: true },
      tenantAuth,
    );
    assert(
      gateOk.status === 200 && gateOk.data.data?.isDiscoverable === true,
      `gate passes (got ${gateOk.status}/${gateOk.data?.data?.isDiscoverable})`,
    );

    const hMint = await jr('POST', '/discovery/handoff', {
      slug: 'polish-shop',
      email: 'customer@example.test',
    });
    assert(
      hMint.status === 200 && typeof hMint.data.data.token === 'string',
      `handoff mint → 200 with token`,
    );
    const hVerify = await jr(
      'GET',
      `/discovery/handoff/verify?token=${encodeURIComponent(hMint.data.data.token)}`,
    );
    assert(
      hVerify.status === 200 &&
        hVerify.data.data.tenantSlug === 'polish-shop' &&
        hVerify.data.data.email === 'customer@example.test',
      `handoff verify → 200 with slug+email round-tripped`,
    );

    const tampered = hMint.data.data.token.replace(/.$/, 'X');
    const hBad = await jr(
      'GET',
      `/discovery/handoff/verify?token=${encodeURIComponent(tampered)}`,
    );
    assert(
      hBad.status === 400 && hBad.data.code === 'TOKEN_INVALID',
      `tampered token → 400 TOKEN_INVALID (got ${hBad.status}/${hBad.data?.code})`,
    );

    const hNoSlug = await jr('POST', '/discovery/handoff', {
      slug: 'nope-not-real',
    });
    assert(
      hNoSlug.status === 404 && hNoSlug.data.code === 'SHOP_NOT_AVAILABLE',
      `handoff mint for missing slug → 404 SHOP_NOT_AVAILABLE`,
    );

    const offlinePatch = await jr(
      'PATCH',
      `/admin/kiosks/${kioskId}/status`,
      { status: 'OFFLINE' },
      adminAsTenant,
    );
    assert(
      offlinePatch.status === 200 || offlinePatch.status === 204,
      `kiosk → OFFLINE (got ${offlinePatch.status})`,
    );

    const customerLogin = await jr('POST', '/customer/auth/login', {
      email: 'student@printloop.test',
      password: 'Password1!',
    });
    assert(customerLogin.status === 200, 'customer login → 200');
    const customerAuth = {
      Authorization: `Bearer ${customerLogin.data.data.tokens.accessToken}`,
      'X-Tenant-Slug': 'polish-shop',
    };

    const detail = await jr('GET', '/discovery/shops/polish-shop');
    assert(detail.status === 200, 'shop detail → 200');
    assert(
      detail.data.data.shop.agentOnline === false,
      `agentOnline flips to false after OFFLINE (got ${detail.data.data.shop.agentOnline})`,
    );

    process.stdout.write('\nALL MARKETPLACE POLISH E2E CHECKS PASSED\n');
    cleanup();
    process.exit(0);
  } catch (err) {
    process.stdout.write(`uncaught: ${err && err.stack ? err.stack : err}\n`);
    process.stdout.write('\n--- server log (tail) ---\n' + serverLog.slice(-4000) + '\n');
    cleanup();
    process.exit(1);
  }
}

main();
