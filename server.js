// ============================================================================
// Bengal Heritage Atlas — Node.js Backend Server
// Built with the built-in HTTP module (no Express)
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

// ---------------------------------------------------------------------------
// 1. Load environment variables from .env (manual parsing, no dotenv)
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.warn('[WARN] .env file not found — using defaults / existing env vars.');
    console.warn('       Copy .env.example to .env and fill in your values.');
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
// 2. MySQL Connection Pool (lazy-loaded)
// ---------------------------------------------------------------------------
let pool = null;
let dbConnected = false;

async function initDatabase() {
  try {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'bengal_heritage_atlas',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

    // Test the connection
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    dbConnected = true;
    log('INFO', 'MySQL connected successfully.');
  } catch (err) {
    dbConnected = false;
    pool = null;
    log('ERROR', `MySQL connection failed: ${err.message}`);
    console.error('');
    console.error('  ╔══════════════════════════════════════════════════════════╗');
    console.error('  ║  Database connection failed.                            ║');
    console.error('  ║                                                         ║');
    console.error('  ║  1. Make sure MySQL is running.                         ║');
    console.error('  ║  2. Copy .env.example → .env and set your credentials. ║');
    console.error('  ║  3. Create the database: bengal_heritage_atlas          ║');
    console.error('  ║  4. Run the SQL schema to create tables.               ║');
    console.error('  ║                                                         ║');
    console.error('  ║  Static files will still be served.                     ║');
    console.error('  ╚══════════════════════════════════════════════════════════╝');
    console.error('');
  }
}

/**
 * Get a connection from the pool. Attempts to reconnect once if pool is dead.
 */
async function getConnection() {
  if (!pool) {
    await initDatabase();
    if (!pool) throw new Error('Database not available');
  }
  try {
    return await pool.getConnection();
  } catch (err) {
    // Try reconnecting once
    log('WARN', 'Lost database connection, attempting reconnect…');
    await initDatabase();
    if (!pool) throw new Error('Database not available');
    return await pool.getConnection();
  }
}

/**
 * Execute a parameterized query. Returns [rows, fields].
 */
async function query(sql, params = []) {
  if (!pool) {
    await initDatabase();
    if (!pool) throw new Error('Database not available');
  }
  try {
    return await pool.execute(sql, params);
  } catch (err) {
    // Retry once on connection-lost errors
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
// 3. Session Store (in-memory)
// ---------------------------------------------------------------------------
const sessions = new Map(); // token → { userId, username, expiresAt }

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

// Periodically clean expired sessions every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token);
  }
}, 15 * 60 * 1000);

// ---------------------------------------------------------------------------
// 4. Helper Functions
// ---------------------------------------------------------------------------

