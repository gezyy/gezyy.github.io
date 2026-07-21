// js/i18n.js — Site-wide language module
// Loaded as a module from every page BEFORE admin.js.
// - Shows a language-choice modal on first visit per session.
// - Exposes window.I18N_READY (Promise) so admin.js can defer its identity modal.
// - Exposes window.I18N = { getLang, setLang, t, pickLocalized, bilingualize }.
//
// Data convention:
//   bilingual field = { zh: "...", en: "..." }
//   legacy string   = treated as both languages, fall-through to whichever filled.

// ── State ─────────────────────────────────────────
const LANG_KEY = 'siteLang';
let currentLang = sessionStorage.getItem(LANG_KEY) || null;

// Promise resolved once the user has chosen (or had a stored choice)
let resolveReady;
window.I18N_READY = new Promise(r => { resolveReady = r; });

// ── Chrome string table ──────────────────────────
const STRINGS = {
  'lang.modal.title':         { zh: '选择语言 / Choose Language', en: '选择语言 / Choose Language' },
  'lang.modal.zh':            { zh: '中文', en: '中文' },
  'lang.modal.en':            { zh: 'English', en: 'English' },

  // Identity modal (admin.js)
  'identity.title':           { zh: '你是谁？', en: 'Who are you?' },
  'identity.guest':           { zh: '游客', en: 'Guest' },
  'identity.admin':           { zh: '管理员', en: 'Admin' },
  'identity.pin.placeholder': { zh: '输入 PIN', en: 'Enter PIN' },
  'identity.pin.confirm':     { zh: '确认', en: 'Confirm' },
  'identity.pin.wrong':       { zh: 'PIN 错误，请重试', en: 'Wrong PIN — please try again' },
  'identity.pin.connection':  { zh: '连接失败，请检查网络', en: 'Connection failed, check your network' },

  // Admin toolbar (admin.js)
  'admin.edit.enter':         { zh: '编辑模式', en: 'Edit mode' },
  'admin.edit.exit':          { zh: '退出编辑', en: 'Exit edit' },
  'admin.save':               { zh: '保存更改', en: 'Save changes' },
  'admin.save.progress':      { zh: '保存中…', en: 'Saving…' },
  'admin.save.ok':            { zh: '已保存！页面将在约 1 分钟后更新。', en: 'Saved! The site will rebuild in ~1 minute.' },
  'admin.save.fail':          { zh: '保存失败: ', en: 'Save failed: ' },
  'admin.error.unknown':      { zh: '未知错误', en: 'Unknown error' },
  'admin.error.prefix':       { zh: '错误: ', en: 'Error: ' },

  // edit-mode.js status bar / toasts
  'em.pending.one':           { zh: '[{n} 项待保存]', en: '[{n} change pending]' },
  'em.pending.many':          { zh: '[{n} 项待保存]', en: '[{n} changes pending]' },
  'em.saving':                { zh: '[保存中…]', en: '[SAVING…]' },
  'em.saved':                 { zh: '[已保存 — 约 1 分钟后生效]', en: '[SAVED — site rebuilds in ~1 min]' },
  'em.fail':                  { zh: '[保存失败: {err}]', en: '[SAVE FAILED: {err}]' },
  'em.nothing':               { zh: '[没有待保存的更改]', en: '[NOTHING TO SAVE]' },
  'em.save.all':              { zh: '[全部保存]', en: '[SAVE ALL]' },
  'em.discard':               { zh: '[放弃]', en: '[DISCARD]' },
  'em.discard.confirm':       { zh: '放弃所有未保存的更改并刷新页面？', en: 'Discard all pending changes and reload?' },

  // Top bar (shared.js)
  'topbar.back.home':         { zh: '[← 主页]', en: '[← HOME]' },
  'topbar.fx':                { zh: '[FX]', en: '[FX]' },
  'topbar.font':              { zh: '[Aa]', en: '[Aa]' },
  'topbar.lang':              { zh: 'EN', en: '中' },

  // Games list page
  'games.title':              { zh: 'GAME COLLECTION', en: 'GAME COLLECTION' },
  'games.subtitle':           { zh: '// 历次构建的归档信号 //', en: '// archived transmissions from past builds //' },
  'games.empty':              { zh: '// 暂无条目 //', en: '// NO ENTRIES //' },
  'games.loadmore':           { zh: '[ 加载更多 — 剩 {n} 条 ]', en: '[ LOAD MORE — {n} LEFT ]' },
  'games.untitled':           { zh: '未命名记录', en: 'Untitled transmission' },
  'games.cover.alt':          { zh: '{title} 封面', en: '{title} cover art' },
  'games.cover.alt.empty':    { zh: '游戏封面', en: 'Game cover' },
  'games.section.essays':     { zh: '游戏设计杂谈', en: 'Game Design Notes' },
  'games.section.systems':    { zh: '游戏系统拆解', en: 'Systems Breakdown' },
  'games.section.analysis':   { zh: '产品与市场分析', en: 'Product & Market Analysis' },
  'games.section.devlogs':    { zh: '开发日志', en: 'Devlog' },

  // Game detail
  'gd.loading':               { zh: '// 加载传输信号 //', en: '// LOADING TRANSMISSION //' },
  'gd.error':                 { zh: '// 信号丢失 //', en: '// SIGNAL LOST //' },
  'gd.error.no.id':           { zh: '未指定游戏 id。请从列表页点击卡片进入。', en: 'No game id given. Open a card from the collection page.' },
  'gd.error.not.found':       { zh: '未找到 id 为 "{id}" 的游戏。', en: 'No game found for id "{id}".' },
  'gd.back.inline':           { zh: '[ ← 返回收藏 ]', en: '[ ← BACK TO COLLECTION ]' },
  'gd.back.fab':              { zh: '[ ← GAME COLLECTION ]', en: '[ ← GAME COLLECTION ]' },
  'gd.back.aria':             { zh: '返回 Game Collection', en: 'Back to Game Collection' },
  'gd.tag.genre':             { zh: '类型', en: 'GENRE' },
  'gd.tag.platform':          { zh: '平台', en: 'PLATFORM' },
  'gd.tag.duration':          { zh: '开发时长', en: 'BUILD TIME' },

  // Games editor / dialog
  'editor.add.game':          { zh: '添加游戏', en: 'ADD GAME' },
  'editor.edit.game':         { zh: '编辑游戏', en: 'EDIT GAME' },
  'editor.id':                { zh: 'ID / 短链 (URL 安全)', en: 'ID / SLUG (URL-safe)' },
  'editor.title':             { zh: '标题', en: 'TITLE' },
  'editor.blurb':             { zh: '简介（一句话）', en: 'BLURB (one short line)' },
  'editor.cover':             { zh: '封面', en: 'COVER IMAGE' },
  'editor.cover.change':      { zh: '[更换封面]', en: '[CHANGE COVER]' },
  'editor.cancel':            { zh: '[取消]', en: '[CANCEL]' },
  'editor.done':              { zh: '[完成]', en: '[DONE]' },
  'editor.lang.zh':           { zh: '中文', en: 'Chinese' },
  'editor.lang.en':           { zh: '英文', en: 'English' },
  'editor.placeholder.zh':    { zh: '中文…', en: 'Chinese…' },
  'editor.placeholder.en':    { zh: 'English…', en: 'English…' },

  // FAB / inline
  'fab.add.game':             { zh: '[ + 添加游戏 ]', en: '[ + ADD GAME ]' },
  'fab.add.book':             { zh: '[+ 添加书本]', en: '[+ ADD BOOK]' },
  'fab.add.image':            { zh: '[+ 添加图片]', en: '[+ ADD IMAGE]' },

  // Body block insert row
  'block.text.add':           { zh: '[ + 文字 ]', en: '[ + TEXT ]' },
  'block.image.add':          { zh: '[ + 图片 ]', en: '[ + IMAGE ]' },
  'block.replace.img':        { zh: '[替换图片]', en: '[replace img]' },
  'block.image.upload':       { zh: '[上传图片]', en: '[upload img]' },
  'block.delete.confirm':     { zh: '删除这个块？', en: 'Delete this block?' },
  'block.text.placeholder':   { zh: '段落文字…', en: 'Block text…' },
  'block.caption.placeholder': { zh: '图片说明…', en: 'Caption…' },

  // Video editor
  'video.upload':             { zh: '[ 上传视频 ]', en: '[ UPLOAD VIDEO ]' },
  'video.replace':            { zh: '[ 替换视频 ]', en: '[ REPLACE VIDEO ]' },
  'video.clear':              { zh: '[ 清除视频 ]', en: '[ CLEAR VIDEO ]' },
  'video.no.video':           { zh: '// 暂无视频 //', en: '// NO VIDEO YET //' },
  'video.unsupported':        { zh: '// 不支持的视频源 //', en: '// UNSUPPORTED VIDEO SOURCE //' },
  'video.youtube.placeholder': { zh: 'YouTube ID 或 URL', en: 'YouTube ID or URL' },
  'video.vimeo.placeholder':  { zh: 'Vimeo ID 或 URL', en: 'Vimeo ID or URL' },
  'video.confirm.clear':      { zh: '清除当前预览视频？', en: 'Remove the preview video?' },
  'video.confirm.size':       { zh: '该文件 {size} MB，超过 ~40 MB 时 Worker 上传可能失败。继续？', en: 'That file is {size} MB. The Worker upload may fail above ~40 MB. Continue?' },

  // Common alerts
  'alert.id.empty':           { zh: 'ID / slug 不能为空。', en: 'ID / slug cannot be empty.' },
  'alert.id.format':          { zh: 'ID 必须是小写字母、数字、连字符，例如 "my-game-slug"。', en: 'ID must be lowercase, digits and hyphens only, e.g. "my-game-slug".' },
  'alert.id.duplicate':       { zh: '已存在 id 为 "{id}" 的游戏。', en: 'A game with id "{id}" already exists.' },
  'alert.title.empty':        { zh: '标题不能为空。', en: 'Title cannot be empty.' },
  'confirm.delete.game':      { zh: '从收藏中删除 "{title}" ？', en: 'Delete "{title}" from the collection?' },
  'confirm.delete.book':      { zh: '删除 "{title}" ？', en: 'Delete "{title}"?' },
  'confirm.delete.image':     { zh: '删除 "{caption}" ？', en: 'Delete "{caption}"?' },

  // Library / Gallery / Home (where applicable)
  'book.untitled':            { zh: '未命名书本', en: 'Untitled book' },
  'gallery.untitled':         { zh: '未命名图片', en: 'Untitled image' },
  'home.title.placeholder':   { zh: 'Instantiated in a substratum', en: 'Instantiated in a substratum' },

  // Home — 3D character speech bubble editor
  'home.dialog.editor.title': { zh: '角色台词预设', en: 'CHARACTER LINES' },
  'home.dialog.editor.hint':  { zh: '单击小人时随机显示其中一条', en: 'One is picked at random when the character is clicked' },
  'home.dialog.add':          { zh: '[ + 添加台词 ]', en: '[ + ADD LINE ]' },
  'home.dialog.empty':        { zh: '// 还没有台词 //', en: '// NO LINES YET //' },
  'home.dialog.close.aria':   { zh: '关闭对话框', en: 'Close dialog' },
  'home.dialog.del.aria':     { zh: '删除这条台词', en: 'Delete this line' },
};

