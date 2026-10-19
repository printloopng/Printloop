const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 5000 + Math.floor(Math.random() * 4000);
const B = `http://localhost:${PORT}/api`;
const DB_FILE = path.resolve(
  __dirname,
  '..',
  'data',
  `cli-e2e-${process.pid}.sqlite`,
);
const CLI = path.resolve(__dirname, 'createSuperAdmin.ts');
const SERVER = path.resolve(__dirname, '..', 'server.ts');

const EMAIL = 'cli-e2e@example.com';
const PW1 = 'FirstPassword2026!';
const PW2 = 'RotatedPassword2027!';

function log(line) {
  process.stdout.write(line + '\n');
}
function ok(msg) {
  log(`ok   ${msg}`);
}
function fail(msg) {
  log(`FAIL: ${msg}`);
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

function runCli(args) {
  const env = { ...process.env, DATABASE_FILE: DB_FILE };
  env.SEED_DEMO = '0';
  const res = spawnSync('npx', ['tsx', CLI, ...args], {
    env,
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '..'),
    shell: true,
  });
  return {
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
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

  const serverEnv = { ...process.env, DATABASE_FILE: DB_FILE, PORT: String(PORT) };
  serverEnv.SEED_DEMO = '0';
  const server = spawn('npx', ['tsx', SERVER], {
    env: serverEnv,
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
      fail(`server failed to come up on :${PORT} within timeout`);
    }
    ok('server up on test port');

    const demoLogin = await jr('POST', '/admin/auth/login', {
      email: 'admin@printloop.test',
      password: 'Admin1234!',
    });
    assert(
      demoLogin.status === 401 || demoLogin.status === 400,
      `seeded demo admin login is rejected when SEED_DEMO unset (got ${demoLogin.status})`,
    );

    const create = runCli([EMAIL, PW1, '--first-name=Cli', '--last-name=E2E']);
    if (create.code !== 0) {
      process.stdout.write(create.stdout);
      process.stderr.write(create.stderr);
      fail(`createSuperAdmin first run exit ${create.code}`);
    }
    ok('CLI first run: exit 0');
    assert(
      /Created:/.test(create.stdout),
      'CLI first run reports "Created"',
    );
    assert(
      /Linked as OWNER/.test(create.stdout),
      'CLI first run links as OWNER of legacy tenant',
    );

    const login1 = await jr('POST', '/admin/auth/login', {
      email: EMAIL,
      password: PW1,
    });
    assert(login1.status === 200, `login with minted account → 200 (got ${login1.status})`);
    assert(
      login1.data &&
        login1.data.data &&
        login1.data.data.user &&
        login1.data.data.user.role === 'super_admin',
      'minted account has role=super_admin',
    );

    const create2 = runCli([EMAIL, PW1]);
    assert(create2.code === 0, `CLI re-run idempotent (exit ${create2.code})`);
    assert(
      /already a SUPER_ADMIN/.test(create2.stdout),
      'CLI re-run reports "already a SUPER_ADMIN"',
    );

    const rotate = runCli([EMAIL, PW2, '--reset-password']);
    assert(rotate.code === 0, `CLI --reset-password (exit ${rotate.code})`);
    assert(
      /password rotated/.test(rotate.stdout),
      'CLI --reset-password reports "password rotated"',
    );

    const loginOld = await jr('POST', '/admin/auth/login', {
      email: EMAIL,
      password: PW1,
    });
    assert(
      loginOld.status === 401 || loginOld.status === 400,
      `old password rejected after rotate (got ${loginOld.status})`,
    );
    const loginNew = await jr('POST', '/admin/auth/login', {
      email: EMAIL,
      password: PW2,
    });
    assert(loginNew.status === 200, `new password works after rotate (got ${loginNew.status})`);

    log('\nALL createSuperAdmin CLI E2E CHECKS PASSED');
    cleanup();
    process.exit(0);
  } catch (err) {
    log(`uncaught: ${err && err.stack ? err.stack : err}`);
    process.stdout.write('\n--- server log ---\n' + serverLog + '\n');
    cleanup();
    process.exit(1);
  }
}

main();
