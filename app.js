'use strict';
// ===== Level Three Barbería · Web de clientes =====
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cop = n => '$' + Number(n).toLocaleString('es-CO');
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDate = d => new Date(d + 'T12:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtT = t => { const [h, m] = t.split(':').map(Number); return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' pm' : ' am'); };
async function api(url, opt = {}) {
  const r = await fetch(url, { method: opt.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Ocurrió un error. Intenta de nuevo.');
  return d;
}
function ask(b) { if (b.dataset.armed) return true; b.dataset.armed = '1'; const t = b.textContent; b.textContent = '¿Seguro? Toca otra vez'; setTimeout(() => { delete b.dataset.armed; b.textContent = t; }, 3000); return false; }

let cfg, customer = null, st = { svc: null, ext: [], brb: 0, date: null, time: null, slots: [] };
const MK = 'l3_mine';
const mine = () => { try { return JSON.parse(localStorage.getItem(MK) || '[]'); } catch { return []; } };
const saveMine = a => { try { localStorage.setItem(MK, JSON.stringify(a)); } catch { } };

// ---------- Navegación ----------
function go(t) {
  if (t === 'reservar' && !customer) {
    accountMessage('Para reservar, primero crea tu cuenta o inicia sesión.');
    switchAccountForm(false);
    t = 'mis';
  }
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === t));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  if (t === 'mis') renderMine();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go);
  const n = e.target.closest('#nav button'); if (n) go(n.dataset.t);
});
document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.closest('.gi')?.remove(); }, true);

// ---------- Ilustraciones ----------
const SIC = {
  clasico: '<circle cx="18" cy="46" r="7"/><circle cx="46" cy="46" r="7"/><path d="M22 41L50 10M42 41L14 10"/>',
  fade: '<rect x="8" y="20" width="48" height="12" rx="3"/><path d="M14 32v16M22 32v16M30 32v16M38 32v16M46 32v16"/>',
  barba: '<path d="M12 20c0 22 8 34 20 34s20-12 20-34c-6 8-12 10-20 10s-14-2-20-10z"/><path d="M25 42q7 5 14 0"/>',
  vip: '<path d="M8 46L12 20l14 14 6-18 6 18 14-14 4 26z"/><path d="M10 54h44"/>'
};
const IC = {
  r: '<rect x="10" y="14" width="44" height="40" rx="6"/><path d="M10 26h44M22 8v10M42 8v10M24 38l8 8 12-14"/>',
  p: '<path d="M8 32L32 8h20v20L28 52z"/><circle cx="42" cy="18" r="3"/>',
  c: SIC.clasico,
  o: '<path d="M32 6c4 12 16 16 16 32a16 16 0 0 1-32 0c0-8 4-12 8-16 0 6 4 8 6 8-2-8-2-16 2-24z"/>',
  l: '<rect x="6" y="20" width="52" height="28" rx="12"/><path d="M20 28v12M14 34h12"/><circle cx="42" cy="30" r="2"/><circle cx="48" cy="38" r="2"/>',
  s: '<path d="M32 6l7 16 17 2-13 12 4 17-15-9-15 9 4-17L8 24l17-2z"/>'
};
const HEADS = [
  { t: 'Fade', h: 'M18 52C18 20 82 20 82 52L78 40C70 26 30 26 22 40Z' }, { t: 'Clásico', h: 'M17 54C14 18 86 14 83 54L80 38C60 22 38 24 20 38Z' },
  { t: 'Pompadour', h: 'M16 54C10 8 90 6 84 54L80 32C62 12 38 14 20 32Z' }, { t: 'Barba full', h: 'M18 52C18 22 82 22 82 52L78 40C70 28 30 28 22 40Z', b: 1 }];
