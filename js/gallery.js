// js/gallery.js — ring carousel gallery (M4) + edit mode (M5)
import {
  isAdmin, pushChange, addPendingUpload, addPendingDelete,
  readFileAsBase64, onEditModeChange,
} from './edit-mode.js';

const RADIUS      = 380;
const TILT        = 28;
const SNAP_THRESH = 0.05;
const INERTIA     = 0.95;
const FRONT_RANGE = 15;
const SCALE_FRONT = 1.2;
const DRAG_THRESH = 6;
const DUST_COUNT  = 60;
const GAL_FILE    = 'content/gallery.json';

let items      = [];
let carouselEl = null;
let angle      = 0;
let angVel     = 0;
let dragging   = false;
let dragStartX = 0;
let dragLastX  = 0;
let dragMoved  = 0;
let isDrag     = false;
let snapping   = false;
let snapTarget = 0;
let rafId      = null;

// ── Load ──────────────────────────────────────────
async function loadItems() {
  try {
    const r = await fetch(`/${GAL_FILE}?_=${Date.now()}`);
    const d = await r.json();
    return [...d.items].sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

// ── Dust ──────────────────────────────────────────
function spawnDust() {
  const layer = document.getElementById('dust-layer');
  if (!layer) return;
  for (let i = 0; i < DUST_COUNT; i++) {
    const d = document.createElement('div');
    d.className = 'dust';
    const size = Math.random() * 1.5 + 0.8;
    d.style.cssText = [
      `width:${size}px`, `height:${size}px`,
      `left:${Math.random() * 100}%`,
      `top:${Math.random() * 100}%`,
      `animation-duration:${4 + Math.random() * 8}s`,
      `animation-delay:${-Math.random() * 12}s`,
    ].join(';');
    layer.appendChild(d);
  }
}

// ── Build carousel ────────────────────────────────
function buildCarousel(itemData) {
  carouselEl = document.getElementById('carousel');
  if (!carouselEl) return;
  carouselEl.innerHTML = '';

  const N    = itemData.length;
  const step = N > 0 ? 360 / N : 0;

  itemData.forEach((item, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'carousel-item';
    wrap.dataset.idx = i;

    const img = document.createElement('img');
    img.src = item.src;
    img.alt = item.caption || '';
    img.draggable = false;

    const overlay = document.createElement('div');
    overlay.className = 'item-overlay';

    const caption = document.createElement('div');
    caption.className = 'item-caption';
    caption.textContent = item.caption || '';

    wrap.appendChild(img);
    wrap.appendChild(overlay);
    wrap.appendChild(caption);

    const itemAngle = i * step;
    wrap.style.transform =
      `rotateY(${itemAngle}deg) translateZ(${RADIUS}px) rotateX(${-TILT}deg)`;

    wrap.addEventListener('click', () => {
      if (isDrag) return;
      onItemClick(item, i);
    });

    carouselEl.appendChild(wrap);
  });
}

// ── Center model ──────────────────────────────────
function buildModel() {
  const model = document.getElementById('gallery-model');
  if (!model) return;
  ['u0','u1','u2','u3','l0','l1','l2','l3'].forEach(cls => {
    const f = document.createElement('div');
    f.className = `model-face ${cls}`;
    model.appendChild(f);
  });
}

// ── Reading modal ─────────────────────────────────
function buildModal() {
  const backdrop = document.createElement('div');
  backdrop.id = 'gallery-modal-backdrop';
  backdrop.innerHTML = `
    <div id="gallery-modal">
      <img id="gallery-modal-img" src="" alt="">
      <div id="gallery-modal-caption"></div>
      <button id="gallery-modal-close">[× CLOSE]</button>
    </div>`;
  document.body.appendChild(backdrop);
  document.getElementById('gallery-modal-close').addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function openModal(item) {
  document.getElementById('gallery-modal-img').src = item.src;
  document.getElementById('gallery-modal-caption').textContent = item.caption || '';
  document.getElementById('gallery-modal-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const b = document.getElementById('gallery-modal-backdrop');
  if (b) b.classList.remove('open');
  document.body.style.overflow = '';
}

// ── Item click logic ──────────────────────────────
function onItemClick(item, idx) {
  const N = items.length;
  if (N === 0) return;
  const step = 360 / N;
  const itemWorldAngle = (idx * step - angle % 360 + 360) % 360;
  const dist = Math.min(itemWorldAngle, 360 - itemWorldAngle);
  if (dist <= FRONT_RANGE) {
    openModal(item);
  } else {
    rotateToItem(idx);
  }
}

function rotateToItem(idx) {
  const N = items.length;
  const step = 360 / N;
  const diff = (((-idx * step) - angle % 360 + 540) % 360) - 180;
  snapTarget = angle + diff;
  snapping   = true;
  angVel     = 0;
}

// ── Overlays ──────────────────────────────────────
function updateOverlays() {
  const N = items.length;
  if (N === 0) return;
  const step = 360 / N;
  const els  = carouselEl ? carouselEl.querySelectorAll('.carousel-item') : [];
  els.forEach((el, i) => {
    const overlay = el.querySelector('.item-overlay');
    const worldAngle = ((i * step + angle) % 360 + 360) % 360;
    const dist = Math.min(worldAngle, 360 - worldAngle);
    if (overlay) overlay.style.opacity = (dist / 180) * 0.85;
    const isFront = dist <= FRONT_RANGE;
    el.style.transform =
      `rotateY(${i * step}deg) translateZ(${RADIUS}px) rotateX(${-TILT}deg) scale(${isFront ? SCALE_FRONT : 1})`;
  });
}

// ── RAF loop ──────────────────────────────────────
function loop() {
  if (snapping) {
    const diff = snapTarget - angle;
    if (Math.abs(diff) < 0.05) { angle = snapTarget; snapping = false; }
    else angle += diff * 0.12;
  } else if (!dragging) {
    angle += angVel;
    angVel *= INERTIA;
    if (Math.abs(angVel) < SNAP_THRESH) { angVel = 0; snapToNearest(); }
  }
  if (carouselEl) carouselEl.style.transform = `rotateY(${angle}deg)`;
  updateOverlays();
  rafId = requestAnimationFrame(loop);
}

function snapToNearest() {
  const N = items.length;
  if (N === 0) return;
  const step = 360 / N;
  const cur  = ((angle % 360) + 360) % 360;
  const target360 = (360 - cur) % 360;
  const idx  = Math.round(target360 / step) % N;
  snapTarget = angle + (((idx * step - cur) + 540) % 360) - 180;
  snapping   = true;
}

// ── Drag ──────────────────────────────────────────
function initDrag() {
  const wrap = document.getElementById('gallery-wrap');
  if (!wrap) return;
  wrap.addEventListener('pointerdown', e => {
    if (e.target.closest('#gallery-modal-backdrop')) return;
    if (document.body.classList.contains('edit-mode')) return;
    dragging   = true;
    isDrag     = false;
    dragMoved  = 0;
    dragStartX = e.clientX;
    dragLastX  = e.clientX;
    snapping   = false;
    angVel     = 0;
    wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - dragLastX;
    dragMoved += Math.abs(e.clientX - dragStartX);
    if (dragMoved > DRAG_THRESH) isDrag = true;
    angle    += dx * 0.3;
    dragLastX = e.clientX;
  });
  const endDrag = e => {
    if (!dragging) return;
    angVel   = (e.clientX - dragLastX) * 0.3;
    dragging = false;
  };
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);
}

// ── Edit mode: gallery edit list ──────────────────
function buildEditList() {
  if (document.getElementById('gallery-edit-list')) return;
  const list = document.createElement('div');
  list.id = 'gallery-edit-list';
  document.body.appendChild(list);
}

function refreshEditList() {
  const list = document.getElementById('gallery-edit-list');
  if (!list) return;
  list.innerHTML = '';

  items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'gem-item';

    const thumb = document.createElement('img');
    thumb.className = 'gem-thumb';
    thumb.src = item.src;
    thumb.alt = item.caption || '';

    const info = document.createElement('div');
    info.className = 'gem-info';

    const caption = document.createElement('span');
    caption.className = 'gem-caption';
    caption.textContent = item.caption || '';

    const btns = document.createElement('div');
    btns.className = 'gem-btns';

    const mkBtn = (label, handler, danger = false) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (danger) b.className = 'danger';
      b.addEventListener('click', handler);
      btns.appendChild(b);
    };

    mkBtn('[del]', () => {
      if (!confirm(`Delete "${item.caption || item.id}"?`)) return;
      addPendingDelete(item.src);
      items.splice(i, 1);
      items.forEach((it, j) => { it.order = j; });
      refreshEditList();
      buildCarousel(items);
      syncPending();
    }, true);

    mkBtn('[↑]', () => {
      if (i === 0) return;
      const tmp = items[i].order;
      items[i].order = items[i - 1].order;
      items[i - 1].order = tmp;
      items.sort((a, b) => a.order - b.order);
      refreshEditList();
      buildCarousel(items);
      syncPending();
    });

    mkBtn('[↓]', () => {
      if (i === items.length - 1) return;
      const tmp = items[i].order;
      items[i].order = items[i + 1].order;
      items[i + 1].order = tmp;
      items.sort((a, b) => a.order - b.order);
      refreshEditList();
      buildCarousel(items);
      syncPending();
    });

    mkBtn('[edit caption]', () => {
      caption.contentEditable = 'true';
      caption.focus();
      const finish = () => {
        caption.contentEditable = 'false';
        item.caption = caption.textContent.trim();
        // update carousel caption too
        const carouselCaption = carouselEl &&
          carouselEl.querySelectorAll('.carousel-item .item-caption')[i];
        if (carouselCaption) carouselCaption.textContent = item.caption;
        syncPending();
      };
      caption.addEventListener('blur', finish, { once: true });
      caption.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); caption.blur(); }
      }, { once: true });
    });

    info.appendChild(caption);
    info.appendChild(btns);
    row.appendChild(thumb);
    row.appendChild(info);
    list.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.id = 'gem-add-btn';
  addBtn.textContent = '[+ ADD IMAGE]';
  addBtn.addEventListener('click', pickGalleryImage);
  list.appendChild(addBtn);
}