// ── Public API ───────────────────────────────────
export function getLang() {
  return currentLang || 'zh';
}

export function setLang(lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  if (currentLang === lang) return;
  currentLang = lang;
  sessionStorage.setItem(LANG_KEY, lang);
}

export function t(key, params = {}) {
  const entry = STRINGS[key];
  if (!entry) return key;
  const lang = getLang();
  let str = entry[lang] ?? entry.en ?? entry.zh ?? key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return str;
}

// Convert any value (string / object / nullish) to displayable text in current lang
export function pickLocalized(value, opts = {}) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  const lang = opts.lang || getLang();
  const other = lang === 'zh' ? 'en' : 'zh';
  const a = (value[lang]  || '').toString().trim();
  const b = (value[other] || '').toString().trim();
  return a || b || '';
}

// Normalize any value into a strict {zh, en} pair — used by editors
export function bilingualize(value) {
  if (value == null) return { zh: '', en: '' };
  if (typeof value === 'string') return { zh: value, en: value };
  if (typeof value === 'object') {
    return { zh: value.zh ?? '', en: value.en ?? '' };
  }
  const s = String(value);
  return { zh: s, en: s };
}

// Expose to plain-script consumers (admin.js)
window.I18N = { getLang, setLang, t, pickLocalized, bilingualize };

// ── Language modal ───────────────────────────────
function buildLanguageModal() {
  const backdrop = document.createElement('div');
  backdrop.id = 'lang-modal-backdrop';
  backdrop.innerHTML = `
    <div id="lang-modal">
      <h2>${t('lang.modal.title')}</h2>
      <div class="lang-modal-btns">
        <button type="button" id="lang-pick-zh">中文</button>
        <button type="button" id="lang-pick-en">English</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  document.getElementById('lang-pick-zh').addEventListener('click', () => pick('zh'));
  document.getElementById('lang-pick-en').addEventListener('click', () => pick('en'));

  function pick(lang) {
    setLang(lang);
    backdrop.remove();
    resolveReady();
  }
}

// ── Bootstrap ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (currentLang) {
    resolveReady();
  } else {
    buildLanguageModal();
  }
});
