
/* EventFlow v3.3.1 — Rebuilt server.js (clean, validated)
 * Features: Auth (JWT cookie), Suppliers, Packages, Plans/Notes, Threads/Messages,
 * Admin approvals + metrics, Settings, Featured packages, Sitemap.
 * Email: safe dev mode by default (writes .eml files to /outbox).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const nodemailer = require('nodemailer');

require('dotenv').config();

// Local JSON storage helpers (from ./store.js)
const { read, write, uid, DATA_DIR } = require('./store');
const { seed } = require('./seed');

// ---------- Initialisation ----------
seed();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = String(process.env.JWT_SECRET || 'change_me');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Rate limits
const authLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 80,  standardHeaders: true, legacyHeaders: false });

// ---------- Email (safe dev mode) ----------
const EMAIL_ENABLED = String(process.env.EMAIL_ENABLED || 'false').toLowerCase() === 'true';
const FROM_EMAIL = process.env.FROM_EMAIL || 'no-reply@eventflow.local';
let transporter = null;

if (EMAIL_ENABLED && process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}

// Always save outgoing email to /outbox in dev
function ensureOutbox() {
  const outDir = path.join(DATA_DIR, '..', 'outbox');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  return outDir;
}
async function sendMail(to, subject, text) {
  const outDir = ensureOutbox();
  const blob = `To: ${to}\nFrom: ${FROM_EMAIL}\nSubject: ${subject}\n\n${text}\n`;
  fs.writeFileSync(path.join(outDir, `email-${Date.now()}.eml`), blob, 'utf8');
  if (transporter) {
    try { await transporter.sendMail({ from: FROM_EMAIL, to, subject, text }); } catch (e) { /* swallow in dev */ }
  }
}

