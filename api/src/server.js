const express = require('express');
const cors = require('cors');
const { desc } = require('drizzle-orm');

const app = express();
const port = process.env.PORT || 3301;
const memory = [];
let dbOk = false;
let db;
let schema;

app.use(cors());
app.use(express.json({ limit: '12mb' }));

function source() {
  return dbOk ? 'drizzle' : 'memory';
}

async function initStore() {
  try {
    ({ db, schema } = require('./db'));
    await db.select({ id: schema.receipts.id }).from(schema.receipts).limit(1);
    dbOk = true;
    console.log('Drizzle: receipts listo.');
  } catch (error) {
    dbOk = false;
    console.warn(
      `Drizzle no disponible (${String(error.message || error).split('\n')[0]}). Sync en memoria.`,
    );
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'talon-field', store: source(), queued: memory.length });
});

app.get('/api/receipts', async (_req, res) => {
  if (dbOk && db) {
    try {
      const rows = await db
        .select({
          id: schema.receipts.id,
          capturedAt: schema.receipts.capturedAt,
          amount: schema.receipts.amount,
          currency: schema.receipts.currency,
          receiptDate: schema.receipts.receiptDate,
          merchant: schema.receipts.merchant,
          status: schema.receipts.status,
        })
        .from(schema.receipts)
        .orderBy(desc(schema.receipts.capturedAt))
        .limit(40);
      res.json({ receipts: rows, store: source() });
      return;
    } catch {
      dbOk = false;
    }
  }
  res.json({
    receipts: memory.map(({ imageB64, ...rest }) => rest),
    store: source(),
  });
});

app.post('/api/receipts', async (req, res) => {
  const body = req.body || {};
  const id = String(body.id || `rc_${Date.now().toString(36)}`);
  const row = {
    id,
    capturedAt: new Date(body.capturedAt || Date.now()),
    amount: body.amount == null || body.amount === '' ? null : String(body.amount),
    currency: body.currency || 'USD',
    receiptDate: body.receiptDate || null,
    merchant: body.merchant || null,
    ocrText: body.ocrText || '',
    status: 'synced',
    imageMime: body.imageMime || 'image/jpeg',
    imageB64: body.imageB64 || null,
  };
  memory.unshift({ ...row, amount: body.amount == null || body.amount === '' ? null : Number(body.amount) });
  if (dbOk && db) {
    try {
      await db.insert(schema.receipts).values(row).onDuplicateKeyUpdate({
        set: {
          capturedAt: row.capturedAt,
          amount: row.amount,
          currency: row.currency,
          receiptDate: row.receiptDate,
          merchant: row.merchant,
          ocrText: row.ocrText,
          status: row.status,
          imageMime: row.imageMime,
          imageB64: row.imageB64,
        },
      });
      await db.insert(schema.syncEvents).values({
        receiptId: id,
        action: 'upsert',
        detail: 'pwa-sync',
      });
    } catch (error) {
      dbOk = false;
      console.warn('Sync Drizzle falló:', String(error.message || error).split('\n')[0]);
    }
  }
  res.json({ ok: true, id, store: source() });
});

async function boot() {
  await initStore();
  app.listen(port, () => {
    console.log(`TALON field API http://localhost:${port} [${source()}]`);
  });
}

boot().catch((error) => {
  console.error(error);
  process.exit(1);
});
