// js/home.js — Falling geometry physics (M2) + title edit (M5)
// ES Module, auto-runs on DOMContentLoaded
// i18n: site title is bilingual ({zh, en}); legacy strings still render.
import { isAdmin, pushChange, onEditModeChange } from './edit-mode.js';
import { t, pickLocalized, bilingualize } from './i18n.js';

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

  // ── Home content load (title + character dialogs + guard lines) ──
  let titleData   = { zh: '', en: '' };
  let dialogsData = [];   // [{ zh, en }, …]  — the random click pool
  // Guard lines are shown by the nav-guard sequence only; they never enter
  // the random pool above.
  let guardData   = { intro: { zh: '', en: '' }, confirm: { zh: '', en: '' }, final: { zh: '', en: '' } };
  try {
    const r = await fetch(`/content/home.json?_=${Date.now()}`);
    const d = await r.json();
    titleData   = bilingualize(d.title);
    dialogsData = Array.isArray(d.dialogs) ? d.dialogs.map(bilingualize) : [];
    const g = d.guard || {};
    guardData = { intro: bilingualize(g.intro), confirm: bilingualize(g.confirm), final: bilingualize(g.final) };
  } catch { /* keep hardcoded fallback */ }

  // Whole-file writer: title + dialogs + guard live in the same JSON, so always
  // push all of them or one editor would clobber another's field.
  const pushHome = () =>
    pushChange('content/home.json', { title: titleData, dialogs: dialogsData, guard: guardData });

  const titleEl = document.getElementById('site-title');
  if (titleEl) {
    const display = pickLocalized(titleData) || titleEl.textContent;
    titleEl.textContent = display;
  }

  // ── Character: drag to move + click to speak + nav guard ───
  setupCharacter(() => dialogsData, guardData);

  if (isAdmin() && titleEl) {
    // Insert a paired ZH/EN editor under the title; visible only in edit mode.
    const editor = document.createElement('div');
    editor.id = 'site-title-editor';
    editor.className = 'gd-inline-editor';
    editor.innerHTML = '<div class="bilingual-pair" id="site-title-pair"></div>';
    titleEl.insertAdjacentElement('afterend', editor);

    const renderPair = () => {
      const host = document.getElementById('site-title-pair');
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
        input.value = titleData[lang] || '';
        input.placeholder = t(`editor.placeholder.${lang}`);
        input.addEventListener('input', () => {
          titleData[lang] = input.value;
          titleEl.textContent = pickLocalized(titleData);
          pushHome();
        });
        cell.appendChild(input);
        host.appendChild(cell);
      });
    };

    const syncEditorVisibility = () => {
      editor.hidden = !document.body.classList.contains('edit-mode');
      if (!editor.hidden) renderPair();
    };
    syncEditorVisibility();
    onEditModeChange(syncEditorVisibility);

    // ── Dialog preset editor (add / edit / remove lines) ──
    buildDialogEditor(dialogsData, pushHome);
  }
});

