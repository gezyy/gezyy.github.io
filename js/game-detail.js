// js/game-detail.js — single game writeup
// M-Games-1: read-only rendering.
// M-Games-2: admin inline editing for title / tags / video source / body blocks.
// M-Games-3 (i18n): bilingual title / tags / body text / image captions.
//   Renderer picks current language; editor exposes paired ZH/EN inputs.

import {
  isAdmin, pushChange, addPendingUpload, addPendingDelete,
  readFileAsBase64, onEditModeChange,
} from './edit-mode.js';
import { t, pickLocalized, bilingualize } from './i18n.js';

const GAMES_FILE = 'content/games.json';

const TAG_DEFS = [
  { key: 'genre',    labelKey: 'gd.tag.genre' },
  { key: 'platform', labelKey: 'gd.tag.platform' },
  { key: 'duration', labelKey: 'gd.tag.duration' },
];

let allGames = [];
let game     = null;
let gameIdx  = -1;

// ── Boot ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Localize chrome
  document.querySelector('#gd-loading .blink').textContent = t('gd.loading');
  document.querySelector('#gd-error span').textContent     = t('gd.error');
  document.querySelector('.gd-back-inline').textContent    = t('gd.back.inline');
  const fab = document.getElementById('gd-back-fab');
  fab.textContent = t('gd.back.fab');
  fab.setAttribute('aria-label', t('gd.back.aria'));

  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    showError(t('gd.error.no.id'));
    return;
  }

  allGames = await loadGames();
  gameIdx  = allGames.findIndex(g => g.id === id);
  if (gameIdx === -1) {
    showError(t('gd.error.not.found', { id }));
    return;
  }
  game = allGames[gameIdx];

  document.title = pickLocalized(game.title) + ' — gezyy';
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
  pushChange(GAMES_FILE, { games: allGames });
}

function isEditing() {
  return isAdmin() && document.body.classList.contains('edit-mode');
}

// Systems Breakdown articles may embed charts whose text is baked into the
// image, so their image blocks carry a separate picture per language.
function isSystemsSection() {
  return game && game.section === 'systems';
}

// All games-asset image paths referenced by an image block's src
// (handles both the legacy string form and the bilingual {zh, en} form).
function imageSrcPaths(src) {
  if (!src) return [];
  if (typeof src === 'string') return [src];
  return [src.zh, src.en].filter(Boolean);
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
  const editor  = document.getElementById('gd-title-editor');

  titleEl.textContent = pickLocalized(game.title);
  // Title is never contenteditable now — editing happens in paired inputs below
  titleEl.removeAttribute('contenteditable');
  titleEl.classList.remove('gd-editable');
  titleEl.onblur = null;

  if (isEditing()) {
    if (!editor) ensureTitleEditor();
    populateTitleEditor();
    document.getElementById('gd-title-editor').hidden = false;
  } else if (editor) {
    editor.hidden = true;
  }
}

function ensureTitleEditor() {
  const host = document.createElement('div');
  host.id = 'gd-title-editor';
  host.className = 'gd-inline-editor';
  host.innerHTML = `<div class="bilingual-pair" id="gd-title-pair"></div>`;
  document.getElementById('gd-header').insertBefore(host, document.getElementById('gd-tags'));
}

function populateTitleEditor() {
  const obj = bilingualize(game.title);
  game.title = obj;
  renderBilingualPair('gd-title-pair', obj, (lang, val) => {
    obj[lang] = val;
    document.getElementById('gd-title').textContent = pickLocalized(obj);
    document.title = pickLocalized(obj) + ' — gezyy';
    syncPending();
  });
}

// ── Tags ─────────────────────────────────────
function renderTags() {
  const list = document.getElementById('gd-tags');
  list.innerHTML = '';
  if (!game.tags) game.tags = {};
  const editing = isEditing();

  TAG_DEFS.forEach(({ key, labelKey }) => {
    const localized = pickLocalized(game.tags[key]);
    if (!localized && !editing) return;

    const li = document.createElement('li');
    li.className = 'gd-tag';

    const k = document.createElement('span');
    k.className = 'gd-tag-key';
    k.textContent = t(labelKey);
    li.appendChild(k);

    if (editing) {
      // Ensure stored as bilingual object
      const obj = bilingualize(game.tags[key]);
      game.tags[key] = obj;
      const pair = document.createElement('div');
      pair.className = 'bilingual-pair gd-tag-pair';
      ['zh', 'en'].forEach(lang => {
        const cell = document.createElement('div');
        cell.className = 'bilingual-cell';

        const langLabel = document.createElement('span');
        langLabel.className = 'bilingual-tag';
        langLabel.textContent = t(`editor.lang.${lang}`);
        cell.appendChild(langLabel);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'gd-tag-input';
        input.value = obj[lang] || '';
        input.placeholder = t(`editor.placeholder.${lang}`);
        input.addEventListener('input', () => {
          obj[lang] = input.value;
          syncPending();
        });
        cell.appendChild(input);
        pair.appendChild(cell);
      });
      li.appendChild(pair);
    } else {
      li.appendChild(document.createTextNode(localized));
    }

    list.appendChild(li);
  });
}

