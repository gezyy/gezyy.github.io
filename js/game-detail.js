// js/game-detail.js — single game writeup
// M-Games-1: read-only rendering.
// M-Games-2: admin inline editing for title / tags / video source / body blocks.
// Persistence funnels through edit-mode.js → Worker → GitHub (entire games.json overwrite).

import {
  isAdmin, pushChange, addPendingUpload, addPendingDelete,
  readFileAsBase64, onEditModeChange,
} from './edit-mode.js';

const GAMES_FILE = 'content/games.json';

const TAG_KEYS = [
  { key: 'genre',    label: 'GENRE' },
  { key: 'platform', label: 'PLATFORM' },
  { key: 'duration', label: 'BUILD TIME' },
];

let allGames = [];       // full list (we still need to overwrite the whole file)
let game     = null;     // current game (reference into allGames)
let gameIdx  = -1;

// ── Boot ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    showError('No game id given. Open a card from the collection page.');
    return;
  }

  allGames = await loadGames();
  gameIdx  = allGames.findIndex(g => g.id === id);
  if (gameIdx === -1) {
    showError(`No game found for id "${id}".`);
    return;
  }
  game = allGames[gameIdx];

  document.title = `${game.title} — gezyy`;
  renderAll();

  if (isAdmin()) onEditModeChange(() => renderAll());
});

// ── Data ─────────────────────────────────────
async function loadGames() {
  try {
    const r = await fetch(`/${GAMES_FILE}?_=${Date.now()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return Array.isArray(data.games) ? data.games : [];
  } catch (e) {
    console.error('[GameDetail] loadGames failed:', e);
    return [];
  }
}

function syncPending() {
  // game is a reference into allGames, so mutating game[…] already updates allGames.
  pushChange(GAMES_FILE, { games: allGames });
}

function isEditing() {
  return isAdmin() && document.body.classList.contains('edit-mode');
}

// ── Render ───────────────────────────────────
function renderAll() {
  renderHeader();
  renderTags();
  renderVideo();
  renderBody();
  document.getElementById('gd-loading').hidden = true;
  document.getElementById('gd-content').hidden = false;
}

// ── Header (title) ───────────────────────────
function renderHeader() {
  const titleEl = document.getElementById('gd-title');
  titleEl.textContent = game.title || 'Untitled';

  if (isEditing()) {
    titleEl.contentEditable = 'true';
    titleEl.classList.add('gd-editable');
    titleEl.onblur = () => {
      const v = titleEl.textContent.trim();
      if (v && v !== game.title) {
        game.title = v;
        document.title = `${v} — gezyy`;
        syncPending();
      } else {
        titleEl.textContent = game.title;
      }
    };
  } else {
    titleEl.removeAttribute('contenteditable');
    titleEl.classList.remove('gd-editable');
    titleEl.onblur = null;
  }
}

// ── Tags ─────────────────────────────────────
function renderTags() {
  const list = document.getElementById('gd-tags');
  list.innerHTML = '';
  if (!game.tags) game.tags = {};

  TAG_KEYS.forEach(({ key, label }) => {
    const value = game.tags[key] || '';
    if (!value && !isEditing()) return;

    const li = document.createElement('li');
    li.className = 'gd-tag';

    const k = document.createElement('span');
    k.className = 'gd-tag-key';
    k.textContent = label;
    li.appendChild(k);

    if (isEditing()) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'gd-tag-input';
      input.value = value;
      input.placeholder = '—';
      input.addEventListener('input', () => {
        game.tags[key] = input.value;
        syncPending();
      });
      sizeTagInput(input);
      input.addEventListener('input', () => sizeTagInput(input));
      li.appendChild(input);
    } else {
      li.appendChild(document.createTextNode(value));
    }

    list.appendChild(li);
  });
}

function sizeTagInput(input) {
  // Make the input expand to its content
  input.style.width = `${Math.max(input.value.length, 6) + 1}ch`;
}

// ── Video ────────────────────────────────────
function renderVideo() {
  const wrap = document.getElementById('gd-video-wrap');
  wrap.innerHTML = '';

  // Render the preview (if present)
  if (game.video?.src) {
    wrap.hidden = false;
    const frame = document.createElement('div');
    frame.className = 'gd-video-frame';
    switch (game.video.type) {
      case 'youtube':
        frame.appendChild(buildIframe(youtubeEmbedUrl(game.video.src), 'YouTube preview'));
        break;
      case 'vimeo':
        frame.appendChild(buildIframe(vimeoEmbedUrl(game.video.src), 'Vimeo preview'));
        break;
      case 'upload':
        frame.appendChild(buildVideoTag(game.video.src));
        break;
      default:
        frame.appendChild(buildFallback('// UNSUPPORTED VIDEO SOURCE //'));
    }
    wrap.appendChild(frame);
  } else if (isEditing()) {
    // In edit mode show an empty drop slot
    wrap.hidden = false;
    const placeholder = document.createElement('div');
    placeholder.className = 'gd-video-frame gd-video-empty';
    placeholder.appendChild(buildFallback('// NO VIDEO YET //'));
    wrap.appendChild(placeholder);
  } else {
    wrap.hidden = true;
    return;
  }

  // Render the editor panel underneath
  if (isEditing()) {
    if (!game.video) game.video = { type: 'youtube', src: '' };
    wrap.appendChild(buildVideoEditor());
  }
}

function buildVideoEditor() {
  const panel = document.createElement('div');
  panel.className = 'gd-video-edit';

  const row = document.createElement('div');
  row.className = 'gd-video-edit-row';

  // Source-type dropdown
  const select = document.createElement('select');
  ['youtube', 'vimeo', 'upload'].forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t.toUpperCase();
    if (game.video.type === t) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    game.video.type = select.value;
    game.video.src  = ''; // src format depends on type — reset
    syncPending();
    renderVideo();
  });
  row.appendChild(select);

  // SRC input (for youtube/vimeo) or upload button (for upload)
  if (game.video.type === 'upload') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gd-video-upload';
    btn.textContent = game.video.src ? '[ REPLACE VIDEO ]' : '[ UPLOAD VIDEO ]';
    btn.addEventListener('click', () => pickVideo());
    row.appendChild(btn);

    if (game.video.src) {
      const tag = document.createElement('span');
      tag.className = 'gd-video-src-label';
      tag.textContent = game.video.src.split('/').pop();
      row.appendChild(tag);
    }
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'gd-video-src';
    input.placeholder = game.video.type === 'youtube'
      ? 'YouTube ID or URL'
      : 'Vimeo ID or URL';
    input.value = game.video.src || '';
    input.addEventListener('input', () => {
      game.video.src = input.value.trim();
      syncPending();
    });
    input.addEventListener('blur', () => renderVideo());
    row.appendChild(input);
  }

  panel.appendChild(row);

  if (game.video.src) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'gd-video-clear danger';
    clear.textContent = '[ CLEAR VIDEO ]';
    clear.addEventListener('click', () => {
      if (!confirm('Remove the preview video?')) return;
      if (game.video.type === 'upload' && game.video.src?.startsWith('assets/videos/games/')) {
        addPendingDelete(game.video.src);
      }
      game.video.src = '';
      syncPending();
      renderVideo();
    });
    panel.appendChild(clear);
  }

  return panel;
}

async function pickVideo() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) {
      if (!confirm(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The Worker upload may fail above ~40 MB. Continue?`)) return;
    }
    const { base64 } = await readFileAsBase64(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = `assets/videos/games/${Date.now()}-${safeName}`;

    if (game.video.src?.startsWith('assets/videos/games/')) {
      addPendingDelete(game.video.src);
    }
    game.video.src = filePath;
    addPendingUpload(filePath, base64);
    syncPending();
    renderVideo();
  };
  input.click();
}

