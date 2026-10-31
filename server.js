// ============================================================================
// Bengal Heritage Atlas — Node.js Backend Server
// Built with the built-in HTTP module and mysql2 (No Express)
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

// ---------------------------------------------------------------------------
// 1. Load environment variables from .env
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.warn('[WARN] .env file not found — using defaults.');
    return;
  }
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
loadEnv();

// ---------------------------------------------------------------------------
// 2. MySQL Connection Pool (TiDB Cloud & MySQL 8 Compatible)
// ---------------------------------------------------------------------------
let pool = null;
let dbConnected = false;

function getPoolConfig() {
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
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        ssl: isTiDB || process.env.DB_SSL === 'true' ? { rejectUnauthorized: true, minVersion: 'TLSv1.2' } : undefined,
      };
    } catch (e) {
      log('WARN', 'Could not parse DATABASE_URL, using individual environment variables');
    }
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const isTiDB = host.includes('tidbcloud.com') || process.env.DB_SSL === 'true';
  const defaultPort = isTiDB ? 4000 : 3306;

  const poolConfig = {
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bengal_heritage_atlas',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  };

  if (isTiDB || process.env.DB_SSL === 'true') {
    poolConfig.host = host;
    poolConfig.port = parseInt(process.env.DB_PORT || String(defaultPort), 10);
    poolConfig.ssl = { rejectUnauthorized: true, minVersion: 'TLSv1.2' };
  } else if (process.env.DB_SOCKET && fs.existsSync(process.env.DB_SOCKET)) {
    poolConfig.socketPath = process.env.DB_SOCKET;
  } else if (process.env.NODE_ENV !== 'production' && (host === '127.0.0.1' || host === 'localhost') && fs.existsSync('/tmp/mysql_brew.sock')) {
    poolConfig.socketPath = '/tmp/mysql_brew.sock';
  } else if (process.env.NODE_ENV !== 'production' && (host === '127.0.0.1' || host === 'localhost') && fs.existsSync('/tmp/mysql.sock')) {
    poolConfig.socketPath = '/tmp/mysql.sock';
  } else {
    poolConfig.host = host;
    poolConfig.port = parseInt(process.env.DB_PORT || '3306', 10);
  }

  return poolConfig;
}

async function initDatabase() {
  try {
    const mysql = require('mysql2/promise');
    const poolConfig = getPoolConfig();

    pool = mysql.createPool(poolConfig);

    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    dbConnected = true;
    log('INFO', `Connected to database "${poolConfig.database}" at ${poolConfig.host || poolConfig.socketPath || 'socket'} successfully.`);
  } catch (err) {
    dbConnected = false;
    pool = null;
    log('ERROR', `Database connection failed: ${err.message}`);
  }
}

