const B = 'http://localhost:4000/api';

async function jr(method, url, body, headers) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d;
  try {
    d = await r.json();
  } catch {
    d = null;
  }
  return { status: r.status, data: d };
}

function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok   ${msg}`);
}

(async () => {
  const login = await jr('POST', '/admin/auth/login', {
    email: 'admin@printloop.test',
    password: 'Admin1234!',
  });
  assert(login.status === 200, `super_admin login (got ${login.status})`);
  const token = login.data?.data?.tokens?.accessToken;
  assert(!!token, 'login returned an access token');
  const claims = decodeJwt(token);
  assert(claims?.role === 'super_admin', 'JWT role is super_admin');
  assert(Array.isArray(claims?.memberships), 'JWT carries memberships[]');
  const auth = { Authorization: `Bearer ${token}` };

  const list = await jr('GET', '/platform/tenants?limit=100', null, auth);
  assert(list.status === 200, `GET /platform/tenants (got ${list.status})`);
  const tenants = list.data?.data?.items || [];
  assert(tenants.length >= 1, `tenant list non-empty (${tenants.length})`);

  const cust = await jr('POST', '/customer/auth/register', {
    firstName: 'Plat',
    lastName: 'Probe',
    email: `platprobe_${Date.now()}@example.test`,
    phoneNumber: '+2348000000123',
    password: 'Password1!',
  });
  if (cust.status === 201) {
    const ctok = cust.data?.data?.tokens?.accessToken;
    const refused = await jr('GET', '/platform/tenants', null, {
      Authorization: `Bearer ${ctok}`,
    });
    assert(
      refused.status === 403,
      `customer refused from platform console (got ${refused.status})`,
    );
  } else {
    console.log(`skip customer-refusal check (register got ${cust.status})`);
  }

  const target = tenants.find((t) => t.slug !== 'legacy') || tenants[0];
  console.log(`-> target tenant: ${target.slug} (${target.status})`);

  const suspend = await jr(
    'POST',
    `/platform/tenants/${target.id}/suspend`,
    { reason: 'e2e test' },
    auth,
  );
  assert(
    suspend.status === 200 || suspend.status === 409,
    `suspend returned ${suspend.status} (200 ok, 409 already-suspended)`,
  );

  const afterSuspend = await jr('GET', '/platform/tenants?limit=100', null, auth);
  const t2 = (afterSuspend.data?.data?.items || []).find((t) => t.id === target.id);
  assert(t2?.status === 'suspended', 'target is suspended after suspend');

  const react = await jr(
    'POST',
    `/platform/tenants/${target.id}/reactivate`,
    null,
    auth,
  );
  assert(react.status === 200, `reactivate (got ${react.status})`);
  const afterReact = await jr('GET', '/platform/tenants?limit=100', null, auth);
  const t3 = (afterReact.data?.data?.items || []).find((t) => t.id === target.id);
  assert(t3?.status === 'active', 'target is active after reactivate');

  const imp = await jr(
    'POST',
    `/platform/tenants/${target.id}/impersonate?ttl=600`,
    null,
    auth,
  );
  assert(imp.status === 200, `impersonate (got ${imp.status})`);
  const impToken = imp.data?.data?.token;
  const impClaims = decodeJwt(impToken);
  assert(
    impClaims?.impersonating?.tenantId === target.id,
    'impersonation token carries impersonating.tenantId',
  );
  assert(
    impClaims?.impersonating?.actorUserId === claims.userId,
    'impersonating.actorUserId === platform admin userId',
  );
  assert(
    (impClaims?.memberships || []).some(
      (m) => m.tenantId === target.id && m.role === 'owner',
    ),
    'impersonation token has synthetic owner membership for target',
  );

  const me = await jr('GET', '/saas/me', null, {
    Authorization: `Bearer ${impToken}`,
    'X-Tenant-Slug': target.slug,
  });
  assert(
    me.status === 200 && me.data?.data?.slug === target.slug,
    `impersonation token resolves /saas/me for ${target.slug} (got ${me.status})`,
  );

  console.log('\nALL PLATFORM E2E CHECKS PASSED');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
