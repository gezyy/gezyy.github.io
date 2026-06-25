// js/games.js — Game Collection list page
// M-Games-1: visual rendering of cards.
// M-Games-2: admin editing — per-card overlay + add/edit modal + cover upload.
// Edit mode lives behind the PIN-protected toggle in admin.js;
// all persistence is funneled through js/edit-mode.js → Cloudflare Worker → GitHub.

import {
  isAdmin, pushChange, addPendingUpload, addPendingDelete,
  readFileAsBase64, onEditModeChange,
} from './edit-mode.js';

const GAMES_FILE = 'content/games.json';
const PAGE_SIZE  = 12;

let allGames = [];        // single source of truth on this page
let visibleCount = 0;     // for paginated rendering
let editor = null;        // { idx: number | -1, draft: gameObject }

// ── Boot ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  allGames = await loadGames();
  renderAll();

  document.getElementById('games-load-more')
    .addEventListener('click', () => { renderNextPage(); syncLoadMore(); });

  if (isAdmin()) {
    buildAddButton();
    buildEditorModal();
    // Re-render when edit mode toggled so overlays show/hide
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
  // Always rewrite full games array — Worker overwrites the JSON file.
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
    btn.textContent = `[ LOAD MORE — ${remaining} LEFT ]`;
  } else {
    wrap.hidden = true;
  }
}

function buildCard(game, idx) {
  const admin = isAdmin();

  // Card is an <a> normally, but in edit mode swap to a <div> so the per-card
  // edit buttons don't have to fight bubbling click → navigation.
  const tag = admin && document.body.classList.contains('edit-mode') ? 'div' : 'a';
  const card = document.createElement(tag);
  card.className = 'game-card';
  if (tag === 'a') {
    card.href = `game-detail.html?id=${encodeURIComponent(game.id)}`;
    card.setAttribute('aria-label', `Open ${game.title || 'game'} details`);
  } else {
    card.classList.add('game-card--editing');
  }

  // ── Cover ──
  const cover = document.createElement('div');
  cover.className = 'game-card-cover';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = game.title ? `${game.title} cover art` : 'Game cover';
  img.src = game.cover || placeholderCover();
  img.onerror = () => { img.src = placeholderCover(); };
  cover.appendChild(img);

  // ── Body ──
  const body = document.createElement('div');
  body.className = 'game-card-body';

  const title = document.createElement('h2');
  title.className = 'game-card-title';
  title.textContent = game.title || 'Untitled transmission';

  const blurb = document.createElement('p');
  blurb.className = 'game-card-blurb';
  blurb.textContent = game.blurb || tagsToBlurb(game.tags);

  body.appendChild(title);
  body.appendChild(blurb);

  card.appendChild(cover);
  card.appendChild(body);

  // ── Admin overlay ──
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
  return [tags.genre, tags.platform, tags.duration].filter(Boolean).join(' · ');
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
  if (!confirm(`Delete "${g.title || g.id}" from the collection?`)) return;
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
  btn.textContent = '[ + ADD GAME ]';
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
      <h3 id="ge-heading">EDIT GAME</h3>

      <label for="ge-id">ID / SLUG (URL-safe)</label>
      <input type="text" id="ge-id" placeholder="my-game-slug" autocomplete="off">

      <label for="ge-title">TITLE</label>
      <input type="text" id="ge-title" placeholder="Game title">

      <label for="ge-blurb">BLURB (one short line)</label>
      <input type="text" id="ge-blurb" placeholder="Genre · Platform · Duration">

      <label>COVER IMAGE</label>
      <div class="ge-cover-row">
        <img class="ge-cover-preview" id="ge-cover-preview" alt="" src="">
        <button type="button" id="ge-cover-btn">[CHANGE COVER]</button>
      </div>

      <div class="ge-footer">
        <button type="button" id="ge-cancel">[CANCEL]</button>
        <button type="button" class="primary" id="ge-done">[DONE]</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

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

  editor = { idx, draft: JSON.parse(JSON.stringify(base)) };

  document.getElementById('ge-heading').textContent = isNew ? 'ADD GAME' : 'EDIT GAME';
  document.getElementById('ge-id').value     = editor.draft.id || '';
  document.getElementById('ge-id').disabled  = !isNew; // changing slug breaks links
  document.getElementById('ge-title').value  = editor.draft.title || '';
  document.getElementById('ge-blurb').value  = editor.draft.blurb || '';

  const prev = document.getElementById('ge-cover-preview');
  prev.src = editor.draft.cover || '';
  prev.style.display = editor.draft.cover ? 'block' : 'none';

  document.getElementById('game-editor-backdrop').classList.add('open');
}

function closeEditor() {
  document.getElementById('game-editor-backdrop').classList.remove('open');
  editor = null;
}

function commitEditor() {
  if (!editor) return;
  const { idx, draft } = editor;
  draft.id    = document.getElementById('ge-id').value.trim();
  draft.title = document.getElementById('ge-title').value.trim();
  draft.blurb = document.getElementById('ge-blurb').value.trim();

  if (!draft.id) { alert('ID / slug cannot be empty.'); return; }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(draft.id)) {
    alert('ID must be lowercase, digits and hyphens only, e.g. "my-game-slug".');
    return;
  }
  if (!draft.title) { alert('Title cannot be empty.'); return; }

  if (idx === -1) {
    // creating — guard against duplicate id
    if (allGames.some(g => g.id === draft.id)) {
      alert(`A game with id "${draft.id}" already exists.`);
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

    // Path the file will live at in the repo
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = `assets/images/games/${Date.now()}-${safeName}`;

    // If we're replacing an existing repo-hosted cover, queue deletion of the old one
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

// ── Placeholder cover (inline SVG, same palette) ──
function placeholderCover() {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'>
      <rect width='640' height='360' fill='#141914'/>
      <text x='320' y='190' text-anchor='middle' font-family='VT323, monospace'
            font-size='32' fill='#3a7a2e' letter-spacing='6'>// NO SIGNAL //</text>
    </svg>`.replace(/\s+/g, ' ');
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
