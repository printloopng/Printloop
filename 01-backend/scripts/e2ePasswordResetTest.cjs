const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 5000 + Math.floor(Math.random() * 4000);
const B = `http://localhost:${PORT}/api`;
const DB_FILE = path.resolve(
  __dirname,
  '..',
  'data',
  `pwreset-e2e-${process.pid}.sqlite`,
);
const SERVER = path.resolve(__dirname, '..', 'server.ts');

const EMAIL = 'admin@printloop.test';
const OLD_PW = 'Admin1234!';
const NEW_PW = 'ResetMeNow2026!';

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

async function jr(method, url, body) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
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
    NODE_ENV: 'development',
  };
  env.SMTP_HOST = '';

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

    const unknown = await jr('POST', '/auth/forgot-password', {
      email: 'nobody-' + process.pid + '@nowhere.test',
    });
    assert(unknown.status === 200, `unknown email → 200 (got ${unknown.status})`);
    assert(
      unknown.data && unknown.data.success === true,
      'unknown email body is success:true',
    );

    const known = await jr('POST', '/auth/forgot-password', { email: EMAIL });
    assert(known.status === 200, `known email → 200 (got ${known.status})`);
    assert(
      known.data && known.data.message === unknown.data.message,
      'known + unknown share IDENTICAL message (anti-enumeration)',
    );

    await new Promise((r) => setTimeout(r, 200));
    const m = serverLog.match(
      new RegExp('minted token for ' + EMAIL.replace(/[.@]/g, '\\$&') + ': (\\S+)'),
    );
    assert(m && m[1], 'token logged to server stdout (dev mode)');
    const TOKEN = m[1];

    const malformed = await jr('POST', '/auth/reset-password', {
      email: EMAIL,
      token: 'not-a-valid-format',
      password: NEW_PW,
    });
    assert(
      malformed.status === 400 && malformed.data.code === 'TOKEN_MALFORMED',
      `malformed token → 400 TOKEN_MALFORMED (got ${malformed.status} ${malformed.data && malformed.data.code})`,
    );

    const wrong = await jr('POST', '/auth/reset-password', {
      email: EMAIL,
      token:
        'deadbeef00000000000000000000000000000000000000000000000000000000.' +
        (Date.now() + 60_000),
      password: NEW_PW,
    });
    assert(
      wrong.status === 400 && wrong.data.code === 'TOKEN_INVALID',
      `unknown valid-shape token → 400 TOKEN_INVALID (got ${wrong.status} ${wrong.data && wrong.data.code})`,
    );

    const reset = await jr('POST', '/auth/reset-password', {
      email: EMAIL,
      token: TOKEN,
      password: NEW_PW,
    });
    assert(
      reset.status === 200 && reset.data.success === true,
      `reset with real token → 200 success (got ${reset.status})`,
    );

    const loginOld = await jr('POST', '/admin/auth/login', {
      email: EMAIL,
      password: OLD_PW,
    });
    assert(loginOld.status === 401, `old password rejected (got ${loginOld.status})`);

    const loginNew = await jr('POST', '/admin/auth/login', {
      email: EMAIL,
      password: NEW_PW,
    });
    assert(loginNew.status === 200, `new password accepted (got ${loginNew.status})`);
    assert(
      loginNew.data &&
        loginNew.data.data &&
        loginNew.data.data.user &&
        loginNew.data.data.user.role === 'super_admin',
      'role preserved through reset (super_admin)',
    );

    const replay = await jr('POST', '/auth/reset-password', {
      email: EMAIL,
      token: TOKEN,
      password: 'YetAnother2026!',
    });
    assert(
      replay.status === 400 && replay.data.code === 'TOKEN_INVALID',
      `token replay rejected — single-use (got ${replay.status} ${replay.data && replay.data.code})`,
    );

    process.stdout.write('\nALL PASSWORD RESET E2E CHECKS PASSED\n');
    cleanup();
    process.exit(0);
  } catch (err) {
    process.stdout.write(`uncaught: ${err && err.stack ? err.stack : err}\n`);
    process.stdout.write('\n--- server log (tail) ---\n' + serverLog.slice(-3000) + '\n');
    cleanup();
    process.exit(1);
  }
}

main();
