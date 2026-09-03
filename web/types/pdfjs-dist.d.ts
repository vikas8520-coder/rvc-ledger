declare module 'pdfjs-dist/build/pdf.mjs' {
  export const version: string;
  export interface GlobalWorkerOptionsType {
    workerSrc: string;
  }
  export const GlobalWorkerOptions: GlobalWorkerOptionsType;
  export interface Viewport {
    width: number;
    height: number;
  }
  export interface PageRenderParams {
    canvasContext: CanvasRenderingContext2D;
    viewport: Viewport;
  }
  export interface PdfPage {
    getViewport(opts: { scale: number }): Viewport;
    render(params: PageRenderParams): { promise: Promise<void> };
  }
  export interface PdfDocument {
    numPages: number;
    getPage(n: number): Promise<PdfPage>;
  }
  export interface GetDocumentParams {
    data: ArrayBuffer | Uint8Array;
  }
  export interface PdfDocumentProxy {
    promise: Promise<PdfDocument>;
  }
  export function getDocument(params: GetDocumentParams): PdfDocumentProxy;
}
