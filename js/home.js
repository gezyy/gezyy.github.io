// js/home.js — Falling geometry physics (M2) + title edit (M5)
// ES Module, auto-runs on DOMContentLoaded
import { isAdmin, pushChange, onEditModeChange } from './edit-mode.js';

const GROUND_RATIO  = 0.70;   // ground line at 70% viewport height
const MAX_SETTLED   = 28;
const SPAWN_NORMAL  = 900;    // ms between spawns at normal FPS
const SPAWN_SLOW    = 1600;   // ms at low FPS
const MOUSE_R       = 80;     // push radius px
const PUSH_F        = 2.8;
const SPRING_F      = 0.07;
const DAMP          = 0.80;

let sandbox, groundY;
let mouseX = -9999, mouseY = -9999;
const shapes = [];
let lastSpawnTs = 0, spawnMs = SPAWN_NORMAL;
let fpsFrames = 0, fpsTs = 0;

// Resolved CSS color strings (set in init)
let C_INK_DIM, C_ACCENT, C_ACCENT_DIM;

// ── Clip-path generators ────────────────────────
function makeClip(type, w, h) {
  const hw = w / 2, hh = h / 2;
  switch (type) {
    case 0: // equilateral-ish triangle
      return `polygon(${hw}px 0px, ${w}px ${h}px, 0px ${h}px)`;
    case 1: // diamond
      return `polygon(${hw}px 0px, ${w}px ${hh}px, ${hw}px ${h}px, 0px ${hh}px)`;
    case 2: // hexagon
      return 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
    case 3: { // irregular quad (randomised once at creation)
      const ax = (0.1 + Math.random() * 0.25) * w;
      const by = (0.1 + Math.random() * 0.25) * h;
      const cx = (0.65 + Math.random() * 0.25) * w;
      const dy = (0.65 + Math.random() * 0.25) * h;
      return `polygon(${ax}px 0px, ${w}px ${by}px, ${cx}px ${h}px, 0px ${dy}px)`;
    }
    default:
      return `polygon(50% 0%, 100% 100%, 0% 100%)`;
  }
}

// ── Shape factory ───────────────────────────────
function spawnShape() {
  const w    = 16 + Math.random() * 38;
  const h    = 16 + Math.random() * 38;
  const type = Math.floor(Math.random() * 4);
  const isAccent = Math.random() < 0.2;
  const color    = isAccent ? C_ACCENT : C_INK_DIM;

  const el = document.createElement('div');
  el.className = 'geo-shape';
  el.style.width   = `${w}px`;
  el.style.height  = `${h}px`;
  el.style.background = color;
  el.style.clipPath   = makeClip(type, w, h);
  el.style.filter     = `drop-shadow(0 0 1.5px ${C_ACCENT_DIM})`;
  sandbox.appendChild(el);

  shapes.push({
    w, h,
    x: Math.random() * (window.innerWidth - w),
    y: -h - Math.random() * 60,
    vx: (Math.random() - 0.5) * 0.5,
    vy: 0.9 + Math.random() * 1.6,
    rot: Math.random() * 360,
    rotV: (Math.random() - 0.5) * 1.4,
    // settled state
    settled:  false,
    settledY: 0,
    pushX: 0, pushY: 0,   // visual offset applied by mouse
    pvx: 0,   pvy: 0,     // push velocity
    // fade
    opacity: 1,
    fading: false,
    el,
  });
}

// ── Render one shape ────────────────────────────
function renderShape(s) {
  const ox = s.settled ? s.pushX : 0;
  const oy = s.settled ? s.pushY : 0;
  s.el.style.transform = `translate(${s.x + ox}px, ${s.y + oy}px) rotate(${s.rot}deg)`;
  if (s.opacity !== 1) s.el.style.opacity = s.opacity;
}

// ── AABB collision helper ───────────────────────
// Returns true if falling shape 'f' overlaps settled shape 's' horizontally.
function xOverlap(f, s) {
  return f.x + f.w > s.x && f.x < s.x + s.w;
}

