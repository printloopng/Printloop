import fs from 'node:fs';

const p = new URL(
  '../src/modules/customer/controllers/print.controller.ts',
  import.meta.url,
);
let s = fs.readFileSync(p, 'utf8');
const reps = [
  ["from '../config/database'", "from '@/config/data-source'"],
  ["from '../entities/", "from '@/database/entities/"],
  ["from '../utils/fileStore'", "from '@/core/utils/fileStore'"],
  ["from '../utils/limits'", "from '@/core/utils/limits'"],
  ["from '../services/documentConvert.service'", "from '@/modules/public/services/documentConvert.service'"],
  ["from '../services/documentConversion.service'", "from '@/modules/public/services/documentConversion.service'"],
  ["from '../services/promotion.service'", "from '@/modules/customer/services/promotion.service'"],
  ["from '../services/pricing.service'", "from '@/modules/public/services/pricing.service'"],
  ["from '../services/abuseLimits.service'", "from '@/modules/customer/services/abuseLimits.service'"],
];
for (const [a, b] of reps) s = s.split(a).join(b);
fs.writeFileSync(p, s);
console.log('imports ported');
