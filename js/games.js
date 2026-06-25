// js/games.js — Game Collection list page
// M-Games-1: visual rendering of cards.
// M-Games-2: admin editing — per-card overlay + add/edit modal + cover upload.
// M-Games-3 (i18n): bilingual title/blurb via {zh, en} objects + paired editor inputs.

import {
  isAdmin, pushChange, addPendingUpload, addPendingDelete,
  readFileAsBase64, onEditModeChange,
} from './edit-mode.js';
import { t, pickLocalized, bilingualize } from './i18n.js';

const GAMES_FILE = 'content/games.json';
const PAGE_SIZE  = 12;

let allGames = [];
let visibleCount = 0;
let editor = null;        // { idx: number | -1, draft: gameObject }

// ── Boot ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Localize header copy
  document.getElementById('games-title').textContent = t('games.title');
  document.getElementById('games-sub').textContent   = t('games.subtitle');
  document.querySelector('#games-grid-empty .blink').textContent = t('games.empty');

  allGames = await loadGames();
  renderAll();

  document.getElementById('games-load-more')
    .addEventListener('click', () => { renderNextPage(); syncLoadMore(); });

  if (isAdmin()) {
    buildAddButton();
    buildEditorModal();
    onEditModeChange(() => renderAll());
  }
});

// ── Data ─────────────────────────────────────
async function loadGames() {
  try {
    const r = await fetch(`/${GAMES_FILE}?_=${Date.now()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data.games)) throw new Error('games field missing');
    return [...data.games].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch (e) {
    console.error('[Games] loadGames failed:', e);
    return [];
  }
}

function syncPending() {
  pushChange(GAMES_FILE, { games: allGames });
}

// ── Render ───────────────────────────────────
function renderAll() {
  const grid = document.getElementById('games-grid');
  if (!grid) return;
  grid.innerHTML = '';
  visibleCount = 0;
  const empty = document.getElementById('games-grid-empty');
  if (allGames.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    renderNextPage();
  }
  syncLoadMore();
}

function renderNextPage() {
  const grid = document.getElementById('games-grid');
  const start = visibleCount;
  const end   = Math.min(start + PAGE_SIZE, allGames.length);
  for (let i = start; i < end; i++) {
    grid.appendChild(buildCard(allGames[i], i));
  }
  visibleCount = end;
}

function syncLoadMore() {
  const wrap = document.getElementById('games-load-more-wrap');
  const btn  = document.getElementById('games-load-more');
  const remaining = allGames.length - visibleCount;
  if (remaining > 0) {
    wrap.hidden = false;
    btn.textContent = t('games.loadmore', { n: remaining });
  } else {
    wrap.hidden = true;
  }
}

function buildCard(game, idx) {
  const admin = isAdmin();
  const titleText = pickLocalized(game.title) || t('games.untitled');
  const blurbText = pickLocalized(game.blurb) || tagsToBlurb(game.tags);

  const tag = admin && document.body.classList.contains('edit-mode') ? 'div' : 'a';
  const card = document.createElement(tag);
  card.className = 'game-card';
  if (tag === 'a') {
    card.href = `game-detail.html?id=${encodeURIComponent(game.id)}`;
    card.setAttribute('aria-label', `Open ${titleText} details`);
  } else {
    card.classList.add('game-card--editing');
  }

  // ── Cover ──
  const cover = document.createElement('div');
  cover.className = 'game-card-cover';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = titleText
    ? t('games.cover.alt', { title: titleText })
    : t('games.cover.alt.empty');
  img.src = game.cover || placeholderCover();
  img.onerror = () => { img.src = placeholderCover(); };
  cover.appendChild(img);

  // ── Body ──
  const body = document.createElement('div');
  body.className = 'game-card-body';

  const title = document.createElement('h2');
  title.className = 'game-card-title';
  title.textContent = titleText;

  const blurb = document.createElement('p');
  blurb.className = 'game-card-blurb';
  blurb.textContent = blurbText;

  body.appendChild(title);
  body.appendChild(blurb);

  card.appendChild(cover);
  card.appendChild(body);

  if (admin) card.appendChild(buildCardCtrl(idx));

  return card;
}

function buildCardCtrl(idx) {
  const ctrl = document.createElement('div');
  ctrl.className = 'game-card-ctrl';

  mkBtn(ctrl, '[edit]',  () => openEditor(idx));
  mkBtn(ctrl, '[↑]',     () => reorder(idx, -1));
  mkBtn(ctrl, '[↓]',     () => reorder(idx, +1));
  mkBtn(ctrl, '[del]',   () => removeGame(idx), true);

  return ctrl;
}

function mkBtn(parent, label, handler, danger = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (danger) b.className = 'danger';
  b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); handler(); });
  parent.appendChild(b);
  return b;
}

function tagsToBlurb(tags) {
  if (!tags) return '';
  return [tags.genre, tags.platform, tags.duration]
    .map(v => pickLocalized(v))
    .filter(Boolean)
    .join(' · ');
}

// ── Reorder / Delete ─────────────────────────
function reorder(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= allGames.length) return;
  [allGames[idx], allGames[target]] = [allGames[target], allGames[idx]];
  reindex();
  renderAll();
  syncPending();
}

function removeGame(idx) {
  const g = allGames[idx];
  const display = pickLocalized(g.title) || g.id;
  if (!confirm(t('confirm.delete.game', { title: display }))) return;
  allGames.splice(idx, 1);
  reindex();
  renderAll();
  syncPending();
}

function reindex() {
  allGames.forEach((g, i) => { g.order = i; });
}

// ── Add ──────────────────────────────────────
function buildAddButton() {
  if (document.getElementById('games-add-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'games-add-btn';
  btn.type = 'button';
  btn.textContent = t('fab.add.game');
  btn.addEventListener('click', () => openEditor(-1));
  document.body.appendChild(btn);
}

// ── Editor modal ─────────────────────────────
function buildEditorModal() {
  if (document.getElementById('game-editor-backdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.id = 'game-editor-backdrop';
  backdrop.innerHTML = `
    <div id="game-editor">
      <h3 id="ge-heading"></h3>

      <label id="ge-id-label" for="ge-id"></label>
      <input type="text" id="ge-id" placeholder="my-game-slug" autocomplete="off">

      <label id="ge-title-label"></label>
      <div class="bilingual-pair" id="ge-title-pair"></div>

      <label id="ge-blurb-label"></label>
      <div class="bilingual-pair" id="ge-blurb-pair"></div>

      <label id="ge-cover-label"></label>
      <div class="ge-cover-row">
        <img class="ge-cover-preview" id="ge-cover-preview" alt="" src="">
        <button type="button" id="ge-cover-btn"></button>
      </div>

      <div class="ge-footer">
        <button type="button" id="ge-cancel"></button>
        <button type="button" class="primary" id="ge-done"></button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  // Localized text injection (so we can re-translate easily if needed)
  document.getElementById('ge-id-label').textContent     = t('editor.id');
  document.getElementById('ge-title-label').textContent  = t('editor.title');
  document.getElementById('ge-blurb-label').textContent  = t('editor.blurb');
  document.getElementById('ge-cover-label').textContent  = t('editor.cover');
  document.getElementById('ge-cover-btn').textContent    = t('editor.cover.change');
  document.getElementById('ge-cancel').textContent       = t('editor.cancel');
  document.getElementById('ge-done').textContent         = t('editor.done');

  document.getElementById('ge-cancel').addEventListener('click', closeEditor);
  document.getElementById('ge-done').addEventListener('click', commitEditor);
  document.getElementById('ge-cover-btn').addEventListener('click', pickCover);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeEditor();
  });
}

