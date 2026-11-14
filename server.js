// ===== Level Three Barbería · Servidor (sin dependencias, solo Node 22.13+) =====
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync, statSync, createReadStream } from 'node:fs';
import { join, extname, normalize, sep, dirname } from 'node:path';
import { createHmac, randomBytes, timingSafeEqual, createHash, scryptSync } from 'node:crypto';

// ---- Variables de entorno (.env) ----
const ROOT = import.meta.dirname;
if (existsSync(join(ROOT, '.env'))) {
  for (const l of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
process.env.TZ ||= 'America/Bogota';
const { db } = await import('./db.js');

const PORT = +process.env.PORT || 3000;
const PUB = join(ROOT, 'public');
const UPLOADS = process.env.UPLOADS_DIR || join(ROOT, 'data', 'uploads');
mkdirSync(UPLOADS, { recursive: true });

let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  // la clave interna se guarda junto a la base de datos (así también queda en el disco persistente)
  const dir = dirname(process.env.DB_PATH || join(ROOT, 'data', 'x')), f = join(dir, 'secret');
  mkdirSync(dir, { recursive: true });
  if (!existsSync(f)) writeFileSync(f, randomBytes(32).toString('hex'), { mode: 0o600 });
  SECRET = readFileSync(f, 'utf8');
}

// ---- Utilidades ----
class HttpError extends Error { constructor(s, m) { super(m); this.s = s; } }
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const intOr = (v, d = 0) => (Number.isFinite(+v) ? Math.round(+v) : d);
const cfg = () => JSON.parse(db.prepare("SELECT value FROM settings WHERE key='config'").get().value);
const q1 = (sql, ...a) => db.prepare(sql).get(...a);
const qa = (sql, ...a) => db.prepare(sql).all(...a);
const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };

const hits = new Map(); // límite simple de intentos por IP
function limit(ip, key, max, ms) {
  const k = key + ip, now = Date.now(), h = hits.get(k);
  if (!h || now > h.t) { hits.set(k, { n: 1, t: now + ms }); return; }
  if (++h.n > max) throw new HttpError(429, 'Demasiados intentos. Espera un momento.');
}
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (n > v.t) hits.delete(k); }, 60000).unref();

// ---- Horarios ----
function slotsOf(c) {
  const [oh, om] = c.open.split(':').map(Number), [ch, cm] = c.close.split(':').map(Number), out = [];
  for (let m = oh * 60 + om; m + c.slot <= ch * 60 + cm; m += c.slot) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}
function checkDate(date, c) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new HttpError(400, 'Fecha no válida.');
  const t = new Date(); const today = ymd(t); t.setDate(t.getDate() + c.daysAhead);
  if (date < today || date > ymd(t)) throw new HttpError(400, 'Esa fecha no está disponible.');
  if (c.closedDays.includes(new Date(date + 'T12:00').getDay())) throw new HttpError(400, 'Ese día estamos cerrados.');
}
function availability(date) {
  const c = cfg(); checkDate(date, c);
  const barbers = qa('SELECT id FROM barbers WHERE active=1 ORDER BY id');
  const taken = qa("SELECT time,barber_id FROM bookings WHERE date=? AND status!='cancelled'", date);
  const blocks = qa('SELECT time,barber_id FROM blocks WHERE date=?', date);
  const today = ymd(new Date()), now = nowHM();
  return slotsOf(c).map(time => {
    let free = barbers.filter(b => !taken.some(t => t.time === time && t.barber_id === b.id) &&
      !blocks.some(k => (k.time === time || k.time === '*') && (k.barber_id === 0 || k.barber_id === b.id))).map(b => b.id);
    if (date === today && time <= now) free = [];
    return { time, free };
  });
}