// ── Video ────────────────────────────────────
function renderVideo() {
  const wrap = document.getElementById('gd-video-wrap');
  wrap.innerHTML = '';

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
        frame.appendChild(buildFallback(t('video.unsupported')));
    }
    wrap.appendChild(frame);
  } else if (isEditing()) {
    wrap.hidden = false;
    const placeholder = document.createElement('div');
    placeholder.className = 'gd-video-frame gd-video-empty';
    placeholder.appendChild(buildFallback(t('video.no.video')));
    wrap.appendChild(placeholder);
  } else {
    wrap.hidden = true;
    return;
  }

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

  const select = document.createElement('select');
  ['youtube', 'vimeo', 'upload'].forEach(typeKey => {
    const opt = document.createElement('option');
    opt.value = typeKey;
    opt.textContent = typeKey.toUpperCase();
    if (game.video.type === typeKey) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    game.video.type = select.value;
    game.video.src  = '';
    syncPending();
    renderVideo();
  });
  row.appendChild(select);

  if (game.video.type === 'upload') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gd-video-upload';
    btn.textContent = game.video.src ? t('video.replace') : t('video.upload');
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
      ? t('video.youtube.placeholder')
      : t('video.vimeo.placeholder');
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
    clear.textContent = t('video.clear');
    clear.addEventListener('click', () => {
      if (!confirm(t('video.confirm.clear'))) return;
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
      const size = (file.size / 1024 / 1024).toFixed(1);
      if (!confirm(t('video.confirm.size', { size }))) return;
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
    const obj = bilingualize(block.value);
    block.value = obj;

    const pair = document.createElement('div');
    pair.className = 'bilingual-pair bilingual-stack';
    ['zh', 'en'].forEach(lang => {
      const cell = document.createElement('div');
      cell.className = 'bilingual-cell';

      const tag = document.createElement('span');
      tag.className = 'bilingual-tag';
      tag.textContent = t(`editor.lang.${lang}`);
      cell.appendChild(tag);

      const ta = document.createElement('textarea');
      ta.className = 'gd-block-text gd-text-edit';
      ta.value = obj[lang] || '';
      ta.placeholder = t('block.text.placeholder');
      ta.addEventListener('input', () => {
        obj[lang] = ta.value;
        autoGrow(ta);
        syncPending();
      });
      autoGrow(ta);
      cell.appendChild(ta);
      pair.appendChild(cell);
    });
    wrap.appendChild(pair);
    wrap.appendChild(buildBlockCtrl(idx));
  } else {
    const p = document.createElement('p');
    p.className = 'gd-block-text';
    p.textContent = pickLocalized(block.value);
    wrap.appendChild(p);
  }
  return wrap;
}

function buildImageBlock(block, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'gd-block-wrap gd-block-image';

  const fig = document.createElement('figure');

  const img = document.createElement('img');
  img.src = pickLocalized(block.src) || placeholderImage();
  img.alt = pickLocalized(block.caption) || 'Project screenshot';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.onerror = () => { img.src = placeholderImage(); };
  fig.appendChild(img);

  // Systems Breakdown: bilingual image — a separate upload slot per language.
  if (isEditing() && isSystemsSection()) {
    block.src = bilingualize(block.src);
    fig.appendChild(buildImageLangUploads(block, idx));
  }

  if (isEditing()) {
    const obj = bilingualize(block.caption);
    block.caption = obj;

    const pair = document.createElement('div');
    pair.className = 'bilingual-pair';
    ['zh', 'en'].forEach(lang => {
      const cell = document.createElement('div');
      cell.className = 'bilingual-cell';

      const tag = document.createElement('span');
      tag.className = 'bilingual-tag';
      tag.textContent = t(`editor.lang.${lang}`);
      cell.appendChild(tag);

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'gd-block-cap-edit';
      input.placeholder = t('block.caption.placeholder');
      input.value = obj[lang] || '';
      input.addEventListener('input', () => {
        obj[lang] = input.value;
        syncPending();
      });
      cell.appendChild(input);
      pair.appendChild(cell);
    });
    fig.appendChild(pair);
  } else {
    const cap = pickLocalized(block.caption);
    if (cap) {
      const node = document.createElement('figcaption');
      node.textContent = cap;
      fig.appendChild(node);
    }
  }

  wrap.appendChild(fig);

  if (isEditing()) {
    const ctrl = buildBlockCtrl(idx);
    if (!isSystemsSection()) {
      // Non-systems: one shared image, single replace button (legacy behaviour).
      const replace = document.createElement('button');
      replace.type = 'button';
      replace.textContent = t('block.replace.img');
      replace.addEventListener('click', () => pickBlockImage(idx));
      ctrl.insertBefore(replace, ctrl.firstChild);
    }
    wrap.appendChild(ctrl);
  }
  return wrap;
}