function log(level, message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${message}`);
}

/**
 * Parse a JSON request body. Returns parsed object or null.
 */
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

/**
 * Parse URL query parameters into a plain object.
 */
function parseQueryParams(reqUrl) {
  const parsed = new URL(reqUrl, 'http://localhost');
  const params = {};
  for (const [key, value] of parsed.searchParams) {
    params[key] = value;
  }
  return params;
}

/**
 * Send a JSON response.
 */
function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Send a JSON error response.
 */
function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: true, message });
}

/**
 * Generate a URL-friendly slug from text.
 */
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

/**
 * Middleware-like auth check. Returns session or null.
 */
function requireAuth(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;
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
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

const PUBLIC_DIR = path.join(__dirname, 'public');

function serveStaticFile(req, res, filePath) {
  // Prevent directory traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, 'Forbidden');
    return;
  }

  fs.stat(resolved, (err, stats) => {
    if (err || !stats.isFile()) {
      // If no extension, try appending .html
      if (!path.extname(resolved)) {
        const htmlPath = resolved + '.html';
        fs.stat(htmlPath, (err2, stats2) => {
          if (!err2 && stats2.isFile()) {
            streamFile(res, htmlPath);
          } else {
            sendError(res, 404, 'Not found');
          }
        });
        return;
      }
      sendError(res, 404, 'Not found');
      return;
    }
    streamFile(res, resolved);
  });
}

function streamFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => {
    sendError(res, 500, 'Error reading file');
  });
}

// ---------------------------------------------------------------------------
// 6. API Route Handlers
// ---------------------------------------------------------------------------

// ---- Public: GET /api/destinations ----
async function handleGetDestinations(req, res) {
  const params = parseQueryParams(req.url);
  const page = Math.max(1, parseInt(params.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.limit) || 12));
  const offset = (page - 1) * limit;

  let whereClauses = [];
  let queryParams = [];

  if (params.search) {
    whereClauses.push('(d.name LIKE ? OR d.district LIKE ? OR d.short_description LIKE ?)');
    const searchTerm = `%${params.search}%`;
    queryParams.push(searchTerm, searchTerm, searchTerm);
  }

  if (params.category) {
    whereClauses.push('c.slug = ?');
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

  const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

  let orderSQL = 'ORDER BY d.is_featured DESC, d.name ASC';
  if (params.sort === 'name_asc') orderSQL = 'ORDER BY d.name ASC';
  else if (params.sort === 'name_desc') orderSQL = 'ORDER BY d.name DESC';
  else if (params.sort === 'featured') orderSQL = 'ORDER BY d.is_featured DESC, d.created_at DESC';

  const countSQL = `SELECT COUNT(*) as total FROM destinations d LEFT JOIN categories c ON d.category_id = c.id ${whereSQL}`;
  const dataSQL = `
    SELECT d.*, c.name as category_name, c.slug as category_slug
    FROM destinations d
    LEFT JOIN categories c ON d.category_id = c.id
    ${whereSQL}
    ${orderSQL}
    LIMIT ? OFFSET ?
  `;

  const [countRows] = await query(countSQL, queryParams);
  const total = countRows[0].total;

  const [rows] = await query(dataSQL, [...queryParams, String(limit), String(offset)]);

  sendJSON(res, 200, {
    destinations: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// ---- Public: GET /api/destinations/featured ----
async function handleGetFeaturedDestinations(req, res) {
  const [rows] = await query(
    `SELECT d.*, c.name as category_name, c.slug as category_slug
     FROM destinations d
     LEFT JOIN categories c ON d.category_id = c.id
     WHERE d.is_featured = 1
     ORDER BY d.name ASC`
  );
  sendJSON(res, 200, { destinations: rows });
}

// ---- Public: GET /api/destinations/:slug ----
async function handleGetDestinationBySlug(req, res, slug) {
  const [rows] = await query(
    `SELECT d.*, c.name as category_name, c.slug as category_slug
     FROM destinations d
     LEFT JOIN categories c ON d.category_id = c.id
     WHERE d.slug = ?`,
    [slug]
  );

  if (rows.length === 0) {
    return sendError(res, 404, 'Destination not found');
  }

  const destination = rows[0];

  // Get related images
  let images = [];
  try {
    const [imgRows] = await query(
      'SELECT * FROM destination_images WHERE destination_id = ? ORDER BY sort_order ASC',
      [String(destination.id)]
    );
    images = imgRows;
  } catch {
    // Table might not exist yet — that's fine
  }

  // Get related destinations (same category or district, exclude current)
  const [related] = await query(
    `SELECT d.id, d.name, d.slug, d.district, d.short_description, d.image_url, c.name as category_name
     FROM destinations d
     LEFT JOIN categories c ON d.category_id = c.id
     WHERE d.id != ? AND (d.category_id = ? OR d.district = ?)
     ORDER BY RAND()
     LIMIT 4`,
    [String(destination.id), String(destination.category_id), destination.district]
  );

  sendJSON(res, 200, {
    destination: { ...destination, images },
    related,
  });
}

// ---- Public: GET /api/categories ----
async function handleGetCategories(req, res) {
  const [rows] = await query(
    `SELECT c.*, COUNT(d.id) as destination_count
     FROM categories c
     LEFT JOIN destinations d ON d.category_id = c.id
     GROUP BY c.id
     ORDER BY c.name ASC`
  );
  sendJSON(res, 200, { categories: rows });
}

// ---- Public: GET /api/stats ----
async function handleGetStats(req, res) {
  const [destCount] = await query('SELECT COUNT(*) as total FROM destinations');
  const [catCount] = await query('SELECT COUNT(*) as total FROM categories');
  const [distCount] = await query('SELECT COUNT(DISTINCT district) as total FROM destinations');

  let unescoCount = 0;
  try {
    const [uRows] = await query("SELECT COUNT(*) as total FROM destinations WHERE is_unesco = 1");
    unescoCount = uRows[0].total;
  } catch {
    // is_unesco column might not exist
  }

  sendJSON(res, 200, {
    stats: {
      destinations: destCount[0].total,
      categories: catCount[0].total,
      districts: distCount[0].total,
      unescoSites: unescoCount,
    },
  });
}

// ---- Public: GET /api/timeline ----
async function handleGetTimeline(req, res) {
  try {
    const [rows] = await query('SELECT * FROM timeline_events ORDER BY sort_order ASC');
    sendJSON(res, 200, { timeline: rows });
  } catch {
    // Table might not exist
    sendJSON(res, 200, { timeline: [] });
  }
}

// ---- Public: GET /api/districts ----
async function handleGetDistricts(req, res) {
  const [rows] = await query(
    `SELECT district, COUNT(*) as destination_count
     FROM destinations
     GROUP BY district
     ORDER BY district ASC`
  );
  sendJSON(res, 200, { districts: rows });
}

// ---- Admin: POST /api/admin/login ----
async function handleAdminLogin(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch {
    return sendError(res, 400, 'Invalid JSON in request body');
  }

  const { username, password } = body;
  if (!username || !password) {
    return sendError(res, 400, 'Username and password are required');
  }

  const [rows] = await query(
    'SELECT * FROM admin_users WHERE username = ?',
    [username]
  );

  if (rows.length === 0) {
    return sendError(res, 401, 'Invalid credentials');
  }

  const admin = rows[0];
  const bcrypt = require('bcryptjs');
  const valid = await bcrypt.compare(password, admin.password_hash);

  if (!valid) {
    return sendError(res, 401, 'Invalid credentials');
  }

  const token = createSession(admin.id, admin.username);

  sendJSON(res, 200, {
    message: 'Login successful',
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      email: admin.email,
    },
  });
}

// ---- Admin: POST /api/admin/logout ----
async function handleAdminLogout(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  destroySession(token);
  sendJSON(res, 200, { message: 'Logged out successfully' });
}

// ---- Admin: GET /api/admin/verify ----
async function handleAdminVerify(req, res) {
  const session = requireAuth(req);
  if (!session) {
    return sendError(res, 401, 'Invalid or expired session');
  }
  sendJSON(res, 200, {
    valid: true,
    admin: { userId: session.userId, username: session.username },
  });
}

// ---- Admin: GET /api/admin/destinations ----
async function handleAdminGetDestinations(req, res) {
  const session = requireAuth(req);
  if (!session) return sendError(res, 401, 'Unauthorized');

  const [rows] = await query(
    `SELECT d.*, c.name as category_name
     FROM destinations d
     LEFT JOIN categories c ON d.category_id = c.id
     ORDER BY d.updated_at DESC, d.created_at DESC`
  );
  sendJSON(res, 200, { destinations: rows });
}

// ---- Admin: POST /api/admin/destinations ----
async function handleAdminCreateDestination(req, res) {
  const session = requireAuth(req);
  if (!session) return sendError(res, 401, 'Unauthorized');

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return sendError(res, 400, 'Invalid JSON in request body');
  }

  // Validate required fields
  const required = ['name', 'district', 'category_id', 'short_description'];
  const missing = required.filter((f) => !body[f]);
  if (missing.length > 0) {
    return sendError(res, 400, `Missing required fields: ${missing.join(', ')}`);
  }

  const slug = slugify(body.name);

  // Check for duplicate slug
  const [existing] = await query('SELECT id FROM destinations WHERE slug = ?', [slug]);
  if (existing.length > 0) {
    return sendError(res, 409, 'A destination with a similar name already exists');
  }

  const [result] = await query(
    `INSERT INTO destinations (name, slug, district, region, category_id, short_description,
     long_description, image_url, latitude, longitude, period, is_featured, is_unesco,
     visiting_hours, entry_fee, best_time, nearest_city, how_to_reach)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.name,
      slug,
      body.district,
      body.region || null,
      String(body.category_id),
      body.short_description,
      body.long_description || null,
      body.image_url || null,
      body.latitude ? String(body.latitude) : null,
      body.longitude ? String(body.longitude) : null,
      body.period || null,
      body.is_featured ? '1' : '0',
      body.is_unesco ? '1' : '0',
      body.visiting_hours || null,
      body.entry_fee || null,
      body.best_time || null,
      body.nearest_city || null,
      body.how_to_reach || null,
    ]
  );

  sendJSON(res, 201, {
    message: 'Destination created successfully',
    id: result.insertId,
    slug,
  });
}

