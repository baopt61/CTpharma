/* CT Pharma website + portfolio admin — dependency-free Node server.
   Run: node server.js  (port 8937 by default)
   Public site:  http://localhost:8937/
   Admin:        http://localhost:8937/#/admin  (set ADMIN_PASSCODE)
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'products.json');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');
const configPath = path.join(ROOT, 'config.json');
const CONFIG = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || CONFIG.adminPasscode || '';
const ADMIN_USER = process.env.ADMIN_USER || CONFIG.adminUser || 'admin';
const PORT = process.env.PORT || CONFIG.port || 8937;

if (!ADMIN_PASSCODE) {
  console.warn('WARNING: ADMIN_PASSCODE is not set; admin login and mutations are disabled.');
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon'
};

function loadData() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function saveData(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, DATA_FILE); // atomic on same volume
}

function send(res, code, body, type) {
  const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(buf),
    'Cache-Control': 'no-store'
  });
  res.end(buf);
}

function authed(req) {
  const given = req.headers['x-passcode'] || '';
  const want = ADMIN_PASSCODE;
  if (!want || given.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limitBytes) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
}

function validProduct(p, cats) {
  if (!p || typeof p !== 'object') return 'invalid body';
  if (!p.n || typeof p.n !== 'string' || !p.n.trim()) return 'name is required';
  if (!cats.some(c => c.k === p.cat)) return 'unknown category';
  if (!Array.isArray(p.ch) || !p.ch.every(c => ['Hospital', 'Pharmacy', 'Modern trade'].includes(c))) return 'invalid channels';
  if (!Array.isArray(p.b) || !p.b.every(x => ['bs', 'ct', 'ex'].includes(x))) return 'invalid badges';
  if (p.flag != null && typeof p.flag !== 'string') return 'invalid flag';
  for (const key of ['pack', 'composition', 'manufacturer', 'supplier', 'country', 'rx', 'compositionNote']) {
    if (p[key] != null && typeof p[key] !== 'string') return `invalid ${key}`;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    /* ---------- API ---------- */
    if (p === '/api/login' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 10_000)).toString() || '{}');
      const userOk = String(body.user || '').trim().toLowerCase() === ADMIN_USER.toLowerCase();
      const passOk = Boolean(ADMIN_PASSCODE) && body.passcode === ADMIN_PASSCODE;
      return send(res, (userOk && passOk) ? 200 : 401, { ok: userOk && passOk });
    }

    // resume an existing session using the stored passcode header (username already verified at login)
    if (p === '/api/verify' && req.method === 'POST') {
      return send(res, authed(req) ? 200 : 401, { ok: authed(req) });
    }

    if (p === '/api/products' && req.method === 'GET') {
      return send(res, 200, loadData());
    }

    if (p.startsWith('/api/') && req.method !== 'GET') {
      if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
    }

    if (p === '/api/products' && req.method === 'POST') {
      const data = loadData();
      const body = JSON.parse((await readBody(req, 100_000)).toString());
      const err = validProduct(body, data.categories);
      if (err) return send(res, 400, { error: err });
      let id = slugify(body.n); let n = 2;
      while (data.products.some(x => x.id === id)) id = slugify(body.n) + '-' + n++;
      const prod = { id, n: body.n.trim(), cat: body.cat, img: body.img || null,
        b: body.b, ch: body.ch, form: body.form || '', ind: body.ind || '', flag: body.flag || null,
        pack: body.pack || '', composition: body.composition || '', manufacturer: body.manufacturer || '',
        supplier: body.supplier || '', country: body.country || '', rx: body.rx || '', compositionNote: body.compositionNote || '' };
      data.products.push(prod);
      saveData(data);
      return send(res, 201, prod);
    }

    const prodMatch = p.match(/^\/api\/products\/([a-z0-9-]+)$/);
    if (prodMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
      const data = loadData();
      const idx = data.products.findIndex(x => x.id === prodMatch[1]);
      if (idx < 0) return send(res, 404, { error: 'not found' });
      if (req.method === 'DELETE') {
        const [gone] = data.products.splice(idx, 1);
        saveData(data);
        return send(res, 200, { deleted: gone.id });
      }
      const body = JSON.parse((await readBody(req, 100_000)).toString());
      const err = validProduct(body, data.categories);
      if (err) return send(res, 400, { error: err });
      const cur = data.products[idx];
      data.products[idx] = { id: cur.id, n: body.n.trim(), cat: body.cat,
        img: body.img !== undefined ? body.img : cur.img,
        b: body.b, ch: body.ch, form: body.form || '', ind: body.ind || '', flag: body.flag || null,
        pack: body.pack !== undefined ? body.pack : (cur.pack || ''),
        composition: body.composition !== undefined ? body.composition : (cur.composition || ''),
        manufacturer: body.manufacturer !== undefined ? body.manufacturer : (cur.manufacturer || ''),
        supplier: body.supplier !== undefined ? body.supplier : (cur.supplier || ''),
        country: body.country !== undefined ? body.country : (cur.country || ''),
        rx: body.rx !== undefined ? body.rx : (cur.rx || ''),
        compositionNote: body.compositionNote !== undefined ? body.compositionNote : (cur.compositionNote || '') };
      saveData(data);
      return send(res, 200, data.products[idx]);
    }

    if (p === '/api/categories' && req.method === 'POST') {
      const data = loadData();
      const body = JSON.parse((await readBody(req, 10_000)).toString());
      if (!body.name || !['med', 'ff'].includes(body.div)) return send(res, 400, { error: 'name and div (med|ff) required' });
      let k = slugify(body.name); let n = 2;
      while (data.categories.some(c => c.k === k)) k = slugify(body.name) + '-' + n++;
      const cat = { k, div: body.div, name: body.name.trim() };
      data.categories.push(cat);
      saveData(data);
      return send(res, 201, cat);
    }

    const catMatch = p.match(/^\/api\/categories\/([a-z0-9-]+)$/);
    if (catMatch && req.method === 'DELETE') {
      const data = loadData();
      const k = catMatch[1];
      if (!data.categories.some(c => c.k === k)) return send(res, 404, { error: 'not found' });
      if (data.products.some(x => x.cat === k)) return send(res, 400, { error: 'category still has products' });
      data.categories = data.categories.filter(c => c.k !== k);
      saveData(data);
      return send(res, 200, { deleted: k });
    }

    if (p === '/api/upload' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 8_000_000)).toString());
      const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(body.dataUri || '');
      if (!m) return send(res, 400, { error: 'expected dataUri (png/jpeg/webp)' });
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const name = slugify(body.name || 'shot') + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(m[2], 'base64'));
      return send(res, 201, { url: '/uploads/' + name });
    }

    if (p.startsWith('/api/')) return send(res, 404, { error: 'no such endpoint' });

    /* ---------- static ---------- */
    if (p.startsWith('/uploads/')) {
      const f = path.join(UPLOAD_DIR, path.normalize(p.slice(9)).replace(/^(\.\.[/\\])+/, ''));
      if (!f.startsWith(UPLOAD_DIR) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return send(res, 404, 'not found', 'text/plain');
      const buf = fs.readFileSync(f);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=3600' });
      return res.end(buf);
    }

    // clean admin URL: /admin (and /admin/) -> login + dashboard page
    if (p === '/admin' || p === '/admin/') {
      const buf = fs.readFileSync(path.join(PUBLIC_DIR, 'admin.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
      return res.end(buf);
    }

    let file = p === '/' ? '/index.html' : p;
    const f = path.join(PUBLIC_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
    if (f.startsWith(PUBLIC_DIR) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const buf = fs.readFileSync(f);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Content-Length': buf.length });
      return res.end(buf);
    }
    return send(res, 404, 'not found', 'text/plain');
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log('CT Pharma site + admin on http://localhost:' + PORT));
