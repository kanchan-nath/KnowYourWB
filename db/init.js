/**
 * Bengal Heritage Atlas — Database Initializer & Migration Tool
 * Compatible with MySQL 8 and TiDB Cloud (Serverless & Dedicated)
 *
 * Usage:
 *   node db/init.js
 *   npm run db:setup
 */

'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// 1. Load environment variables from .env
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}
loadEnv();

// 2. Parse connection options
function getConnectionConfig() {
  const databaseUrl = process.env.DATABASE_URL || process.env.TIDB_URL;
  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      const isTiDB = parsed.hostname.includes('tidbcloud.com') || parsed.searchParams.get('ssl') === 'true';
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '4000', 10),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, '') || 'bengal_heritage_atlas',
        multipleStatements: true,
        ssl: isTiDB || process.env.DB_SSL === 'true' ? { rejectUnauthorized: true, minVersion: 'TLSv1.2' } : undefined,
      };
    } catch (e) {
      console.warn('[WARN] Could not parse DATABASE_URL, falling back to individual variables');
    }
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const isTiDB = host.includes('tidbcloud.com') || process.env.DB_SSL === 'true';
  const defaultPort = isTiDB ? 4000 : 3306;

  const config = {
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bengal_heritage_atlas',
    multipleStatements: true,
  };

  if (isTiDB || process.env.DB_SSL === 'true') {
    config.host = host;
    config.port = parseInt(process.env.DB_PORT || String(defaultPort), 10);
    config.ssl = { rejectUnauthorized: true, minVersion: 'TLSv1.2' };
  } else if (process.env.DB_SOCKET && fs.existsSync(process.env.DB_SOCKET)) {
    config.socketPath = process.env.DB_SOCKET;
  } else if ((host === '127.0.0.1' || host === 'localhost') && fs.existsSync('/tmp/mysql_brew.sock')) {
    config.socketPath = '/tmp/mysql_brew.sock';
  } else if ((host === '127.0.0.1' || host === 'localhost') && fs.existsSync('/tmp/mysql.sock')) {
    config.socketPath = '/tmp/mysql.sock';
  } else {
    config.host = host;
    config.port = parseInt(process.env.DB_PORT || '3306', 10);
  }

  return config;
}

// Helper to split SQL by semicolons safely
function splitSqlStatements(content) {
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let inComment = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1] || '';

    // Comment handling --
    if (!inString && char === '-' && nextChar === '-') {
      inComment = true;
    }
    if (inComment && char === '\n') {
      inComment = false;
      continue;
    }
    if (inComment) continue;

    // String handling
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true;
      stringChar = char;
      current += char;
      continue;
    } else if (inString && char === stringChar) {
      if (content[i - 1] !== '\\') {
        inString = false;
      }
      current += char;
      continue;
    }

    if (!inString && char === ';') {
      const stmt = current.trim();
      if (stmt.length > 0) {
        statements.push(stmt);
      }
      current = '';
    } else {
      current += char;
    }
  }

  const trailing = current.trim();
  if (trailing.length > 0) {
    statements.push(trailing);
  }

  return statements;
}

async function run() {
  console.log('\n======================================================');
  console.log('🏛️  Bengal Heritage Atlas — Database Initializer');
  console.log('======================================================\n');

  const config = getConnectionConfig();
  console.log(`📡 Target Host:     ${config.host || config.socketPath || 'local socket'}`);
  console.log(`🔌 Target Port:     ${config.port || 'default'}`);
  console.log(`👤 Target User:     ${config.user}`);
  console.log(`🗄️  Target Database: ${config.database}`);
  console.log(`🔒 SSL Enabled:     ${Boolean(config.ssl)}\n`);

  let connection;
  try {
    // Try connecting directly
    console.log('Connecting to database server...');
    connection = await mysql.createConnection(config);
    console.log('✅ Connection established.\n');
  } catch (err) {
    // If database doesn't exist, try connecting without DB to create it
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.log(`Database "${config.database}" does not exist. Creating it...`);
      const rootConfig = { ...config };
      delete rootConfig.database;
      const rootConn = await mysql.createConnection(rootConfig);
      await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
      await rootConn.end();
      connection = await mysql.createConnection(config);
      console.log(`✅ Database "${config.database}" created and connected.\n`);
    } else {
      console.error('❌ Connection failed:', err.message);
      process.exit(1);
    }
  }

  try {
    // 1. Execute schema.sql
    console.log('📄 Step 1: Applying Schema (db/schema.sql)...');
    const schemaFile = path.join(__dirname, 'schema.sql');
    let schemaSQL = fs.readFileSync(schemaFile, 'utf-8');

    // Filter out redundant "CREATE DATABASE" and "USE" to be friendly with TiDB Cloud pre-assigned DBs
    const schemaStmts = splitSqlStatements(schemaSQL).filter(stmt => {
      const upper = stmt.toUpperCase().trim();
      return !upper.startsWith('CREATE DATABASE') && !upper.startsWith('USE ');
    });

    for (const stmt of schemaStmts) {
      await connection.query(stmt);
    }
    console.log('✅ All tables and indexes created successfully.\n');

    // 2. Execute seed.sql
    console.log('🌱 Step 2: Seeding Data (db/seed.sql)...');
    const seedFile = path.join(__dirname, 'seed.sql');
    let seedSQL = fs.readFileSync(seedFile, 'utf-8');

    const seedStmts = splitSqlStatements(seedSQL).filter(stmt => {
      const upper = stmt.toUpperCase().trim();
      return !upper.startsWith('USE ');
    });

    for (const stmt of seedStmts) {
      await connection.query(stmt);
    }
    console.log('✅ Seed data inserted successfully.\n');

    // 3. Verify counts
    console.log('📊 Step 3: Verifying Database Records:');
    const tables = ['categories', 'destinations', 'destination_images', 'timeline_events', 'admin_users'];
    for (const t of tables) {
      const [rows] = await connection.query(`SELECT COUNT(*) as count FROM \`${t}\``);
      console.log(`   • ${t.padEnd(20)}: ${rows[0].count} rows`);
    }

    console.log('\n🎉 Database setup completed successfully! Ready for production deployment.\n');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

run();