const head = x => `<svg viewBox="0 0 100 110"><rect width="100" height="110" fill="#2a322e"/><path d="M30 100c0-14 40-14 40 0v10H30z" fill="#444f49"/><ellipse cx="50" cy="55" rx="27" ry="33" fill="#c58d63"/>${x.b ? '<path d="M24 58c2 34 50 34 52 0c-6 14-14 20-26 20s-20-6-26-20z" fill="#1b1f1d"/>' : ''}<path d="${x.h}" fill="#1b1f1d"/></svg>`;
const BEV = [
  { n: 'Poker', g: '#8a5514', c: '#c8102e', t: '#fff', l: 'POKER' }, { n: 'Águila', g: '#8a5514', c: '#f2c200', t: '#1a1a1a', l: 'ÁGUILA' },
  { n: 'Club Colombia', g: '#6b4410', c: '#1d4d2b', t: '#f2c200', l: 'CLUB' }, { n: 'Águila Light', g: '#8a5514', c: '#cfd6db', t: '#1a1a1a', l: 'LIGHT' },
  { n: 'Gaseosa', g: '#3a1c0f', c: '#d71920', t: '#fff', l: 'COLA' }, { n: 'Agua', g: '#9fd3e8', c: '#fff', t: '#2a7fa6', l: 'AGUA' }];
const bottle = b => `<div class="beer"><svg viewBox="0 0 90 150"><rect x="33" y="4" width="24" height="30" rx="6" fill="${b.g}"/><path d="M33 30h24l10 24v84a8 8 0 0 1-8 8H31a8 8 0 0 1-8-8V54z" fill="${b.g}"/><rect x="23" y="70" width="44" height="46" fill="${b.c}"/><text x="45" y="98" text-anchor="middle" font-size="10" font-weight="700" fill="${b.t}" font-family="Georgia,serif">${b.l}</text></svg><b>${b.n}</b><div class="mu">Bien fría</div></div>`;

// ---------- Portada ----------
function drawHome() {
  const c=cfg.settings;
  if(c.heroKicker) $('heroKicker').textContent=c.heroKicker;
  if(c.heroSubtitle) $('heroSubtitle').textContent=c.heroSubtitle;
  if(c.heroTitle) $('hl').textContent=c.heroTitle;
  if(c.mainTitle) $('mainTitle').textContent=c.mainTitle;
  if(c.mainText) $('mainText').textContent=c.mainText;
  if(c.heroVideo){$('heroVideoSource').src=c.heroVideo; $('heroVideo').load();}
  let k = 0;
  $('hl').innerHTML = (c.heroTitle || 'CORTES DE OTRO NIVEL').split('\n').map(l => `<span class="ln">${[...l].map(c => c === ' ' ? '<span>&nbsp;</span>' : `<span style="--i:${k++}">${esc(c)}</span>`).join('')}</span>`).join('');
  const m = ['FADE', 'CLÁSICO', 'BARBA', 'VIDEOJUEGOS', 'CERVEZA FRÍA', 'POKER', 'ÁGUILA'].concat(cfg.services.length ? ['DESDE ' + cop(Math.min(...cfg.services.map(s => s.price)))] : []).map(x => `<span>${x}</span>`).join('');
  $('mq').innerHTML = m + m;
  $('tiles').innerHTML = [['reservar', 'r', 'Reservar cita', 'Elige tu hora y tu barbero'], ['precios', 'p', 'Precios', cfg.services.length ? 'Desde ' + cop(Math.min(...cfg.services.map(s => s.price))) : ''],
  ['galeria', 'c', 'Cortes', 'Mira los estilos'], ['promos', 'o', 'Promos', 'Combos y descuentos'], ['local', 'l', 'Nuestro local', 'Videojuegos y cerveza'], ['resenas', 's', 'Reseñas', 'Lo que dicen de nosotros']]
    .map(([g, i, t, d]) => `<button class="tile" data-go="${g}"><svg viewBox="0 0 64 64">${IC[i]}</svg><b>${t}</b><span>${d}</span></button>`).join('');
  if (!matchMedia('(prefers-reduced-motion:reduce)').matches) setInterval(() => {
    const s = $('slide'); if (!s.offsetParent || !s.firstElementChild) return;
    const w = s.firstElementChild.offsetWidth + 10, end = s.scrollWidth - s.clientWidth - 4;
    s.scrollTo({ left: s.scrollLeft >= end ? 0 : s.scrollLeft + w, behavior: 'smooth' });
  }, 3500);
}

