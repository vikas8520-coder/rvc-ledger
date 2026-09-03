'use client';

/**
 * PaddleOCR-based bill extraction.
 *
 * Uses ppu-paddle-ocr (PP-OCRv6) which runs entirely in the browser
 * via ONNX Runtime Web. Supports English, Telugu, Hindi, Tamil, and
 * 50+ other languages — much better than Tesseract.js for Indian
 * language bills.
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

/**
 * Recognize text in an image using PaddleOCR (PP-OCRv6).
 * Returns all text lines with bounding boxes and confidence scores.
 */
export async function recognizeWithPaddle(
  file: File,
  onProgress?: (p: PaddleProgress) => void,
): Promise<OcrResult> {
  const service = await getService(onProgress);

  onProgress?.({ status: 'recognizing', progress: 0 });

  // Convert File to canvas for PaddleOCR
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  URL.revokeObjectURL(url);

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

  const result = await service.recognize(canvas);
  onProgress?.({ status: 'done', progress: 1 });

  // ppu-paddle-ocr returns { text, lines: [{ text, score, bbox }] }
  const lines: OcrLine[] = (result.lines || []).map((l: any) => ({
    text: l.text || '',
    score: l.score || 0,
    bbox: l.bbox || [0, 0, 0, 0],
  }));

  const fullText = lines.map((l) => l.text).join('\n');

  return { text: fullText, lines, source: 'paddleocr' };
}

/**
 * Check if PaddleOCR is available (model loaded).
 */
export function isPaddleReady(): boolean {
  return serviceInstance !== null;
}