// ---------- Auth helpers ----------
function setAuthCookie(res, token) {
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 });
}
function clearAuthCookie(res) { res.clearCookie('token'); }
function getUserFromCookie(req) {
  const t = req.cookies && req.cookies.token;
  if (!t) return null;
  try { return jwt.verify(t, JWT_SECRET); } catch { return null; }
}
function authRequired(req, res, next) {
  const u = getUserFromCookie(req);
  if (!u) return res.status(401).json({ error: 'Unauthenticated' });
  req.user = u;
  next();
}
function roleRequired(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
function passwordOk(pw='') {
  return typeof pw === 'string' && pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

// ---------- AUTH ----------
app.post('/api/auth/register', authLimiter, (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  if (!validator.isEmail(String(email))) return res.status(400).json({ error: 'Invalid email' });
  if (!passwordOk(password)) return res.status(400).json({ error: 'Weak password' });
  const roleFinal = (role === 'supplier' || role === 'customer') ? role : 'customer';

  const users = read('users');
  if (users.find(u => u.email.toLowerCase() === String(email).toLowerCase())) return res.status(409).json({ error: 'Email already registered' });

  const user = {
    id: uid('usr'),
    name: String(name).trim().slice(0, 80),
    email: String(email).toLowerCase(),
    role: roleFinal,
    passwordHash: bcrypt.hashSync(password, 10),
    notify: true,
    createdAt: new Date().toISOString()
  };
  users.push(user); write('users', users);

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  setAuthCookie(res, token);

  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const user = read('users').find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  if (!bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  setAuthCookie(res, token);
  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/logout', (_req, res) => { clearAuthCookie(res); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => {
  const p = getUserFromCookie(req);
  if (!p) return res.json({ user: null });
  const u = read('users').find(x => x.id === p.id);
  res.json({ user: u ? { id: u.id, name: u.name, email: u.email, role: u.role, notify: u.notify !== false } : null });
});

// ---------- Suppliers (public) ----------
app.get('/api/suppliers', (req, res) => {
  const { category, q, price } = req.query;
  let items = read('suppliers').filter(s => s.approved);
  if (category) items = items.filter(s => s.category === category);
  if (price) items = items.filter(s => (s.price_display || '').includes(price));
  if (q) {
    const qq = String(q).toLowerCase();
    items = items.filter(s =>
      (s.name || '').toLowerCase().includes(qq) ||
      (s.description_short || '').toLowerCase().includes(qq) ||
      (s.location || '').toLowerCase().includes(qq)
    );
  }
  res.json({ items });
});

app.get('/api/suppliers/:id', (req, res) => {
  const s = read('suppliers').find(x => x.id === req.params.id && x.approved);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

app.get('/api/suppliers/:id/packages', (req, res) => {
  const supplier = read('suppliers').find(x => x.id === req.params.id && x.approved);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
  const pkgs = read('packages').filter(p => p.supplierId === supplier.id && p.approved);
  res.json({ items: pkgs });
});

app.get('/api/packages/featured', (_req, res) => {
  const items = read('packages').filter(p => p.approved).sort((a,b) => Number(b.featured) - Number(a.featured)).slice(0, 6);
  res.json({ items });
});

app.get('/api/packages/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const items = read('packages').filter(p => p.approved && (
    (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
  ));
  res.json({ items });
});

// ---------- Supplier dashboard ----------
app.get('/api/me/suppliers', authRequired, roleRequired('supplier'), (req, res) => {
  const list = read('suppliers').filter(s => s.ownerUserId === req.user.id);
  res.json({ items: list });
});

app.post('/api/me/suppliers', writeLimiter, authRequired, roleRequired('supplier'), (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category) return res.status(400).json({ error: 'Missing fields' });
  const photos = (b.photos ? (Array.isArray(b.photos) ? b.photos : String(b.photos).split(/\r?\n/)) : [])
    .map(x => String(x).trim()).filter(Boolean);

  const amenities = (b.amenities ? String(b.amenities).split(',') : []).map(x => x.trim()).filter(Boolean);

  const s = {
    id: uid('sup'),
    ownerUserId: req.user.id,
    name: String(b.name).slice(0, 120),
    category: b.category,
    location: String(b.location || '').slice(0, 120),
    price_display: String(b.price_display || '').slice(0, 60),
    website: String(b.website || '').slice(0, 200),
    license: String(b.license || '').slice(0, 120),
    amenities,
    maxGuests: parseInt(b.maxGuests || 0, 10),
    description_short: String(b.description_short || '').slice(0, 220),
    description_long: String(b.description_long || '').slice(0, 2000),
    photos: photos.length ? photos : [`https://source.unsplash.com/featured/800x600/?event,${encodeURIComponent(b.category)}`],
    email: read('users').find(u => u.id === req.user.id)?.email || '',
    approved: false
  };
  const all = read('suppliers'); all.push(s); write('suppliers', all);
  res.json({ ok: true, supplier: s });
});

app.patch('/api/me/suppliers/:id', writeLimiter, authRequired, roleRequired('supplier'), (req, res) => {
  const all = read('suppliers');
  const i = all.findIndex(s => s.id === req.params.id && s.ownerUserId === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};

  const fields = ['name','category','location','price_display','website','license','description_short','description_long'];
  for (const k of fields) if (typeof b[k] === 'string') all[i][k] = b[k];

  if (b.amenities) all[i].amenities = String(b.amenities).split(',').map(x => x.trim()).filter(Boolean);
  if (b.maxGuests != null) all[i].maxGuests = parseInt(b.maxGuests,10) || 0;
  if (b.photos) {
    const photos = (Array.isArray(b.photos) ? b.photos : String(b.photos).split(/\r?\n/)).map(x => String(x).trim()).filter(Boolean);
    if (photos.length) all[i].photos = photos;
  }
  all[i].approved = false;
  write('suppliers', all);
  res.json({ ok: true, supplier: all[i] });
});

app.get('/api/me/packages', authRequired, roleRequired('supplier'), (req, res) => {
  const mine = read('suppliers').filter(s => s.ownerUserId === req.user.id).map(s => s.id);
  const items = read('packages').filter(p => mine.includes(p.supplierId));
  res.json({ items });
});

app.post('/api/me/packages', writeLimiter, authRequired, roleRequired('supplier'), (req, res) => {
  const { supplierId, title, description, price, image } = req.body || {};
  if (!supplierId || !title) return res.status(400).json({ error: 'Missing fields' });
  const own = read('suppliers').find(s => s.id === supplierId && s.ownerUserId === req.user.id);
  if (!own) return res.status(403).json({ error: 'Forbidden' });

  const pkg = {
    id: uid('pkg'),
    supplierId,
    title: String(title).slice(0, 120),
    description: String(description || '').slice(0, 1500),
    price: String(price || '').slice(0, 60),
    image: image || 'https://source.unsplash.com/featured/800x600/?package,event',
    approved: false,
    featured: false
  };
  const all = read('packages'); all.push(pkg); write('packages', all);
  res.json({ ok: true, package: pkg });
});

// ---------- Threads & Messages ----------
app.post('/api/threads/start', writeLimiter, authRequired, async (req, res) => {
  const { supplierId } = req.body || {};
  if (!supplierId) return res.status(400).json({ error: 'Missing supplierId' });
  const supplier = read('suppliers').find(s => s.id === supplierId && s.approved);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  const threads = read('threads');
  let thread = threads.find(t => t.supplierId === supplierId && t.customerId === req.user.id);
  if (!thread) {
    thread = { id: uid('thd'), supplierId, supplierName: supplier.name, customerId: req.user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    threads.push(thread); write('threads', threads);
  }

  // Email notify supplier (safe IIFE)
  (async () => {
    try {
      const customer = read('users').find(u => u.id === req.user.id);
      if (supplier.email && customer && customer.notify !== false) {
        await sendMail(supplier.email, 'New enquiry on EventFlow', `A customer started a conversation about ${supplier.name}.`);
      }
    } catch (e) { /* dev-safe */ }
  })();

  res.json({ ok: true, thread });
});

app.get('/api/threads/my', authRequired, (req, res) => {
  const ts = read('threads');
  let items = [];
  if (req.user.role === 'customer') items = ts.filter(t => t.customerId === req.user.id);
  else if (req.user.role === 'supplier') {
    const mine = read('suppliers').filter(s => s.ownerUserId === req.user.id).map(s => s.id);
    items = ts.filter(t => mine.includes(t.supplierId));
  } else if (req.user.role === 'admin') items = ts;
  const msgs = read('messages');
  items = items.map(t => ({ ...t, last: msgs.filter(m => m.threadId === t.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0] || null }));
  res.json({ items });
});

app.get('/api/threads/:id/messages', authRequired, (req, res) => {
  const t = read('threads').find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Thread not found' });
  if (req.user.role !== 'admin' && t.customerId !== req.user.id) {
    const own = read('suppliers').find(s => s.id === t.supplierId && s.ownerUserId === req.user.id);
    if (!own) return res.status(403).json({ error: 'Forbidden' });
  }
  const msgs = read('messages').filter(m => m.threadId === t.id).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  res.json({ items: msgs });
});

app.post('/api/threads/:id/messages', writeLimiter, authRequired, (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Missing text' });
  const t = read('threads').find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Thread not found' });
  if (req.user.role !== 'admin' && t.customerId !== req.user.id) {
    const own = read('suppliers').find(s => s.id === t.supplierId && s.ownerUserId === req.user.id);
    if (!own) return res.status(403).json({ error: 'Forbidden' });
  }
  const msgs = read('messages'); const entry = { id: uid('msg'), threadId: t.id, fromUserId: req.user.id, fromRole: req.user.role, text: String(text).slice(0, 4000), createdAt: new Date().toISOString() };
  msgs.push(entry); write('messages', msgs);

  // Update thread timestamp
  const th = read('threads'); const i = th.findIndex(x => x.id === t.id); if (i >= 0) { th[i].updatedAt = entry.createdAt; write('threads', th); }

  // Email notify other party (safe IIFE)
  (async () => {
    try {
      const otherEmail = (req.user.role === 'customer')
        ? (read('suppliers').find(s => s.id === t.supplierId)?.email || null)
        : (read('users').find(u => u.id === t.customerId)?.email || null);
      const me = read('users').find(u => u.id === req.user.id);
      if (otherEmail && me && me.notify !== false) {
        await sendMail(otherEmail, 'New message on EventFlow', `You have a new message in a conversation.\n\n${entry.text.slice(0, 500)}`);
      }
    } catch (e) { /* dev-safe */ }
  })();

  res.json({ ok: true, message: entry });
});

// ---------- Plan & Notes (customer) ----------
app.get('/api/plan', authRequired, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ error: 'Customers only' });
  const plans = read('plans').filter(p => p.userId === req.user.id);
  const suppliers = read('suppliers').filter(s => s.approved);
  const items = plans.map(p => suppliers.find(s => s.id === p.supplierId)).filter(Boolean);
  res.json({ items });
});

