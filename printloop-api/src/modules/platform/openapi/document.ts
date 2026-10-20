import { schemas, obj, ref, str, type Schema } from './schemas';
import { routes, type Op, type Auth } from './paths';

const SECURITY: Record<Auth, Array<Record<string, string[]>>> = {
  none: [],
  user: [{ bearerAuth: [] }],
  kiosk: [{ kioskKey: [] }],
  upload: [{ bearerAuth: [] }, { uploadTicket: [] }],
  groupToken: [{ groupUploadToken: [] }],
  signature: [{ webhookSignature: [] }],
  fileToken: [{ fileToken: [] }],
};

const CONTENT: Record<string, string> = {
  csv: 'text/csv',
  markdown: 'text/markdown',
  html: 'text/html',
  file: 'application/octet-stream',
};

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ref('ErrorEnvelope') } },
});

function operationId(method: string, path: string): string {
  const words = path
    .split('/')
    .filter(Boolean)
    .map((seg) => (seg.startsWith('{') ? `by-${seg.slice(1, -1)}` : seg))
    .join('-')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return [method.toLowerCase(), ...words.map((w) => w[0].toUpperCase() + w.slice(1))].join('') || method.toLowerCase();
}

function successResponse(op: Op) {
  const description = op.status === 201 ? 'Created' : 'OK';
  if (op.raw) return { description, content: { 'application/json': { schema: op.data ?? {} } } };
  if (op.produces && op.produces !== 'json') {
    return { description, content: { [CONTENT[op.produces]]: { schema: str({ format: op.produces === 'file' ? 'binary' : undefined }) } } };
  }
  const envelope: Schema = obj(
    { success: { type: 'boolean', enum: [true] }, message: str(), ...(op.data ? { data: op.data } : {}) },
    op.data ? ['success', 'data'] : ['success'],
  );
  return { description, content: { 'application/json': { schema: envelope } } };
}

function buildOperation(method: string, path: string, op: Op) {
  const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
  const query = Object.entries(op.query || {}).map(([name, schema]) => ({ name, in: 'query', required: false, schema }));
  const operation: Record<string, any> = {
    operationId: operationId(method, path),
    tags: [op.tag],
    summary: op.summary,
    security: SECURITY[op.auth],
    parameters: [...params, ...query],
    responses: {
      [String(op.status ?? 200)]: successResponse(op),
      400: errorResponse('Invalid request'),
      ...(op.auth !== 'none' ? { 401: errorResponse('Missing or invalid credentials'), 403: errorResponse('Not allowed') } : {}),
      404: errorResponse('Not found'),
      409: errorResponse('Conflicts with the current state'),
    },
  };
  if (op.body) operation.requestBody = { required: true, content: { 'application/json': { schema: op.body } } };
  if (op.multipart) operation.requestBody = { required: true, content: { 'multipart/form-data': { schema: op.multipart } } };
  if (!operation.parameters.length) delete operation.parameters;
  return operation;
}

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [method, path, op] of routes) {
    paths[path] ??= {};
    paths[path][method.toLowerCase()] = buildOperation(method, path, op);
  }
  const tags = [...new Set(routes.map(([, , op]) => op.tag))].map((name) => ({ name }));
  return {
    openapi: '3.1.0',
    info: {
      title: 'PrintLoop API',
      version: '2.0.0',
      description:
        'Multi-tenant campus print marketplace: customer printing, shop console, kiosk agent and PrintLoop backoffice. ' +
        'Every JSON response is an envelope: { success, message?, data? } on success and { success: false, message, code? } on error.',
    },
    servers: [
      { url: 'https://api.printloop.app/api', description: 'production' },
      { url: 'http://localhost:4000/api', description: 'local' },
    ],
    tags,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        kioskKey: { type: 'apiKey', in: 'header', name: 'X-Kiosk-Key' },
        uploadTicket: { type: 'apiKey', in: 'header', name: 'X-Upload-Ticket', description: 'From POST /uploads/ticket; valid only for its upload' },
        groupUploadToken: { type: 'apiKey', in: 'header', name: 'X-Upload-Token' },
        fileToken: { type: 'apiKey', in: 'query', name: 't' },
        webhookSignature: { type: 'apiKey', in: 'header', name: 'x-paystack-signature', description: 'Or x-render-signature for render callbacks' },
        tenantSlug: { type: 'apiKey', in: 'header', name: 'X-Tenant-Slug', description: 'Selects the shop when not resolved from the host' },
      },
      schemas,
    },
    paths,
  };
}

export const openApiSpec = buildOpenApiDocument();
