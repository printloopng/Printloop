import fs from 'node:fs';

const p = new URL(
  '../src/modules/public/controllers/legal.controller.ts',
  import.meta.url,
);
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  /import \{ Router, type Request, type Response \} from 'express';/,
  "import { type Request, type Response, type NextFunction } from 'express';",
);
s = s.replace(/const router = Router\(\);\n/, '');
s = s.replace(/export default router;\s*$/, '');
s = s.replace(
  "router.get('/dpa', async (req: Request, res: Response) => {",
  "  getDpa = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {",
);
s = s.replace(
  "router.get('/terms', async (req: Request, res: Response) => {",
  "  getTerms = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {",
);
s = s.replace(
  "router.get('/privacy', async (req: Request, res: Response) => {",
  "  getPrivacy = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {",
);
s = s.replace(
  '/**\n * GET /api/legal/dpa',
  'export class PublicLegalController {\n\n/**\n * GET /api/legal/dpa',
);
s += '\n}\n\nexport const publicLegalController = new PublicLegalController();\n';
fs.writeFileSync(p, s);
console.log('legal ok');
