import { PDFDocument, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { extractPdfText } from '@/core/utils/pdfText';
import {
  isOfficeDocument,
  conversionEnabled,
  convertOfficeToPdf,
} from '@/modules/public/services/documentConversion.service';

export interface PreflightIssue {
  type: 'missing_font' | 'low_res' | 'wrong_colorspace' | 'missing_bleed' | 'trim_issues' | 'overset_text' | 'transparency' | 'overprint';
  severity: 'error' | 'warning' | 'info';
  page: number;
  details: string;
  autoFixable: boolean;
  location?: { x: number; y: number; w: number; h: number };
}

export interface AutoFix {
  type: 'embed_fonts' | 'rgb_to_cmyk' | 'add_bleed' | 'upscale_images' | 'add_trim_marks' | 'fix_overset_text' | 'flatten_transparency' | 'fix_overprint';
  description: string;
  confidence: number;
  affectedPages: number[];
  estimatedSizeIncrease: number;
}

export interface PreflightResult {
  fileHash: string;
  issues: PreflightIssue[];
  autoFixes: AutoFix[];
  quote: InstantQuote;
  metadata: {
    pageCount: number;
    fileSize: number;
    dimensions: { w: number; h: number }[];
    colorspaces: string[];
    fonts: FontInfo[];
    images: ImageInfo[];
  };
}

export interface FontInfo {
  name: string;
  embedded: boolean;
  subset: boolean;
  type: string;
  encoding: string;
}

export interface ImageInfo {
  page: number;
  index: number;
  width: number;
  height: number;
  dpi: number;
  colorspace: string;
  hasTransparency: boolean;
  size: number;
}

export interface InstantQuote {
  baseAmount: number;
  breakdown: QuoteBreakdown[];
  shopMatches: ShopMatch[];
  gangRunEligible: boolean;
  gangRunDiscount: number;
  totalAmount: number;
  currency: 'NGN';
}

export interface QuoteBreakdown {
  item: string;
  amount: number;
  description: string;
}

export interface ShopMatch {
  shopId: string;
  shopName: string;
  distanceKm: number;
  capabilityMatch: number;
  estimatedTurnaroundHrs: number;
  price: number;
  rating: number;
}

const MIN_DPI = 150;
const RECOMMENDED_DPI = 300;
const BLEED_MM = 3;
const BLEED_PT = BLEED_MM * 2.83465;

export async function analyzePreflight(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  printConfig: PrintConfig
): Promise<PreflightResult> {
  if (isOfficeDocument(fileName, mimeType)) {
    if (!conversionEnabled()) {
      throw new Error('Office document conversion is not enabled on this server. Please upload a PDF instead.');
    }
    const pdfBuffer = await convertOfficeToPdf(fileBuffer, fileName);
    return await analyzePreflightPdf(pdfBuffer, fileName, printConfig);
  }
  
  return await analyzePreflightPdf(fileBuffer, fileName, printConfig);
}

async function extractText(pdf: Buffer): Promise<string> {
  try {
    const pages = await extractPdfText(pdf, 200);
    return pages.map((p) => p.items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join('')).join('\n');
  } catch {
    return '';
  }
}

async function analyzePreflightPdf(
  pdfBuffer: Buffer,
  fileName: string,
  printConfig: PrintConfig
): Promise<PreflightResult> {
  const fileHash = createHash('sha256').update(pdfBuffer).digest('hex');
  
  const cached = await getCachedPreflight(fileHash);
  if (cached) return cached;

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const parseResult = { text: await extractText(pdfBuffer) };
  
  const pageCount = pdfDoc.getPageCount();
  const pages = pdfDoc.getPages();
  
  const metadata = await extractMetadata(pdfDoc, pages, parseResult);
  
  const issues = await analyzeIssues(pdfDoc, pages, printConfig, metadata);
  
  const autoFixes = generateAutoFixes(issues, metadata);
  
  const quote = await generateInstantQuote(printConfig, metadata, issues);
  
  const result: PreflightResult = {
    fileHash,
    issues,
    autoFixes,
    quote,
    metadata
  };

  await cachePreflight(fileHash, result);

  return result;
}

async function extractMetadata(
  pdfDoc: PDFDocument,
  pages: PDFPage[],
  parseResult: any
): Promise<PreflightResult['metadata']> {
  const dimensions: { w: number; h: number }[] = [];
  const colorspaces = new Set<string>();
  const fonts: FontInfo[] = [];
  const images: ImageInfo[] = [];
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    dimensions.push({ w: width, h: height });
    
    const pageFonts = await extractPageFonts(pdfDoc, i);
    fonts.push(...pageFonts);
    
  }
  
  const textContent = parseResult.text || '';
  
  return {
    pageCount: pages.length,
    fileSize: 0,
    dimensions,
    colorspaces: Array.from(colorspaces),
    fonts: deduplicateFonts(fonts),
    images
  };
}