async function pickGalleryImage() {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = async () => {
    for (const file of Array.from(input.files)) {
      const { base64, dataUrl } = await readFileAsBase64(file);
      const filePath = `assets/images/gallery/${file.name}`;
      const caption  = file.name.replace(/\.[^.]+$/, '');
      const newItem  = {
        id: 'img-' + Date.now() + Math.random().toString(36).slice(2, 5),
        src: filePath,
        caption,
        order: items.length,
      };
      addPendingUpload(filePath, base64);
      // Preview using data URL until committed
      newItem._previewSrc = dataUrl;
      items.push(newItem);
    }
    refreshEditList();
    // Rebuild carousel with preview URLs
    const previewItems = items.map(it => ({ ...it, src: it._previewSrc || it.src }));
    buildCarousel(previewItems);
    syncPending();
  };
  input.click();
}

function syncPending() {
  const clean = items.map(({ _previewSrc, ...rest }) => rest);
  pushChange(GAL_FILE, { items: clean });
}

// ── Init ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  spawnDust();
  buildModal();
  buildModel();

  if (isAdmin()) {
    buildEditList();
    onEditModeChange(inEdit => {
      if (inEdit) refreshEditList();
    });
  }

  items = await loadItems();
  if (items.length > 0) buildCarousel(items);

  initDrag();
  rafId = requestAnimationFrame(loop);
});
