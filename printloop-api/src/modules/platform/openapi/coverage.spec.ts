import { patchRouterForInventory, collectRoutes, toOpenApiPath } from '@/test/routeInventory';

patchRouterForInventory();

describe('OpenAPI document', () => {
  let routes: Array<{ method: string; path: string }>;
  let documented: Set<string>;
  let spec: any;

  beforeAll(async () => {
    const { AppDataSource } = await import('@/config/data-source');
    const { createRootRoutes } = await import('@/routes/root.route');
    routes = collectRoutes(createRootRoutes(AppDataSource), '');
    spec = (await import('@/modules/platform/openapi/document')).openApiSpec;
    documented = new Set(
      Object.entries(spec.paths).flatMap(([path, ops]: [string, any]) =>
        Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`),
      ),
    );
  });

  it('documents every mounted route', () => {
    const missing = routes
      .map((r) => `${r.method} ${toOpenApiPath(r.path)}`)
      .filter((key) => !documented.has(key));
    expect(missing).toEqual([]);
  });

  it('documents no route that does not exist', () => {
    const real = new Set(routes.map((r) => `${r.method} ${toOpenApiPath(r.path)}`));
    const phantom = [...documented].filter((key) => !real.has(key));
    expect(phantom).toEqual([]);
  });

  it('has unique operation ids and resolvable schema refs', () => {
    const ids = Object.values(spec.paths).flatMap((ops: any) => Object.values(ops).map((o: any) => o.operationId));
    expect(new Set(ids).size).toBe(ids.length);
    const refs = [...JSON.stringify(spec).matchAll(/"#\/components\/schemas\/(\w+)"/g)].map((m) => m[1]);
    const unknown = [...new Set(refs)].filter((name) => !spec.components.schemas[name]);
    expect(unknown).toEqual([]);
  });
});
