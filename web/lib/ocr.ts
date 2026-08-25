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

export async function recognizeBill(
  file: File,
  langs: string,
  onProgress?: (msg: OcrProgress) => void
): Promise<string> {
  const canvas = await resizeImage(file, 1600);

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