// ── Character: left-click speaks / left-drag rotates / right-drag moves ──
function setupCharacter(getDialogs, guardData) {
  const model = document.getElementById('home-3d');
  if (!model) return;

  const DRAG_THRESHOLD = 6;   // px before a press becomes a drag rather than a click

  // ── Speech bubble ──
  const bubble = document.createElement('div');
  bubble.id = 'home-3d-bubble';
  bubble.innerHTML = `
    <div class="bubble-body">
      <button class="bubble-close" type="button" aria-label="${t('home.dialog.close.aria')}">×</button>
      <span class="bubble-text"></span>
    </div>
    <span class="bubble-tail"></span>`;
  document.body.appendChild(bubble);

  const textEl = bubble.querySelector('.bubble-text');
  bubble.querySelector('.bubble-close').addEventListener('click', () => {
    bubble.classList.remove('open');
  });

  // Position the bubble next to the character's current spot, flipping to the
  // left side if the character sits too close to the right edge.
  function positionBubble() {
    const rect = model.getBoundingClientRect();
    const top  = rect.top + rect.height * 0.12;
    bubble.classList.remove('flip');
    bubble.style.top  = `${top}px`;
    bubble.style.left = `${rect.right - 12}px`;
    if (rect.right - 12 + bubble.offsetWidth > window.innerWidth - 8) {
      bubble.classList.add('flip');
      bubble.style.left = `${rect.left - bubble.offsetWidth + 12}px`;
    }
  }

  function showBubble(text) {
    if (!text) return;
    textEl.textContent = text;
    bubble.classList.add('open');
    positionBubble();
  }

  let lastIdx = -1;
  function showRandomLine() {
    const dialogs = getDialogs();
    // Only consider lines that render to non-empty text in the current language.
    const candidates = [];
    dialogs.forEach((d, i) => {
      if (pickLocalized(d).trim()) candidates.push(i);
    });
    if (!candidates.length) return;

    let idx = candidates[Math.floor(Math.random() * candidates.length)];
    if (candidates.length > 1 && idx === lastIdx) {
      // Avoid repeating the same line twice in a row.
      const rest = candidates.filter(i => i !== lastIdx);
      idx = rest[Math.floor(Math.random() * rest.length)];
    }
    lastIdx = idx;
    showBubble(pickLocalized(dialogs[idx]));
  }

  // ── Animation switching ──
  function playAnim(name) {
    const avail = model.availableAnimations;
    if (avail && avail.length && !avail.includes(name)) return;
    if (model.getAttribute('animation-name') === name) return;
    model.setAttribute('animation-name', name);
  }

  // ── Scripted walk: glide the character to a target, playing the walk clip ──
  let walkRAF = null;
  function walkTo(tx, ty, done) {
    if (walkRAF) cancelAnimationFrame(walkRAF);
    const rect = model.getBoundingClientRect();
    const sx = rect.left, sy = rect.top;
    model.style.bottom = 'auto';                 // switch to explicit top/left
    tx = Math.max(0, Math.min(tx, window.innerWidth  - model.offsetWidth));
    ty = Math.max(0, Math.min(ty, window.innerHeight - model.offsetHeight));
    const dist = Math.hypot(tx - sx, ty - sy);
    if (dist < 2) { done && done(); return; }

    const dur = Math.min(1700, Math.max(420, dist / 0.5));   // ~0.5 px/ms
    playAnim('walk');
    const start = performance.now();
    (function step(now) {
      let p = (now - start) / dur;
      if (p > 1) p = 1;
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;  // easeInOutQuad
      model.style.left = `${sx + (tx - sx) * e}px`;
      model.style.top  = `${sy + (ty - sy) * e}px`;
      if (bubble.classList.contains('open')) positionBubble();  // bubble follows
      if (p < 1) { walkRAF = requestAnimationFrame(step); }
      else { walkRAF = null; playAnim('idle'); done && done(); }
    })(start);
  }

  // Walk to stand in front of a nav button (covering it).
  function walkToButton(btnRect, done) {
    const tx = btnRect.left + btnRect.width  / 2 - model.offsetWidth  / 2;
    const ty = btnRect.top  + btnRect.height / 2 - model.offsetHeight * 0.6;
    walkTo(tx, ty, done);
  }

  // Walk back to the default bottom-left corner, then re-pin to the CSS anchor.
  function walkHome(done) {
    const m  = window.innerWidth <= 640 ? 8 : 20;
    const tx = m;
    const ty = window.innerHeight - model.offsetHeight - m;
    walkTo(tx, ty, () => {
      model.style.left = '';
      model.style.top  = '';
      model.style.bottom = '';   // revert to the CSS bottom-left anchor
      done && done();
    });
  }

  function setGuardLock(locked) {
    model.classList.toggle('guard-lock', locked);   // pointer-events:none while locked
  }

  // ── First-visit greeting (feature 1): show the intro line once per session ──
  let greetTimer = null;
  if (guardData && pickLocalized(guardData.intro).trim() && !sessionStorage.getItem('homeGreeted')) {
    sessionStorage.setItem('homeGreeted', '1');
    greetTimer = setTimeout(() => showBubble(pickLocalized(guardData.intro)), 500);
  }

  // ── Nav guard (feature 2): gate Library/Gallery for non-admin visitors ──
  setupNavGuard();
  function setupNavGuard() {
    if (isAdmin()) return;                 // owner navigates freely
    if (!guardData) return;
    const guarded = [...document.querySelectorAll('#home-nav .nav-card')]
      .filter(a => /(?:library|gallery)\.html/i.test(a.getAttribute('href') || ''));
    if (!guarded.length) return;

    let stage = 0;        // 0 not started · 1 intro shown · 2 confirm shown · 3 done
    let busy  = false;    // a scripted walk is in progress → swallow clicks

    guarded.forEach(a => {
      a.addEventListener('click', e => {
        if (isAdmin() || stage >= 3) return;   // owner / finished → normal navigation
        e.preventDefault();
        if (busy) return;

        clearTimeout(greetTimer);          // cancel any pending greeting
        const btnRect = a.getBoundingClientRect();

        if (stage === 0) {
          stage = 1;
          busy = true;
          setGuardLock(true);
          bubble.classList.remove('open');
          walkToButton(btnRect, () => { showBubble(pickLocalized(guardData.intro)); busy = false; });
        } else if (stage === 1) {
          stage = 2;
          busy = true;
          bubble.classList.remove('open');
          walkToButton(btnRect, () => { showBubble(pickLocalized(guardData.confirm)); busy = false; });
        } else if (stage === 2) {
          stage = 3;
          busy = true;
          showBubble(pickLocalized(guardData.final));   // spoken while walking home
          walkHome(() => { setGuardLock(false); busy = false; });
        }
      });
    });
  }

  // ── Input model ──
  //  • LEFT button:  a clean click speaks (bubble); a left-drag rotates the
  //                  character — that rotation is handled by model-viewer's
  //                  own camera-controls, so we only detect the click here.
  //  • RIGHT button: drag to move the character anywhere on screen, playing
  //                  the walk animation until release.
  model.addEventListener('contextmenu', e => e.preventDefault());  // free the right-drag

  // Left-click (speak) detection
  let lStartX = 0, lStartY = 0, leftArmed = false;
  // Right-drag (move) state
  let rStartX = 0, rStartY = 0, baseLeft = 0, baseTop = 0, moving = false;

  model.addEventListener('pointerdown', e => {
    if (e.button === 0) {                       // left → potential click
      leftArmed = true;
      lStartX = e.clientX; lStartY = e.clientY;
    } else if (e.button === 2) {                // right → start moving
      moving = true;
      rStartX = e.clientX; rStartY = e.clientY;
      const rect = model.getBoundingClientRect();
      baseLeft = rect.left; baseTop = rect.top;
      bubble.classList.remove('open');          // moving dismisses the bubble
      model.style.bottom = 'auto';              // switch to explicit top/left
      model.classList.add('dragging');
      playAnim('walk');
      e.preventDefault();
    }
  });

  window.addEventListener('pointermove', e => {
    if (!moving) return;
    const maxX = window.innerWidth  - model.offsetWidth;
    const maxY = window.innerHeight - model.offsetHeight;
    const nx = Math.max(0, Math.min(baseLeft + (e.clientX - rStartX), maxX));
    const ny = Math.max(0, Math.min(baseTop  + (e.clientY - rStartY), maxY));
    model.style.left = `${nx}px`;
    model.style.top  = `${ny}px`;
  });

  function endMove() {
    if (!moving) return;
    moving = false;
    model.classList.remove('dragging');
    playAnim('idle');
  }

  window.addEventListener('pointerup', e => {
    if (e.button === 0 && leftArmed) {
      leftArmed = false;
      // Only a near-stationary press counts as a click; a left-drag was a rotate.
      if (Math.hypot(e.clientX - lStartX, e.clientY - lStartY) <= DRAG_THRESHOLD) {
        showRandomLine();
      }
    } else if (e.button === 2) {
      endMove();
    }
  });
  window.addEventListener('pointercancel', endMove);

  // Keep the character on-screen if the viewport shrinks after a move.
  window.addEventListener('resize', () => {
    if (model.style.bottom !== 'auto') return;  // still at its default anchor
    const maxX = window.innerWidth  - model.offsetWidth;
    const maxY = window.innerHeight - model.offsetHeight;
    const curX = parseFloat(model.style.left) || 0;
    const curY = parseFloat(model.style.top)  || 0;
    model.style.left = `${Math.max(0, Math.min(curX, maxX))}px`;
    model.style.top  = `${Math.max(0, Math.min(curY, maxY))}px`;
  });
}