// Paired ZH/EN image upload controls for a Systems Breakdown image block.
function buildImageLangUploads(block, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'gd-img-lang-uploads';

  ['zh', 'en'].forEach(lang => {
    const cell = document.createElement('div');
    cell.className = 'gd-img-lang-cell';

    const tag = document.createElement('span');
    tag.className = 'bilingual-tag';
    tag.textContent = t(`editor.lang.${lang}`);
    cell.appendChild(tag);

    const cur = block.src[lang];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gd-img-lang-btn';
    btn.textContent = cur ? t('block.replace.img') : t('block.image.upload');
    btn.addEventListener('click', () => pickBlockImage(idx, lang));
    cell.appendChild(btn);

    if (cur) {
      const name = document.createElement('span');
      name.className = 'gd-img-lang-name';
      name.textContent = cur.split('/').pop();
      cell.appendChild(name);
    }

    wrap.appendChild(cell);
  });

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
  mkBtn(row, t('block.text.add'),  () => insertBlock(idx, { type: 'text',  value: { zh: '', en: '' } }));
  mkBtn(row, t('block.image.add'), () => insertImage(idx));
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
    // In Systems Breakdown, seed both languages with the first upload (so a
    // fallback always exists); the admin can then replace one side separately.
    const src = isSystemsSection() ? { zh: filePath, en: filePath } : filePath;
    insertBlock(idx, { type: 'image', src, caption: { zh: '', en: '' } });
  };
  input.click();
}

// lang omitted → replace the single shared image (legacy / non-systems).
// lang = 'zh' | 'en' → replace just that language's image (systems).
function pickBlockImage(idx, lang) {
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

    if (lang) {
      block.src = bilingualize(block.src);
      const old   = block.src[lang];
      const other = block.src[lang === 'zh' ? 'en' : 'zh'];
      // Delete the old file only if it's ours and not shared with the other language.
      if (old && old !== other && old.startsWith('assets/images/games/')) {
        addPendingDelete(old);
      }
      block.src[lang] = filePath;
    } else {
      if (typeof block.src === 'string' && block.src.startsWith('assets/images/games/')) {
        addPendingDelete(block.src);
      }
      block.src = filePath;
    }

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
  if (!confirm(t('block.delete.confirm'))) return;
  if (block?.type === 'image') {
    [...new Set(imageSrcPaths(block.src))].forEach(p => {
      if (p.startsWith('assets/images/games/')) addPendingDelete(p);
    });
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

function placeholderImage() {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 450'>
      <rect width='800' height='450' fill='#141914'/>
      <text x='400' y='240' text-anchor='middle' font-family='VT323, monospace'
            font-size='34' fill='#3a7a2e' letter-spacing='6'>// IMAGE PENDING //</text>
    </svg>`.replace(/\s+/g, ' ');
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// Bilingual pair renderer for the title editor (reused locally)
function renderBilingualPair(hostId, valueObj, onChange) {
  const host = document.getElementById(hostId);
  host.innerHTML = '';
  ['zh', 'en'].forEach(lang => {
    const cell = document.createElement('div');
    cell.className = 'bilingual-cell';

    const tag = document.createElement('span');
    tag.className = 'bilingual-tag';
    tag.textContent = t(`editor.lang.${lang}`);
    cell.appendChild(tag);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = valueObj[lang] || '';
    input.placeholder = t(`editor.placeholder.${lang}`);
    input.addEventListener('input', () => onChange(lang, input.value));
    cell.appendChild(input);

    host.appendChild(cell);
  });
}

// ── Error UI ─────────────────────────────────
function showError(msg) {
  document.getElementById('gd-loading').hidden = true;
  const err = document.getElementById('gd-error');
  document.getElementById('gd-error-msg').textContent = msg;
  err.hidden = false;
}
