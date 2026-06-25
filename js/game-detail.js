// js/game-detail.js — single game writeup
// Reads ?id=<slug>, fetches content/games.json, renders header / tags / video / body.

const GAMES_FILE = 'content/games.json';

const TAG_KEY_LABELS = {
  genre:    'GENRE',
  platform: 'PLATFORM',
  duration: 'BUILD TIME',
};

document.addEventListener('DOMContentLoaded', async () => {
  const id = new URLSearchParams(location.search).get('id');

  if (!id) {
    showError('No game id given. Open a card from the collection page.');
    return;
  }

  const game = await loadGame(id);
  if (!game) {
    showError(`No game found for id "${id}".`);
    return;
  }

  document.title = `${game.title} — gezyy`;
  renderGame(game);
});

// ── Data ─────────────────────────────────────
async function loadGame(id) {
  try {
    const r = await fetch(`/${GAMES_FILE}?_=${Date.now()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const list = Array.isArray(data.games) ? data.games : [];
    return list.find(g => g.id === id) || null;
  } catch (e) {
    console.error('[GameDetail] loadGame failed:', e);
    return null;
  }
}

// ── Render ───────────────────────────────────
function renderGame(game) {
  renderHeader(game);
  renderTags(game.tags || {});
  renderVideo(game.video);
  renderBody(game.body || []);

  document.getElementById('gd-loading').hidden = true;
  document.getElementById('gd-content').hidden = false;
}

function renderHeader(game) {
  document.getElementById('gd-title').textContent = game.title || 'Untitled';
}

function renderTags(tags) {
  const list = document.getElementById('gd-tags');
  list.innerHTML = '';
  Object.entries(tags).forEach(([key, value]) => {
    if (!value) return;
    const li = document.createElement('li');
    li.className = 'gd-tag';
    const k = document.createElement('span');
    k.className = 'gd-tag-key';
    k.textContent = TAG_KEY_LABELS[key] || key.toUpperCase();
    li.appendChild(k);
    li.appendChild(document.createTextNode(String(value)));
    list.appendChild(li);
  });
}

function renderVideo(video) {
  const wrap = document.getElementById('gd-video-wrap');
  wrap.innerHTML = '';
  if (!video || !video.src) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;

  const frame = document.createElement('div');
  frame.className = 'gd-video-frame';

  switch (video.type) {
    case 'youtube':
      frame.appendChild(buildIframe(youtubeEmbedUrl(video.src), 'YouTube preview'));
      break;
    case 'vimeo':
      frame.appendChild(buildIframe(vimeoEmbedUrl(video.src), 'Vimeo preview'));
      break;
    case 'upload':
      frame.appendChild(buildVideoTag(video.src));
      break;
    default:
      frame.appendChild(buildFallback('// UNSUPPORTED VIDEO SOURCE //'));
  }
  wrap.appendChild(frame);
}

function renderBody(blocks) {
  const root = document.getElementById('gd-body');
  root.innerHTML = '';
  blocks.forEach(block => {
    if (block?.type === 'text' && block.value) {
      const p = document.createElement('p');
      p.className = 'gd-block-text';
      p.textContent = block.value;
      root.appendChild(p);
    } else if (block?.type === 'image' && block.src) {
      const wrap = document.createElement('div');
      wrap.className = 'gd-block-image';
      const fig = document.createElement('figure');

      const img = document.createElement('img');
      img.src = block.src;
      img.alt = block.caption || 'Project screenshot';
      img.loading = 'lazy';
      img.decoding = 'async';
      fig.appendChild(img);

      if (block.caption) {
        const cap = document.createElement('figcaption');
        cap.textContent = block.caption;
        fig.appendChild(cap);
      }
      wrap.appendChild(fig);
      root.appendChild(wrap);
    }
  });
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

// Accepts: 11-char ID, youtu.be/<id>, youtube.com/watch?v=<id>, /embed/<id>, /shorts/<id>
function youtubeEmbedUrl(input) {
  const raw = String(input).trim();
  const idMatch =
    raw.match(/^[A-Za-z0-9_-]{11}$/) ||
    raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  const id = idMatch ? (idMatch[1] || idMatch[0]) : '';
  return id ? `https://www.youtube.com/embed/${id}` : '';
}

// Accepts: numeric ID, vimeo.com/<id>
function vimeoEmbedUrl(input) {
  const raw = String(input).trim();
  const idMatch = raw.match(/^\d+$/) || raw.match(/vimeo\.com\/(\d+)/);
  const id = idMatch ? (idMatch[1] || idMatch[0]) : '';
  return id ? `https://player.vimeo.com/video/${id}` : '';
}

// ── Error UI ─────────────────────────────────
function showError(msg) {
  document.getElementById('gd-loading').hidden = true;
  const err = document.getElementById('gd-error');
  document.getElementById('gd-error-msg').textContent = msg;
  err.hidden = false;
}
