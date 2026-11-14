'use strict';
// ===== Level Three Barbería · Panel del administrador =====
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cop = n => '$' + Number(n || 0).toLocaleString('es-CO');
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDate = d => new Date(d + 'T12:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtT = t => { const [h, m] = t.split(':').map(Number); return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h >= 12 ? ' pm' : ' am'); };
const waNum = p => { p = String(p || '').replace(/\D/g, ''); return p.length === 10 ? '57' + p : p; };
const DN = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
async function api(url, opt = {}) {
  const r = await fetch(url, { method: opt.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error');
  return d;
}
function ask(b) { if (b.dataset.armed) return true; b.dataset.armed = '1'; const t = b.textContent; b.textContent = '¿Seguro? Toca otra vez'; setTimeout(() => { delete b.dataset.armed; b.textContent = t; }, 3000); return false; }
const flash = (el, t, ok = true) => { el.textContent = t; el.style.color = ok ? 'var(--ok)' : 'var(--bad)'; };

const TABS = [['resumen', '📊 Resumen'], ['reservas', '📅 Reservas'], ['catalogo', '💈 Servicios'], ['horarios', '🕘 Horarios'], ['fotos', '🖼️ Cortes'], ['contenido', '🎬 Contenido'], ['resenas', '⭐ Reseñas']];
let tab = 'resumen';
const V = $('view');

async function start() {
  $('app').hidden = false;
  draw();
}
function draw() {
  $('tabs').innerHTML = TABS.map(([k, l]) => `<button class="chip ${k === tab ? 'sel' : ''}" data-k="${k}">${l}</button>`).join('');
  ({ resumen, reservas, catalogo, horarios, fotos, contenido, resenas })[tab]();
}
$('tabs').onclick = e => { const c = e.target.closest('.chip'); if (c) { tab = c.dataset.k; draw(); } };

// ---------- Resumen ----------
async function resumen() {
  V.innerHTML = '<p class="mu">Cargando…</p>';
  const s = await api('/api/admin/summary');
  const stats = [['Reservas totales', s.total.n], ['Clientes', s.clientes], ['Citas hoy', s.hoy.n], ['Próximas', s.proximas.n], ['Ingresos hoy', cop(s.hoy.s)], ['Por cobrar', cop(s.proximas.s)]];
  const bar = (t, e) => `<h2>${t}</h2>` + (e.length ? e.map(x => `<div class="row"><div style="flex:1">${esc(x.name)}<i style="display:block;height:4px;border-radius:2px;background:var(--ac);margin-top:4px;width:${Math.round(x.n / e[0].n * 100)}%"></i></div><b>${x.n}</b></div>`).join('') : '<p class="mu">Sin datos todavía.</p>');
  const map = Object.fromEntries(s.dias.map(d => [d.date, d])), days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = iso(d); days.push({ k, n: map[k]?.n || 0 }); }
  const mx = Math.max(1, ...days.map(d => d.n));
  V.innerHTML = `<div class="stats" style="margin-top:12px">${stats.map(([l, v]) => `<div class="stat"><b>${v}</b>${l}</div>`).join('')}</div>
  <h2>Últimos 14 días</h2><div style="display:flex;align-items:flex-end;gap:4px;height:90px">${days.map(d => `<div title="${d.k}: ${d.n}" style="flex:1;background:var(--ac);border-radius:4px 4px 0 0;height:${Math.max(3, d.n / mx * 100)}%;opacity:${d.n ? 1 : .25}"></div>`).join('')}</div>
  ${bar('Reservas por servicio', s.porServicio)}${bar('Reservas por barbero', s.porBarbero)}<p class="mu">Canceladas: ${s.canceladas}</p>`;
}

// ---------- Reservas ----------
let F = { scope: 'upcoming', date: '', status: '' };
async function reservas() {
  V.innerHTML = `<h2>Reservas</h2>
  <select id="fs"><option value="today">Hoy</option><option value="upcoming">Próximas</option><option value="all">Todas</option></select>
  <input type="date" id="fd"><select id="fst"><option value="">Estado: activas</option><option value="confirmed">Confirmadas</option><option value="done">Hechas</option><option value="noshow">No vino</option><option value="cancelled">Canceladas</option></select>
  <a class="lnk" href="/api/admin/export">⬇ Exportar CSV</a><div id="rl" style="margin-top:10px"></div>`;
  $('fs').value = F.scope; $('fd').value = F.date; $('fst').value = F.status;
  $('fs').onchange = () => { F.scope = $('fs').value; load(); }; $('fd').onchange = () => { F.date = $('fd').value; load(); }; $('fst').onchange = () => { F.status = $('fst').value; load(); };
  load();
  async function load() {
    const l = await api(`/api/admin/bookings?scope=${F.scope}&date=${F.date}&status=${F.status}`);
    const lab = { confirmed: '', done: ' ✅ Hecha', noshow: ' 🚫 No vino', cancelled: ' ❌ Cancelada' };
    $('rl').innerHTML = l.map(r => `<div class="row"><div><b>${esc(r.name)}</b> · ${esc(r.phone)}${lab[r.status]}<small>${esc(r.service_name)}${r.extras ? ' + ' + esc(r.extras) : ''} · ${fmtDate(r.date)} · ${fmtT(r.time)} · ${esc(r.barber_name)} · ${cop(r.price)} · #${esc(r.code)}${r.note ? '<br>📝 ' + esc(r.note) : ''}</small></div>
    <div style="display:flex;flex-direction:column;gap:6px">
    <a class="cta2" style="margin:0;padding:8px 10px;font-size:13px" target="_blank" rel="noopener" href="https://wa.me/${waNum(r.phone)}?text=${encodeURIComponent(r.status === 'done' ? 'Hola ' + r.name + ', gracias por visitarnos en Level Three Barbería. Tu corte de ' + r.service_name + ' quedó registrado como realizado. ¡Te esperamos pronto!' : 'Hola ' + r.name + ', te escribimos de Level Three Barbería para confirmar tu cita de ' + r.service_name + ' el ' + fmtDate(r.date) + ' a las ' + fmtT(r.time) + '. Código: ' + r.code + '.')}">💬 ${r.status === 'done' ? 'Avisar corte realizado' : 'WhatsApp'}</a>
    <a class="lnk" href="tel:+${waNum(r.phone)}">📞 Llamar</a>
    ${r.status === 'confirmed' ? `<button class="x" style="border-color:var(--ok);color:var(--ok)" data-id="${r.id}" data-s="done">✓ Hecha</button><button class="x" data-id="${r.id}" data-s="noshow">No vino</button><button class="x" data-id="${r.id}" data-s="cancelled">Cancelar</button>` : `<button class="x" data-id="${r.id}" data-s="confirmed">Reabrir</button>`}
    </div></div>`).join('') || '<p class="mu">No hay reservas para mostrar.</p>';
    $('rl').onclick = async e => {
      const b = e.target.closest('button[data-s]'); if (!b) return;
      if (b.dataset.s === 'cancelled' && !ask(b)) return;
      try { await api('/api/admin/bookings/' + b.dataset.id, { method: 'PATCH', body: { status: b.dataset.s } }); load(); } catch (er) { b.textContent = er.message; }
    };
  }
}

// ---------- Catálogo ----------
const ICONS = ['clasico', 'fade', 'barba', 'vip'];
async function catalogo() {
  const c = await api('/api/admin/catalog');
  const inp = (k, v, ph, w = '') => `<input data-k="${k}" value="${esc(v)}" placeholder="${ph}" style="margin:0;${w}">`;
  const row = (t, r) => `<div class="row" data-row="${t}" data-id="${r.id ?? ''}" style="flex-wrap:wrap;margin-bottom:8px">
    ${inp('name', r.name, 'Nombre', 'flex:2;min-width:140px')}
    ${t === 'b' ? '' : inp('price', r.price, 'Precio', 'flex:1;min-width:90px')}
    ${t === 's' ? inp('duration', r.duration, '30 min', 'flex:1;min-width:80px') + `<select data-k="icon" style="margin:0;flex:1">${ICONS.map(i => `<option ${i === r.icon ? 'selected' : ''}>${i}</option>`).join('')}</select>` : ''}
    ${t === 'e' ? inp('emoji', r.emoji, '✨', 'width:60px;flex:0') : ''}
    <label style="display:flex;gap:6px;align-items:center;color:var(--tx)"><input type="checkbox" data-k="active" ${r.active === 0 ? '' : 'checked'} style="width:auto;margin:0"> Activo</label></div>`;
  const list = (t, a) => a.map(r => row(t, r)).join('');
  V.innerHTML = `<h2>Servicios</h2><div id="ls">${list('s', c.services)}</div><button class="lnk" data-add="s">+ Servicio</button>
  <h2>Extras</h2><div id="le">${list('e', c.extras)}</div><button class="lnk" data-add="e">+ Extra</button>
  <h2>Barberos</h2><div id="lb">${list('b', c.barbers)}</div><button class="lnk" data-add="b">+ Barbero</button>
  <button class="cta" id="sv" style="margin-top:14px">Guardar cambios</button><p id="cm" class="mu"></p>`;
  V.onclick = e => { const a = e.target.closest('[data-add]'); if (a) { const t = a.dataset.add; $({ s: 'ls', e: 'le', b: 'lb' }[t]).insertAdjacentHTML('beforeend', row(t, { name: '', price: 0, duration: '30 min', icon: 'clasico', emoji: '✨' })); } };
  $('sv').onclick = async () => {
    const get = t => [...V.querySelectorAll(`[data-row="${t}"]`)].map(r => {
      const o = { id: r.dataset.id || undefined }; r.querySelectorAll('[data-k]').forEach(i => o[i.dataset.k] = i.type === 'checkbox' ? (i.checked ? 1 : 0) : i.value);
      return o;
    });
    try { await api('/api/admin/catalog', { method: 'PUT', body: { services: get('s'), extras: get('e'), barbers: get('b') } }); flash($('cm'), '✓ Guardado. Los clientes ya ven los cambios.'); setTimeout(catalogo, 800); }
    catch (er) { flash($('cm'), er.message, false); }
  };
}

// ---------- Horarios ----------
async function horarios() {
  const [{ settings: c, barbers }, blocks] = await Promise.all([api('/api/config'), api('/api/admin/blocks')]);
  const times = []; { let [h, m] = c.open.split(':').map(Number); const [ch, cm] = c.close.split(':').map(Number); for (let x = h * 60 + m; x + c.slot <= ch * 60 + cm; x += c.slot) times.push(String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0')); }
  const f = (id, l, v, t = 'text') => `<label>${l}</label><input id="${id}" type="${t}" value="${esc(v)}">`;
  V.innerHTML = `<h2>Horario y datos del local</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">${f('s_open', 'Abre', c.open, 'time')}${f('s_close', 'Cierra', c.close, 'time')}${f('s_slot', 'Minutos por cita', c.slot, 'number')}${f('s_ahead', 'Días hacia adelante', c.daysAhead, 'number')}</div>
  <label>Días cerrados</label><div class="chips" id="s_closed">${DN.map((n, i) => `<button class="chip ${c.closedDays.includes(i) ? 'sel' : ''}" data-d="${i}">${n}</button>`).join('')}</div>
  ${f('s_wa', 'WhatsApp del negocio (con 57, solo números)', c.whatsapp)}${f('s_addr', 'Dirección', c.address)}${f('s_ig', 'Instagram', c.instagram)}${f('s_loy', 'Corte de regalo cada N cortes', c.loyal, 'number')}
  <h2>Promociones</h2><div id="pr">${c.promos.map(p => promoRow(p)).join('')}</div><button class="lnk" id="addp">+ Promoción</button>
  <button class="cta" id="ss" style="margin-top:14px">Guardar horarios y datos</button><p id="sm" class="mu"></p>
  <h2>Bloquear horario</h2>
  <input type="date" id="bd" min="${iso(new Date())}"><select id="bt"><option value="*">Todo el día</option>${times.map(t => `<option value="${t}">${fmtT(t)}</option>`).join('')}</select>
  <select id="bb"><option value="0">Todos los barberos</option>${barbers.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>
  <input id="br" placeholder="Motivo (almuerzo, día libre…)" maxlength="60"><button class="cta" id="bgo">Bloquear</button><p id="bm" class="mu"></p>
  <div id="bl">${blocks.map(b => `<div class="row"><div>🚫 ${fmtDate(b.date)} · ${b.time === '*' ? 'Todo el día' : fmtT(b.time)}<small>${b.barber_id ? esc((barbers.find(x => x.id === b.barber_id) || {}).name || 'Barbero') : 'Todos'}${b.reason ? ' · ' + esc(b.reason) : ''}</small></div><button class="x" data-b="${b.id}">Quitar</button></div>`).join('')}</div>`;
  function promoRow(p) { return `<div class="row" data-p style="flex-wrap:wrap"><input data-k="n" value="${esc(p.n)}" placeholder="Nombre" style="margin:0;flex:2;min-width:120px"><input data-k="d" value="${esc(p.d)}" placeholder="Descripción" style="margin:0;flex:3;min-width:140px"><input data-k="p" value="${esc(p.p)}" placeholder="$45.000" style="margin:0;flex:1;min-width:80px"><button class="x" data-rm>Quitar</button></div>`; }
  $('s_closed').onclick = e => { const b = e.target.closest('.chip'); if (b) b.classList.toggle('sel'); };
  $('addp').onclick = () => $('pr').insertAdjacentHTML('beforeend', promoRow({ n: '', d: '', p: '' }));
  V.onclick = async e => {
    const rm = e.target.closest('[data-rm]'); if (rm) rm.closest('[data-p]').remove();
    const q = e.target.closest('[data-b]'); if (q) { await api('/api/admin/blocks/' + q.dataset.b, { method: 'DELETE' }); horarios(); }
  };
  $('ss').onclick = async () => {
    const promos = [...V.querySelectorAll('[data-p]')].map(r => Object.fromEntries([...r.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value])));
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { open: $('s_open').value, close: $('s_close').value, slot: +$('s_slot').value, daysAhead: +$('s_ahead').value, closedDays: [...$('s_closed').querySelectorAll('.sel')].map(b => +b.dataset.d), whatsapp: $('s_wa').value, address: $('s_addr').value, instagram: $('s_ig').value, loyal: +$('s_loy').value, promos } });
      flash($('sm'), '✓ Guardado.');
    } catch (er) { flash($('sm'), er.message, false); }
  };
  $('bgo').onclick = async () => {
    if (!$('bd').value) return flash($('bm'), 'Elige una fecha.', false);
    try { await api('/api/admin/blocks', { method: 'POST', body: { date: $('bd').value, time: $('bt').value, barberId: +$('bb').value, reason: $('br').value } }); horarios(); } catch (er) { flash($('bm'), er.message, false); }
  };
}