// ── Body blocks ──────────────────────────────
function renderBody() {
  const root = document.getElementById('gd-body');
  root.innerHTML = '';
  if (!Array.isArray(game.body)) game.body = [];

  if (isEditing()) root.appendChild(buildInsertRow(0));

  game.body.forEach((block, i) => {
    if (block?.type === 'text') {
      root.appendChild(buildTextBlock(block, i));
    } else if (block?.type === 'image') {
      root.appendChild(buildImageBlock(block, i));
    }
    if (isEditing()) root.appendChild(buildInsertRow(i + 1));
  });
}

function buildTextBlock(block, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'gd-block-wrap';

  if (isEditing()) {
    const ta = document.createElement('textarea');
    ta.className = 'gd-block-text gd-editable gd-text-edit';
    ta.value = block.value || '';
    ta.placeholder = 'Block text…';
    ta.addEventListener('input', () => {
      block.value = ta.value;
      autoGrow(ta);
      syncPending();
    });
    autoGrow(ta);
    wrap.appendChild(ta);
    wrap.appendChild(buildBlockCtrl(idx));
  } else {
    const p = document.createElement('p');
    p.className = 'gd-block-text';
    p.textContent = block.value || '';
    wrap.appendChild(p);
  }
  return wrap;
}

function buildImageBlock(block, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'gd-block-wrap gd-block-image';

  const fig = document.createElement('figure');

  const img = document.createElement('img');
  img.src = block.src || placeholderImage();
  img.alt = block.caption || 'Project screenshot';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.onerror = () => { img.src = placeholderImage(); };
  fig.appendChild(img);

  if (isEditing()) {
    const cap = document.createElement('input');
    cap.type = 'text';
    cap.className = 'gd-block-cap-edit';
    cap.placeholder = 'Caption…';
    cap.value = block.caption || '';
    cap.addEventListener('input', () => {
      block.caption = cap.value;
      syncPending();
    });
    fig.appendChild(cap);
  } else if (block.caption) {
    const cap = document.createElement('figcaption');
    cap.textContent = block.caption;
    fig.appendChild(cap);
  }

  wrap.appendChild(fig);

  if (isEditing()) {
    const ctrl = buildBlockCtrl(idx);
    // Append a "replace image" button to image blocks
    const replace = document.createElement('button');
    replace.type = 'button';
    replace.textContent = '[replace img]';
    replace.addEventListener('click', () => pickBlockImage(idx));
    ctrl.insertBefore(replace, ctrl.firstChild);
    wrap.appendChild(ctrl);
  }
  return wrap;
}