// ---------- Reserva por pasos ----------
const svcObj = () => cfg.services.find(s => s.id === st.svc);
const extObjs = () => cfg.extras.filter(e => st.ext.includes(e.id));
const total = () => (svcObj()?.price || 0) + extObjs().reduce((a, e) => a + e.price, 0);
const barberName = () => st.brb ? cfg.barbers.find(b => b.id === st.brb)?.name : 'Cualquiera';
let step = 1;
const LAB = ['Servicio', 'Barbero, día y hora', 'Tus datos'];
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2600); }
const updDock = () => { $('dk').textContent = cop(total()); };
function showStep(n) {
  step = n;
  document.querySelectorAll('#reservar .step').forEach(s => s.classList.toggle('on', +s.dataset.s === n));
  $('steps').dataset.n = n; $('stepl').textContent = `Paso ${n} de 3 · ${LAB[n - 1]}`;
  $('back').style.visibility = n > 1 ? 'visible' : 'hidden';
  $('next').textContent = n === 3 ? 'Confirmar reserva' : 'Continuar';
  if (n === 3) drawSum();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function drawBooking() {
  if (customer) { $('nm').value = customer.name; $('ph').value = customer.phone; }
  $('svc').innerHTML = cfg.services.map(s => `<button class="card svc" data-id="${esc(s.id)}"><span class="ico"><svg viewBox="0 0 64 64">${SIC[s.icon] || SIC.clasico}</svg></span><span class="tx"><b>${esc(s.name)}</b><span class="dur">⏱ ${esc(s.duration)}</span></span><span class="price">${cop(s.price)}</span></button>`).join('');
  $('ext').innerHTML = cfg.extras.map(e => `<button class="card ex" data-id="${esc(e.id)}"><i>${esc(e.emoji)}</i><b>${esc(e.name)}</b><span class="price">+ ${cop(e.price)}</span></button>`).join('');
  $('brb').innerHTML = [{ id: 0, name: 'Cualquiera' }, ...cfg.barbers].map(b => `<button class="bcard ${b.id === 0 ? 'sel' : ''}" data-i="${b.id}"><span class="av" style="--h:${(b.id * 67 + 20) % 360}">${b.id ? esc(b.name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()) : '★'}</span>${esc(b.name)}</button>`).join('');
  const days = [], c = cfg.settings;
  for (let i = 0; i <= c.daysAhead; i++) { const d = new Date(); d.setDate(d.getDate() + i); if (!c.closedDays.includes(d.getDay())) days.push([d, i]); }
  $('days').innerHTML = days.map(([d, i]) => `<button class="chip day" data-d="${iso(d)}"><small>${i === 0 ? 'hoy' : d.toLocaleDateString('es-CO', { weekday: 'short' })}</small><b>${d.getDate()}</b><small>${d.toLocaleDateString('es-CO', { month: 'short' })}</small></button>`).join('');
  $('plist').innerHTML = cfg.services.map(s => `<div class="row"><div><b>${esc(s.name)}</b><small>${esc(s.duration)}</small></div><b class="price">${cop(s.price)}</b></div>`).join('') +
    cfg.extras.map(e => `<div class="row"><div><b>${esc(e.emoji)} ${esc(e.name)}</b><small>Extra</small></div><b class="price">+ ${cop(e.price)}</b></div>`).join('');
  updDock();
}
$('svc').onclick = e => { const c = e.target.closest('.card'); if (!c) return; st.svc = c.dataset.id; [...$('svc').children].forEach(x => x.classList.toggle('sel', x === c)); updDock(); };
$('ext').onclick = e => { const c = e.target.closest('.card'); if (!c) return; const i = c.dataset.id, k = st.ext.indexOf(i); k < 0 ? st.ext.push(i) : st.ext.splice(k, 1); c.classList.toggle('sel', k < 0); updDock(); };
$('brb').onclick = e => { const c = e.target.closest('.bcard'); if (!c) return; st.brb = +c.dataset.i; st.time = null; [...$('brb').children].forEach(x => x.classList.toggle('sel', x === c)); drawTimes(); };
$('days').onclick = async e => {
  const c = e.target.closest('.chip'); if (!c) return;
  st.date = c.dataset.d; st.time = null; [...$('days').children].forEach(x => x.classList.toggle('sel', x === c));
  $('times').innerHTML = '<div class="times">' + '<div class="sk"></div>'.repeat(8) + '</div>';
  try { st.slots = (await api('/api/availability?date=' + st.date)).slots; drawTimes(); } catch (er) { $('times').innerHTML = `<span class="mu">${esc(er.message)}</span>`; }
};
function drawTimes() {
  if (!st.date) return;
  const ok = s => st.brb ? s.free.includes(st.brb) : s.free.length > 0, g = { 'Mañana': [], 'Tarde': [], 'Noche': [] };
  st.slots.forEach(s => { const h = +s.time.slice(0, 2); g[h < 12 ? 'Mañana' : h < 18 ? 'Tarde' : 'Noche'].push(s); });
  $('times').innerHTML = Object.entries(g).filter(([, a]) => a.length).map(([k, a]) => `<div class="tgrp">${k}</div><div class="times">${a.map(s => `<button class="chip ${st.time === s.time ? 'sel' : ''}" data-t="${s.time}" ${ok(s) ? '' : 'disabled'}>${fmtT(s.time)}</button>`).join('')}</div>`).join('') || '<span class="mu">Sin horas disponibles.</span>';
}
$('times').onclick = e => { const c = e.target.closest('.chip'); if (!c || c.disabled) return; st.time = c.dataset.t; drawTimes(); };
function drawSum() {
  const s = svcObj(), x = extObjs();
  $('sum').innerHTML = `<div><span>Servicio</span><b>${esc(s.name)}</b></div>` + (x.length ? `<div><span>Extras</span><b>${esc(x.map(e => e.name).join(', '))}</b></div>` : '') +
    `<div><span>Fecha</span><b>${fmtDate(st.date)}</b></div><div><span>Hora</span><b>${fmtT(st.time)}</b></div><div><span>Barbero</span><b>${esc(barberName())}</b></div><div><span>Total</span><b class="price">${cop(total())}</b></div>`;
}
$('next').onclick = () => {
  if (step === 1) { if (!st.svc) return toast('Elige un servicio'); showStep(2); }
  else if (step === 2) { if (!st.date || !st.time) return toast('Elige el día y la hora'); showStep(3); }
  else submit();
};
$('back').onclick = () => showStep(step - 1);
async function submit() {
  if (!customer) { toast('Inicia sesión para reservar'); go('mis'); return; }
  const nm = customer.name, ph = customer.phone;
  $('next').disabled = true;
  try {
    const b = await api('/api/bookings', { method: 'POST', body: { name: nm, phone: ph, note: $('nt').value, serviceId: st.svc, extraIds: st.ext, barberId: st.brb, date: st.date, time: st.time } });
    saveMine([{ ...b, phone: ph }, ...mine()]); showDone(b);
  } catch (e) {
    toast(e.message);
    if (/disponible/.test(e.message)) try { st.slots = (await api('/api/availability?date=' + st.date)).slots; st.time = null; drawTimes(); showStep(2); } catch { }
  }
  $('next').disabled = false;
}
function ics(b) {
  const sv = cfg.services.find(x => x.name === b.service), dur = parseInt(sv?.duration) || 45, p = n => String(n).padStart(2, '0');
  const f = d => `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
  const d1 = new Date(b.date + 'T' + b.time + ':00'), d2 = new Date(d1.getTime() + dur * 60000);
  const t = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:' + b.code + '@level-three', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(d1), 'DTEND:' + f(d2), 'SUMMARY:Level Three Barbería - ' + b.service, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(t);
}
function showDone(b) {
  $('reservar').classList.add('fin'); $('done').hidden = false;
  const w = cfg.settings.whatsapp;
  $('done').innerHTML = `<div class="okr"><svg viewBox="0 0 40 40"><path d="M10 21l7 7 14-15"/></svg></div><h2>¡Reserva confirmada!</h2><p class="mu">Tu reserva quedó registrada. También aparece en tu cuenta.</p><div class="code">${esc(b.code)}</div>
  <div class="sumc"><div><span>Servicio</span><b>${esc(b.service)}${b.extras ? ' + ' + esc(b.extras) : ''}</b></div><div><span>Fecha</span><b>${fmtDate(b.date)}</b></div><div><span>Hora</span><b>${fmtT(b.time)}</b></div><div><span>Barbero</span><b>${esc(b.barber)}</b></div><div><span>Total</span><b class="price">${cop(b.price)}</b></div></div>
  ${w ? `<a class="cta2" target="_blank" rel="noopener" href="https://wa.me/${esc(w)}?text=${encodeURIComponent('Hola, Level Three. Mi comprobante de reserva: ' + b.name + ', ' + b.service + (b.extras ? ' + ' + b.extras : '') + ', ' + fmtDate(b.date) + ' a las ' + fmtT(b.time) + ', barbero: ' + b.barber + ', total: ' + cop(b.price) + ', código: ' + b.code + '.')}">💬 Avisar por WhatsApp</a>` : ''}
  <a class="ghost" download="cita-level-three.ics" href="${ics(b)}" style="display:block;margin-top:10px;text-decoration:none;text-align:center">📅 Agregar al calendario</a>
  <button class="ghost" id="again" style="margin-top:10px;width:100%">Hacer otra reserva</button>`;
  $('again').onclick = resetBooking; window.scrollTo({ top: 0, behavior: 'smooth' });
}
function resetBooking() {
  st = { svc: null, ext: [], brb: 0, date: null, time: null, slots: [] };
  drawBooking(); $('times').innerHTML = '<span class="mu">Primero elige un día.</span>'; $('nt').value = '';
  $('reservar').classList.remove('fin'); $('done').hidden = true; showStep(1);
}

// ---------- Mis citas ----------
async function renderMine() {
  if (!customer) { $('accountGate').hidden = false; $('customerPanel').hidden = true; return; }
  $('accountGate').hidden = true; $('customerPanel').hidden = false;
  $('customerName').textContent = customer.name; $('customerPhone').textContent = customer.phone;
  let a = [];
  try { a = await api('/api/customer/bookings'); } catch (e) { $('accountMsg').textContent = e.message; return; }
  const completed = a.filter(r => r.status === 'done').length, target = cfg.settings.loyal || 5, left = target - (completed % target);
  $('loy').innerHTML = `<div class="msg ok"><b>⭐ Programa Level Three</b><br>Cortes realizados y confirmados: ${completed}. ${completed > 0 && left === target ? '¡Consulta en la barbería tu beneficio!' : 'Te faltan ' + left + ' cortes para tu próximo beneficio.'}</div>`;
  const labels = { confirmed: '🟡 Confirmada', done: '✅ Corte realizado', noshow: '⚪ No asististe', cancelled: '❌ Cancelada' };
  $('mine').innerHTML = a.length ? a.map(r => `<div class="ticket"><div><b>${esc(r.service)}</b><small>${fmtDate(r.date)} · ${fmtT(r.time)} · ${esc(r.barber)} · ${cop(r.price)}<br>Código ${esc(r.code)} · ${labels[r.status] || r.status}</small></div></div>`).join('') : '<p class="mu">Aún no tienes reservas. ¡Agenda tu primer corte!</p>';
  const promos = cfg.settings.promos || [];
  $('customerPromos').innerHTML = promos.length ? promos.map(p => `<div class="row promo-client"><div><b>🎁 ${esc(p.n)}</b><small>${esc(p.d)}</small></div><b>${esc(p.p || 'Pregunta')}</b></div>`).join('') : '<p class="mu">Pronto tendremos nuevas promociones.</p>';
}
function accountMessage(t, bad=false) { $('accountMsg').textContent=t; $('accountMsg').style.color=bad?'var(--bad)':'var(--mu)'; }
function switchAccountForm(register) {
  $('loginForm').hidden=register; $('registerForm').hidden=!register;
  $('showLogin').classList.toggle('sel',!register); $('showRegister').classList.toggle('sel',register); accountMessage('');
}
$('showLogin').onclick=()=>switchAccountForm(false); $('showRegister').onclick=()=>switchAccountForm(true);
async function accountAction(kind) {
  const body = kind==='register' ? {name:$('regName').value,phone:$('regPhone').value,password:$('regPass').value} : {phone:$('loginPhone').value,password:$('loginPass').value};
  const btn = kind==='register' ? $('registerBtn') : $('loginBtn'); btn.disabled=true;
  try { const r=await api('/api/customer/'+kind,{method:'POST',body}); customer=r.customer; accountMessage('¡Bienvenido a Level Three! Ya puedes reservar.'); $('bookingIdentity').textContent='Reserva a nombre de '+customer.name+' · '+customer.phone; renderMine(); }
  catch(e){accountMessage(e.message,true);} finally {btn.disabled=false;}
}
$('loginBtn').onclick=()=>accountAction('login'); $('registerBtn').onclick=()=>accountAction('register');
$('logoutBtn').onclick=async()=>{try{await api('/api/customer/logout',{method:'POST'});}catch{} customer=null; switchAccountForm(false); accountMessage('Has cerrado sesión. Inicia sesión para reservar.'); renderMine();};
async function restoreCustomer() { try { const r=await api('/api/customer/me'); customer=r.customer; $('bookingIdentity').textContent='Reserva a nombre de '+customer.name+' · '+customer.phone; } catch { customer=null; } }
// ---------- Galería ----------
async function loadGallery() {
  let g = []; try { g = await api('/api/gallery'); } catch { }
  const it = g.length ? g.map(x => ({ t: x.title, img: `<img src="${esc(x.url)}" alt="${esc(x.title)}" loading="lazy">` })) : HEADS.map(h => ({ t: h.t, img: head(h) }));
  $('glist').innerHTML = it.map(i => `<div class="gi">${i.img}<b>${esc(i.t)}</b><button class="chip" data-t="${esc(i.t)}">Quiero este corte</button></div>`).join('');
  $('slide').innerHTML = it.map(i => `<div class="gi">${i.img}<b>${esc(i.t)}</b></div>`).join('');
}
$('glist').onclick = e => { const c = e.target.closest('.chip'); if (c) { $('nt').value = 'Quiero: ' + c.dataset.t; go('reservar'); } };

// ---------- Reseñas ----------
let rs = 5;
$('rst').innerHTML = [1, 2, 3, 4, 5].map(i => `<button class="chip ${i === 5 ? 'sel' : ''}" data-s="${i}">${i} ★</button>`).join('');
$('rst').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; rs = +c.dataset.s; [...$('rst').children].forEach(x => x.classList.toggle('sel', x === c)); };
async function loadReviews() {
  let r = { list: [], avg: 0 }; try { r = await api('/api/reviews'); } catch { }
  $('rsum').innerHTML = r.list.length ? `<div class="msg"><b class="stars">★ ${r.avg.toFixed(1)}</b> · ${r.list.length} reseña${r.list.length > 1 ? 's' : ''}</div>` : '<p class="mu">Sé el primero en dejar una reseña.</p>';
  $('rlist').innerHTML = r.list.map(x => `<div class="row"><div><b>${esc(x.name)}</b> <span class="stars">${'★'.repeat(x.stars)}${'☆'.repeat(5 - x.stars)}</span><small>${esc(x.text)}</small></div></div>`).join('');
}
$('rgo').onclick = async () => {
  try { await api('/api/reviews', { method: 'POST', body: { name: $('rnm').value, stars: rs, text: $('rtx').value } }); $('rmsg').textContent = '¡Gracias por tu reseña!'; $('rtx').value = ''; loadReviews(); }
  catch (e) { $('rmsg').textContent = e.message; }
};

// ---------- Local, promos e info ----------
async function drawLocal() {
  const c = cfg.settings, DN = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  $('bev').innerHTML = BEV.map(bottle).join('');
  try { const mm=await api('/api/media'); $('environmentMedia').innerHTML=mm.filter(x=>x.section==='ambiente').map(x=>`<div class="gi">${x.mime.startsWith('video/')?`<video src="${esc(x.url)}" controls playsinline style="width:100%;border-radius:12px"></video>`:`<img src="${esc(x.url)}" alt="${esc(x.title)}" loading="lazy">`}<b>${esc(x.title)}</b></div>`).join(''); } catch {}
  $('plst').innerHTML = c.promos.map(p => `<div class="row"><div><b>🔥 ${esc(p.n)}</b><small>${esc(p.d)}</small></div><b>${esc(p.p)}</b></div>`).join('') || '<p class="mu">Pronto tendremos promociones.</p>';
  $('info').innerHTML = `<div class="msg">🕘 ${fmtT(c.open)} – ${fmtT(c.close)}${c.closedDays.length ? ' · Cerrado: ' + c.closedDays.map(d => DN[d]).join(', ') : ''}` +
    (c.address ? '<br>📍 ' + esc(c.address) : '') + (c.whatsapp ? `<br>💬 <a href="https://wa.me/${esc(c.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : '') + (c.instagram ? '<br>📸 ' + esc(c.instagram) : '') + '</div>';
}

async function loadBadges() {
  const c = cfg.settings, out = [];
  let nf = null;
  for (let i = 0; i <= Math.min(c.daysAhead, 5) && !nf; i++) {
    const d = new Date(); d.setDate(d.getDate() + i); if (c.closedDays.includes(d.getDay())) continue;
    try { const a = (await api('/api/availability?date=' + iso(d))).slots.find(x => x.free.length); if (a) nf = { i, d: iso(d), t: a.time }; } catch { }
  }
  if (nf) out.push(`<span class="bd">🕒 Próxima hora libre: <b>${nf.i === 0 ? 'Hoy' : nf.i === 1 ? 'Mañana' : fmtDate(nf.d)} ${fmtT(nf.t)}</b></span>`);
  try { const r = await api('/api/reviews'); if (r.list.length) out.push(`<span class="bd">⭐ <b>${r.avg.toFixed(1)}</b> · ${r.list.length} reseña${r.list.length > 1 ? 's' : ''}</span>`); } catch { }
  if (cfg.services.length) out.push(`<span class="bd">💈 Desde <b>${cop(Math.min(...cfg.services.map(x => x.price)))}</b></span>`);
  $('badges').innerHTML = out.join('');
}
(async function boot() {
  try { cfg = await api('/api/config'); }
  catch { document.querySelector('main').insertAdjacentHTML('afterbegin', '<div class="msg bad">No se pudo cargar la información. Recarga la página.</div>'); return; }
  drawHome(); drawBooking(); drawLocal(); loadGallery(); loadReviews(); loadBadges();
})();

// Restaurar la sesión del cliente y cargar su historial al entrar.
restoreCustomer().then(() => { if (document.getElementById('mis').classList.contains('on')) renderMine(); });
