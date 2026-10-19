const path = require('node:path');

const DB_PATH =
  process.env.DATABASE_FILE
    ? path.resolve(process.env.DATABASE_FILE)
    : path.resolve(__dirname, '..', 'data', 'printloop.sqlite');

let sqlite3;
try {
  sqlite3 = require('sqlite3');
} catch {
  console.error('sqlite3 not available; cannot run integrity check');
  process.exit(1);
}

const TABLES = [
  'users',
  'wallets',
  'kiosks',
  'print_jobs',
  'print_job_items',
  'payments',
  'files',
  'pricing_configs',
  'promotions',
  'group_sessions',
  'transactions',
  'payouts',
  'payout_schedules',
  'tenant_balances',
  'tenant_brandings',
  'tenant_webhooks',
  'tenant_domains',
];

function nullCount(db, table) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) AS n FROM "${table}" WHERE "tenantId" IS NULL`,
      (err, row) => (err ? reject(err) : resolve(row ? row.n : 0)),
    );
  });
}

function rowCount(db, table) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) AS n FROM "${table}"`, (err, row) =>
      err ? reject(err) : resolve(row ? row.n : 0),
    );
  });
}

(async () => {
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
  let failures = 0;
  for (const t of TABLES) {
    try {
      const total = await rowCount(db, t);
      const nulls = await nullCount(db, t);
      if (nulls > 0) {
        console.error(`FAIL ${t}: ${nulls}/${total} rows have NULL tenantId`);
        failures++;
      } else {
        console.log(`ok   ${t}: ${total} rows, 0 NULL tenantId`);
      }
    } catch (e) {
      console.log(`skip ${t}: ${e.message}`);
    }
  }
  db.close();
  if (failures > 0) {
    console.error(`\n${failures} table(s) have NULL tenantId rows — regression!`);
    process.exit(1);
  }
  console.log('\nTENANTID INTEGRITY OK');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
