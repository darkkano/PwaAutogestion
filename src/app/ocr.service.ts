import { Injectable, signal } from '@angular/core';
import { VisionHit } from './models';
import { decodeStrip, parseOcrText } from './vision';

@Injectable({ providedIn: 'root' })
export class OcrService {
  readonly progress = signal(0);
  readonly status = signal('listo');
  private worker: {
    recognize: (c: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<void>;
  } | null = null;

  async read(canvas: HTMLCanvasElement): Promise<VisionHit> {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const strip = decodeStrip(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (strip) {
        this.status.set('pista on-device');
        this.progress.set(1);
        return {
          amount: strip.a,
          receiptDate: strip.d,
          merchant: strip.m,
          ocrText: `TALON strip ${strip.m} ${strip.d} ${strip.a}`,
          engine: 'strip',
        };
      }
    }
    return this.tesseract(canvas);
  }

  private async tesseract(canvas: HTMLCanvasElement): Promise<VisionHit> {
    this.status.set('Cargando modelo OCR…');
    this.progress.set(0.05);
    try {
      if (!this.worker) {
        const { createWorker } = await import('tesseract.js');
        this.worker = (await createWorker('spa+eng', 1, {
          logger: (m: { status?: string; progress?: number }) => {
            if (m.status) {
              this.status.set(m.status);
            }
            if (typeof m.progress === 'number') {
              this.progress.set(m.progress);
            }
          },
        })) as unknown as {
          recognize: (c: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
          terminate: () => Promise<void>;
        };
      }
      const worker = this.worker;
      if (!worker) {
        throw new Error('worker');
      }
      this.status.set('Leyendo recibo…');
      const { data } = await worker.recognize(canvas);
      const parsed = parseOcrText(data.text || '');
      this.progress.set(1);
      this.status.set('OCR listo');
      return {
        amount: parsed.a,
        receiptDate: parsed.d,
        merchant: parsed.m,
        ocrText: data.text || '',
        engine: 'tesseract',
      };
    } catch (error) {
      this.status.set('OCR no disponible offline (sin modelo). Completa a mano.');
      this.progress.set(0);
      return {
        amount: null,
        receiptDate: null,
        merchant: null,
        ocrText: error instanceof Error ? error.message : 'fail',
        engine: 'manual',
      };
    }
  }
}
