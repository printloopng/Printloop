import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { buildOpenApiDocument } from '@/modules/platform/openapi/document';

interface DocumentedOp {
  method: string;
  path: string;
  re: RegExp;
  params: number;
  responses: Record<string, any>;
}

let ops: DocumentedOp[] | null = null;
let ajv: Ajv;
const compiled = new Map<string, ValidateFunction>();
const violations = new Set<string>();

function strictify<T>(node: T): T {
  if (Array.isArray(node)) {
    node.forEach(strictify);
  } else if (node && typeof node === 'object') {
    const n = node as Record<string, any>;
    if (n.properties && n.additionalProperties === undefined) n.additionalProperties = false;
    Object.values(n).forEach(strictify);
  }
  return node;
}

function load(): DocumentedOp[] {
  const doc = buildOpenApiDocument() as any;
  ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(strictify({ $id: 'pl', components: JSON.parse(JSON.stringify(doc.components)) }), 'pl');
  return Object.entries(doc.paths as Record<string, Record<string, any>>).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => ({
      method: method.toUpperCase(),
      path,
      re: new RegExp(`^${path.replace(/\{[^}]+\}/g, '[^/]+')}$`),
      params: (path.match(/\{/g) || []).length,
      responses: op.responses ?? {},
    })),
  );
}

export function checkContract(method: string, url: string, status: number, body: unknown): void {
  if (status >= 300 || !body || typeof body !== 'object') return;
  ops ??= load();
  const path = url.split('?')[0]!.replace(/^\/api/, '');
  const op = ops
    .filter((o) => o.method === method.toUpperCase() && o.re.test(path))
    .sort((a, b) => a.params - b.params)[0];
  if (!op) {
    violations.add(`${method} ${path}: not documented`);
    return;
  }
  const response = op.responses[String(status)];
  if (!response) {
    violations.add(`${method} ${op.path}: returned ${status}, documented ${Object.keys(op.responses).filter((s) => s < '300').join('/')}`);
    return;
  }
  const schema = response.content?.['application/json']?.schema;
  if (!schema) return;
  const key = `${method} ${op.path} ${status}`;
  let validate = compiled.get(key);
  if (!validate) {
    validate = ajv.compile(strictify(JSON.parse(JSON.stringify(schema).replace(/"#\/components\/schemas\//g, '"pl#/components/schemas/'))));
    compiled.set(key, validate);
  }
  if (validate(body)) return;
  for (const e of validate.errors ?? []) {
    if (e.keyword === 'anyOf') continue;
    const where = e.instancePath.replace(/\/\d+/g, '/*') || '(root)';
    const what = e.keyword === 'additionalProperties' ? `undocumented "${e.params.additionalProperty}"` : e.message;
    violations.add(`${key}: ${where} ${what}`);
  }
}

export function contractViolations(): string[] {
  return [...violations].sort();
}
