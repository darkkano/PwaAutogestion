export type SyncState = 'pending' | 'syncing' | 'ok' | 'error';

export interface Receipt {
  id: string;
  createdAt: number;
  amount: number | null;
  currency: string;
  receiptDate: string | null;
  merchant: string | null;
  ocrText: string;
  ocrStatus: 'idle' | 'running' | 'done' | 'fail';
  sync: SyncState;
  thumb: string;
  imageB64: string;
  imageMime: string;
  source: 'camera' | 'demo';
}

export interface VisionHit {
  amount: number | null;
  receiptDate: string | null;
  merchant: string | null;
  ocrText: string;
  engine: 'strip' | 'tesseract' | 'manual';
}
