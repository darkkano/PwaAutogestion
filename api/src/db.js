const path = require('path');
const mysql = require('mysql2/promise');
const { drizzle } = require('drizzle-orm/mysql2');
const { loadEnv } = require('./load-env');
const schema = require('./schema');

loadEnv(path.join(__dirname, '..', '..'));

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'mysql://root:@127.0.0.1:3306/talon';
}

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
});

const db = drizzle(pool, { schema, mode: 'default' });

module.exports = { db, schema, pool };
