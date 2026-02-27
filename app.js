/**
 * BFL GALLERY — app.js
 * v2.0 — Upload fixed, IndexedDB persistent, no sample data
 */
'use strict';

const state = {
  photos: [], currentFile: null,
  filter: 'all', sort: 'newest', view: 'grid', search: '', lbIndex: 0,
};

// ── IndexedDB ──────────────────────────────────────────
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('bfl_gallery_v2', 1);
    req.onupgradeneeded = e => {
      if (!e.target.result.objectStoreNames.contains('photos'))
        e.target.result.createObjectStore('photos', { keyPath: 'id' });
    };
    req.onsuccess = e => { db = e.target.result; resolve(); };
    req.onerror   = () => reject(req.error);
  });
}

function dbGetAll() {
  return new Promise(res => {
    if (!db) { res([]); return; }
    const r = db.transaction('photos','readonly').objectStore('photos').getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror   = () => res([]);
  });
}

function dbPut(p) {
  return new Promise((res, rej) => {
    if (!db) { rej(); return; }
    const r = db.transaction('photos','readwrite').objectStore('photos').put(p);
    r.onsuccess = res; r.onerror = () => rej(r.error);
  });
}

function lsSave() {
  try { localStorage.setItem('bfl_photos', JSON.stringify(state.photos)); } catch {}
}

async function persistPhoto(photo) {
  try { await dbPut(photo); } catch { lsSave(); }
}

async function loadPhotos() {
  try {
    let rows = await dbGetAll();
    state.photos = rows.sort((a,b) => b.ts - a.ts);
    if (!state.photos.length) {
      const ls = JSON.parse(localStorage.getItem('bfl_photos') || '[]');
      state.photos = ls;
      for (const p of ls) { try { await dbPut(p); } catch {} }
    }
  } catch {
    state.photos = JSON.parse(localStorage.getItem('bfl_photos') || '[]');
  }
}

// ── Helpers ────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s || ''); return d.innerHTML;
}

const fmtDate = ts => new Date(ts).toLocaleDateString('id-ID');
const fmtDateFull = ts => new Date(ts).toLocaleDateString('id-ID',{year:'numeric',month:'long',day:'numeric'});

function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = () => rej(new Error('FileReader failed'));
    r.readAsDataURL(file);
  });
}

// ── Stats ──────────────────────────────────────────────
function updateStats() {
  document.getElementById('statTotal').textContent    = state.photos.length;
  document.getElementById('statCreators').textContent = new Set(state.photos.map(p=>p.author)).size;
  document.getElementById('statLikes').textContent    = state.photos.reduce((a,b)=>a+(b.likes||0),0);
}

// ── Filtered List ───────────────────────────────────────
function getFiltered() {
  let arr = state.filter === 'all' ? [...state.photos] : state.photos.filter(p=>p.category===state.filter);
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    arr = arr.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.location||'').toLowerCase().includes(q)
    );
  }
  if (state.sort === 'newest')      arr.sort((a,b)=>b.ts-a.ts);
  else if (state.sort === 'oldest') arr.sort((a,b)=>a.ts-b.ts);
  else                              arr.sort((a,b)=>(b.likes||0)-(a.likes||0));
  return arr;
}

// ── Render ─────────────────────────────────────────────
function render() {
  updateStats();
  const G = document.getElementById('gallery');
  const filtered = getFiltered();

  if (!filtered.length) {
    G.innerHTML = `<div class="empty-state">
      <span class="empty-icon">🌌</span>
      <div class="empty-title">BELUM ADA FOTO</div>
      <p class="empty-desc">${state.search ? 'Tidak ada hasil untuk "<strong>'+escHtml(state.search)+'</strong>"' : 'Jadilah yang pertama upload foto ke BFL Gallery!'}</p>
    </div>`;
    return;
  }

  G.innerHTML = '';
  filtered.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.style.animationDelay = `${Math.min(i*40,500)}ms`;

    if (state.view === 'list') {
      card.innerHTML = `
        <img class="card-img" src="${p.src}" alt="${escHtml(p.title)}" loading="lazy">
        <div class="list-meta">
          <span class="card-badge">${escHtml(p.category)}</span>
          <div class="card-title">${escHtml(p.title)}</div>
          <div class="card-meta">${escHtml(p.author)} · ${p.location?escHtml(p.location):'—'} · ${fmtDate(p.ts)}</div>
        </div>
        <button class="card-like ${p.liked?'liked':''}" aria-label="Like">${p.liked?'♥':'♡'} ${p.likes||0}</button>`;
    } else {
      card.innerHTML = `
        <img class="card-img" src="${p.src}" alt="${escHtml(p.title)}" loading="lazy">
        <span class="card-badge">${escHtml(p.category)}</span>
        <button class="card-like ${p.liked?'liked':''}" aria-label="Like">${p.liked?'♥':'♡'}</button>
        <div class="card-overlay">
          <div class="card-title">${escHtml(p.title)}</div>
          <div class="card-meta">${escHtml(p.author)} · ${p.likes||0} likes</div>
        </div>`;
    }

    card.querySelector('.card-like').addEventListener('click', e => { e.stopPropagation(); toggleLike(p.id); });
    card.addEventListener('click', () => openLightbox(p.id));
    G.appendChild(card);
  });
}

// ── Like ───────────────────────────────────────────────
async function toggleLike(id) {
  const idx = state.photos.findIndex(p=>p.id===id);
  if (idx < 0) return;
  const p = state.photos[idx];
  p.liked = !p.liked;
  p.likes = Math.max(0, (p.likes||0) + (p.liked?1:-1));
  await persistPhoto(p);
  render();
  if (document.getElementById('lightbox').classList.contains('open')) {
    const lbP = getFiltered()[state.lbIndex];
    if (lbP) updateLbLikeBtn(lbP);
  }
}

