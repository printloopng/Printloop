import 'reflect-metadata';
import { AppDataSource } from '@/config/data-source';
import { ensureSuperAdmin, SuperAdminInputError } from '@/database/seeders/superAdmin';

const USAGE =
  'Usage: npm run admin:create -- <email> <password> [--first-name=...] [--last-name=...] [--reset-password]\n' +
  '   or: SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... npm run admin:create';

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq === -1) flags[arg.slice(2)] = true;
    else flags[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return {
    email: positional[0] || process.env.SUPER_ADMIN_EMAIL || '',
    password: positional[1] || process.env.SUPER_ADMIN_PASSWORD || '',
    firstName: typeof flags['first-name'] === 'string' ? flags['first-name'] : process.env.SUPER_ADMIN_FIRST_NAME,
    lastName: typeof flags['last-name'] === 'string' ? flags['last-name'] : process.env.SUPER_ADMIN_LAST_NAME,
    resetPassword: flags['reset-password'] === true,
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email || !args.password) {
    console.error(USAGE);
    return 1;
  }

  await AppDataSource.initialize();
  try {
    await AppDataSource.runMigrations();
    const result = await ensureSuperAdmin(args);
    switch (result.outcome) {
      case 'created':
        console.log(`Created ${args.email} as PrintLoop staff (userId=${result.userId}).`);
        return 0;
      case 'updated':
        console.log(`Updated ${args.email}: now PrintLoop staff with a new password (userId=${result.userId}).`);
        return 0;
      case 'unchanged':
        console.log(`${args.email} is already PrintLoop staff (userId=${result.userId}). No changes. Use --reset-password to rotate.`);
        return 0;
      case 'refused':
        console.error(`Refused: ${args.email} already exists with role=${result.role}. Re-run with --reset-password to promote it and rotate the password.`);
        return 2;
    }
  } catch (err) {
    if (err instanceof SuperAdminInputError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  } finally {
    await AppDataSource.destroy();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('create-super-admin failed:', err);
    process.exit(3);
  });
