// js/shared.js — ES Module
// Injects CRT overlay, top bar controls, back button. Auto-runs on DOMContentLoaded.

const IS_HOME = document.body.classList.contains('page-home');

document.addEventListener('DOMContentLoaded', () => {
  injectCRTOverlay();
  injectTopBar();
  restorePrefs();
});

function injectCRTOverlay() {
  if (document.getElementById('crt-overlay')) return;
  const el = document.createElement('div');
  el.id = 'crt-overlay';
  document.body.appendChild(el);
}

function injectTopBar() {
  if (document.getElementById('top-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'top-bar';

  // Left: back button (hidden on home)
  const left = document.createElement('div');
  if (!IS_HOME) {
    const back = document.createElement('button');
    back.id = 'btn-back';
    back.textContent = '[← HOME]';
    back.onclick = () => { window.location.href = 'index.html'; };
    left.appendChild(back);
  }

  // Right: FX toggle + font toggle
  const right = document.createElement('div');
  right.id = 'top-bar-right';

  const btnFX = document.createElement('button');
  btnFX.className = 'top-bar-btn';
  btnFX.id = 'btn-fx';
  btnFX.textContent = '[FX]';
  btnFX.title = 'Toggle CRT effects';
  btnFX.onclick = toggleFX;

  const btnFont = document.createElement('button');
  btnFont.className = 'top-bar-btn';
  btnFont.id = 'btn-font';
  btnFont.textContent = '[Aa]';
  btnFont.title = 'Toggle readable font';
  btnFont.onclick = toggleFont;

  right.appendChild(btnFX);
  right.appendChild(btnFont);

  bar.appendChild(left);
  bar.appendChild(right);
  document.body.prepend(bar);
}

function toggleFX() {
  const overlay = document.getElementById('crt-overlay');
  const btn = document.getElementById('btn-fx');
  const isOff = overlay.classList.toggle('fx-off');
  document.body.classList.toggle('crt-chroma', !isOff);
  btn.classList.toggle('active', !isOff);
  localStorage.setItem('fxOff', isOff ? '1' : '0');
}

function toggleFont() {
  const isReadable = document.body.classList.toggle('font-readable');
  document.getElementById('btn-font').classList.toggle('active', isReadable);
  localStorage.setItem('fontReadable', isReadable ? '1' : '0');
}

function restorePrefs() {
  if (localStorage.getItem('fxOff') === '1') {
    document.getElementById('crt-overlay')?.classList.add('fx-off');
    document.getElementById('btn-fx')?.classList.remove('active');
  } else {
    document.body.classList.add('crt-chroma');
    document.getElementById('btn-fx')?.classList.add('active');
  }

  if (localStorage.getItem('fontReadable') === '1') {
    document.body.classList.add('font-readable');
    document.getElementById('btn-font')?.classList.add('active');
  }
}
