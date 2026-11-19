import { startTestApi, type TestApi } from '@/test/harness';
import { AppDataSource } from '@/config/data-source';
import { Tenant } from '@/database/entities/tenant.entity';
import { computeCommissionSplit } from '@/modules/saas/services/commission.service';

jest.setTimeout(120_000);

describe('platform fee: one rate for every shop, with a rate of its own per shop', () => {
  let api: TestApi;
  let staff = '';
  let shopId = '';

  const shop = async () => (await api.call('GET', `/platform/tenants/${shopId}`, { token: staff })).body.data.tenant;
  const setDefault = (value: number) =>
    api.call('PATCH', '/platform/settings/commissionPctDefault', { token: staff, body: { value } });
  const setShopRate = (commissionPct: number | null) =>
    api.call('PATCH', `/platform/tenants/${shopId}/commission`, { token: staff, body: { commissionPct } });
  const split = async (gross: number) => {
    const tenant = await AppDataSource.getRepository(Tenant).findOneOrFail({ where: { id: shopId } });
    return computeCommissionSplit(tenant, gross);
  };

  beforeAll(async () => {
    api = await startTestApi();
    staff = await api.login('admin@printloop.ng', 'Password1!');
    const list = await api.call('GET', '/platform/tenants', { token: staff });
    shopId = list.body.data.items.find((t: any) => t.slug === 'campus-print').id;
  });

  afterAll(async () => {
    await api.close();
  });

  it('starts every shop on the platform rate', async () => {
    const t = await shop();
    expect(t.commissionPct).toBeCloseTo(0.1);
    expect(t.commissionPctCustom).toBe(false);
    expect((await split(1000)).commissionAmount).toBe(100);
  });

  it('changes the rate for all shops at once from the platform setting', async () => {
    const res = await setDefault(12);
    expect(res.status).toBe(200);
    expect((await shop()).commissionPct).toBeCloseTo(0.12);
    expect((await split(1000)).commissionAmount).toBe(120);
  });

  it('refuses a platform rate outside 0 to 50 percent', async () => {
    expect((await setDefault(60)).status).toBe(400);
    expect((await setDefault(-1)).status).toBe(400);
    expect((await shop()).commissionPct).toBeCloseTo(0.12);
  });

  it('gives one shop its own rate that the platform rate no longer touches', async () => {
    const res = await setShopRate(0.05);
    expect(res.status).toBe(200);
    expect(res.body.data.commissionPct).toBeCloseTo(0.05);
    expect(res.body.data.commissionPctCustom).toBe(true);
    expect((await split(1000)).commissionAmount).toBe(50);

    await setDefault(15);
    expect((await shop()).commissionPct).toBeCloseTo(0.05);
    expect((await split(1000)).commissionAmount).toBe(50);
  });

  it('puts the shop back on the platform rate when its own rate is cleared', async () => {
    const res = await setShopRate(null);
    expect(res.status).toBe(200);
    expect(res.body.data.commissionPctCustom).toBe(false);
    expect(res.body.data.commissionPct).toBeCloseTo(0.15);
    expect((await split(1000)).commissionAmount).toBe(150);
  });

  it('refuses a shop rate above 50 percent or that is not a number', async () => {
    expect((await setShopRate(0.9)).status).toBe(400);
    expect((await api.call('PATCH', `/platform/tenants/${shopId}/commission`, { token: staff, body: { commissionPct: '5%' } })).status).toBe(400);
  });

  it('lets a shop with a rate of 0 keep everything', async () => {
    await setShopRate(0);
    expect((await split(1000)).commissionAmount).toBe(0);
    await setShopRate(null);
  });
});
