// Admin panel — shared across all pages
// Set WORKER_URL after deploying the Cloudflare Worker
const WORKER_URL = 'https://gezyy-admin.gezijun167955.workers.dev';
window.ADMIN_WORKER_URL = WORKER_URL; // exposed for edit-mode.js

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let editMode = false;
  let siteContent = null;        // loaded from content.json
  let pendingUploads = [];       // [{filePath, base64}]
  let pendingDeletes = [];       // [filePath]

  const token = () => sessionStorage.getItem('adminToken');
  const identity = () => sessionStorage.getItem('siteIdentity');

  // ── Bootstrap ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    siteContent = await loadContent();
    initPage();

    if (!identity()) {
      showIdentityModal();
    } else if (identity() === 'admin' && token()) {
      buildToolbar();
    }
  });

  // ── Content loading ────────────────────────────────────
  async function loadContent() {
    try {
      const r = await fetch('/content.json?_=' + Date.now());
      return await r.json();
    } catch {
      return null;
    }
  }

  // ── Page-specific rendering ────────────────────────────
  function initPage() {
    const page = document.body.dataset.page;
    if (page === 'index') renderNav();
    else if (page === 'library') renderLibrary();
    else if (page === 'gallery') renderGallery();
  }

  // index.html — nav links
  function renderNav() {
    if (!siteContent) return;
    const nav = document.getElementById('links');
    if (!nav) return;
    nav.innerHTML = '';
    siteContent.nav.forEach((item, i) => {
      const wrap = document.createElement('span');
      wrap.className = 'nav-link-wrap';
      wrap.dataset.idx = i;

      const a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;

      const del = document.createElement('button');
      del.className = 'nav-del-btn';
      del.textContent = '×';
      del.onclick = (e) => { e.preventDefault(); removeNav(i); };

      wrap.appendChild(a);
      wrap.appendChild(del);
      nav.appendChild(wrap);
    });

    const addBtn = document.createElement('button');
    addBtn.id = 'nav-add-btn';
    addBtn.textContent = '+ 添加页签';
    addBtn.onclick = addNav;
    nav.appendChild(addBtn);
  }

  function removeNav(idx) {
    siteContent.nav.splice(idx, 1);
    renderNav();
  }

  function addNav() {
    const label = prompt('页签名称:');
    if (!label) return;
    const href = prompt('链接 (如 newpage.html):');
    if (!href) return;
    siteContent.nav.push({ label, href });
    renderNav();
  }

  // library.html — items
  function renderLibrary() {
    if (!siteContent) return;
    const container = document.querySelector('.images-container');
    if (!container) return;
    container.innerHTML = '';

    siteContent.library.items.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'image-item';
      div.style.position = 'relative';
      div.dataset.idx = i;

      const img = document.createElement('img');
      img.src = item.image;
      img.alt = item.title;
      img.onclick = () => showLibraryText(i);

      const title = document.createElement('p');
      title.className = 'image-title';
      title.textContent = item.title;

      const overlay = document.createElement('div');
      overlay.className = 'admin-item-overlay';

      const btnEdit = makeOverlayBtn('编辑内容', () => openLibraryEditor(i));
      const btnImg = makeOverlayBtn('换封面', () => pickLibraryCover(i, img));
      const btnDel = makeOverlayBtn('删除', () => deleteLibraryItem(i), true);

      overlay.appendChild(btnEdit);
      overlay.appendChild(btnImg);
      overlay.appendChild(btnDel);

      div.appendChild(img);
      div.appendChild(title);
      div.appendChild(overlay);
      container.appendChild(div);
    });

    const addBtn = document.createElement('button');
    addBtn.id = 'library-add-btn';
    addBtn.textContent = '+ 添加作品';
    addBtn.onclick = addLibraryItem;
    container.appendChild(addBtn);

    // Re-init library text logic with new data
    if (typeof window.initLibraryText === 'function') {
      window.initLibraryText(siteContent.library.items);
    }
  }

  function showLibraryText(idx) {
    if (typeof window.showText === 'function') window.showText(idx + 1);
  }

  function deleteLibraryItem(idx) {
    if (!confirm('确认删除这个作品？')) return;
    siteContent.library.items.splice(idx, 1);
    renderLibrary();
  }

  function addLibraryItem() {
    const title = prompt('作品标题:');
    if (!title) return;
    siteContent.library.items.push({ title, image: 'resources/library-image1.jpg', pages: [''] });
    renderLibrary();
    openLibraryEditor(siteContent.library.items.length - 1);
  }

  function pickLibraryCover(idx, imgEl) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const { base64, dataUrl } = await readFileAsBase64(file);
      const filePath = 'resources/' + file.name;
      siteContent.library.items[idx].image = filePath;
      imgEl.src = dataUrl;
      pendingUploads.push({ filePath, base64 });
    };
    input.click();
  }

  // gallery.html — images
  function renderGallery() {
    if (!siteContent) return;
    const container = document.getElementById('gallery-container');
    if (!container) return;
    // Keep existing items or rebuild
    container.innerHTML = '';

    siteContent.gallery.images.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'image-container';
      div.style.position = 'relative';

      const img = document.createElement('img');
      img.src = item.src;
      img.alt = item.title;
      img.onclick = () => { if (typeof showImage === 'function') showImage(img); };

      const title = document.createElement('p');
      title.className = 'image-title';
      title.textContent = item.title;

      const overlay = document.createElement('div');
      overlay.className = 'admin-item-overlay';
      const btnRename = makeOverlayBtn('重命名', () => renameGalleryItem(i, title));
      const btnDel = makeOverlayBtn('删除', () => deleteGalleryItem(i), true);
      overlay.appendChild(btnRename);
      overlay.appendChild(btnDel);

      div.appendChild(img);
      div.appendChild(title);
      div.appendChild(overlay);
      container.appendChild(div);
    });

    // Upload zone
    let zone = document.getElementById('gallery-upload-zone');
    if (!zone) {
      zone = document.createElement('div');
      zone.id = 'gallery-upload-zone';
      zone.textContent = '+ 点击上传图片';
      zone.onclick = pickGalleryImage;
      container.appendChild(zone);
    }

    const goBack = document.getElementById('go-back');
    if (goBack) container.insertAdjacentElement('afterend', zone);
  }

  function renameGalleryItem(idx, titleEl) {
    const newName = prompt('新标题:', siteContent.gallery.images[idx].title);
    if (newName === null) return;
    siteContent.gallery.images[idx].title = newName;
    titleEl.textContent = newName;
  }

  function deleteGalleryItem(idx) {
    if (!confirm('确认删除这张图片？')) return;
    const item = siteContent.gallery.images[idx];
    pendingDeletes.push(item.src);
    siteContent.gallery.images.splice(idx, 1);
    renderGallery();
  }

  function pickGalleryImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async () => {
      for (const file of Array.from(input.files)) {
        const { base64 } = await readFileAsBase64(file);
        const filePath = 'resources/' + file.name;
        const title = file.name.replace(/\.[^.]+$/, '');
        siteContent.gallery.images.push({ src: filePath, title });
        pendingUploads.push({ filePath, base64 });
      }
      renderGallery();
    };
    input.click();
  }

  // ── Library text editor modal ──────────────────────────
  let editingLibIdx = null;

  function openLibraryEditor(idx) {
    editingLibIdx = idx;
    const item = siteContent.library.items[idx];

    let backdrop = document.getElementById('lib-editor-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'lib-editor-backdrop';
      backdrop.innerHTML = `
        <div id="lib-editor">
          <h3>编辑作品内容</h3>
          <input id="lib-editor-title" type="text" placeholder="标题">
          <div id="lib-editor-pages"></div>
          <button id="lib-editor-add-page">+ 添加页面</button>
          <div class="lib-editor-footer">
            <button id="lib-editor-cancel">取消</button>
            <button id="lib-editor-ok" class="primary">完成</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);
      document.getElementById('lib-editor-cancel').onclick = closeLibraryEditor;
      document.getElementById('lib-editor-ok').onclick = saveLibraryEditor;
      document.getElementById('lib-editor-add-page').onclick = addLibraryPage;
    }

    document.getElementById('lib-editor-title').value = item.title;
    renderLibEditorPages(item.pages);
    backdrop.classList.add('open');
  }

  function renderLibEditorPages(pages) {
    const container = document.getElementById('lib-editor-pages');
    container.innerHTML = '';
    pages.forEach((text, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'lib-page-entry';
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.dataset.pageIdx = i;
      const del = document.createElement('button');
      del.className = 'lib-page-del';
      del.textContent = '×';
      del.onclick = () => {
        pages.splice(i, 1);
        renderLibEditorPages(pages);
      };
      wrap.appendChild(ta);
      wrap.appendChild(del);
      container.appendChild(wrap);
    });
  }

  function addLibraryPage() {
    const item = siteContent.library.items[editingLibIdx];
    item.pages.push('');
    renderLibEditorPages(item.pages);
  }

  function saveLibraryEditor() {
    const item = siteContent.library.items[editingLibIdx];
    item.title = document.getElementById('lib-editor-title').value;
    const tas = document.querySelectorAll('#lib-editor-pages textarea');
    item.pages = Array.from(tas).map(ta => ta.value);
    closeLibraryEditor();
    renderLibrary();
  }

  function closeLibraryEditor() {
    const backdrop = document.getElementById('lib-editor-backdrop');
    if (backdrop) backdrop.classList.remove('open');
  }

  // ── Auth / Modal ────────────────────────────────────────
  function showIdentityModal() {
    const backdrop = document.createElement('div');
    backdrop.id = 'admin-modal-backdrop';
    backdrop.innerHTML = `
      <div id="admin-modal">
        <h2>你是谁？</h2>
        <div class="admin-modal-btns">
          <button id="btn-guest">游客</button>
          <button id="btn-admin">管理员</button>
        </div>
        <div id="admin-pin-form">
          <input type="password" id="admin-pin-input" placeholder="输入 PIN" autocomplete="off">
          <button id="btn-pin-submit">确认</button>
          <div id="admin-pin-error">PIN 错误，请重试</div>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    document.getElementById('btn-guest').onclick = () => {
      sessionStorage.setItem('siteIdentity', 'guest');
      backdrop.remove();
    };

    document.getElementById('btn-admin').onclick = () => {
      document.getElementById('admin-pin-form').style.display = 'block';
      document.getElementById('admin-pin-input').focus();
    };

    document.getElementById('btn-pin-submit').onclick = submitPin;
    document.getElementById('admin-pin-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') submitPin();
    });
  }

  async function submitPin() {
    const pin = document.getElementById('admin-pin-input').value;
    const errEl = document.getElementById('admin-pin-error');
    errEl.style.display = 'none';

    try {
      const resp = await fetch(`${WORKER_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await resp.json();
      if (data.token) {
        sessionStorage.setItem('adminToken', data.token);
        sessionStorage.setItem('siteIdentity', 'admin');
        document.getElementById('admin-modal-backdrop').remove();
        buildToolbar();
      } else {
        errEl.style.display = 'block';
        document.getElementById('admin-pin-input').value = '';
      }
    } catch {
      errEl.textContent = '连接失败，请检查网络';
      errEl.style.display = 'block';
    }
  }

  // ── Toolbar ─────────────────────────────────────────────
  function buildToolbar() {
    if (document.getElementById('admin-toolbar')) return;
    const bar = document.createElement('div');
    bar.id = 'admin-toolbar';
    bar.innerHTML = `
      <div id="admin-save-status"></div>
      <button id="admin-save-btn">保存更改</button>
      <button id="admin-edit-toggle">编辑模式</button>`;
    document.body.appendChild(bar);

    document.getElementById('admin-edit-toggle').onclick = toggleEditMode;
    document.getElementById('admin-save-btn').onclick = (e) => {
      e.preventDefault();
      (window.__emCommit || saveAll)();
    };
  }

  function toggleEditMode() {
    editMode = !editMode;
    document.body.classList.toggle('edit-mode', editMode);
    const toggle = document.getElementById('admin-edit-toggle');
    const saveBtn = document.getElementById('admin-save-btn');
    toggle.classList.toggle('active', editMode);
    toggle.textContent = editMode ? '退出编辑' : '编辑模式';
    saveBtn.style.display = editMode ? 'block' : 'none';
  }

  // ── Save all ────────────────────────────────────────────
  async function saveAll() {
    const status = document.getElementById('admin-save-status');
    status.style.display = 'block';
    status.textContent = '保存中…';

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token()}`,
    };

    try {
      // Upload new images
      for (const { filePath, base64 } of pendingUploads) {
        await fetch(`${WORKER_URL}/upload`, {
          method: 'POST', headers,
          body: JSON.stringify({ filePath, data: base64 }),
        });
      }
      pendingUploads = [];

      // Delete removed images
      for (const filePath of pendingDeletes) {
        await fetch(`${WORKER_URL}/upload`, {
          method: 'DELETE', headers,
          body: JSON.stringify({ filePath }),
        });
      }
      pendingDeletes = [];

      // Update content.json
      const resp = await fetch(`${WORKER_URL}/content`, {
        method: 'PUT', headers,
        body: JSON.stringify({ content: siteContent }),
      });
      const result = await resp.json();

      if (result.ok) {
        status.textContent = '已保存！页面将在约 1 分钟后更新。';
        setTimeout(() => { status.style.display = 'none'; }, 5000);
      } else {
        status.textContent = '保存失败: ' + (result.error || '未知错误');
      }
    } catch (e) {
      status.textContent = '错误: ' + e.message;
    }
  }

  // ── Utilities ────────────────────────────────────────────
  function makeOverlayBtn(label, handler, danger = false) {
    const btn = document.createElement('button');
    btn.className = 'admin-overlay-btn' + (danger ? ' danger' : '');
    btn.textContent = label;
    btn.onclick = (e) => { e.stopPropagation(); handler(); };
    return btn;
  }

  function readFileAsBase64(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, dataUrl });
      };
      reader.readAsDataURL(file);
    });
  }
})();