app.post('/api/plan', authRequired, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ error: 'Customers only' });
  const { supplierId } = req.body || {}; if (!supplierId) return res.status(400).json({ error: 'Missing supplierId' });
  const s = read('suppliers').find(x => x.id === supplierId && x.approved); if (!s) return res.status(404).json({ error: 'Supplier not found' });
  const all = read('plans'); if (!all.find(p => p.userId === req.user.id && p.supplierId === supplierId)) all.push({ id: uid('pln'), userId: req.user.id, supplierId, createdAt: new Date().toISOString() });
  write('plans', all); res.json({ ok: true });
});

app.delete('/api/plan/:supplierId', authRequired, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ error: 'Customers only' });
  const all = read('plans').filter(p => !(p.userId === req.user.id && p.supplierId === req.params.supplierId));
  write('plans', all); res.json({ ok: true });
});

app.get('/api/notes', authRequired, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ error: 'Customers only' });
  const n = read('notes').find(x => x.userId === req.user.id); res.json({ text: n?.text || '' });
});

app.post('/api/notes', authRequired, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ error: 'Customers only' });
  const all = read('notes'); const i = all.findIndex(x => x.userId === req.user.id);
  if (i >= 0) { all[i].text = String(req.body?.text || ''); all[i].updatedAt = new Date().toISOString(); }
  else { all.push({ id: uid('nte'), userId: req.user.id, text: String(req.body?.text || ''), createdAt: new Date().toISOString() }); }
  write('notes', all); res.json({ ok: true });
});

