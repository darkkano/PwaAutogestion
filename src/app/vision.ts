export interface StripPayload {
  a: number;
  d: string;
  m: string;
}

const BAR = 4;
const X0 = 40;
const STRIP_Y = 920;

function toBits(payload: StripPayload): number[] {
  const bytes = Array.from(new TextEncoder().encode(JSON.stringify(payload)));
  const bits: number[] = [1, 0, 1, 1, 0, 1, 0, 1];
  const len = bytes.length;
  for (let i = 7; i >= 0; i -= 1) {
    bits.push((len >> i) & 1);
  }
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i -= 1) {
      bits.push((byte >> i) & 1);
    }
  }
  return bits;
}

function drawBits(ctx: CanvasRenderingContext2D, bits: number[], scale: number) {
  const bar = Math.max(2, Math.round(BAR * scale));
  const x0 = Math.round(X0 * scale);
  const y = Math.round(STRIP_Y * scale);
  bits.forEach((bit, i) => {
    ctx.fillStyle = bit ? '#111' : '#f7f1de';
    ctx.fillRect(x0 + i * bar, y, bar, Math.round(28 * scale));
  });
}

export function drawDemoReceipt(
  canvas: HTMLCanvasElement,
  payload: StripPayload,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  canvas.width = 720;
  canvas.height = 1000;
  ctx.fillStyle = '#f7f1de';
  ctx.fillRect(0, 0, 720, 1000);
  ctx.fillStyle = '#1a2118';
  ctx.fillRect(0, 0, 720, 18);
  ctx.font = '700 48px sans-serif';
  ctx.fillText('TALON', 48, 90);
  ctx.font = '22px monospace';
  ctx.fillText('COMPROBANTE DE PAGO', 48, 128);
  ctx.fillText(payload.m.toUpperCase(), 48, 200);
  ctx.fillText(`FECHA  ${payload.d}`, 48, 250);
  ctx.fillText('--------------------------------', 48, 330);
  ctx.font = '700 54px monospace';
  ctx.fillText(`TOTAL USD ${payload.a.toFixed(2)}`, 48, 420);
  ctx.font = '18px monospace';
  ctx.fillText('Conserve este talon para su conciliacion', 48, 500);
  drawBits(ctx, toBits(payload), 1);
  ctx.fillStyle = '#1a2118';
  ctx.font = '12px sans-serif';
  ctx.fillText('pista de vision on-device', 48, 970);
}

function sampleBits(image: ImageData): number[] | null {
  const { width, height, data } = image;
  const scale = width / 720;
  const bar = Math.max(2, Math.round(BAR * scale));
  const x0 = Math.round(X0 * scale);
  const y = Math.min(height - 8, Math.round((STRIP_Y + 12) * (height / 1000)));
  const bits: number[] = [];
  for (let i = 0; i < 480; i += 1) {
    const x = x0 + i * bar + Math.floor(bar / 2);
    if (x >= width - 4) {
      break;
    }
    const idx = (y * width + x) * 4;
    const lum = data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11;
    bits.push(lum < 90 ? 1 : 0);
  }
  const start = bits.findIndex(
    (_, i) =>
      bits[i] === 1 &&
      bits[i + 1] === 0 &&
      bits[i + 2] === 1 &&
      bits[i + 3] === 1 &&
      bits[i + 4] === 0 &&
      bits[i + 5] === 1 &&
      bits[i + 6] === 0 &&
      bits[i + 7] === 1,
  );
  if (start < 0) {
    return null;
  }
  return bits.slice(start);
}

export function decodeStrip(image: ImageData): StripPayload | null {
  const bits = sampleBits(image);
  if (!bits || bits.length < 24) {
    return null;
  }
  let len = 0;
  for (let i = 0; i < 8; i += 1) {
    len = (len << 1) | bits[8 + i];
  }
  if (len < 8 || len > 180) {
    return null;
  }
  const bytes: number[] = [];
  for (let b = 0; b < len; b += 1) {
    let value = 0;
    for (let i = 0; i < 8; i += 1) {
      value = (value << 1) | (bits[16 + b * 8 + i] || 0);
    }
    bytes.push(value);
  }
  try {
    const json = new TextDecoder().decode(new Uint8Array(bytes));
    const parsed = JSON.parse(json) as StripPayload;
    if (typeof parsed.a === 'number' && parsed.d && parsed.m) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function parseOcrText(text: string): { a: number | null; d: string | null; m: string | null } {
  const amountMatch = text.match(/(?:total|monto|importe|usd)\s*[:.]?\s*\$?\s*(\d{1,6}(?:[.,]\d{2}))/i);
  const dateMatch = text.match(/(\d{1,2}[/.\\-]\d{1,2}[/.\\-]\d{2,4})/);
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2 && !/talon|comprobante|total|fecha/i.test(line));
  return {
    a: amountMatch ? Number(amountMatch[1].replace(',', '.')) : null,
    d: dateMatch ? dateMatch[1] : null,
    m: lines[0] || null,
  };
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve('');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function fileToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
}

export function thumbOf(canvas: HTMLCanvasElement): string {
  const t = document.createElement('canvas');
  const scale = 220 / canvas.width;
  t.width = 220;
  t.height = Math.round(canvas.height * scale);
  t.getContext('2d')?.drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.7);
}
