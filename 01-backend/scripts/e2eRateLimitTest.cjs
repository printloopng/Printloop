const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 5000 + Math.floor(Math.random() * 4000);
const B = `http://localhost:${PORT}/api`;
const DB_FILE = path.resolve(
  __dirname,
  '..',
  'data',
  `rl-e2e-${process.pid}.sqlite`,
);
const SERVER = path.resolve(__dirname, '..', 'server.ts');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

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

async function probeRedis() {
  const u = new URL(REDIS_URL);
  const net = require('node:net');
  return new Promise((resolve) => {
    const s = net.createConnection(
      { host: u.hostname, port: Number(u.port) || 6379 },
      () => {
        s.end();
        resolve(true);
      },
    );
    s.on('error', () => resolve(false));
    s.setTimeout(2000, () => {
      s.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const redisUp = await probeRedis();
  if (!redisUp) {
    process.stdout.write(
      `SKIP: Redis unreachable at ${REDIS_URL}. ` +
        `Start one (docker run -p 6379:6379 redis) and re-run.\n`,
    );
    process.exit(0);
  }
  ok(`Redis reachable at ${REDIS_URL}`);

  try {
    fs.unlinkSync(DB_FILE);
  } catch {
  }

  const env = {
    ...process.env,
    DATABASE_FILE: DB_FILE,
    PORT: String(PORT),
    SEED_DEMO: '1',
    REDIS_URL,
  };
  env.DISABLE_RATE_LIMIT = '';
  env.DISABLE_REDIS = '0';

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

    const attempts = [];
    for (let i = 1; i <= 6; i++) {
      const r = await jr('POST', '/admin/auth/login', {
        email: 'admin@printloop.test',
        password: 'definitely-not-the-right-password',
      });
      attempts.push({ i, status: r.status, code: r.data && r.data.code });
    }
    process.stdout.write(JSON.stringify(attempts) + '\n');

    for (let i = 0; i < 5; i++) {
      assert(
        attempts[i].status === 401,
        `attempt ${i + 1}: 401 invalid credentials (got ${attempts[i].status})`,
      );
    }
    assert(
      attempts[5].status === 429,
      `attempt 6: 429 LOGIN_RATE_LIMIT (got ${attempts[5].status})`,
    );
    assert(
      attempts[5].code === 'LOGIN_RATE_LIMIT',
      `attempt 6: code=LOGIN_RATE_LIMIT (got ${attempts[5].code})`,
    );

    process.stdout.write('\nALL RATE LIMIT E2E CHECKS PASSED\n');
    cleanup();
    process.exit(0);
  } catch (err) {
    process.stdout.write(`uncaught: ${err && err.stack ? err.stack : err}\n`);
    process.stdout.write('\n--- server log ---\n' + serverLog + '\n');
    cleanup();
    process.exit(1);
  }
}

main();