// ── RAF loop ────────────────────────────────────
function loop(ts) {
  requestAnimationFrame(loop);

  // FPS sampling (every 1 s)
  fpsFrames++;
  if (ts - fpsTs >= 1000) {
    spawnMs = fpsFrames < 30 ? SPAWN_SLOW : SPAWN_NORMAL;
    fpsFrames = 0;
    fpsTs = ts;
  }

  // Spawn when under limit
  const settledCount = shapes.filter(s => s.settled && !s.fading).length;
  if (ts - lastSpawnTs > spawnMs && settledCount < MAX_SETTLED) {
    spawnShape();
    lastSpawnTs = ts;
  }

  // Start fading oldest settled when approaching limit
  if (settledCount >= MAX_SETTLED) {
    const oldest = shapes.find(s => s.settled && !s.fading);
    if (oldest) oldest.fading = true;
  }

  // Update all shapes (iterate backwards so splice is safe)
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];

    // ── Fading out ──────────────────────────────
    if (s.fading) {
      s.opacity = Math.max(0, s.opacity - 0.016);
      s.el.style.opacity = s.opacity;
      if (s.opacity <= 0) {
        s.el.remove();
        shapes.splice(i, 1);
      }
      continue;
    }

    // ── Falling ─────────────────────────────────
    if (!s.settled) {
      s.vy = Math.min(s.vy + 0.045, 5.5);  // gravity, capped
      s.x += s.vx;
      s.y += s.vy;
      s.rot += s.rotV;

      // Horizontal wall bounce
      if (s.x < 0) {
        s.x = 0;
        s.vx = Math.abs(s.vx) * 0.5;
      } else if (s.x + s.w > window.innerWidth) {
        s.x = window.innerWidth - s.w;
        s.vx = -Math.abs(s.vx) * 0.5;
      }

      // Find where to settle: minimum settledY among overlapping settled shapes
      // that are at or below the shape's current top edge (to avoid teleporting up)
      const bottom = s.y + s.h;
      let settleAt = groundY;

      for (const other of shapes) {
        if (!other.settled || other.fading || other === s) continue;
        if (!xOverlap(s, other)) continue;
        // Only treat shapes whose top is below where the falling shape currently starts
        if (other.settledY >= s.y && other.settledY < settleAt) {
          settleAt = other.settledY;
        }
      }

      if (bottom >= settleAt) {
        s.y = settleAt - s.h;
        s.settledY = s.y;
        s.settled  = true;
        s.vx = 0; s.vy = 0; s.rotV = 0;
      }
    }

    // ── Settled: mouse push + spring return ─────
    if (s.settled) {
      const cx = s.x + s.w / 2 + s.pushX;
      const cy = s.settledY + s.h / 2 + s.pushY;
      const dx = cx - mouseX;
      const dy = cy - mouseY;
      const dist = Math.hypot(dx, dy);

      if (dist < MOUSE_R && dist > 1) {
        const force = (1 - dist / MOUSE_R) * PUSH_F;
        s.pvx += (dx / dist) * force;
        s.pvy += (dy / dist) * force;
        // tiny spin on push
        s.rot += (Math.random() - 0.5) * force * 0.8;
      }

      // Spring back + damp
      s.pvx += -s.pushX * SPRING_F;
      s.pvy += -s.pushY * SPRING_F;
      s.pvx *= DAMP;
      s.pvy *= DAMP;
      s.pushX += s.pvx;
      s.pushY += s.pvy;
    }

    renderShape(s);
  }
}

// ── Init ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  sandbox = document.getElementById('geo-sandbox');
  if (!sandbox) return;

  const cs = getComputedStyle(document.documentElement);
  C_INK_DIM   = cs.getPropertyValue('--ink-dim').trim()   || '#6b7a68';
  C_ACCENT    = cs.getPropertyValue('--accent').trim()    || '#7cff5e';
  C_ACCENT_DIM = cs.getPropertyValue('--accent-dim').trim() || '#3a7a2e';

  groundY = window.innerHeight * GROUND_RATIO;

  window.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  // Mouse leaving window: push stops
  window.addEventListener('mouseleave', () => {
    mouseX = -9999;
    mouseY = -9999;
  });
  window.addEventListener('resize', () => {
    groundY = window.innerHeight * GROUND_RATIO;
  });

  fpsTs = performance.now();
  requestAnimationFrame(loop);

  // ── Title load + admin edit ────────────────────
  try {
    const r = await fetch(`/content/home.json?_=${Date.now()}`);
    const d = await r.json();
    const titleEl = document.getElementById('site-title');
    if (titleEl && d.title) titleEl.textContent = d.title;
  } catch { /* keep hardcoded fallback */ }

  if (isAdmin()) {
    const titleEl = document.getElementById('site-title');
    if (!titleEl) return;

    const activateEdit = () => {
      if (!document.body.classList.contains('edit-mode')) return;
      titleEl.contentEditable = 'true';
      titleEl.focus();
    };

    const finishEdit = () => {
      titleEl.contentEditable = 'false';
      const newTitle = titleEl.textContent.trim();
      if (newTitle) pushChange('content/home.json', { title: newTitle });
    };

    titleEl.addEventListener('dblclick', activateEdit);
    titleEl.addEventListener('blur', finishEdit);
    titleEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
      if (e.key === 'Escape') {
        titleEl.contentEditable = 'false';
        // Restore from JSON (cancel)
        fetch(`/content/home.json?_=${Date.now()}`)
          .then(r => r.json())
          .then(d => { if (d.title) titleEl.textContent = d.title; })
          .catch(() => {});
      }
    });

    onEditModeChange(inEdit => {
      titleEl.title = inEdit ? 'Double-click to edit title' : '';
    });
  }
});