// ── Filter / Sort / View ────────────────────────────────
function setFilter(cat) {
  state.filter = cat;
  document.querySelectorAll('.nav-pill').forEach(b => b.classList.toggle('active', b.dataset.cat===cat));
  render();
}

function setSort(sort, btn) {
  state.sort = sort;
  document.querySelectorAll('.sort-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  render();
}

function setView(view, btn) {
  state.view = view;
  document.querySelectorAll('.view-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('gallery').classList.toggle('view-list', view==='list');
  render();
}

document.getElementById('searchInput').addEventListener('input', function() {
  state.search = this.value; render();
});

// ── Modal ──────────────────────────────────────────────
function openModal() {
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});

// ── File Upload ────────────────────────────────────────
// browseBtn triggers file input — NO overlap/absolute positioning issue
document.getElementById('browseBtn').addEventListener('click', function(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('fileInput').value = '';
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', function() {
  if (this.files && this.files[0]) handleFile(this.files[0]);
});

const dz = document.getElementById('dropZone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('dragover'); });
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) { showToast('⚠ Pilih file gambar (JPG, PNG, GIF, WebP)'); return; }
  if (file.size > 20*1024*1024) { showToast('⚠ File terlalu besar. Maks 20MB.'); return; }
  state.currentFile = file;
  const r = new FileReader();
  r.onload = e => {
    const prev = document.getElementById('previewImg');
    prev.src = e.target.result; prev.style.display = 'block';
    document.getElementById('dropFileName').textContent = '✓ ' + file.name;
    dz.classList.add('has-file');
  };
  r.readAsDataURL(file);
}

// ── Submit ─────────────────────────────────────────────
async function submitPhoto() {
  if (!state.currentFile) { showToast('⚠ Pilih foto terlebih dahulu!'); return; }
  const btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  try {
    const src = await readAsDataURL(state.currentFile);
    const photo = {
      id: uid(), src,
      title:    document.getElementById('photoTitle').value.trim()    || 'Untitled',
      author:   document.getElementById('photoAuthor').value.trim()   || 'Anonymous',
      category: document.getElementById('photoCategory').value,
      location: document.getElementById('photoLocation').value.trim() || '',
      ts: Date.now(), likes: 0, liked: false,
    };
    state.photos.unshift(photo);
    await persistPhoto(photo);
    closeModal(); resetForm(); render();
    showToast('✓ Foto berhasil dipublish ke BFL Gallery!');
  } catch (err) {
    console.error(err);
    showToast('✗ Gagal menyimpan. Coba lagi.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Publish Foto';
  }
}

function resetForm() {
  state.currentFile = null;
  try { document.getElementById('fileInput').value = ''; } catch {}
  ['photoTitle','photoAuthor','photoLocation'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('photoCategory').value = 'uncategorized';
  const prev = document.getElementById('previewImg');
  prev.src = ''; prev.style.display = 'none';
  document.getElementById('dropFileName').textContent = '';
  dz.classList.remove('has-file');
}

// ── Lightbox ───────────────────────────────────────────
function openLightbox(id) {
  const filtered = getFiltered();
  const idx = filtered.findIndex(p=>p.id===id);
  if (idx < 0) return;
  state.lbIndex = idx;
  populateLb(filtered[idx]);
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function populateLb(p) {
  document.getElementById('lbImg').src              = p.src;
  document.getElementById('lbImg').alt              = p.title;
  document.getElementById('lbTitle').textContent    = p.title;
  document.getElementById('lbAuthor').textContent   = p.author;
  document.getElementById('lbCategory').textContent = p.category.toUpperCase();
  document.getElementById('lbLocation').textContent = p.location || '—';
  document.getElementById('lbDate').textContent     = fmtDateFull(p.ts);
  updateLbLikeBtn(p);
}

function updateLbLikeBtn(p) {
  const btn = document.getElementById('lbLikeBtn');
  btn.textContent = (p.liked?'♥':'♡') + `  Like  ·  ${p.likes||0}`;
  btn.className = 'btn-lb-like' + (p.liked?' liked':'');
}

function closeLightbox(e) {
  if (!e || e.target === document.getElementById('lightbox')) {
    document.getElementById('lightbox').classList.remove('open');
    document.body.style.overflow = '';
  }
}

function lbNavigate(dir) {
  const f = getFiltered(); if (!f.length) return;
  state.lbIndex = (state.lbIndex + dir + f.length) % f.length;
  populateLb(f[state.lbIndex]);
}

function lbLike() {
  const p = getFiltered()[state.lbIndex]; if (p) toggleLike(p.id);
}

document.getElementById('lightbox').addEventListener('click', closeLightbox);

document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  const md = document.getElementById('modal');
  if (lb.classList.contains('open')) {
    if (e.key==='ArrowLeft')  lbNavigate(-1);
    if (e.key==='ArrowRight') lbNavigate(1);
    if (e.key==='Escape')     closeLightbox();
  } else if (md.classList.contains('open')) {
    if (e.key==='Escape') closeModal();
  }
});

// ── Toast ──────────────────────────────────────────────
let _tt = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(()=>t.classList.remove('show'), 3500);
}

// ── Init ───────────────────────────────────────────────
(async function init() {
  try { await openDB(); } catch (e) { console.warn('IndexedDB unavailable:', e); }
  await loadPhotos();
  render();
  window.openModal=openModal; window.closeModal=closeModal;
  window.submitPhoto=submitPhoto; window.setFilter=setFilter;
  window.setSort=setSort; window.setView=setView;
  window.closeLightbox=closeLightbox; window.lbNavigate=lbNavigate;
  window.lbLike=lbLike;
})();