// ---------- Fotos ----------
let gfile = null;
async function fotos() {
  const g = await api('/api/gallery');
  V.innerHTML = `<h2>Agregar foto de corte</h2>
  <input type="file" id="gf" accept="image/*" hidden><input type="file" id="gc" accept="image/*" capture="environment" hidden>
  <div id="gdrop" style="border:2px dashed var(--ac);border-radius:14px;padding:16px;text-align:center;margin:8px 0">
  <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button type="button" class="cta" id="gpick" style="width:auto;padding:12px 18px;margin:0">📁 Elegir foto</button><button type="button" class="cta" id="gcam" style="width:auto;padding:12px 18px;margin:0">📷 Tomar foto</button></div>
  <p class="mu" style="margin:8px 0 0" id="gname">o arrastra una imagen aquí</p><img id="gprev" alt="" style="display:none;max-width:160px;margin:8px auto 0;border-radius:10px"></div>
  <input id="gt" placeholder="Nombre del corte, ej. Fade bajo" maxlength="40"><button class="cta" id="gup">Subir foto</button><p class="mu" id="gmsg"></p>
  <h2>Fotos publicadas (salen en Cortes y en el Inicio)</h2><div class="gal" id="gm">${g.map(x => `<div class="gi"><img src="${esc(x.url)}" alt=""><input aria-label="Título del corte" data-title="${x.id}" value="${esc(x.title)}" maxlength="40"><button class="lnk" data-save-title="${x.id}">Guardar título</button><button class="x" data-g="${x.id}">Borrar</button></div>`).join('') || '<p class="mu">Aún no has subido fotos.</p>'}</div>`;
  gfile = null;
  const set = f => { if (!f) return; if (!/^image\//.test(f.type)) return flash($('gmsg'), 'Elige una imagen (JPG o PNG).', false); gfile = f; $('gname').textContent = f.name || 'Foto lista'; const p = $('gprev'); p.src = URL.createObjectURL(f); p.style.display = 'block'; $('gmsg').textContent = ''; };
  $('gpick').onclick = () => $('gf').click(); $('gcam').onclick = () => $('gc').click();
  $('gf').onchange = $('gc').onchange = e => set(e.target.files[0]);
  $('gdrop').ondragover = e => e.preventDefault(); $('gdrop').ondrop = e => { e.preventDefault(); set(e.dataTransfer.files[0]); };
  $('gup').onclick = async () => {
    if (!gfile) return flash($('gmsg'), 'Primero elige una foto.', false);
    flash($('gmsg'), 'Subiendo…');
    try { await api('/api/admin/gallery', { method: 'POST', body: { title: $('gt').value, dataUrl: await shrink(gfile) } }); fotos(); }
    catch (e) { flash($('gmsg'), 'No se pudo subir: ' + e.message, false); }
  };
  $('gm').onclick = async e => { const save=e.target.closest('[data-save-title]'); if(save){const id=save.dataset.saveTitle; await api('/api/admin/gallery/'+id,{method:'PATCH',body:{title:$(`[data-title="${id}"]`).value}}); flash($('gmsg'),'Título actualizado.'); return;} const b = e.target.closest('.x'); if (b && ask(b)) { await api('/api/admin/gallery/' + b.dataset.g, { method: 'DELETE' }); fotos(); } };
}
function shrink(f, W = 1200) {
  return new Promise((res, rej) => {
    const im = new Image(), u = URL.createObjectURL(f);
    im.onload = () => { const s = Math.min(1, W / im.width), c = document.createElement('canvas'); c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', .85)); };
    im.onerror = () => rej(new Error('No se pudo leer la imagen. Prueba con JPG o PNG.')); im.src = u;
  });
}

// ---------- Contenido, portada y ambiente ----------
async function contenido() {
  const [{settings:c}, media] = await Promise.all([api('/api/config'),api('/api/media')]);
  const field=(id,label,value,kind='text')=>`<label>${label}</label><input id="${id}" type="${kind}" value="${esc(value||'')}">`;
  const mediaHtml=media.filter(x=>x.section==='ambiente').map(x=>`<div class="gi">${x.mime.startsWith('video/')?`<video src="${esc(x.url)}" controls playsinline style="width:100%;border-radius:10px"></video>`:`<img src="${esc(x.url)}" alt="${esc(x.title)}">`}<b>${esc(x.title)}</b><button class="x" data-media-del="${x.id}">Eliminar</button></div>`).join('');
  const hero=media.filter(x=>x.section==='portada').map(x=>`<div class="gi"><video src="${esc(x.url)}" controls playsinline style="width:100%;border-radius:10px"></video><b>Video de portada</b><button class="x" data-media-del="${x.id}">Eliminar</button></div>`).join('');
  V.innerHTML=`<h2>Contenido principal</h2><p class="mu">Edita los textos que aparecen en la página de clientes.</p>${field('ct_kicker','Frase superior',c.heroKicker||'TU ESTILO. TU ACTITUD.')}${field('ct_title','Título principal',c.heroTitle||'CORTES DE OTRO NIVEL')}${field('ct_sub','Descripción',c.heroSubtitle||'Más que un corte: una experiencia hecha para destacar. Elige tu estilo y reserva tu momento.')}${field('ct_main','Título de sección',c.mainTitle||'Todo a otro nivel.')}${field('ct_text','Texto de sección',c.mainText||'Tu próxima experiencia comienza aquí.')}<button class="cta" id="ct_save">Guardar textos</button><p class="mu" id="ct_msg"></p>
  <h2>Video de portada</h2><p class="mu">Sube un MP4 o WEBM (máximo 15 MB). En el teléfono puedes elegirlo desde Archivos o galería.</p><input type="file" id="hero_file" accept="video/mp4,video/webm"><button class="cta" id="hero_up">Publicar video de portada</button><div class="gal" style="margin-top:12px">${hero||'<p class="mu">No hay video personalizado publicado.</p>'}</div>
  <h2>Ambiente de la barbería</h2><p class="mu">Publica fotos o videos del local, sillas, instalaciones, herramientas y decoración.</p>${field('env_title','Descripción del contenido','Así se vive Level Three')}<input type="file" id="env_file" accept="image/*,video/mp4,video/webm"><button class="cta" id="env_up">Publicar foto o video</button><div class="gal" style="margin-top:12px">${mediaHtml||'<p class="mu">Todavía no hay contenido del ambiente.</p>'}</div>
  <h2>Vista previa de la página</h2><div class="card" style="padding:18px"><small id="pv_kicker">${esc(c.heroKicker||'TU ESTILO. TU ACTITUD.')}</small><h2 id="pv_title">${esc(c.heroTitle||'CORTES DE OTRO NIVEL')}</h2><p id="pv_sub">${esc(c.heroSubtitle||'Más que un corte: una experiencia hecha para destacar.')}</p></div><p class="mu">La vista previa muestra los textos antes de guardarlos. Al guardar, los clientes verán los cambios al recargar.</p>`;
  const read=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
  const preview=()=>{ $('pv_kicker').textContent=$('ct_kicker').value; $('pv_title').textContent=$('ct_title').value; $('pv_sub').textContent=$('ct_sub').value; };
  ['ct_kicker','ct_title','ct_sub'].forEach(id=>$(id).oninput=preview);
  $('ct_save').onclick=async()=>{try{await api('/api/admin/settings',{method:'PUT',body:{heroKicker:$('ct_kicker').value,heroTitle:$('ct_title').value,heroSubtitle:$('ct_sub').value,mainTitle:$('ct_main').value,mainText:$('ct_text').value}});flash($('ct_msg'),'✓ Textos publicados.');}catch(e){flash($('ct_msg'),e.message,false)}};
  $('hero_up').onclick=async()=>{const f=$('hero_file').files[0];if(!f)return alert('Selecciona un video.');try{$('hero_up').disabled=true;await api('/api/admin/media',{method:'POST',body:{section:'portada',title:'Video de portada',dataUrl:await read(f)}});contenido()}catch(e){alert(e.message)}finally{$('hero_up').disabled=false}};
  $('env_up').onclick=async()=>{const f=$('env_file').files[0];if(!f)return alert('Selecciona una foto o video.');try{$('env_up').disabled=true;await api('/api/admin/media',{method:'POST',body:{section:'ambiente',title:$('env_title').value,dataUrl:await read(f)}});contenido()}catch(e){alert(e.message)}finally{$('env_up').disabled=false}};
  V.onclick=async e=>{const b=e.target.closest('[data-media-del]');if(b&&ask(b)){await api('/api/admin/media/'+b.dataset.mediaDel,{method:'DELETE'});contenido()}};
}

// ---------- Reseñas ----------
async function resenas() {
  const r = await api('/api/reviews');
  V.innerHTML = '<h2>Reseñas</h2>' + (r.list.map(x => `<div class="row"><div><b>${esc(x.name)}</b> <span class="stars">${'★'.repeat(x.stars)}</span><small>${esc(x.text)}</small></div><button class="x" data-r="${x.id}">Borrar</button></div>`).join('') || '<p class="mu">Sin reseñas.</p>');
  V.onclick = async e => { const b = e.target.closest('[data-r]'); if (b && ask(b)) { await api('/api/admin/reviews/' + b.dataset.r, { method: 'DELETE' }); resenas(); } };
}

start();
