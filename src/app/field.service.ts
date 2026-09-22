import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { idbAll, idbPut } from './idb';
import { Receipt } from './models';
import { OcrService } from './ocr.service';
import { canvasToJpeg, drawDemoReceipt, fileToCanvas, thumbOf } from './vision';

@Injectable({ providedIn: 'root' })
export class FieldService {
  private readonly http = inject(HttpClient);
  private readonly ocr = inject(OcrService);
  readonly items = signal<Receipt[]>([]);
  readonly forcedOffline = signal(false);
  readonly online = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);
  readonly syncing = signal(false);
  readonly swReady = signal(false);
  readonly lastError = signal<string | null>(null);
  readonly ocrStatus = this.ocr.status;
  readonly ocrProgress = this.ocr.progress;

  readonly pending = computed(() => this.items().filter((row) => row.sync !== 'ok').length);
  readonly live = computed(() => this.online() && !this.forcedOffline());

  async boot() {
    this.items.set(await idbAll<Receipt>());
    window.addEventListener('online', () => {
      this.online.set(true);
      void this.flush();
    });
    window.addEventListener('offline', () => this.online.set(false));
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.flush();
      }
    });
    navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'talon-sync') {
        void this.flush();
      }
    });
    await this.registerSw();
    window.setInterval(() => void this.flush(), 8000);
    void this.flush();
  }

  toggleOffline() {
    this.forcedOffline.update((value) => !value);
    if (this.live()) {
      void this.flush();
    }
  }

  private async registerSw() {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      this.swReady.set(true);
      type SyncReg = ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };
      await (reg as SyncReg).sync?.register('talon-sync');
    } catch {
      this.swReady.set(false);
    }
  }

  async captureFile(file: File) {
    const canvas = await fileToCanvas(file);
    await this.ingest(canvas, 'camera');
  }

  async captureDemo() {
    const canvas = document.createElement('canvas');
    const amount = Number((12 + Math.random() * 980).toFixed(2));
    const now = new Date();
    const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const merchants = ['Bodega Lima', 'Farmacia Sur', 'Taller Rivas', 'Kiosko 9', 'Mercado Central'];
    drawDemoReceipt(canvas, {
      a: amount,
      d: date,
      m: merchants[Math.floor(Math.random() * merchants.length)],
    });
    await this.ingest(canvas, 'demo');
  }

  private async ingest(canvas: HTMLCanvasElement, source: Receipt['source']) {
    const imageB64 = await canvasToJpeg(canvas);
    const row: Receipt = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      amount: null,
      currency: 'USD',
      receiptDate: null,
      merchant: null,
      ocrText: '',
      ocrStatus: 'running',
      sync: 'pending',
      thumb: thumbOf(canvas),
      imageB64,
      imageMime: 'image/jpeg',
      source,
    };
    await this.save(row);
    try {
      const hit = await this.ocr.read(canvas);
      row.amount = hit.amount;
      row.receiptDate = hit.receiptDate;
      row.merchant = hit.merchant;
      row.ocrText = hit.ocrText;
      row.ocrStatus = 'done';
    } catch {
      row.ocrStatus = 'fail';
    }
    await this.save(row);
    void this.flush();
  }

  async patch(id: string, patch: Partial<Receipt>) {
    const current = this.items().find((row) => row.id === id);
    if (!current) {
      return;
    }
    await this.save({ ...current, ...patch, sync: 'pending' });
    void this.flush();
  }

  private async save(row: Receipt) {
    await idbPut(row);
    this.items.update((list) => {
      const rest = list.filter((item) => item.id !== row.id);
      return [row, ...rest].sort((a, b) => b.createdAt - a.createdAt);
    });
  }

  async flush() {
    if (!this.live() || this.syncing()) {
      return;
    }
    const queue = this.items().filter((row) => row.sync !== 'ok');
    if (!queue.length) {
      return;
    }
    this.syncing.set(true);
    this.lastError.set(null);
    try {
      for (const row of queue) {
        await this.save({ ...row, sync: 'syncing' });
        await firstValueFrom(
          this.http.post('/api/receipts', {
            id: row.id,
            capturedAt: row.createdAt,
            amount: row.amount,
            currency: row.currency,
            receiptDate: row.receiptDate,
            merchant: row.merchant,
            ocrText: row.ocrText,
            imageMime: row.imageMime,
            imageB64: row.imageB64,
          }),
        );
        await this.save({ ...row, sync: 'ok' });
      }
    } catch (error) {
      this.lastError.set(error instanceof Error ? error.message : 'sync fail');
      const failed = this.items().map((row) =>
        row.sync === 'syncing' ? { ...row, sync: 'error' as const } : row,
      );
      for (const row of failed) {
        await idbPut(row);
      }
      this.items.set(failed);
    } finally {
      this.syncing.set(false);
    }
  }
}
