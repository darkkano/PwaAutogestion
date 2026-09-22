const { execSync } = require('child_process');
const path = require('path');
const mysql = require('mysql2/promise');
const { loadEnv } = require('./load-env');

const root = path.join(__dirname, '..', '..');
loadEnv(root);

const url = process.env.DATABASE_URL || 'mysql://root:@127.0.0.1:3306/talon';

async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
  });
  await conn.query(
    'CREATE DATABASE IF NOT EXISTS `talon` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  );
  await conn.end();
}

async function main() {
  console.log('Drizzle → MySQL talon');
  await ensureDatabase();
  execSync('npx drizzle-kit push --force', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
  console.log('Tablas receipts y sync_events listas.');
}

main().catch((error) => {
  console.error('\nNo pude crear la BD. Arranca MySQL en XAMPP (MySQL → Start).\n');
  console.error(error.message);
  process.exit(1);
});
