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
