const { mysqlTable, varchar, int, decimal, text, longtext, datetime, timestamp, index } = require('drizzle-orm/mysql-core');

const receipts = mysqlTable(
  'receipts',
  {
    id: varchar('id', { length: 40 }).primaryKey(),
    capturedAt: datetime('captured_at').notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }),
    currency: varchar('currency', { length: 8 }).notNull(),
    receiptDate: varchar('receipt_date', { length: 16 }),
    merchant: varchar('merchant', { length: 120 }),
    ocrText: text('ocr_text').notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    imageMime: varchar('image_mime', { length: 40 }),
    imageB64: longtext('image_b64'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({ capturedIdx: index('idx_receipts_captured').on(t.capturedAt) }),
);

const syncEvents = mysqlTable(
  'sync_events',
  {
    id: int('id').autoincrement().primaryKey(),
    receiptId: varchar('receipt_id', { length: 40 }).notNull(),
    action: varchar('action', { length: 24 }).notNull(),
    detail: varchar('detail', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({ receiptIdx: index('idx_sync_events_receipt').on(t.receiptId) }),
);

module.exports = { receipts, syncEvents };
