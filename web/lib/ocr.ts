'use client';

import { createWorker, LoggerMessage } from 'tesseract.js';

export interface OcrProgress {
  status: string;
  progress: number;
}

export async function resizeImage(file: File, maxWidth = 1600): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Preprocess image for better OCR results:
 * - Grayscale conversion
 * - Contrast enhancement
 * - Adaptive thresholding (binarization)
 * - Sharpening
 * - Upscaling for small images
 */
export async function preprocessForOcr(file: File, maxWidth = 1600): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let width = img.width;
      let height = img.height;

      // Upscale small images for better OCR
      if (width < 1000) {
        const scale = 1000 / width;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // Cap at maxWidth
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // Get image data for processing
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // Step 1: Convert to grayscale
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }

      // Step 2: Build histogram for contrast stretching
      const hist = new Array(256).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        hist[data[i]]++;
      }

      // Find 2nd and 98th percentile for robust contrast stretching
      const totalPixels = width * height;
      let lowCut = totalPixels * 0.02;
      let highCut = totalPixels * 0.98;
      let low = 0, high = 255;
      let cumSum = 0;
      for (let i = 0; i < 256; i++) {
        cumSum += hist[i];
        if (cumSum <= lowCut) low = i;
        if (cumSum <= highCut) high = i;
      }
      if (high <= low) { high = 255; low = 0; }

      // Step 3: Contrast stretch
      const range = high - low || 1;
      for (let i = 0; i < data.length; i += 4) {
        const val = Math.max(0, Math.min(255, ((data[i] - low) / range) * 255));
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }

      // Step 4: Adaptive thresholding (local mean)
      // Use a simple tile-based approach for speed
      const tileSize = 32;
      for (let ty = 0; ty < height; ty += tileSize) {
        for (let tx = 0; tx < width; tx += tileSize) {
          // Calculate local mean
          let sum = 0, count = 0;
          const yEnd = Math.min(ty + tileSize, height);
          const xEnd = Math.min(tx + tileSize, width);
          for (let y = ty; y < yEnd; y++) {
            for (let x = tx; x < xEnd; x++) {
              const idx = (y * width + x) * 4;
              sum += data[idx];
              count++;
            }
          }
          const mean = sum / count;
          // Apply threshold with bias
          const threshold = mean - 10;
          for (let y = ty; y < yEnd; y++) {
            for (let x = tx; x < xEnd; x++) {
              const idx = (y * width + x) * 4;
              const val = data[idx] > threshold ? 255 : 0;
              data[idx] = val;
              data[idx + 1] = val;
              data[idx + 2] = val;
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function recognizeBill(
  file: File,
  langs: string,
  onProgress?: (msg: OcrProgress) => void
): Promise<string> {
  const canvas = await preprocessForOcr(file, 1600);

  const worker = await createWorker(langs, 1, {
    langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
    logger: (m: LoggerMessage) => {
      if (onProgress) {
        onProgress({ status: m.status, progress: typeof m.progress === 'number' ? m.progress : 0 });
      }
    },
    errorHandler: (e) => console.error(e),
  });

  const ret = await worker.recognize(canvas);
  const text = ret.data.text;
  await worker.terminate();
  return text;
}

// ============================================================
// SMART OCR ROUTING — printed vs handwritten detection
// ============================================================
// Strategy: Run Tesseract first (free, local). If it produces
// readable text with numbers and enough meaningful characters,
// the bill is printed — use the Tesseract result.
// If Tesseract returns garbage/empty/too few characters, the
// bill is likely handwritten — fall back to Gemini API.
//
// This saves API costs: printed bills (the easy majority) are
// processed for free. Only handwritten bills use paid AI.
// ============================================================

export type OcrSource = 'tesseract' | 'gemini';

export interface OcrResult {
  text: string;
  source: OcrSource;
  tesseractText?: string;
}

export interface SmartOcrProgress {
  status: string;
  progress: number;
  source?: OcrSource;
}

/**
 * Analyze Tesseract output to decide if it's good enough
 * or if we need to fall back to Gemini.
 *
 * Heuristics for "good enough" (printed bill):
 * - At least 20 characters of meaningful text
 * - Contains at least 2 digits (bills have amounts/quantities)
 * - Not mostly garbage (ratio of alphanumeric to total > 0.4)
 * - Has at least 2 lines of meaningful content
 *
 * Heuristics for "needs Gemini" (handwritten):
 * - Empty or very short text (< 15 chars)
 * - No digits found (bills always have numbers)
 * - Mostly special characters / garbage
 * - Very few alphanumeric characters
 */
function isTesseractResultGoodEnough(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 15) return false;

  // Count meaningful characters
  const alphanumeric = (trimmed.match(/[a-zA-Z0-9\u0c00-\u0c7f\u0900-\u097f]/g) || []).length;
  const totalChars = trimmed.replace(/\s/g, '').length;
  if (totalChars === 0) return false;

  const alphaRatio = alphanumeric / totalChars;
  if (alphaRatio < 0.4) return false;

  // Bills must have numbers (amounts, quantities, rates)
  const digits = (trimmed.match(/\d/g) || []).length;
  if (digits < 2) return false;

  // Should have at least 2 lines of content (not just one word)
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 2);
  if (lines.length < 2) return false;

  return true;
}

/**
 * Convert a File to base64 for sending to the Gemini API.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Call the server-side Gemini OCR API route.
 */
async function recognizeWithGemini(file: File): Promise<string> {
  const imageBase64 = await fileToBase64(file);
  const mimeType = file.type || 'image/jpeg';

  const response = await fetch('/api/ocr/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Gemini OCR failed: ${response.status}`);
  }

  const data = await response.json();
  return data.text || '';
}

/**
 * Smart OCR: try Tesseract first (free), fall back to Gemini (paid)
 * only if Tesseract can't read the image (likely handwritten).
 *
 * This automatically distinguishes printed bills (handled locally,
 * no API cost) from handwritten bills (sent to Gemini AI).
 */
export async function smartRecognizeBill(
  file: File,
  langs: string,
  onProgress?: (msg: SmartOcrProgress) => void
): Promise<OcrResult> {
  // Step 1: Try Tesseract (free, local)
  onProgress?.({ status: 'local_ocr', progress: 0, source: 'tesseract' });

  const tesseractText = await recognizeBill(file, langs, (m) => {
    onProgress?.({ status: m.status, progress: m.progress, source: 'tesseract' });
  });

  // Step 2: Check if Tesseract result is good enough
  if (isTesseractResultGoodEnough(tesseractText)) {
    onProgress?.({ status: 'done', progress: 1, source: 'tesseract' });
    return { text: tesseractText, source: 'tesseract', tesseractText };
  }

  // Step 3: Tesseract failed — this is likely handwritten.
  // Fall back to Gemini API (paid, but handles handwriting).
  onProgress?.({ status: 'ai_ocr', progress: 0, source: 'gemini' });

  try {
    const geminiText = await recognizeWithGemini(file);
    onProgress?.({ status: 'done', progress: 1, source: 'gemini' });

    // If Gemini also returns nothing, give back the Tesseract text
    // (something is better than nothing for manual review)
    if (!geminiText || geminiText.trim() === '' || geminiText.includes('[NO TEXT FOUND]')) {
      return { text: tesseractText, source: 'tesseract', tesseractText };
    }

    return { text: geminiText, source: 'gemini', tesseractText };
  } catch (err) {
    console.error('Gemini OCR fallback failed:', err);
    // Return Tesseract result as last resort — user can correct manually
    onProgress?.({ status: 'ai_ocr_failed', progress: 1, source: 'gemini' });
    return { text: tesseractText, source: 'tesseract', tesseractText };
  }
}
