export const DEV_JWT_SECRET =
  'printloop-dev-secret-please-change-32chars-minimum';

export interface EnvIssue {
  key: string;
  detail: string;
}

export function validateDeployEnv(): EnvIssue[] {
  if (process.env.NODE_ENV !== 'production') {
    return [];
  }
  const issues: EnvIssue[] = [];

  const required = (
    key: string,
    detail = `missing (${key})`,
  ): void => {
    const v = (process.env[key] || '').trim();
    if (!v) issues.push({ key, detail });
  };

  required('DATABASE_URL', 'missing (DATABASE_URL) — Postgres required in production');
  required('REDIS_URL', 'missing (REDIS_URL) — queues/accept-window depend on Redis');
  required('RENDER_CALLBACK_SECRET');
  required('PAYSTACK_SECRET_KEY');
  required('PRINTLOOP_APEX_DOMAINS');

  const jwt = (process.env.JWT_SECRET || '').trim();
  if (!jwt) {
    issues.push({ key: 'JWT_SECRET', detail: 'missing (JWT_SECRET)' });
  } else if (jwt.length < 16) {
    issues.push({ key: 'JWT_SECRET', detail: 'must be ≥16 characters' });
  } else if (jwt === DEV_JWT_SECRET) {
    issues.push({ key: 'JWT_SECRET', detail: 'dev fallback secret must never run in production' });
  }

  if (process.env.SEED_DEMO === '1') {
    issues.push({
      key: 'SEED_DEMO',
      detail: 'SEED_DEMO=1 inserts demo accounts (admin@printloop.test / Admin1234!) — never in production',
    });
  }
  if (process.env.DISABLE_RATE_LIMIT === '1') {
    issues.push({
      key: 'DISABLE_RATE_LIMIT',
      detail: 'rate-limit disable flag is a test/CI escape hatch, never for production',
    });
  }

  return issues;
}

export function assertDeployConfig(): EnvIssue[] | void {
  const issues = validateDeployEnv();
  if (issues.length > 0) {
    const lines = issues
      .map((i) => `  - ${i.key}: ${i.detail}`)
      .join('\n');
    throw new Error(
      'Production environment is misconfigured — refusing to boot.\n' +
        lines +
        '\nFix these and restart.',
    );
  }
  return issues;
}