// ── Admin: build the dialog preset editor panel ──
function buildDialogEditor(dialogsData, pushHome) {
  const panel = document.createElement('div');
  panel.id = 'dialog-editor';
  panel.innerHTML = `
    <h3>${t('home.dialog.editor.title')}</h3>
    <p class="dialog-editor-hint">${t('home.dialog.editor.hint')}</p>
    <div id="dialog-list"></div>
    <button id="dialog-add-btn" type="button">${t('home.dialog.add')}</button>`;
  document.body.appendChild(panel);

  const list = panel.querySelector('#dialog-list');

  function render() {
    list.innerHTML = '';
    if (!dialogsData.length) {
      const empty = document.createElement('p');
      empty.className = 'dialog-editor-empty';
      empty.textContent = t('home.dialog.empty');
      list.appendChild(empty);
      return;
    }

    dialogsData.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'dialog-edit-row';

      const del = document.createElement('button');
      del.className = 'dialog-del-line';
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', t('home.dialog.del.aria'));
      del.addEventListener('click', () => {
        dialogsData.splice(i, 1);
        pushHome();
        render();
      });
      row.appendChild(del);

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
        input.value = entry[lang] || '';
        input.placeholder = t(`editor.placeholder.${lang}`);
        input.addEventListener('input', () => {
          entry[lang] = input.value;
          pushHome();
        });
        cell.appendChild(input);
        pair.appendChild(cell);
      });
      row.appendChild(pair);
      list.appendChild(row);
    });
  }

  panel.querySelector('#dialog-add-btn').addEventListener('click', () => {
    dialogsData.push({ zh: '', en: '' });
    pushHome();
    render();
    // Focus the freshly added line's first input.
    const inputs = list.querySelectorAll('.dialog-edit-row input');
    if (inputs.length) inputs[inputs.length - 2]?.focus();
  });

  render();
}