// ---- Autenticación del administrador (cookie firmada) ----
const sign = p => createHmac('sha256', SECRET).update(p).digest('base64url');
const makeToken = () => { const p = String(Date.now() + 12 * 3600e3); return p + '.' + sign(p); };
function isAdmin(req) {
  const m = /(?:^|;\s*)lt_admin=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return false;
  const [p, s] = m[1].split('.'); if (!s) return false;
  const a = Buffer.from(sign(p)), b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b) && Date.now() < +p;
}
const sha = s => createHash('sha256').update(String(s)).digest();
const customerToken = id => { const p = `${id}.${Date.now() + 30 * 24 * 3600e3}`; return p + '.' + sign('customer:' + p); };
function customerFrom(req) {
  const m = /(?:^|;\s*)lt_customer=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const [id, exp, sig] = m[1].split('.'); if (!id || !exp || !sig || Date.now() > +exp) return null;
  const expected = Buffer.from(sign(`customer:${id}.${exp}`)), got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return q1('SELECT id,name,phone FROM customers WHERE id=?', intOr(id)) || null;
}
function setCustomerCookie(res, id) { res.setHeader('Set-Cookie', `lt_customer=${customerToken(id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`); }
function clearCustomerCookie(res) { res.setHeader('Set-Cookie', 'lt_customer=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); }
const passwordHash = password => { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 64).toString('hex'); };
const passwordOk = (password, stored) => { const [salt, hash] = String(stored).split(':'); if (!salt || !hash) return false; const a = Buffer.from(hash, 'hex'), b = scryptSync(password, salt, 64); return a.length === b.length && timingSafeEqual(a, b); };


// ---- Rutas de la API ----
const routes = [];
const route = (m, p, h, admin = false) => routes.push({ m, admin, h, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') });
const pubBooking = b => ({ code: b.code, name: b.name, service: b.service_name, extras: b.extras, barber: b.barber_name, date: b.date, time: b.time, price: b.price, status: b.status });

// === Públicas ===
route('GET', '/api/config', () => ({
  services: qa('SELECT id,name,price,duration,icon FROM services WHERE active=1 ORDER BY sort,rowid'),
  extras: qa('SELECT id,name,price,emoji FROM extras WHERE active=1 ORDER BY sort,rowid'),
  barbers: qa('SELECT id,name FROM barbers WHERE active=1 ORDER BY id'),
  settings: cfg()
}));
route('GET', '/api/availability', ({ q }) => ({ date: q.get('date'), slots: availability(q.get('date')) }));

route('POST', '/api/bookings', ({ body, ip, req }) => {
  limit(ip, 'book', +process.env.BOOK_LIMIT || 15, 3600e3);
  const c = cfg();
  const customer = customerFrom(req);
  if (!customer) throw new HttpError(401, 'Para reservar debes crear una cuenta o iniciar sesión.');
  const name = customer.name, phone = customer.phone;
  checkDate(body.date, c);
  if (!slotsOf(c).includes(body.time)) throw new HttpError(400, 'Hora no válida.');
  if (body.date === ymd(new Date()) && body.time <= nowHM()) throw new HttpError(400, 'Esa hora ya pasó.');
  const svc = q1('SELECT * FROM services WHERE id=? AND active=1', String(body.serviceId));
  if (!svc) throw new HttpError(400, 'Elige un servicio.');
  const ids = Array.isArray(body.extraIds) ? body.extraIds.slice(0, 10).map(String) : [];
  const exs = ids.map(id => q1('SELECT * FROM extras WHERE id=? AND active=1', id)).filter(Boolean);
  const price = svc.price + exs.reduce((s, e) => s + e.price, 0);
  try {
    return tx(() => {
      const slot = availability(body.date).find(s => s.time === body.time);
      const want = intOr(body.barberId), bid = want ? (slot.free.includes(want) ? want : 0) : slot.free[0];
      if (!bid) throw new HttpError(409, 'Esa hora ya no está disponible. Elige otra.');
      const barber = q1('SELECT name FROM barbers WHERE id=?', bid);
      let code; do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (q1('SELECT 1 FROM bookings WHERE code=?', code));
      db.prepare('INSERT INTO bookings(code,name,phone,service_id,service_name,extras,barber_id,barber_name,date,time,price,note,customer_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(code, name, phone, svc.id, svc.name, exs.map(e => e.name).join(', '), bid, barber.name, body.date, body.time, price, clean(body.note, 120), customer?.id || null);
      return pubBooking(q1('SELECT * FROM bookings WHERE code=?', code));
    });
  } catch (e) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Esa hora ya no está disponible. Elige otra.'); throw e; }
});
route('POST', '/api/bookings/cancel', ({ body, ip }) => {
  limit(ip, 'cancel', 20, 3600e3);
  const phone = String(body.phone || '').replace(/\D/g, '').slice(-10);
  const b = q1('SELECT * FROM bookings WHERE code=?', String(body.code || '').toUpperCase());
  if (!b || !phone || !b.phone.endsWith(phone)) throw new HttpError(404, 'No encontramos esa reserva.');
  if (b.status === 'confirmed') db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(b.id);
  return { ok: true };
});
// === Cuenta del cliente: registro, inicio de sesión e historial ===
route('POST', '/api/customer/register', ({ body, req, res, ip }) => {
  limit(ip, 'customer-register', 8, 3600e3);
  const name = clean(body.name, 60), phone = String(body.phone || '').replace(/\D/g, ''), password = String(body.password || '');
  if (name.length < 2) throw new HttpError(400, 'Escribe tu nombre completo.');
  if (phone.length < 10 || phone.length > 15) throw new HttpError(400, 'Escribe un celular válido con indicativo si aplica.');
  if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener mínimo 8 caracteres.');
  if (q1('SELECT id FROM customers WHERE phone=?', phone)) throw new HttpError(409, 'Ya existe una cuenta con ese celular. Inicia sesión.');
  const r = db.prepare('INSERT INTO customers(name,phone,password_hash) VALUES(?,?,?)').run(name, phone, passwordHash(password));
  const id = Number(r.lastInsertRowid);
  // Importa al perfil las reservas anteriores asociadas al mismo número.
  db.prepare('UPDATE bookings SET customer_id=? WHERE phone=? AND customer_id IS NULL').run(id, phone);
  setCustomerCookie(res, id); return { customer: { id, name, phone } };
});
route('POST', '/api/customer/login', ({ body, res, ip }) => {
  limit(ip, 'customer-login', 12, 900000);
  const phone = String(body.phone || '').replace(/\D/g, ''), password = String(body.password || ''), user = q1('SELECT * FROM customers WHERE phone=?', phone);
  if (!user || !passwordOk(password, user.password_hash)) throw new HttpError(401, 'Celular o contraseña incorrectos.');
  setCustomerCookie(res, user.id); return { customer: { id: user.id, name: user.name, phone: user.phone } };
});
route('POST', '/api/customer/logout', ({ res }) => { clearCustomerCookie(res); return { ok: true }; });
route('GET', '/api/customer/me', ({ req }) => { const u = customerFrom(req); if (!u) throw new HttpError(401, 'Inicia sesión para ver tu cuenta.'); return { customer: u }; });
route('GET', '/api/customer/bookings', ({ req }) => {
  const u = customerFrom(req); if (!u) throw new HttpError(401, 'Inicia sesión para ver tus reservas.');
  return qa('SELECT code,name,service_name AS service,extras,barber_name AS barber,date,time,price,status,created_at FROM bookings WHERE customer_id=? ORDER BY date DESC,time DESC', u.id);
});

route('GET', '/api/reviews', () => {
  const list = qa('SELECT id,name,stars,text,created_at FROM reviews ORDER BY id DESC LIMIT 100');
  return { list, avg: list.length ? list.reduce((s, r) => s + r.stars, 0) / list.length : 0 };
});
route('POST', '/api/reviews', ({ body, ip }) => {
  limit(ip, 'rev', 3, 3600e3);
  const name = clean(body.name, 40), stars = intOr(body.stars);
  if (name.length < 2) throw new HttpError(400, 'Escribe tu nombre.');
  if (stars < 1 || stars > 5) throw new HttpError(400, 'Elige de 1 a 5 estrellas.');
  db.prepare('INSERT INTO reviews(name,stars,text) VALUES(?,?,?)').run(name, stars, clean(body.text, 200));
});
route('GET', '/api/gallery', () => qa('SELECT id,title,file FROM gallery ORDER BY id DESC').map(g => ({ id: g.id, title: g.title, url: '/uploads/' + g.file })));
route('GET', '/api/media', () => qa('SELECT id,section,title,file,mime FROM media ORDER BY id DESC').map(x => ({...x,url:'/uploads/'+x.file}))); 

// === Administrador ===
route('POST', '/api/admin/login', () => ({ ok: true, message: 'Acceso sin contraseña.' }));
route('POST', '/api/admin/logout', () => ({ ok: true }));

route('GET', '/api/admin/summary', () => {
  const t = new Date(), today = ymd(t), live = "status!='cancelled'";
  const from = new Date(t); from.setDate(from.getDate() - 13);
  const one = (w, ...a) => q1(`SELECT COUNT(*) n, COALESCE(SUM(price),0) s FROM bookings WHERE ${live} ${w}`, ...a);
  return {
    today, total: one(''), hoy: one('AND date=?', today), proximas: one('AND date>=?', today),
    clientes: q1(`SELECT COUNT(DISTINCT phone) n FROM bookings WHERE ${live}`).n,
    canceladas: q1("SELECT COUNT(*) n FROM bookings WHERE status='cancelled'").n,
    porServicio: qa(`SELECT service_name name,COUNT(*) n FROM bookings WHERE ${live} GROUP BY service_name ORDER BY n DESC`),
    porBarbero: qa(`SELECT barber_name name,COUNT(*) n FROM bookings WHERE ${live} GROUP BY barber_name ORDER BY n DESC`),
    dias: qa(`SELECT date,COUNT(*) n,SUM(price) s FROM bookings WHERE ${live} AND date BETWEEN ? AND ? GROUP BY date ORDER BY date`, ymd(from), today)
  };
}, true);
route('GET', '/api/admin/bookings', ({ q }) => {
  const today = ymd(new Date()), scope = q.get('scope') || 'upcoming', st = q.get('status'), d = q.get('date');
  let w = '1=1'; const a = [];
  if (d) { w += ' AND date=?'; a.push(d); } else if (scope === 'today') { w += ' AND date=?'; a.push(today); } else if (scope === 'upcoming') { w += ' AND date>=?'; a.push(today); }
  if (st) { w += ' AND status=?'; a.push(st); } else if (scope !== 'all') w += " AND status!='cancelled'";
  return qa(`SELECT * FROM bookings WHERE ${w} ORDER BY date,time LIMIT 1000`, ...a);
}, true);
route('PATCH', '/api/admin/bookings/:id', ({ p, body }) => {
  if (!['confirmed', 'done', 'noshow', 'cancelled'].includes(body.status)) throw new HttpError(400, 'Estado no válido.');
  try { db.prepare('UPDATE bookings SET status=? WHERE id=?').run(body.status, intOr(p.id)); }
  catch (e) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Esa hora ya fue tomada por otra reserva.'); throw e; }
}, true);
route('GET', '/api/admin/export', ({ res }) => {
  const cell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const rows = qa('SELECT * FROM bookings ORDER BY date,time'), cols = ['code', 'name', 'phone', 'service_name', 'extras', 'barber_name', 'date', 'time', 'price', 'status', 'note', 'created_at'];
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="reservas.csv"' });
  res.end('\ufeff' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n'));
}, true);

route('GET', '/api/admin/catalog', () => ({
  services: qa('SELECT * FROM services ORDER BY sort,rowid'), extras: qa('SELECT * FROM extras ORDER BY sort,rowid'), barbers: qa('SELECT * FROM barbers ORDER BY id')
}), true);
const slug = s => clean(s, 30).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
route('PUT', '/api/admin/catalog', ({ body }) => tx(() => {
  const S = (body.services || []).filter(s => clean(s.name, 50)), E = body.extras || [], B = (body.barbers || []).filter(b => clean(b.name, 40));
  if (!S.length || !B.length) throw new HttpError(400, 'Debe haber al menos un servicio y un barbero.');
  const up = (table, cols, rows, mk) => {
    const keep = [];
    rows.forEach((r, i) => {
      const id = r.id || slug(r.name) + '-' + randomBytes(2).toString('hex'); keep.push(id);
      db.prepare(`INSERT INTO ${table}(id,${cols.join(',')},active,sort) VALUES(?,${cols.map(() => '?').join(',')},?,?) ON CONFLICT(id) DO UPDATE SET ${cols.map(c => c + '=excluded.' + c).join(',')},active=excluded.active,sort=excluded.sort`)
        .run(id, ...mk(r), r.active === 0 || r.active === false ? 0 : 1, i);
    });
    if (keep.length) db.prepare(`UPDATE ${table} SET active=0 WHERE id NOT IN (${keep.map(() => '?').join(',')})`).run(...keep);
    else db.exec(`UPDATE ${table} SET active=0`);
  };
  up('services', ['name', 'price', 'duration', 'icon'], S, s => [clean(s.name, 50), Math.max(0, intOr(s.price)), clean(s.duration, 20), ['clasico', 'fade', 'barba', 'vip'].includes(s.icon) ? s.icon : 'clasico']);
  up('extras', ['name', 'price', 'emoji'], E.filter(e => clean(e.name, 50)), e => [clean(e.name, 50), Math.max(0, intOr(e.price)), clean(e.emoji, 4) || '✨']);
  for (const b of B) {
    if (b.id) db.prepare('UPDATE barbers SET name=?,active=? WHERE id=?').run(clean(b.name, 40), b.active === 0 || b.active === false ? 0 : 1, intOr(b.id));
    else db.prepare('INSERT INTO barbers(name) VALUES(?)').run(clean(b.name, 40));
  }
}), true);
route('PUT', '/api/admin/settings', ({ body }) => {
  const c = cfg(), tm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (body.open !== undefined) { if (!tm.test(body.open)) throw new HttpError(400, 'Hora de apertura no válida.'); c.open = body.open; }
  if (body.close !== undefined) { if (!tm.test(body.close)) throw new HttpError(400, 'Hora de cierre no válida.'); c.close = body.close; }
  if (c.close <= c.open) throw new HttpError(400, 'El cierre debe ser después de la apertura.');
  if (body.slot !== undefined) c.slot = Math.min(120, Math.max(10, intOr(body.slot, 30)));
  if (body.daysAhead !== undefined) c.daysAhead = Math.min(60, Math.max(1, intOr(body.daysAhead, 14)));
  if (Array.isArray(body.closedDays)) c.closedDays = body.closedDays.map(intOr).filter(d => d >= 0 && d <= 6);
  for (const k of ['whatsapp', 'address', 'instagram']) if (body[k] !== undefined) c[k] = clean(body[k], 120).replace(k === 'whatsapp' ? /\D/g : /$^/, '');
  if (body.loyal !== undefined) c.loyal = Math.min(30, Math.max(2, intOr(body.loyal, 5)));
  if (Array.isArray(body.promos)) c.promos = body.promos.slice(0, 12).map(p => ({ n: clean(p.n, 40), d: clean(p.d, 100), p: clean(p.p, 20), image: clean(p.image, 180) })).filter(p => p.n);
  for (const k of ['heroTitle','heroSubtitle','heroKicker','heroVideo','mainTitle','mainText']) if (body[k] !== undefined) c[k] = clean(body[k], k === 'heroVideo' ? 180 : 180);
  db.prepare("UPDATE settings SET value=? WHERE key='config'").run(JSON.stringify(c));
}, true);

route('GET', '/api/admin/blocks', () => qa('SELECT * FROM blocks WHERE date>=? ORDER BY date,time', ymd(new Date())), true);
route('POST', '/api/admin/blocks', ({ body }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) throw new HttpError(400, 'Fecha no válida.');
  const time = body.time === '*' ? '*' : String(body.time);
  if (time !== '*' && !/^\d{2}:\d{2}$/.test(time)) throw new HttpError(400, 'Hora no válida.');
  db.prepare('INSERT INTO blocks(date,time,barber_id,reason) VALUES(?,?,?,?)').run(body.date, time, intOr(body.barberId), clean(body.reason, 60));
}, true);
route('DELETE', '/api/admin/blocks/:id', ({ p }) => { db.prepare('DELETE FROM blocks WHERE id=?').run(intOr(p.id)); }, true);

route('POST', '/api/admin/gallery', ({ body }) => {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.dataUrl || '');
  if (!m) throw new HttpError(400, 'Imagen no válida (usa JPG, PNG o WEBP).');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4e6) throw new HttpError(413, 'La imagen pesa demasiado (máx. 4 MB).');
  const ok = (m[1] === 'jpeg' && buf[0] === 0xff && buf[1] === 0xd8) || (m[1] === 'png' && buf.subarray(1, 4).toString() === 'PNG') ||
    (m[1] === 'webp' && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP');
  if (!ok) throw new HttpError(400, 'El archivo no es una imagen válida.');
  const file = `${Date.now()}-${randomBytes(4).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  writeFileSync(join(UPLOADS, file), buf);
  const r = db.prepare('INSERT INTO gallery(title,file) VALUES(?,?)').run(clean(body.title, 40) || 'Corte', file);
  return { id: Number(r.lastInsertRowid), url: '/uploads/' + file };
}, true);
route('PATCH', '/api/admin/gallery/:id', ({ p, body }) => {
  db.prepare('UPDATE gallery SET title=? WHERE id=?').run(clean(body.title, 40) || 'Corte', intOr(p.id));
}, true);
route('POST', '/api/admin/media', ({ body }) => {
  const m = /^data:(image\/(?:jpeg|png|webp)|video\/(?:mp4|webm));base64,([A-Za-z0-9+/=]+)$/.exec(body.dataUrl || '');
  if (!m) throw new HttpError(400, 'Formato no válido. Usa JPG, PNG, WEBP, MP4 o WEBM.');
  const mime = m[1], buf = Buffer.from(m[2], 'base64'), video = mime.startsWith('video/');
  if (buf.length > (video ? 15e6 : 4e6)) throw new HttpError(413, video ? 'El video supera 15 MB.' : 'La imagen supera 4 MB.');
  const valid = video ? (mime === 'video/mp4' ? buf.subarray(4,8).toString() === 'ftyp' : buf.subarray(0,4).toString() === '\u001aE\xdf\xa3') :
    (mime === 'image/jpeg' ? buf[0]===0xff && buf[1]===0xd8 : mime === 'image/png' ? buf.subarray(1,4).toString()==='PNG' : buf.subarray(0,4).toString()==='RIFF' && buf.subarray(8,12).toString()==='WEBP');
  if (!valid) throw new HttpError(400, 'El archivo no parece válido.');
  const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'})[mime];
  const file = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`; writeFileSync(join(UPLOADS,file),buf);
  const section = ['ambiente','portada'].includes(body.section) ? body.section : 'ambiente';
  if (section === 'portada') {
    if (!video) { unlinkSync(join(UPLOADS,file)); throw new HttpError(400,'La portada debe ser un video.'); }
    const c=cfg(); const old=c.heroVideo; c.heroVideo='/uploads/'+file; db.prepare("UPDATE settings SET value=? WHERE key='config'").run(JSON.stringify(c));
    if (old && old.startsWith('/uploads/')) { try { unlinkSync(join(UPLOADS,old.slice(9))); } catch {} }
  }
  const r=db.prepare('INSERT INTO media(section,title,file,mime) VALUES(?,?,?,?)').run(section,clean(body.title,60)||'Ambiente Level Three',file,mime);
  return {id:Number(r.lastInsertRowid),url:'/uploads/'+file,section};
}, true);
route('DELETE', '/api/admin/media/:id', ({ p }) => {
  const x=q1('SELECT * FROM media WHERE id=?',intOr(p.id)); if (!x) return;
  try { unlinkSync(join(UPLOADS,x.file)); } catch {}
  db.prepare('DELETE FROM media WHERE id=?').run(x.id);
  if (x.section==='portada') { const c=cfg(); if(c.heroVideo==='/uploads/'+x.file){c.heroVideo='';db.prepare("UPDATE settings SET value=? WHERE key='config'").run(JSON.stringify(c));} }
}, true);
route('DELETE', '/api/admin/gallery/:id', ({ p }) => {
  const g = q1('SELECT * FROM gallery WHERE id=?', intOr(p.id));
  if (g) { try { unlinkSync(join(UPLOADS, g.file)); } catch { } db.prepare('DELETE FROM gallery WHERE id=?').run(g.id); }
}, true);
route('DELETE', '/api/admin/reviews/:id', ({ p }) => { db.prepare('DELETE FROM reviews WHERE id=?').run(intOr(p.id)); }, true);

// ---- Archivos estáticos ----
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon' };
function serve(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html'; else if (rel === '/admin') rel = '/admin.html';
  const up = rel.startsWith('/uploads/'), base = up ? UPLOADS : PUB;
  const full = normalize(join(base, up ? rel.slice(9) : rel));
  if (!full.startsWith(base + sep) || !existsSync(full) || !statSync(full).isFile()) throw new HttpError(404, 'No encontrado');
  const size = statSync(full).size, type = MIME[extname(full)] || 'application/octet-stream';
  const cache = up ? 'public, max-age=31536000, immutable' : 'no-cache';
  const range = req.headers.range;
  if (range && /^(video\/|audio\/)/.test(type)) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m) { res.writeHead(416, { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' }); return res.end(); }
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[2] && m[1] ? Number(m[2]) : size - 1;
    if (!m[1] && m[2]) end = size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' }); return res.end();
    }
    end = Math.min(end, size - 1);
    res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
    if (req.method === 'HEAD') return res.end();
    createReadStream(full, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
  if (req.method === 'HEAD') return res.end();
  createReadStream(full).pipe(res);
}

// ---- Servidor ----
async function body(req, max) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw new HttpError(413, 'Archivo demasiado grande.'); chunks.push(c); }
  if (!n) return {};
  if (!/application\/json/.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Formato no válido.');
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HttpError(400, 'JSON no válido.'); }
}
const server = http.createServer(async (req, res) => {
  const send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'");
    const u = new URL(req.url, 'http://x'), ip = process.env.TRUST_PROXY === '1' ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
    if (u.pathname.startsWith('/api/')) {
      const r = routes.find(r => r.m === req.method && r.re.test(u.pathname));
      if (!r) throw new HttpError(404, 'No encontrado');
      // Modo sin contraseña solicitado: las rutas administrativas quedan públicas.
      const b = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await body(req, (u.pathname === '/api/admin/gallery' ? 7e6 : u.pathname === '/api/admin/media' ? 22e6 : 1e5)) : {};
      const out = await r.h({ req, res, ip, q: u.searchParams, p: r.re.exec(u.pathname).groups || {}, body: b });
      if (!res.writableEnded) send(200, out ?? { ok: true });
    } else if (req.method === 'GET' || req.method === 'HEAD') serve(req, res, u.pathname);
    else throw new HttpError(405, 'Método no permitido');
  } catch (e) {
    if (res.writableEnded) return;
    if (e instanceof HttpError) { if (req.url.startsWith('/api/')) send(e.s, { error: e.message }); else { res.writeHead(e.s, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(e.message); } }
    else { console.error(e); send(500, { error: 'Error interno' }); }
  }
});
server.listen(PORT, () => console.log(`✂️  Level Three Barbería listo en http://localhost:${PORT}  ·  Admin: http://localhost:${PORT}/admin`));