async function query(sql, params = []) {
  if (!pool) {
    await initDatabase();
    if (!pool) throw new Error('Database not available');
  }
  try {
    return await pool.execute(sql, params);
  } catch (err) {
    if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNREFUSED') {
      log('WARN', 'Connection lost during query, reconnecting…');
      await initDatabase();
      if (!pool) throw err;
      return await pool.execute(sql, params);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 3. In-Memory Session Store
// ---------------------------------------------------------------------------
const sessions = new Map(); // token -> { userId, username, expiresAt }

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(userId, username) {
  const token = generateToken();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  sessions.set(token, { userId, username, expiresAt });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function destroySession(token) {
  sessions.delete(token);
}

// ---------------------------------------------------------------------------
// 4. Utility Helpers
// ---------------------------------------------------------------------------
function log(level, message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${message}`);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON in request body'));
      }
    });
    req.on('error', reject);
  });
}

function parseQueryParams(reqUrl) {
  const parsed = new URL(reqUrl, 'http://localhost');
  const params = {};
  for (const [key, value] of parsed.searchParams) {
    params[key] = value;
  }
  return params;
}

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: message || 'An error occurred' });
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function requireAuth(req) {
  const authHeader = req.headers['authorization'] || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  // Fallback to query param if needed (e.g. for verify)
  if (!token) {
    const parsed = new URL(req.url, 'http://localhost');
    token = parsed.searchParams.get('token') || '';
  }

  return getSession(token);
}

// ---------------------------------------------------------------------------
// 5. Static File Server
// ---------------------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const PUBLIC_DIR = path.join(__dirname, 'public');

function serveStaticFile(req, res, filePath) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, 'Forbidden');
    return;
  }

  fs.stat(resolved, (err, stats) => {
    if (err || !stats.isFile()) {
      if (!path.extname(resolved)) {
        const htmlPath = resolved + '.html';
        fs.stat(htmlPath, (err2, stats2) => {
          if (!err2 && stats2.isFile()) {
            streamFile(res, htmlPath);
          } else {
            sendError(res, 404, 'File not found');
          }
        });
        return;
      }
      sendError(res, 404, 'File not found');
      return;
    }
    streamFile(res, resolved);
  });
}

function streamFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const cacheControl = ext === '.html'
    ? 'no-cache, must-revalidate'
    : 'public, max-age=86400, stale-while-revalidate=604800';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
  });
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => {
    sendError(res, 500, 'Error streaming file');
  });
}

// ---------------------------------------------------------------------------
// 6. Public API Endpoints
// ---------------------------------------------------------------------------

// GET /api/destinations
async function handleGetDestinations(req, res) {
  const params = parseQueryParams(req.url);
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || 12));
  const offset = (page - 1) * limit;

  let whereClauses = [];
  let queryParams = [];

  if (params.search) {
    whereClauses.push('(d.name LIKE ? OR d.district LIKE ? OR d.short_description LIKE ? OR d.historical_background LIKE ?)');
    const searchTerm = `%${params.search}%`;
    queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (params.category) {
    whereClauses.push('d.category_id = ?');
    queryParams.push(params.category);
  }

  if (params.district) {
    whereClauses.push('d.district = ?');
    queryParams.push(params.district);
  }

  if (params.region) {
    whereClauses.push('d.region = ?');
    queryParams.push(params.region);
  }

  if (params.unesco === 'true') {
    whereClauses.push("d.unesco_status IN ('World Heritage Site', 'Tentative List')");
  }

  const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  let orderSQL = 'ORDER BY d.is_featured DESC, d.name ASC';
  if (params.sort === 'name_asc') orderSQL = 'ORDER BY d.name ASC';
  else if (params.sort === 'name_desc') orderSQL = 'ORDER BY d.name DESC';
  else if (params.sort === 'featured') orderSQL = 'ORDER BY d.is_featured DESC, d.rating DESC, d.name ASC';

  const countSQL = `SELECT COUNT(*) as total FROM destinations d ${whereSQL}`;
  const [countRows] = await query(countSQL, queryParams);
  const total = countRows[0].total;

  const dataSQL = `
    SELECT d.*, c.category_name, c.icon as category_icon
    FROM destinations d
    LEFT JOIN categories c ON d.category_id = c.category_id
    ${whereSQL}
    ${orderSQL}
    LIMIT ? OFFSET ?
  `;

  const [rows] = await query(dataSQL, [...queryParams, String(limit), String(offset)]);

  sendJSON(res, 200, {
    destinations: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

// GET /api/destinations/featured
async function handleGetFeaturedDestinations(req, res) {
  const [rows] = await query(
    `SELECT d.*, c.category_name, c.icon as category_icon
     FROM destinations d
     LEFT JOIN categories c ON d.category_id = c.category_id
     WHERE d.is_featured = 1
     ORDER BY d.rating DESC, d.name ASC`
  );
  sendJSON(res, 200, { destinations: rows });
}

// GET /api/destinations/:slug
async function handleGetDestinationBySlug(req, res, slug) {
  const [rows] = await query(
    `SELECT d.*, c.category_name, c.icon as category_icon
     FROM destinations d
     LEFT JOIN categories c ON d.category_id = c.category_id
     WHERE d.slug = ?`,
    [slug]
  );

  if (rows.length === 0) {
    return sendError(res, 404, 'Destination not found');
  }

  const destination = rows[0];

  // Images
  let images = [];
  try {
    const [imgRows] = await query(
      'SELECT * FROM destination_images WHERE destination_id = ? ORDER BY sort_order ASC',
      [String(destination.destination_id)]
    );
    images = imgRows;
  } catch (e) {
    log('WARN', `Could not fetch images for ${destination.destination_id}`);
  }

  // Related destinations (same category or district, excluding self)
  let related = [];
  try {
    const [relRows] = await query(
      `SELECT d.*, c.category_name
       FROM destinations d
       LEFT JOIN categories c ON d.category_id = c.category_id
       WHERE d.destination_id != ? AND (d.category_id = ? OR d.district = ?)
       ORDER BY d.is_featured DESC, d.rating DESC
       LIMIT 3`,
      [String(destination.destination_id), String(destination.category_id), destination.district]
    );
    related = relRows;
  } catch (e) {
    log('WARN', `Could not fetch related for ${destination.destination_id}`);
  }

  // Attach directly on destination for clean consumption
  destination.images = images;
  destination.related = related;

  sendJSON(res, 200, destination);
}

// GET /api/categories
async function handleGetCategories(req, res) {
  const [rows] = await query(
    `SELECT c.*, COUNT(d.destination_id) as destination_count
     FROM categories c
     LEFT JOIN destinations d ON d.category_id = c.category_id
     GROUP BY c.category_id, c.category_name, c.description, c.icon, c.created_at
     ORDER BY c.category_name ASC`
  );
  sendJSON(res, 200, rows);
}

// GET /api/stats
async function handleGetStats(req, res) {
  const [destCount] = await query('SELECT COUNT(*) as total FROM destinations');
  const [catCount] = await query('SELECT COUNT(*) as total FROM categories');
  const [distCount] = await query('SELECT COUNT(DISTINCT district) as total FROM destinations');
  const [unescoCount] = await query("SELECT COUNT(*) as total FROM destinations WHERE unesco_status = 'World Heritage Site'");

  sendJSON(res, 200, {
    totalDestinations: destCount[0].total,
    totalCategories: catCount[0].total,
    totalDistricts: distCount[0].total,
    totalUnesco: unescoCount[0].total,
  });
}

// GET /api/timeline
async function handleGetTimeline(req, res) {
  const [rows] = await query('SELECT * FROM timeline_events ORDER BY sort_order ASC');
  sendJSON(res, 200, rows);
}

// GET /api/districts
async function handleGetDistricts(req, res) {
  const [rows] = await query(
    `SELECT district, COUNT(*) as count
     FROM destinations
     GROUP BY district
     ORDER BY district ASC`
  );
  sendJSON(res, 200, rows);
}

// ---------------------------------------------------------------------------
// 7. Administrative API Endpoints (Protected)
// ---------------------------------------------------------------------------

// POST /api/admin/login
async function handleAdminLogin(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const { username, password } = body;
  if (!username || !password) {
    return sendError(res, 400, 'Username and password are required');
  }

  const [rows] = await query('SELECT * FROM admin_users WHERE username = ?', [username]);
  if (rows.length === 0) {
    return sendError(res, 401, 'Invalid username or password');
  }

  const admin = rows[0];
  const bcrypt = require('bcryptjs');
  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    return sendError(res, 401, 'Invalid username or password');
  }

  const token = createSession(admin.admin_id, admin.username);
  sendJSON(res, 200, {
    token,
    username: admin.username,
  });
}

// POST /api/admin/logout
async function handleAdminLogout(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  destroySession(token);
  sendJSON(res, 200, { message: 'Logged out successfully' });
}

// GET /api/admin/verify
async function handleAdminVerify(req, res) {
  const session = requireAuth(req);
  if (!session) {
    return sendError(res, 401, 'Invalid or expired session');
  }
  sendJSON(res, 200, {
    valid: true,
    user: { userId: session.userId, username: session.username },
  });
}

// GET /api/admin/destinations
async function handleAdminGetDestinations(req, res) {
  const session = requireAuth(req);
  if (!session) return sendError(res, 401, 'Unauthorized');

  const [rows] = await query(
    `SELECT d.*, c.category_name
     FROM destinations d
     LEFT JOIN categories c ON d.category_id = c.category_id
     ORDER BY d.updated_at DESC, d.destination_id DESC`
  );
  sendJSON(res, 200, { destinations: rows });
}

// POST /api/admin/destinations
async function handleAdminCreateDestination(req, res) {
  const session = requireAuth(req);
  if (!session) return sendError(res, 401, 'Unauthorized');

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const required = ['name', 'district', 'category_id', 'short_description'];
  const missing = required.filter((f) => !body[f]);
  if (missing.length > 0) {
    return sendError(res, 400, `Missing required fields: ${missing.join(', ')}`);
  }

  let slug = slugify(body.name);
  const [existing] = await query('SELECT destination_id FROM destinations WHERE slug = ?', [slug]);
  if (existing.length > 0) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const [result] = await query(
    `INSERT INTO destinations (
      slug, name, district, region, category_id, short_description,
      historical_background, heritage_significance, historical_period, established_year,
      unesco_status, latitude, longitude, opening_hours, entry_fee,
      accessibility_info, best_time_to_visit, nearest_city, featured_image_url,
      image_credit, source_url, is_featured
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      slug,
      body.name,
      body.district,
      body.region || null,
      parseInt(body.category_id, 10),
      body.short_description,
      body.historical_background || null,
      body.heritage_significance || null,
      body.historical_period || null,
      body.established_year || null,
      body.unesco_status || 'None',
      body.latitude ? parseFloat(body.latitude) : null,
      body.longitude ? parseFloat(body.longitude) : null,
      body.opening_hours || null,
      body.entry_fee || null,
      body.accessibility_info || null,
      body.best_time_to_visit || null,
      body.nearest_city || null,
      body.featured_image_url || null,
      body.image_credit || null,
      body.source_url || null,
      body.is_featured ? 1 : 0,
    ]
  );

  sendJSON(res, 201, {
    message: 'Destination created successfully',
    destination_id: result.insertId,
    slug,
  });
}

// PUT /api/admin/destinations/:id
async function handleAdminUpdateDestination(req, res, id) {
  const session = requireAuth(req);
  if (!session) return sendError(res, 401, 'Unauthorized');

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const [existing] = await query('SELECT destination_id FROM destinations WHERE destination_id = ?', [String(id)]);
  if (existing.length === 0) {
    return sendError(res, 404, 'Destination not found');
  }

  const updatableFields = [
    'name', 'district', 'region', 'category_id', 'short_description',
    'historical_background', 'heritage_significance', 'historical_period',
    'established_year', 'unesco_status', 'latitude', 'longitude',
    'opening_hours', 'entry_fee', 'accessibility_info', 'best_time_to_visit',
    'nearest_city', 'featured_image_url', 'image_credit', 'source_url', 'is_featured'
  ];

  const setClauses = [];
  const values = [];

  for (const field of updatableFields) {
    if (body[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      if (field === 'is_featured') {
        values.push(body[field] ? 1 : 0);
      } else if (field === 'category_id') {
        values.push(parseInt(body[field], 10));
      } else if (field === 'latitude' || field === 'longitude') {
        values.push(body[field] !== null && body[field] !== '' ? parseFloat(body[field]) : null);
      } else {
        values.push(body[field] !== null && body[field] !== '' ? String(body[field]) : null);
      }
    }
  }

  if (body.name) {
    setClauses.push('slug = ?');
    values.push(slugify(body.name));
  }

  if (setClauses.length === 0) {
    return sendError(res, 400, 'No fields provided for update');
  }

  values.push(String(id));

  await query(
    `UPDATE destinations SET ${setClauses.join(', ')} WHERE destination_id = ?`,
    values
  );

  sendJSON(res, 200, { message: 'Destination updated successfully' });
}

// DELETE /api/admin/destinations/:id
async function handleAdminDeleteDestination(req, res, id) {
  const session = requireAuth(req);
  if (!session) return sendError(res, 401, 'Unauthorized');

  const [existing] = await query('SELECT destination_id FROM destinations WHERE destination_id = ?', [String(id)]);
  if (existing.length === 0) {
    return sendError(res, 404, 'Destination not found');
  }

  try {
    await query('DELETE FROM destination_images WHERE destination_id = ?', [String(id)]);
  } catch (e) {
    // ignore
  }

  await query('DELETE FROM destinations WHERE destination_id = ?', [String(id)]);
  sendJSON(res, 200, { message: 'Destination deleted successfully' });
}

// ---------------------------------------------------------------------------
// 8. Main HTTP Router
// ---------------------------------------------------------------------------
async function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const method = req.method;

  try {
    // ---- API Routes ----
    if (pathname.startsWith('/api/')) {
      // Health Check for Render & uptime monitoring
      if (pathname === '/api/health' && method === 'GET') {
        return sendJSON(res, 200, {
          status: 'ok',
          database: dbConnected,
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
        });
      }

      if (!pool && !dbConnected) {
        await initDatabase();
      }

      // Public API
      if (pathname === '/api/destinations' && method === 'GET') {
        return await handleGetDestinations(req, res);
      }
      if (pathname === '/api/destinations/featured' && method === 'GET') {
        return await handleGetFeaturedDestinations(req, res);
      }
      if (pathname.startsWith('/api/destinations/') && method === 'GET') {
        const slug = pathname.replace('/api/destinations/', '');
        return await handleGetDestinationBySlug(req, res, slug);
      }
      if (pathname === '/api/categories' && method === 'GET') {
        return await handleGetCategories(req, res);
      }
      if (pathname === '/api/stats' && method === 'GET') {
        return await handleGetStats(req, res);
      }
      if (pathname === '/api/timeline' && method === 'GET') {
        return await handleGetTimeline(req, res);
      }
      if (pathname === '/api/districts' && method === 'GET') {
        return await handleGetDistricts(req, res);
      }

      // Admin API
      if (pathname === '/api/admin/login' && method === 'POST') {
        return await handleAdminLogin(req, res);
      }
      if (pathname === '/api/admin/logout' && method === 'POST') {
        return await handleAdminLogout(req, res);
      }
      if (pathname === '/api/admin/verify' && method === 'GET') {
        return await handleAdminVerify(req, res);
      }
      if (pathname === '/api/admin/destinations' && method === 'GET') {
        return await handleAdminGetDestinations(req, res);
      }
      if (pathname === '/api/admin/destinations' && method === 'POST') {
        return await handleAdminCreateDestination(req, res);
      }
      if (pathname.startsWith('/api/admin/destinations/') && method === 'PUT') {
        const id = pathname.replace('/api/admin/destinations/', '');
        return await handleAdminUpdateDestination(req, res, id);
      }
      if (pathname.startsWith('/api/admin/destinations/') && method === 'DELETE') {
        const id = pathname.replace('/api/admin/destinations/', '');
        return await handleAdminDeleteDestination(req, res, id);
      }

      return sendError(res, 404, `API route not found: ${method} ${pathname}`);
    }

    // ---- Static Files ----
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    serveStaticFile(req, res, filePath);

  } catch (err) {
    log('ERROR', `Unhandled request error: ${err.message}\n${err.stack}`);
    sendError(res, 500, 'Internal Server Error');
  }
}

// ---------------------------------------------------------------------------
// 9. Startup
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const server = http.createServer(handleRequest);

initDatabase().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    log('INFO', `Bengal Heritage Atlas server running at http://localhost:${PORT}`);
  });
});

process.on('SIGTERM', () => {
  log('INFO', 'SIGTERM received, shutting down gracefully...');
  server.close(() => {
    if (pool) pool.end();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('INFO', 'SIGINT received, shutting down gracefully...');
  server.close(() => {
    if (pool) pool.end();
    process.exit(0);
  });
});
