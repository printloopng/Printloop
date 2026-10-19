import fs from 'node:fs';

const p = new URL(
  '../src/modules/platform/controllers/platform.controller.ts',
  import.meta.url,
);
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  /import \{ Request, Response, Router \} from 'express';/,
  "import { Request, Response, NextFunction } from 'express';",
);
s = s.replace(/const router = Router\(\);\n[\s\S]*?router\.use\(authenticate, requirePlatformAdmin\);\n\n/, '');
s = s.replace(/export default router;\s*$/, '');

const reps = [
  ["router.get('/tenants', async (req: Request, res: Response) => {", "  listTenants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.get('/tenants/:id', async (req: Request, res: Response) => {", "  getTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.post('/tenants/:id/suspend', async (req: Request, res: Response) => {", "  suspendTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.post('/tenants/:id/reactivate', async (req: Request, res: Response) => {", "  reactivateTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.post('/tenants/:id/impersonate', async (req: Request, res: Response) => {", "  impersonateTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.delete('/tenants/:id', async (req: Request, res: Response) => {", "  deleteTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.get('/reliability', async (req: Request, res: Response) => {", "  reliability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
];
for (const [a, b] of reps) s = s.replace(a, b);

s = s.replace(
  '/** GET /api/platform/tenants */',
  'export class PlatformController {\n\n/** GET /api/platform/tenants */',
);
s += '\n}\n\nexport const platformController = new PlatformController();\n';
fs.writeFileSync(p, s);
console.log('platform ok');
