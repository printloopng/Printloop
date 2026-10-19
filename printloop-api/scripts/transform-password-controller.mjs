import fs from 'node:fs';

const p = new URL(
  '../src/modules/customer/controllers/passwordReset.controller.ts',
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
  "router.post('/forgot-password', async (req: Request, res: Response) => {",
  "  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {",
);
s = s.replace(
  "router.post('/reset-password', async (req: Request, res: Response) => {",
  "  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {",
);
s = s.replace(
  '/** POST /api/auth/forgot-password */',
  'export class PasswordResetController {\n\n/** POST /api/auth/forgot-password */',
);
s += '\n}\n\nexport const passwordResetController = new PasswordResetController();\n';
fs.writeFileSync(p, s);
