// js/edit-mode.js — Edit mode framework (M5)
// ES Module. Imported by library.js, gallery.js, home.js.
// Depends on admin.js running first (sets window.ADMIN_WORKER_URL, body.edit-mode).

const workerUrl = () => window.ADMIN_WORKER_URL || '';

// ── State ────────────────────────────────────────
const pendingChanges    = new Map();   // filePath → JSON object
const pendingUploads    = [];          // [{filePath, base64}]
const pendingDeletes    = [];          // [filePath]
const editModeCallbacks = [];

let statusBar = null;

// ── Admin check ───────────────────────────────────
export function isAdmin() {
  return sessionStorage.getItem('siteIdentity') === 'admin'
      && !!sessionStorage.getItem('adminToken');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}`,
  };
}

// ── Pending state API ─────────────────────────────
export function pushChange(filePath, data) {
  pendingChanges.set(filePath, data);
  refreshStatusBar();
}

export function addPendingUpload(filePath, base64) {
  const i = pendingUploads.findIndex(u => u.filePath === filePath);
  if (i >= 0) pendingUploads[i].base64 = base64;
  else pendingUploads.push({ filePath, base64 });
}

export function addPendingDelete(filePath) {
  if (!pendingDeletes.includes(filePath)) pendingDeletes.push(filePath);
  const i = pendingUploads.findIndex(u => u.filePath === filePath);
  if (i >= 0) pendingUploads.splice(i, 1);
}

// ── Utils ─────────────────────────────────────────
export function readFileAsBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve({ base64: dataUrl.split(',')[1], dataUrl });
    };
    reader.readAsDataURL(file);
  });
}

function jsonToBase64(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
}

// ── Edit mode change notifications ────────────────
export function onEditModeChange(cb) {
  editModeCallbacks.push(cb);
}

// ── Commit ────────────────────────────────────────
async function commitAll() {
  const total = pendingDeletes.length + pendingUploads.length + pendingChanges.size;
  if (total === 0) { showToast('[NOTHING TO SAVE]', false); return; }

  setStatusLabel('[SAVING…]');
  const url = workerUrl();
  const headers = authHeaders();

  try {
    for (const fp of [...pendingDeletes]) {
      const r = await fetch(`${url}/upload`, {
        method: 'DELETE', headers,
        body: JSON.stringify({ filePath: fp }),
      });
      if (!r.ok) throw new Error(`Delete failed: ${fp}`);
    }
    pendingDeletes.length = 0;

    for (const { filePath, base64 } of [...pendingUploads]) {
      const r = await fetch(`${url}/upload`, {
        method: 'POST', headers,
        body: JSON.stringify({ filePath, data: base64 }),
      });
      if (!r.ok) throw new Error(`Upload failed: ${filePath}`);
    }
    pendingUploads.length = 0;

    for (const [fp, data] of pendingChanges) {
      const r = await fetch(`${url}/upload`, {
        method: 'POST', headers,
        body: JSON.stringify({ filePath: fp, data: jsonToBase64(data) }),
      });
      if (!r.ok) throw new Error(`Save failed: ${fp}`);
    }
    pendingChanges.clear();

    showToast('[SAVED — site rebuilds in ~1 min]', false);
    refreshStatusBar();
  } catch (e) {
    showToast(`[SAVE FAILED: ${e.message}]`, true);
    refreshStatusBar();
  }
}

// ── Status bar ────────────────────────────────────
function buildStatusBar() {
  if (statusBar) return;
  statusBar = document.createElement('div');
  statusBar.id = 'em-status-bar';
  statusBar.innerHTML = `
    <span id="em-pending-label"></span>
    <div class="em-actions">
      <button id="em-save-btn">[SAVE ALL]</button>
      <button id="em-discard-btn">[DISCARD]</button>
    </div>`;
  document.body.appendChild(statusBar);

  document.getElementById('em-save-btn').addEventListener('click', commitAll);
  document.getElementById('em-discard-btn').addEventListener('click', () => {
    if (!confirm('Discard all pending changes and reload?')) return;
    pendingChanges.clear();
    pendingUploads.length = 0;
    pendingDeletes.length = 0;
    window.location.reload();
  });
  refreshStatusBar();
}

function refreshStatusBar() {
  if (!statusBar) return;
  const total = pendingChanges.size + pendingUploads.length + pendingDeletes.length;
  const inEdit = document.body.classList.contains('edit-mode');
  statusBar.style.display = (inEdit && total > 0) ? 'flex' : 'none';
  setStatusLabel(`[${total} change${total !== 1 ? 's' : ''} pending]`);
}

function setStatusLabel(text) {
  const el = document.getElementById('em-pending-label');
  if (el) el.textContent = text;
}

// ── Toast ─────────────────────────────────────────
function showToast(msg, isError) {
  let t = document.getElementById('em-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'em-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = isError ? 'error' : '';
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 4500);
}

// ── Init ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!isAdmin()) return;
  buildStatusBar();

  // Override admin.js save button to use our commit flow
  const adminSaveBtn = document.getElementById('admin-save-btn');
  if (adminSaveBtn) adminSaveBtn.onclick = (e) => { e.preventDefault(); commitAll(); };

  // Watch body.edit-mode toggle via MutationObserver
  new MutationObserver(() => {
    const inEdit = document.body.classList.contains('edit-mode');
    refreshStatusBar();
    editModeCallbacks.forEach(cb => cb(inEdit));
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
});
