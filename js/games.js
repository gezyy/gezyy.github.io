// js/games.js — Game Collection list page
// Static data driven: fetches content/games.json, renders cards.
// Edit-mode wiring lives in a later milestone (M-Games-2).

const GAMES_FILE = 'content/games.json';
const PAGE_SIZE  = 12;

let allGames = [];
let visibleCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const grid     = document.getElementById('games-grid');
  const empty    = document.getElementById('games-grid-empty');
  const moreWrap = document.getElementById('games-load-more-wrap');
  const moreBtn  = document.getElementById('games-load-more');
  if (!grid) return;

  allGames = await loadGames();

  if (allGames.length === 0) {
    empty.hidden = false;
    return;
  }

  renderNext(grid);
  syncLoadMore(moreWrap, moreBtn);

  moreBtn.addEventListener('click', () => {
    renderNext(grid);
    syncLoadMore(moreWrap, moreBtn);
  });
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

// ── Render ───────────────────────────────────
function renderNext(grid) {
  const start = visibleCount;
  const end   = Math.min(start + PAGE_SIZE, allGames.length);
  for (let i = start; i < end; i++) {
    grid.appendChild(buildCard(allGames[i]));
  }
  visibleCount = end;
}

function buildCard(game) {
  const card = document.createElement('a');
  card.className = 'game-card';
  card.href = `game-detail.html?id=${encodeURIComponent(game.id)}`;
  card.setAttribute('aria-label', `Open ${game.title || 'game'} details`);

  // Cover
  const cover = document.createElement('div');
  cover.className = 'game-card-cover';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = game.title ? `${game.title} cover art` : 'Game cover';
  img.src = game.cover || placeholderCover();
  img.onerror = () => { img.src = placeholderCover(); };
  cover.appendChild(img);

  // Body
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
  return card;
}

function tagsToBlurb(tags) {
  if (!tags) return '';
  return [tags.genre, tags.platform, tags.duration].filter(Boolean).join(' · ');
}

// ── Load more visibility ─────────────────────
function syncLoadMore(wrap, btn) {
  const remaining = allGames.length - visibleCount;
  if (remaining > 0) {
    wrap.hidden = false;
    btn.textContent = `[ LOAD MORE — ${remaining} LEFT ]`;
  } else {
    wrap.hidden = true;
  }
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
