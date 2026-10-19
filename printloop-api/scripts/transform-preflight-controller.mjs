import fs from 'node:fs';

const p = new URL(
  '../src/modules/customer/controllers/preflight.controller.ts',
  import.meta.url,
);
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  /import \{ Router, type Request, type Response \} from 'express';/,
  "import { type Request, type Response, type NextFunction } from 'express';",
);
s = s.replace(/const router = Router\(\);\n/, '');
s = s.replace(/export default router;\s*$/, '');
const reps = [
  ["router.post('/analyze', optionalTenant, upload.single('file'), async (req: Request, res: Response) => {", "  analyze = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.post('/fix', optionalTenant, upload.single('file'), async (req: Request, res: Response) => {", "  fix = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.post('/quote', optionalTenant, async (req: Request, res: Response) => {", "  quote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.get('/capabilities', (req: Request, res: Response) => {", "  capabilities = (_req: Request, res: Response, _next: NextFunction): void => {"],
  ["router.post('/apply-fix', optionalTenant, upload.single('file'), async (req: Request, res: Response) => {", "  applyFix = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
];
for (const [a, b] of reps) s = s.replace(a, b);
s = s.replace(
  '/**\n * POST /api/preflight/analyze',
  'export class PreflightController {\n\n/**\n * POST /api/preflight/analyze',
);
s += '\n}\n\nexport const preflightController = new PreflightController();\n';
s += '\nexport const preflightUpload = upload;\n';
fs.writeFileSync(p, s);