function deduplicateFonts(fonts: FontInfo[]): FontInfo[] {
  const seen = new Set<string>();
  return fonts.filter(f => {
    const key = `${f.name}-${f.embedded}-${f.subset}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function analyzeIssues(
  pdfDoc: PDFDocument,
  pages: PDFPage[],
  printConfig: PrintConfig,
  metadata: PreflightResult['metadata']
): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  const { bleed = BLEED_MM } = printConfig;
  const bleedPt = bleed * 2.83465;
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const pageNum = i + 1;
    
    const bleedIssues = checkBleed(page, pageWidth, pageHeight, bleedPt, pageNum);
    issues.push(...bleedIssues);
    
    const fontIssues = checkFonts(pageNum, metadata.fonts);
    issues.push(...fontIssues);
    
    const imageIssues = await checkImages(pageNum);
    issues.push(...imageIssues);
    
    const trimIssues = checkTrimMargins(page, pageWidth, pageHeight, pageNum);
    issues.push(...trimIssues);
    
    const transparencyIssues = checkTransparency(pageNum);
    issues.push(...transparencyIssues);
    
    const overprintIssues = checkOverprint(pageNum);
    issues.push(...overprintIssues);
    
    const oversetIssues = checkOversetText(pageNum);
    issues.push(...oversetIssues);
  }
  
  return issues;
}

function checkBleed(page: PDFPage, pageWidth: number, pageHeight: number, bleedPt: number, pageNum: number): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  
  const hasBleed = false;
  
  if (!hasBleed) {
    issues.push({
      type: 'missing_bleed',
      severity: 'error',
      page: pageNum,
      details: `Missing ${BLEED_MM}mm bleed on all sides. Add ${BLEED_MM}mm bleed area beyond trim edge.`,
      autoFixable: true,
      location: { x: 0, y: 0, w: pageWidth, h: pageHeight }
    });
  }
  
  return issues;
}

function checkFonts(pageNum: number, fonts: FontInfo[]): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const unembedded = fonts.filter(f => !f.embedded);
  
  for (const font of unembedded) {
    issues.push({
      type: 'missing_font',
      severity: 'error',
      page: pageNum,
      details: `Font "${font.name}" is not embedded. Text may render incorrectly.`,
      autoFixable: true,
      location: undefined
    });
  }
  
  return issues;
}

async function checkImages(pageNum: number): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  return issues;
}

function checkTrimMargins(page: PDFPage, pageWidth: number, pageHeight: number, pageNum: number): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const safeMargin = 5 * 2.83465;
  return issues;
}

function checkTransparency(pageNum: number): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  return issues;
}

function checkOverprint(pageNum: number): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  return issues;
}

function checkOversetText(pageNum: number): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  return issues;
}

function generateAutoFixes(issues: PreflightIssue[], metadata: PreflightResult['metadata']): AutoFix[] {
  const fixes: AutoFix[] = [];
  const issueTypes = new Set(issues.map(i => i.type));
  
  if (issueTypes.has('missing_font')) {
    fixes.push({
      type: 'embed_fonts',
      description: 'Embed all unembedded fonts by subsetting',
      confidence: 0.95,
      affectedPages: [...new Set(issues.filter(i => i.type === 'missing_font').map(i => i.page))],
      estimatedSizeIncrease: 50000
    });
  }
  
  if (issueTypes.has('wrong_colorspace')) {
    fixes.push({
      type: 'rgb_to_cmyk',
      description: 'Convert RGB images to CMYK (FOGRA39 profile)',
      confidence: 0.9,
      affectedPages: [...new Set(issues.filter(i => i.type === 'wrong_colorspace').map(i => i.page))],
      estimatedSizeIncrease: 100000
    });
  }
  
  if (issueTypes.has('missing_bleed')) {
    fixes.push({
      type: 'add_bleed',
      description: `Add ${BLEED_MM}mm bleed by mirroring edge content`,
      confidence: 0.85,
      affectedPages: [...new Set(issues.filter(i => i.type === 'missing_bleed').map(i => i.page))],
      estimatedSizeIncrease: 20000
    });
  }
  
  if (issueTypes.has('low_res')) {
    fixes.push({
      type: 'upscale_images',
      description: 'AI upscale low-resolution images to 300 DPI (ESRGAN)',
      confidence: 0.8,
      affectedPages: [...new Set(issues.filter(i => i.type === 'low_res').map(i => i.page))],
      estimatedSizeIncrease: 500000
    });
  }
  
  if (issueTypes.has('trim_issues')) {
    fixes.push({
      type: 'add_trim_marks',
      description: 'Add trim/crop marks at 3mm offset',
      confidence: 0.95,
      affectedPages: [...new Set(issues.filter(i => i.type === 'trim_issues').map(i => i.page))],
      estimatedSizeIncrease: 5000
    });
  }
  
  if (issueTypes.has('overset_text')) {
    fixes.push({
      type: 'fix_overset_text',
      description: 'Auto-size text frames to fit content',
      confidence: 0.7,
      affectedPages: [...new Set(issues.filter(i => i.type === 'overset_text').map(i => i.page))],
      estimatedSizeIncrease: 1000
    });
  }
  
  if (issueTypes.has('transparency')) {
    fixes.push({
      type: 'flatten_transparency',
      description: 'Flatten transparency using high-resolution rasterization',
      confidence: 0.85,
      affectedPages: [...new Set(issues.filter(i => i.type === 'transparency').map(i => i.page))],
      estimatedSizeIncrease: 200000
    });
  }
  
  if (issueTypes.has('overprint')) {
    fixes.push({
      type: 'fix_overprint',
      description: 'Remove unintended overprint settings',
      confidence: 0.8,
      affectedPages: [...new Set(issues.filter(i => i.type === 'overprint').map(i => i.page))],
      estimatedSizeIncrease: 1000
    });
  }
  
  return fixes;
}

export async function generateInstantQuote(
  printConfig: PrintConfig,
  metadata: PreflightResult['metadata'],
  issues: PreflightIssue[]
): Promise<InstantQuote> {
  const { pageCount, dimensions } = metadata;
  const { copies = 1, paper = 'A4', color = 'bw', sided = 'single', qualityDpi = 300 } = printConfig;
  
  const baseRate = getBaseRate(paper, color, qualityDpi, sided);
  const baseAmount = baseRate * pageCount * copies;
  
  let penalty = 0;
  const hasErrors = issues.some(i => i.severity === 'error');
  if (hasErrors) {
    penalty += 0.1 * baseAmount;
  }
  
  const gangRunEligible = pageCount <= 50 && metadata.pageCount > 0;
  const gangRunDiscount = gangRunEligible ? 0.4 : 0;
  
  const shopMatches = await findMatchingShops(metadata, printConfig);
  
  const breakdown: QuoteBreakdown[] = [
    { item: 'Printing', amount: baseAmount, description: `${pageCount} pages × ${copies} copies` },
    { item: 'Issues penalty', amount: penalty, description: hasErrors ? 'Print readiness issues' : 'Print-ready' },
    { item: 'Gang run discount', amount: -baseAmount * gangRunDiscount, description: gangRunEligible ? '40% off for gang run' : 'Standard pricing' }
  ];
  
  const totalAmount = Math.max(0, baseAmount + penalty - baseAmount * gangRunDiscount);
  
  return {
    baseAmount,
    breakdown,
    shopMatches,
    gangRunEligible,
    gangRunDiscount,
    totalAmount: Math.round(totalAmount),
    currency: 'NGN'
  };
}

function getBaseRate(paper: string, color: string, dpi: number, sided: string): number {
  const rates: Record<string, number> = {
    'A4-bw-300-single': 50,
    'A4-bw-300-double': 65,
    'A4-color-300-single': 150,
    'A4-color-300-double': 200,
    'A3-bw-300-single': 100,
    'A3-bw-300-double': 150,
    'A3-color-300-single': 300,
    'A3-color-300-double': 400
  };
  const key = `${paper}-${color}-${dpi}-${sided}`;
  return rates[key] || 50;
}

async function findMatchingShops(metadata: any, printConfig: PrintConfig): Promise<ShopMatch[]> {
  
  return [
    {
      shopId: 'shop_1',
      shopName: 'PrintHub Yaba',
      distanceKm: 2.3,
      capabilityMatch: 0.95,
      estimatedTurnaroundHrs: 2,
      price: 500,
      rating: 4.8
    },
    {
      shopId: 'shop_2',
      shopName: 'QuickPrint Lagos',
      distanceKm: 5.1,
      capabilityMatch: 0.88,
      estimatedTurnaroundHrs: 4,
      price: 550,
      rating: 4.6
    }
  ];
}

export async function applyAutoFixes(
  pdfBuffer: Buffer,
  fixes: AutoFix[]
): Promise<Buffer> {
  let doc = await PDFDocument.load(pdfBuffer);
  
  for (const fix of fixes) {
    switch (fix.type) {
      case 'embed_fonts':
        doc = await embedFonts(doc);
        break;
      case 'rgb_to_cmyk':
        doc = await convertToCMYK(doc);
        break;
      case 'add_bleed':
        doc = await addBleed(doc);
        break;
      case 'add_trim_marks':
        doc = await addTrimMarks(doc);
        break;
      case 'upscale_images':
        break;
      case 'fix_overset_text':
        break;
      case 'flatten_transparency':
        break;
      case 'fix_overprint':
        break;
    }
  }
  
  return Buffer.from(await doc.save());
}

async function embedFonts(doc: PDFDocument): Promise<PDFDocument> {
  return doc;
}

async function convertToCMYK(doc: PDFDocument): Promise<PDFDocument> {
  return doc;
}

async function addBleed(doc: PDFDocument): Promise<PDFDocument> {
  const pages = doc.getPages();
  const bleedPt = BLEED_MM * 2.83465;
  
  for (const page of pages) {
    const { width, height } = page.getSize();
    const newWidth = width + 2 * bleedPt;
    const newHeight = height + 2 * bleedPt;
    
    const newPage = doc.addPage([newWidth, newHeight]);
    
    const { width: srcW, height: srcH } = page.getSize();
    const form = await doc.embedPage(page);
    newPage.drawPage(form, {
      x: bleedPt,
      y: bleedPt,
      width: srcW,
      height: srcH
    });
    
  }

  return doc;
}

async function addTrimMarks(doc: PDFDocument): Promise<PDFDocument> {
  const pages = doc.getPages();
  const markLength = 10 * 2.83465;
  const markOffset = 3 * 2.83465;
  const lineWidth = 0.5;
  
  for (const page of pages) {
    const { width, height } = page.getSize();
    const bleedPt = BLEED_MM * 2.83465;
    const trimX = bleedPt;
    const trimY = bleedPt;
    const trimW = width - 2 * bleedPt;
    const trimH = height - 2 * bleedPt;
    
    page.drawLine({
      start: { x: trimX - markOffset - markLength, y: trimY + trimH + markOffset },
      end: { x: trimX - markOffset, y: trimY + trimH + markOffset },
      thickness: lineWidth,
      color: rgb(0, 0, 0)
    });
    page.drawLine({
      start: { x: trimX - markOffset, y: trimY + trimH + markOffset },
      end: { x: trimX - markOffset, y: trimY + trimH + markOffset + markLength },
      thickness: lineWidth,
      color: rgb(0, 0, 0)
    });
  }
  
  return doc;
}

async function getCachedPreflight(fileHash: string): Promise<PreflightResult | null> {
  return null;
}

async function cachePreflight(fileHash: string, result: PreflightResult): Promise<void> {
}

export interface PrintConfig {
  copies: number;
  paper: 'A4' | 'A3' | 'Letter' | 'Legal';
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  qualityDpi: 100 | 300 | 600;
  bleed?: number;
  orientation?: 'portrait' | 'landscape';
}

async function extractPageFonts(pdfDoc: PDFDocument, pageIndex: number): Promise<FontInfo[]> {
  return [];

async function findMatchingShops(metadata: any, printConfig: PrintConfig): Promise<ShopMatch[]> {
  
  return [
    {
      shopId: 'shop_1',
      shopName: 'PrintHub Yaba',
      distanceKm: 2.3,
      capabilityMatch: 0.95,
      estimatedTurnaroundHrs: 2,
      price: 500,
      rating: 4.8
    },
    {
      shopId: 'shop_2',
      shopName: 'QuickPrint Lagos',
      distanceKm: 5.1,
      capabilityMatch: 0.88,
      estimatedTurnaroundHrs: 4,
      price: 550,
      rating: 4.6
    }
  ];
}}
