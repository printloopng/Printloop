import fs from 'node:fs';

const p = new URL(
  '../src/modules/public/controllers/discovery.controller.ts',
  import.meta.url,
);
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  /import \{ Router, type Request, type Response \} from 'express';/,
  "import { type Request, type Response, type NextFunction } from 'express';",
);
s = s.replace(/const router = Router\(\);\n/, '');
s = s.replace(/export default router;\s*[\s\S]*$/m, '');

const reps = [
  ["router.get('/shops/nearby', async (req: Request, res: Response) => {", "  shopsNearby = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.get('/shops', async (req: Request, res: Response) => {", "  listShops = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.get('/shops/:slug/reviews', async (req: Request, res: Response) => {", "  shopReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.get('/shops/:slug', async (req: Request, res: Response) => {", "  shopBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.post('/handoff', async (req: Request, res: Response) => {", "  createHandoff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.get('/handoff/verify', async (req: Request, res: Response) => {", "  verifyHandoff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
  ["router.post('/shops/seed-demo-nearby', async (req: Request, res: Response) => {", "  seedDemoNearby = async (req: Request, res: Response, next: NextFunction): Promise<void> => {"],
];
for (const [a, b] of reps) s = s.replace(a, b);

s = s.replace(
  /(\}\r?\n\r?\n\/\*\* Parse \+ clamp)/,
  '}\n\nexport class DiscoveryController {\n\n/** Parse + clamp',
);
if (!s.includes('export class DiscoveryController')) {
  s = s.replace('/** GET /api/discovery/shops/nearby */', 'export class DiscoveryController {\n\n/** GET /api/discovery/shops/nearby */');
}
s += '\n}\n\nexport const discoveryController = new DiscoveryController();\n';
fs.writeFileSync(p, s);
console.log('discovery ok');
