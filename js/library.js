// js/library.js — CSS 3D bookshelf renderer (M3) + edit mode (M5)
import {
  isAdmin, pushChange, addPendingUpload,
  readFileAsBase64, onEditModeChange,
} from './edit-mode.js';

const DIAG_START = { x: 0.12, y: 0.82 };
const DIAG_END   = { x: 0.72, y: 0.14 };
const LIB_FILE   = 'content/library.json';

let books = [];
let stage = null;

// Modal state (reading)
let activeBook    = null;
let activePageIdx = 0;

// Editor state
let editorBook  = null;  // working copy being edited
let editorIdx   = -1;    // index in books[] (-1 = new)

// ── Load ──────────────────────────────────────────
async function loadBooks() {
  try {
    const r = await fetch(`/${LIB_FILE}?_=${Date.now()}`);
    const data = await r.json();
    return [...data.books].sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

// ── Cover pixelization ────────────────────────────
function pixelizeCover(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 48; canvas.height = 72;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, 48, 72);
        resolve(canvas.toDataURL('image/png'));
      } catch { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

// ── Build one book element ────────────────────────
function buildBook(book) {
  const el = document.createElement('div');
  el.className = 'book-3d';
  el.dataset.bookId = book.id;

  const cover = document.createElement('div');
  cover.className = 'book-face cover';
  const coverTitle = document.createElement('div');
  coverTitle.className = 'cover-title';
  coverTitle.textContent = book.title;
  cover.appendChild(coverTitle);
  el.appendChild(cover);

  if (book.cover) {
    pixelizeCover(book.cover).then(url => {
      cover.style.backgroundImage = `url('${url}')`;
    });
  }

  const back = document.createElement('div');
  back.className = 'book-face back';
  el.appendChild(back);

  const spine = document.createElement('div');
  spine.className = 'book-face spine';
  const spineLabel = document.createElement('span');
  spineLabel.className = 'spine-label';
  spineLabel.textContent = book.title;
  spine.appendChild(spineLabel);
  el.appendChild(spine);

  const sideR = document.createElement('div');
  sideR.className = 'book-face side-r';
  el.appendChild(sideR);

  const top = document.createElement('div');
  top.className = 'book-face top';
  el.appendChild(top);

  const btm = document.createElement('div');
  btm.className = 'book-face btm';
  el.appendChild(btm);

  el.addEventListener('click', () => {
    if (!document.body.classList.contains('edit-mode')) openModal(book);
  });

  return el;
}

// ── Build edit control strip ──────────────────────
function buildBookEditCtrl(book, idx) {
  const ctrl = document.createElement('div');
  ctrl.className = 'book-edit-ctrl';

  const mkBtn = (label, handler, isDanger = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (isDanger) b.className = 'danger';
    b.addEventListener('click', e => { e.stopPropagation(); handler(); });
    ctrl.appendChild(b);
  };

  mkBtn('[edit]', () => openBookEditor(idx));
  mkBtn('[↑]', () => reorderBook(idx, -1));
  mkBtn('[↓]', () => reorderBook(idx, +1));
  mkBtn('[del]', () => deleteBook(idx), true);

  return ctrl;
}

// ── Position books along diagonal ────────────────
function renderBooks() {
  if (!stage) return;
  stage.innerHTML = '';

  const W = window.innerWidth;
  const H = window.innerHeight - 48;
  const N = books.length;
  const admin = isAdmin();

  books.forEach((book, i) => {
    const t  = N > 1 ? i / (N - 1) : 0.5;
    const cx = DIAG_START.x + t * (DIAG_END.x - DIAG_START.x);
    const cy = DIAG_START.y + t * (DIAG_END.y - DIAG_START.y);
    const px = cx * W;
    const py = cy * H;

    const el = buildBook(book);
    el.style.left   = `${px - 45}px`;
    el.style.top    = `${py - 70}px`;
    el.style.zIndex = N - i;
    stage.appendChild(el);

    if (admin) {
      const ctrl = buildBookEditCtrl(book, i);
      ctrl.style.left   = `${px - 45}px`;
      ctrl.style.top    = `${py + 75}px`;
      ctrl.style.zIndex = N - i + 200;
      stage.appendChild(ctrl);
    }
  });
}

// ── Reading modal ─────────────────────────────────
function openModal(book) {
  activeBook    = book;
  activePageIdx = 0;
  syncModal();
  document.getElementById('book-modal-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('book-modal-backdrop').classList.remove('open');
  document.body.style.overflow = '';
  activeBook = null;
}

function syncModal() {
  if (!activeBook) return;
  const pages = activeBook.pages || [];
  const page  = pages[activePageIdx] || { left: '', right: '' };
  document.getElementById('book-page-left').textContent  = page.left  || '';
  document.getElementById('book-page-right').textContent = page.right || '';
  document.getElementById('book-page-indicator').textContent =
    `${activePageIdx + 1} / ${pages.length}`;
  document.getElementById('modal-prev').disabled = activePageIdx === 0;
  document.getElementById('modal-next').disabled = activePageIdx >= pages.length - 1;
}

function prevPage() {
  if (activePageIdx > 0) { activePageIdx--; syncModal(); }
}

function nextPage() {
  if (!activeBook) return;
  if (activePageIdx < (activeBook.pages || []).length - 1) { activePageIdx++; syncModal(); }
}

function buildModal() {
  const backdrop = document.createElement('div');
  backdrop.id = 'book-modal-backdrop';
  backdrop.innerHTML = `
    <div id="book-modal">
      <div id="book-open">
        <div class="book-page" id="book-page-left"></div>
        <div id="book-spine-center"></div>
        <div class="book-page" id="book-page-right"></div>
      </div>
      <div id="book-modal-footer">
        <button class="modal-nav-btn" id="modal-prev">[← PREV]</button>
        <span id="book-page-indicator">1 / 1</span>
        <button class="modal-nav-btn" id="modal-next">[NEXT →]</button>
        <button class="modal-nav-btn" id="book-modal-close">[× CLOSE]</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  document.getElementById('book-modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-prev').addEventListener('click', prevPage);
  document.getElementById('modal-next').addEventListener('click', nextPage);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', e => {
    if (!activeBook) return;
    if (e.key === 'Escape')      closeModal();
    if (e.key === 'ArrowLeft')   prevPage();
    if (e.key === 'ArrowRight')  nextPage();
  });
}

// ── Edit: reorder ─────────────────────────────────
function reorderBook(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= books.length) return;
  // Swap order values
  const tmp = books[idx].order;
  books[idx].order = books[target].order;
  books[target].order = tmp;
  books.sort((a, b) => a.order - b.order);
  renderBooks();
  syncPending();
}

// ── Edit: delete ──────────────────────────────────
function deleteBook(idx) {
  if (!confirm(`Delete "${books[idx].title}"?`)) return;
  books.splice(idx, 1);
  books.forEach((b, i) => { b.order = i; });
  renderBooks();
  syncPending();
}

// ── Edit: book editor modal ───────────────────────
function buildBookEditor() {
  if (document.getElementById('book-editor-backdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.id = 'book-editor-backdrop';
  backdrop.innerHTML = `
    <div id="book-editor">
      <h3 id="be-title-heading">EDIT BOOK</h3>
      <label>TITLE</label>
      <input type="text" id="be-title-input" placeholder="Book title">
      <label>COVER IMAGE</label>
      <div class="be-cover-row">
        <img class="be-cover-preview" id="be-cover-preview" src="" alt="">
        <button id="be-cover-btn">[CHANGE COVER]</button>
      </div>
      <label>PAGES (left / right)</label>
      <div id="be-pages"></div>
      <button id="be-add-page">[+ ADD PAGE]</button>
      <div class="be-footer">
        <button id="be-cancel">[CANCEL]</button>
        <button class="primary" id="be-done">[DONE]</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  document.getElementById('be-cancel').addEventListener('click', closeBookEditor);
  document.getElementById('be-done').addEventListener('click', saveBookEditor);
  document.getElementById('be-add-page').addEventListener('click', () => {
    editorBook.pages.push({ left: '', right: '' });
    renderEditorPages();
  });
  document.getElementById('be-cover-btn').addEventListener('click', pickEditorCover);
}

function openBookEditor(idx) {
  editorIdx  = idx;
  // Deep-clone so cancelling doesn't corrupt live data
  editorBook = JSON.parse(JSON.stringify(idx === -1 ? {
    id: 'book-' + Date.now(),
    cover: '',
    title: '',
    pages: [{ left: '', right: '' }],
    order: books.length,
  } : books[idx]));

  document.getElementById('be-title-heading').textContent =
    idx === -1 ? 'ADD BOOK' : 'EDIT BOOK';
  document.getElementById('be-title-input').value = editorBook.title;
  const prev = document.getElementById('be-cover-preview');
  prev.src = editorBook.cover || '';
  prev.style.display = editorBook.cover ? 'block' : 'none';

  renderEditorPages();
  document.getElementById('book-editor-backdrop').classList.add('open');
}

function renderEditorPages() {
  const container = document.getElementById('be-pages');
  container.innerHTML = '';
  (editorBook.pages || []).forEach((page, i) => {
    const row = document.createElement('div');
    row.className = 'be-page-row';

    const taLeft = document.createElement('textarea');
    taLeft.placeholder = 'Left page…';
    taLeft.value = page.left || '';
    taLeft.addEventListener('input', () => { editorBook.pages[i].left = taLeft.value; });

    const taRight = document.createElement('textarea');
    taRight.placeholder = 'Right page…';
    taRight.value = page.right || '';
    taRight.addEventListener('input', () => { editorBook.pages[i].right = taRight.value; });

    const delBtn = document.createElement('button');
    delBtn.className = 'be-del-page';
    delBtn.textContent = '[×]';
    delBtn.addEventListener('click', () => {
      editorBook.pages.splice(i, 1);
      renderEditorPages();
    });

    row.appendChild(taLeft);
    row.appendChild(taRight);
    row.appendChild(delBtn);
    container.appendChild(row);
  });
}

async function pickEditorCover() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const { base64, dataUrl } = await readFileAsBase64(file);
    const filePath = `assets/images/library/${file.name}`;
    editorBook.cover = filePath;
    addPendingUpload(filePath, base64);
    const prev = document.getElementById('be-cover-preview');
    prev.src = dataUrl;
    prev.style.display = 'block';
  };
  input.click();
}

function saveBookEditor() {
  editorBook.title = document.getElementById('be-title-input').value.trim();
  if (!editorBook.title) { alert('Title cannot be empty.'); return; }

  if (editorIdx === -1) {
    books.push(editorBook);
  } else {
    books[editorIdx] = editorBook;
  }
  books.sort((a, b) => a.order - b.order);
  closeBookEditor();
  renderBooks();
  syncPending();
}

function closeBookEditor() {
  document.getElementById('book-editor-backdrop').classList.remove('open');
}

// ── Add book button ───────────────────────────────
function buildAddBookBtn() {
  if (document.getElementById('lib-add-book-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'lib-add-book-btn';
  btn.textContent = '[+ ADD BOOK]';
  btn.addEventListener('click', () => openBookEditor(-1));
  document.body.appendChild(btn);
}

// ── Sync pending changes ──────────────────────────
function syncPending() {
  pushChange(LIB_FILE, { books });
}

// ── Init ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  stage = document.getElementById('library-stage');
  if (!stage) return;

  buildModal();

  if (isAdmin()) {
    buildBookEditor();
    buildAddBookBtn();
  }

  books = await loadBooks();
  renderBooks();

  window.addEventListener('resize', renderBooks);

  onEditModeChange(() => renderBooks());
});