// ---- Admin: PUT /api/admin/destinations/:id ----
async function handleAdminUpdateDestination(req, res, id) {
  const session = requireAuth(req);
  if (!session) return sendError(res, 401, 'Unauthorized');

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return sendError(res, 400, 'Invalid JSON in request body');
  }

  // Verify destination exists
  const [existing] = await query('SELECT id FROM destinations WHERE id = ?', [String(id)]);
  if (existing.length === 0) {
    return sendError(res, 404, 'Destination not found');
  }

  // Build dynamic update
  const updatableFields = [
    'name', 'district', 'region', 'category_id', 'short_description',
    'long_description', 'image_url', 'latitude', 'longitude', 'period',
    'is_featured', 'is_unesco', 'visiting_hours', 'entry_fee', 'best_time',
    'nearest_city', 'how_to_reach',
  ];

  const setClauses = [];
  const values = [];

  for (const field of updatableFields) {
    if (body[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      if (field === 'is_featured' || field === 'is_unesco') {
        values.push(body[field] ? '1' : '0');
      } else {
        values.push(body[field] !== null ? String(body[field]) : null);
      }
    }
  }

  // Update slug if name changed
  if (body.name) {
    setClauses.push('slug = ?');
    values.push(slugify(body.name));
  }

  if (setClauses.length === 0) {
    return sendError(res, 400, 'No fields to update');
  }

  setClauses.push('updated_at = NOW()');
  values.push(String(id));

  await query(
    `UPDATE destinations SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  );

  sendJSON(res, 200, { message: 'Destination updated successfully' });
}

// ---- Admin: DELETE /api/admin/destinations/:id ----
async function handleAdminDeleteDestination(req, res, id) {
  const session = requireAuth(req);
  if (!session) return sendError(res, 401, 'Unauthorized');

  const [existing] = await query('SELECT id FROM destinations WHERE id = ?', [String(id)]);
  if (existing.length === 0) {
    return sendError(res, 404, 'Destination not found');
  }

  // Delete related images first
  try {
    await query('DELETE FROM destination_images WHERE destination_id = ?', [String(id)]);
  } catch {
    // Table might not exist
  }

  await query('DELETE FROM destinations WHERE id = ?', [String(id)]);

  sendJSON(res, 200, { message: 'Destination deleted successfully' });
}

// ---------------------------------------------------------------------------
// 7. Router
// ---------------------------------------------------------------------------

async function handleRequest(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // ---- API Routes ----
  if (pathname.startsWith('/api/')) {
    // All API routes require the database
    if (!pool && !dbConnected) {
      await initDatabase();
    }
    if (!pool) {
      return sendError(res, 503, 'Database service is unavailable. Please try again later.');
    }

    try {
      // --- Public API ---

      // GET /api/destinations/featured (must come before :slug)
      if (method === 'GET' && pathname === '/api/destinations/featured') {
        return await handleGetFeaturedDestinations(req, res);
      }

      // GET /api/destinations
      if (method === 'GET' && pathname === '/api/destinations') {
        return await handleGetDestinations(req, res);
      }

      // GET /api/destinations/:slug
      const destSlugMatch = pathname.match(/^\/api\/destinations\/([a-z0-9\-]+)$/);
      if (method === 'GET' && destSlugMatch) {
        return await handleGetDestinationBySlug(req, res, destSlugMatch[1]);
      }

      // GET /api/categories
      if (method === 'GET' && pathname === '/api/categories') {
        return await handleGetCategories(req, res);
      }

      // GET /api/stats
      if (method === 'GET' && pathname === '/api/stats') {
        return await handleGetStats(req, res);
      }

      // GET /api/timeline
      if (method === 'GET' && pathname === '/api/timeline') {
        return await handleGetTimeline(req, res);
      }

      // GET /api/districts
      if (method === 'GET' && pathname === '/api/districts') {
        return await handleGetDistricts(req, res);
      }

      // --- Admin API ---

      // POST /api/admin/login
      if (method === 'POST' && pathname === '/api/admin/login') {
        return await handleAdminLogin(req, res);
      }

      // POST /api/admin/logout
      if (method === 'POST' && pathname === '/api/admin/logout') {
        return await handleAdminLogout(req, res);
      }

      // GET /api/admin/verify
      if (method === 'GET' && pathname === '/api/admin/verify') {
        return await handleAdminVerify(req, res);
      }

      // GET /api/admin/destinations
      if (method === 'GET' && pathname === '/api/admin/destinations') {
        return await handleAdminGetDestinations(req, res);
      }

      // POST /api/admin/destinations
      if (method === 'POST' && pathname === '/api/admin/destinations') {
        return await handleAdminCreateDestination(req, res);
      }

      // PUT /api/admin/destinations/:id
      const adminUpdateMatch = pathname.match(/^\/api\/admin\/destinations\/(\d+)$/);
      if (method === 'PUT' && adminUpdateMatch) {
        return await handleAdminUpdateDestination(req, res, parseInt(adminUpdateMatch[1]));
      }

      // DELETE /api/admin/destinations/:id
      const adminDeleteMatch = pathname.match(/^\/api\/admin\/destinations\/(\d+)$/);
      if (method === 'DELETE' && adminDeleteMatch) {
        return await handleAdminDeleteDestination(req, res, parseInt(adminDeleteMatch[1]));
      }

      // No API route matched
      return sendError(res, 404, `API endpoint not found: ${method} ${pathname}`);
    } catch (err) {
      log('ERROR', `API error on ${method} ${pathname}: ${err.message}`);
      return sendError(res, 500, 'Internal server error');
    }
  }

  // ---- Static File Serving ----
  let filePath = path.join(PUBLIC_DIR, pathname);

  // Serve index.html for root
  if (pathname === '/') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  // For SPA-like routes without extensions, try to serve the corresponding HTML
  // or fall back to index.html
  if (!path.extname(filePath)) {
    const htmlFile = filePath + '.html';
    if (fs.existsSync(htmlFile)) {
      filePath = htmlFile;
    } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
      filePath = path.join(filePath, 'index.html');
    }
  }

  serveStaticFile(req, res, filePath);
}

// ---------------------------------------------------------------------------
// 8. Create and Start Server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    log('ERROR', `Unhandled error: ${err.message}`);
    if (!res.headersSent) {
      sendError(res, 500, 'Internal server error');
    }
  }
});

const PORT = parseInt(process.env.PORT || '3000', 10);

// Ensure the public directory exists
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  log('INFO', 'Created /public directory.');
}

// Startup
(async () => {
  // Try connecting to the database
  await initDatabase();

  server.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║                                                  ║');
    console.log('  ║   🏛️  Bengal Heritage Atlas — Server Running     ║');
    console.log('  ║                                                  ║');
    console.log(`  ║   Local:  http://localhost:${PORT}                  ║`);
    console.log(`  ║   DB:     ${dbConnected ? '✅ Connected' : '❌ Not connected'}                    ║`);
    console.log('  ║                                                  ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
  });
})();

// ---------------------------------------------------------------------------
// 9. Global Error Handling
// ---------------------------------------------------------------------------

process.on('unhandledRejection', (reason, promise) => {
  log('ERROR', `Unhandled Rejection: ${reason}`);
});

process.on('uncaughtException', (err) => {
  log('ERROR', `Uncaught Exception: ${err.message}`);
  // Give time for logging, then exit
  setTimeout(() => process.exit(1), 1000);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  log('INFO', 'SIGTERM received. Shutting down gracefully…');
  server.close(() => {
    if (pool) pool.end();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  log('INFO', 'SIGINT received. Shutting down…');
  server.close(() => {
    if (pool) pool.end();
    process.exit(0);
  });
});
