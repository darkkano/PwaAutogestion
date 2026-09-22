import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './api/src/schema.js',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'mysql://root:@127.0.0.1:3306/talon',
  },
});