// ---------- Settings ----------
app.get('/api/me/settings', authRequired, (req, res) => {
  const users = read('users'); const i = users.findIndex(u => u.id === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  res.json({ notify: users[i].notify !== false });
});
app.post('/api/me/settings', authRequired, (req, res) => {
  const users = read('users'); const i = users.findIndex(u => u.id === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  users[i].notify = !!req.body?.notify; write('users', users); res.json({ ok: true, notify: users[i].notify });
});

// ---------- Admin ----------
app.get('/api/admin/metrics', authRequired, roleRequired('admin'), (_req, res) => {
  const users = read('users'), suppliers = read('suppliers'), plans = read('plans'), msgs = read('messages'), pkgs = read('packages'), threads = read('threads');
  res.json({ counts: {
    usersTotal: users.length,
    usersByRole: users.reduce((a,u) => { a[u.role] = (a[u.role] || 0) + 1; return a; }, {}),
    suppliersTotal: suppliers.length,
    packagesTotal: pkgs.length,
    plansTotal: plans.length,
    messagesTotal: msgs.length,
    threadsTotal: threads.length
  }});
});

app.get('/api/admin/suppliers', authRequired, roleRequired('admin'), (_req, res) => res.json({ items: read('suppliers') }));
app.post('/api/admin/suppliers/:id/approve', authRequired, roleRequired('admin'), (req, res) => {
  const all = read('suppliers'); const i = all.findIndex(s => s.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  all[i].approved = !!req.body?.approved; write('suppliers', all); res.json({ ok: true, supplier: all[i] });
});
app.get('/api/admin/packages', authRequired, roleRequired('admin'), (_req, res) => res.json({ items: read('packages') }));
app.post('/api/admin/packages/:id/approve', authRequired, roleRequired('admin'), (req, res) => {
  const all = read('packages'); const i = all.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  all[i].approved = !!req.body?.approved; write('packages', all); res.json({ ok: true, package: all[i] });
});
app.post('/api/admin/packages/:id/feature', authRequired, roleRequired('admin'), (req, res) => {
  const all = read('packages'); const i = all.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  all[i].featured = !!req.body?.featured; write('packages', all); res.json({ ok: true, package: all[i] });
});

// ---------- Sitemap ----------
app.get('/sitemap.xml', (_req, res) => {
  const base = `http://localhost:${PORT}`;
  const suppliers = read('suppliers').filter(s => s.approved).map(s => `${base}/supplier.html?id=${s.id}`);
  const urls = [ `${base}/`, `${base}/suppliers.html`, `${base}/start.html`, `${base}/plan.html`, `${base}/auth.html`, ...suppliers ];
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls.map(u => `<url><loc>${u}</loc></url>`), '</urlset>'].join('');
  res.set('Content-Type','application/xml'); res.send(xml);
});

// ---------- Protected HTML routes ----------
const sendHTML = (res, file) => res.sendFile(path.join(__dirname, 'public', file));
app.get('/dashboard/customer', authRequired, (req, res) => { if (req.user.role !== 'customer') return res.redirect('/auth.html'); sendHTML(res, 'dashboard-customer.html'); });
app.get('/dashboard/supplier', authRequired, (req, res) => { if (req.user.role !== 'supplier') return res.redirect('/auth.html'); sendHTML(res, 'dashboard-supplier.html'); });
app.get('/admin', authRequired, (req, res) => { if (req.user.role !== 'admin') return res.redirect('/auth.html'); sendHTML(res, 'admin.html'); });

// ---------- Static & 404 ----------
app.use(express.static(path.join(__dirname, 'public')));
app.use((_req, res) => res.status(404).send('Not found'));

// ---------- Start ----------
app.listen(PORT, () => console.log(`EventFlow v3.3.1 server running → http://localhost:${PORT}`));
