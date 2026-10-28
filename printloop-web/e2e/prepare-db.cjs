const path = require("node:path");
const { Client } = require(require.resolve("pg", { paths: [path.resolve(__dirname, "..", "..", "printloop-api")] }));

const name = process.env.E2E_DB_NAME || "printloop_e2e";

(async () => {
  const server = new URL(process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres");
  server.pathname = "/postgres";
  const client = new Client({ connectionString: server.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${name}"`);
  await client.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