function openEditor(idx) {
  const isNew = idx === -1;
  const base = isNew ? {
    id: '',
    title: '',
    cover: '',
    blurb: '',
    tags: { genre: '', platform: '', duration: '' },
    video: { type: 'youtube', src: '' },
    body: [],
    order: allGames.length,
  } : allGames[idx];

  // Deep clone + force title/blurb into bilingual shape so the editor never sees a bare string
  const draft = JSON.parse(JSON.stringify(base));
  draft.title = bilingualize(draft.title);
  draft.blurb = bilingualize(draft.blurb);
  editor = { idx, draft };

  document.getElementById('ge-heading').textContent = t(isNew ? 'editor.add.game' : 'editor.edit.game');
  document.getElementById('ge-id').value     = draft.id || '';
  document.getElementById('ge-id').disabled  = !isNew; // changing slug breaks links

  renderBilingualPair('ge-title-pair', draft.title, (lang, val) => { draft.title[lang] = val; });
  renderBilingualPair('ge-blurb-pair', draft.blurb, (lang, val) => { draft.blurb[lang] = val; });

  const prev = document.getElementById('ge-cover-preview');
  prev.src = draft.cover || '';
  prev.style.display = draft.cover ? 'block' : 'none';

  document.getElementById('game-editor-backdrop').classList.add('open');
}

// Renders two inputs (ZH + EN) into a host div, wired to onChange(lang, value).
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

function closeEditor() {
  document.getElementById('game-editor-backdrop').classList.remove('open');
  editor = null;
}

function commitEditor() {
  if (!editor) return;
  const { idx, draft } = editor;
  draft.id = document.getElementById('ge-id').value.trim();

  if (!draft.id) { alert(t('alert.id.empty')); return; }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(draft.id)) {
    alert(t('alert.id.format'));
    return;
  }
  // Title needs at least one language filled
  if (!draft.title.zh.trim() && !draft.title.en.trim()) {
    alert(t('alert.title.empty'));
    return;
  }

  if (idx === -1) {
    if (allGames.some(g => g.id === draft.id)) {
      alert(t('alert.id.duplicate', { id: draft.id }));
      return;
    }
    allGames.push(draft);
  } else {
    allGames[idx] = draft;
  }
  reindex();
  closeEditor();
  renderAll();
  syncPending();
}

async function pickCover() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file || !editor) return;
    const { base64, dataUrl } = await readFileAsBase64(file);

    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = `assets/images/games/${Date.now()}-${safeName}`;

    const oldCover = editor.draft.cover;
    if (oldCover && oldCover.startsWith('assets/images/games/')) {
      addPendingDelete(oldCover);
    }

    editor.draft.cover = filePath;
    addPendingUpload(filePath, base64);

    const prev = document.getElementById('ge-cover-preview');
    prev.src = dataUrl;
    prev.style.display = 'block';
  };
  input.click();
}

// ── Placeholder cover ────────────────────────
function placeholderCover() {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'>
      <rect width='640' height='360' fill='#141914'/>
      <text x='320' y='190' text-anchor='middle' font-family='VT323, monospace'
            font-size='32' fill='#3a7a2e' letter-spacing='6'>// NO SIGNAL //</text>
    </svg>`.replace(/\s+/g, ' ');
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
