import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpenApiDocument } from '@/modules/platform/openapi/document';

const out = resolve(process.argv[2] ?? 'openapi.json');
writeFileSync(out, JSON.stringify(buildOpenApiDocument(), null, 2) + '\n');
console.log(`OpenAPI written to ${out}`);
