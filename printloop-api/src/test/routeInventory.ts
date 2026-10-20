const RouterPkg: any = require('router');

type Inventory = Array<{ method: string; path: string }>;

let patched = false;

export function patchRouterForInventory(): void {
  if (patched) return;
  patched = true;
  const proto = (RouterPkg as any).prototype;
  const originalUse = proto.use;
  proto.use = function use(this: any, ...args: any[]) {
    const before = this.stack.length;
    let path: string | string[] = '/';
    const first = args[0];
    if (typeof first === 'string' || (Array.isArray(first) && typeof first[0] === 'string')) path = first;
    const out = originalUse.apply(this, args);
    for (let i = before; i < this.stack.length; i++) this.stack[i].__mount = path;
    return out;
  };
}

function join(a: string, b: string): string {
  const joined = `${a}/${b}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

export function collectRoutes(router: any, prefix = ''): Inventory {
  const out: Inventory = [];
  for (const layer of router.stack || []) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        for (const method of Object.keys(layer.route.methods || {})) {
          if (method === '_all') continue;
          out.push({ method: method.toUpperCase(), path: join(prefix, p) });
        }
      }
    } else if (layer.handle?.stack) {
      const mounts = Array.isArray(layer.__mount) ? layer.__mount : [layer.__mount ?? '/'];
      for (const m of mounts) out.push(...collectRoutes(layer.handle, join(prefix, m)));
    }
  }
  const seen = new Set<string>();
  return out.filter((r) => {
    const k = `${r.method} ${r.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z_]\w*)/g, '{$1}');
}
