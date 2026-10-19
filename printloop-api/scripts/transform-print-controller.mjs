import fs from 'node:fs';

const p = new URL(
  '../src/modules/customer/controllers/print.controller.ts',
  import.meta.url,
);
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  /import \{ Router, type Request, type Response \} from 'express';/,
  "import { type Request, type Response, type NextFunction } from 'express';",
);
s = s.replace(/const router = Router\(\);\n/, '');
s = s.replace(/export default router;\s*$/, '');

const replacements = [
  [
    "router.post('/print-jobs', upload.single('file'), async (req: Request, res: Response) => {",
    "  createPrintJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {",
  ],
  [
    "router.post('/print-jobs/batch', upload.array('files', 50), async (req: Request, res: Response) => {",
    "  createPrintJobBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {",
  ],
  [
    "router.get('/print-jobs', async (req: Request, res: Response) => {",
    "  listPrintJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {",
  ],
  [
    "router.get('/print-token', async (req: Request, res: Response) => {",
    "  getPrintToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {",
  ],
  [
    "router.post('/print-token/rotate', async (req: Request, res: Response) => {",
    "  rotatePrintToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {",
  ],
  [
    "router.get('/pricing', async (_req: Request, res: Response) => {",
    "  getPricing = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {",
  ],
  [
    "router.post('/print-jobs/quote', async (req: Request, res: Response) => {",
    "  quotePrintJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {",
  ],
  [
    "router.get('/stations', async (_req: Request, res: Response) => {",
    "  listStations = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {",
  ],
  [
    "router.get('/print-jobs/options', (_req: Request, res: Response) => {",
    "  getPrintJobOptions = (_req: Request, res: Response, _next: NextFunction): void => {",
  ],
  [
    "router.post('/shops/:slug/reviews', async (req: Request, res: Response) => {",
    "  createShopReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {",
  ],
  [
    "router.post('/disputes', async (req: Request, res: Response) => {",
    "  createDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {",
  ],
];
for (const [from, to] of replacements) {
  if (!s.includes(from)) console.warn('missing:', from.slice(0, 70));
  s = s.replace(from, to);
}

s = s.replace(
  /(\}\r?\n\r?\n\/\*\*\r?\n \* POST \/api\/customer\/print-jobs)/,
  '}\n\nexport class CustomerPrintController {\n\n/**\n * POST /api/customer/print-jobs',
);
if (!s.includes('export class CustomerPrintController')) {
  throw new Error('class insert failed');
}

s += '\n}\n\nexport const customerPrintController = new CustomerPrintController();\n';

fs.writeFileSync(p, s);
console.log('ok');