function buildBlockCtrl(idx) {
  const ctrl = document.createElement('div');
  ctrl.className = 'gd-block-ctrl';
  mkBtn(ctrl, '[↑]',   () => moveBlock(idx, -1));
  mkBtn(ctrl, '[↓]',   () => moveBlock(idx, +1));
  mkBtn(ctrl, '[del]', () => deleteBlock(idx), true);
  return ctrl;
}

function buildInsertRow(idx) {
  const row = document.createElement('div');
  row.className = 'gd-block-insert';
  mkBtn(row, '[ + TEXT ]',  () => insertBlock(idx, { type: 'text',  value: '' }));
  mkBtn(row, '[ + IMAGE ]', () => insertImage(idx));
  return row;
}

function mkBtn(parent, label, handler, danger = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (danger) b.classList.add('danger');
  b.addEventListener('click', e => { e.preventDefault(); handler(); });
  parent.appendChild(b);
  return b;
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
}

// ── Block mutations ──────────────────────────
function insertBlock(idx, block) {
  game.body.splice(idx, 0, block);
  syncPending();
  renderBody();
}

function insertImage(idx) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const { base64 } = await readFileAsBase64(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = `assets/images/games/${Date.now()}-${safeName}`;
    addPendingUpload(filePath, base64);
    insertBlock(idx, { type: 'image', src: filePath, caption: '' });
  };
  input.click();
}

function pickBlockImage(idx) {
  const block = game.body[idx];
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const { base64 } = await readFileAsBase64(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = `assets/images/games/${Date.now()}-${safeName}`;
    if (block.src?.startsWith('assets/images/games/')) {
      addPendingDelete(block.src);
    }
    block.src = filePath;
    addPendingUpload(filePath, base64);
    syncPending();
    renderBody();
  };
  input.click();
}

function moveBlock(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= game.body.length) return;
  [game.body[idx], game.body[target]] = [game.body[target], game.body[idx]];
  syncPending();
  renderBody();
}

function deleteBlock(idx) {
  const block = game.body[idx];
  if (!confirm('Delete this block?')) return;
  if (block?.type === 'image' && block.src?.startsWith('assets/images/games/')) {
    addPendingDelete(block.src);
  }
  game.body.splice(idx, 1);
  syncPending();
  renderBody();
}

// ── Video helpers ────────────────────────────
function buildIframe(src, title) {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = title;
  iframe.loading = 'lazy';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.allowFullscreen = true;
  return iframe;
}

function buildVideoTag(src) {
  const video = document.createElement('video');
  video.src = src;
  video.controls = true;
  video.preload = 'metadata';
  video.playsInline = true;
  return video;
}

function buildFallback(text) {
  const el = document.createElement('div');
  el.className = 'gd-video-fallback';
  el.textContent = text;
  return el;
}

function youtubeEmbedUrl(input) {
  const raw = String(input).trim();
  const idMatch =
    raw.match(/^[A-Za-z0-9_-]{11}$/) ||
    raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  const id = idMatch ? (idMatch[1] || idMatch[0]) : '';
  return id ? `https://www.youtube.com/embed/${id}` : '';
}

function vimeoEmbedUrl(input) {
  const raw = String(input).trim();
  const idMatch = raw.match(/^\d+$/) || raw.match(/vimeo\.com\/(\d+)/);
  const id = idMatch ? (idMatch[1] || idMatch[0]) : '';
  return id ? `https://player.vimeo.com/video/${id}` : '';
}

// ── Placeholder image for a freshly-inserted image block that hasn't uploaded yet
function placeholderImage() {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 450'>
      <rect width='800' height='450' fill='#141914'/>
      <text x='400' y='240' text-anchor='middle' font-family='VT323, monospace'
            font-size='34' fill='#3a7a2e' letter-spacing='6'>// IMAGE PENDING //</text>
    </svg>`.replace(/\s+/g, ' ');
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// ── Error UI ─────────────────────────────────
function showError(msg) {
  document.getElementById('gd-loading').hidden = true;
  const err = document.getElementById('gd-error');
  document.getElementById('gd-error-msg').textContent = msg;
  err.hidden = false;
}
