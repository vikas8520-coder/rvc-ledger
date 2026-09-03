'use client';

/**
 * PaddleOCR-based bill extraction.
 *
 * Uses ppu-paddle-ocr (PP-OCRv6) which runs entirely in the browser
 * via ONNX Runtime Web. Supports English, Telugu, Hindi, Tamil, and
 * 50+ other languages — much better than Tesseract.js for Indian
 * language bills.
 *
 * Accepts all formats: images (jpg, png, webp, gif, bmp, heic, etc.)
 * and PDFs (multi-page). PDFs are rendered to canvases via pdf.js
 * before OCR runs.
 *
 * No API key, no server, no Gemini — completely free and private.
 */

export interface OcrLine {
  text: string;
  score: number;
  bbox: [number, number, number, number]; // [x, y, w, h]
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
  source: 'paddleocr';
}

export interface PaddleProgress {
  status: string;
  progress: number;
}

let serviceInstance: any = null;
let initPromise: Promise<any> | null = null;

/**
 * Initialize PaddleOCR service (lazy, singleton).
 * Downloads ~6MB model on first use, cached afterwards.
 */
async function getService(onProgress?: (p: PaddleProgress) => void): Promise<any> {
  if (serviceInstance) return serviceInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    onProgress?.({ status: 'loading_model', progress: 0 });
    const { PaddleOcrService } = await import('ppu-paddle-ocr/web');
    const service = new PaddleOcrService();
    await service.initialize();
    onProgress?.({ status: 'model_ready', progress: 1 });
    serviceInstance = service;
    return service;
  })();

  return initPromise;
}

// ── File type detection ──────────────────────────────────────────────

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?|svg)$/i.test(file.name);
}

// ── PDF → canvases (via pdf.js) ──────────────────────────────────────

/**
 * Render a PDF file to a list of canvases (one per page).
 * Uses pdf.js (pdfjs-dist) loaded dynamically.
 */
async function pdfToCanvases(
  file: File,
  onProgress?: (p: PaddleProgress) => void,
  maxPages = 10,
): Promise<HTMLCanvasElement[]> {
  onProgress?.({ status: 'loading_pdf', progress: 0 });

  // Dynamic import pdf.js with worker
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  // Use the CDN worker that matches the installed version
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const numPages = Math.min(pdf.numPages, maxPages);
  const canvases: HTMLCanvasElement[] = [];

  for (let i = 1; i <= numPages; i++) {
    onProgress?.({ status: 'rendering_pdf', progress: i / numPages });
    const page = await pdf.getPage(i);
    // Render at 2x for better OCR accuracy
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    canvases.push(canvas);
  }

  onProgress?.({ status: 'pdf_rendered', progress: 1 });
  return canvases;
}

// ── Image → canvas ───────────────────────────────────────────────────

async function imageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  const canvas = document.createElement('canvas');
  // Downscale large images for faster processing
  const maxDim = 1600;
  let w = img.width;
  let h = img.height;
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

// ── OCR on canvas ────────────────────────────────────────────────────

async function recognizeCanvas(
  service: any,
  canvas: HTMLCanvasElement,
): Promise<{ lines: OcrLine[]; text: string }> {
  const result = await service.recognize(canvas);
  const lines: OcrLine[] = (result.lines || []).map((l: any) => ({
    text: l.text || '',
    score: l.score || 0,
    bbox: l.bbox || [0, 0, 0, 0],
  }));
  const fullText = lines.map((l) => l.text).join('\n');
  return { lines, text: fullText };
}

// ── Main recognize function ──────────────────────────────────────────

/**
 * Recognize text in an image or PDF using PaddleOCR (PP-OCRv6).
 * Accepts: jpg, png, webp, gif, bmp, heic, heif, avif, tiff, pdf
 * For PDFs, all pages are rendered and OCR'd (up to 10 pages).
 * Returns all text lines with bounding boxes and confidence scores.
 */
export async function recognizeWithPaddle(
  file: File,
  onProgress?: (p: PaddleProgress) => void,
): Promise<OcrResult> {
  const service = await getService(onProgress);

  // PDF: render pages to canvases, then OCR each
  if (isPdf(file)) {
    const canvases = await pdfToCanvases(file, onProgress);
    if (canvases.length === 0) {
      return { text: '', lines: [], source: 'paddleocr' };
    }

    onProgress?.({ status: 'recognizing', progress: 0 });
    const allLines: OcrLine[] = [];
    const allText: string[] = [];
    for (let i = 0; i < canvases.length; i++) {
      onProgress?.({ status: 'recognizing', progress: (i / canvases.length) * 0.9 });
      const { lines, text } = await recognizeCanvas(service, canvases[i]);
      allLines.push(...lines);
      if (text) allText.push(text);
    }

    onProgress?.({ status: 'done', progress: 1 });
    return {
      text: allText.join('\n\n'),
      lines: allLines,
      source: 'paddleocr',
    };
  }

  // Image: convert to canvas, then OCR
  if (isImage(file)) {
    onProgress?.({ status: 'recognizing', progress: 0 });
    const canvas = await imageToCanvas(file);
    const { lines, text } = await recognizeCanvas(service, canvas);
    onProgress?.({ status: 'done', progress: 1 });
    return { text, lines, source: 'paddleocr' };
  }

  // Unknown format — try as image anyway
  onProgress?.({ status: 'recognizing', progress: 0 });
  const canvas = await imageToCanvas(file);
  const { lines, text } = await recognizeCanvas(service, canvas);
  onProgress?.({ status: 'done', progress: 1 });
  return { text, lines, source: 'paddleocr' };
}

/**
 * Check if PaddleOCR is available (model loaded).
 */
export function isPaddleReady(): boolean {
  return serviceInstance !== null;
}

/**
 * Check if a file type is supported (image or PDF).
 */
export function isSupportedFile(file: File): boolean {
  return isImage(file) || isPdf(file);
}

// ── Direct PDF text extraction (for generated PDFs) ──────────────────

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;  // PDF coordinates (origin bottom-left)
  width: number;
  height: number;
  page: number;
  pageWidth: number;
  pageHeight: number;
}

export interface PdfTextResult {
  items: PdfTextItem[];
  text: string;
  hasText: boolean;
}

/**
 * Try to extract text directly from a PDF (without OCR).
 * Works for generated PDFs that have embedded text.
 * Returns text items with position info for layout-aware parsing.
 * If the PDF has no extractable text (scanned), hasText will be false.
 */
export async function extractPdfTextDirect(file: File): Promise<PdfTextResult> {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const numPages = Math.min(pdf.numPages, 10);
  const items: PdfTextItem[] = [];
  const textParts: string[] = [];

  for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await (page as any).getTextContent();

    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      items.push({
        text: item.str.trim(),
        x: transform[4],
        y: transform[5],
        width: item.width || 0,
        height: item.height || 0,
        page: p,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      });
    }
    // Also build plain text for fallback
    const pageText = items
      .filter((i) => i.page === p)
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((i) => i.text)
      .join(' ');
    textParts.push(pageText);
  }

  const text = textParts.join('\n\n');
  return { items, text, hasText: items.length > 0 };
}
