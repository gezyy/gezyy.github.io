# Gezyy 网站开发规格 (SPEC)

> 本文档供 Claude Code 阅读并据此进行开发。请严格遵循"技术约束"与"开发顺序"两节。如有歧义，停下来向用户确认，不要擅自发挥。

---

## 1. 项目概述

一个个人创作展示型静态网站。当前阶段包含 4 个页面：

- **Home**（主界面 / `index.html`）
- **Library**（书本陈列 / `library.html`）
- **Gallery**（图片环绕 / `gallery.html`）
- **Game Collection**（游戏收藏 / `games.html`） — 本阶段**仅占位**，不实现内容

整体视觉风格关键词：
- **Low-poly 几何体**（低多边形 / 棱角分明）
- **轻度 horror**（不血腥，靠氛围：暗、噪点、闪烁、扫描线）
- **低保真夜视仪 / DV 影像感**（绿色调可选、扫描线、CRT 弯曲、雪花）
- **90s 复古**（像素化、CRT、低饱和、磁带噪点）

最终观感：像一台坏掉的旧 DV 机录下来的展览。

---

## 2. 技术栈与约束（重要：不要偏离）

### 2.1 必须遵守

- **纯静态站**：HTML + CSS + 原生 JS（ES Modules）。**不使用** React/Vue/Svelte/任何构建工具。
- **3D 效果一律用 CSS 3D Transforms**（`perspective` / `transform: rotateX/Y/Z` / `translateZ`）。**禁止引入 Three.js、Babylon.js 等任何 WebGL 库**。
- **每个页面一个独立 HTML 文件**，共享 `css/` 和 `js/` 目录下的资源。不做 SPA。
- **现有项目结构必须保留**。本项目是在已有的 admin 编辑模式项目上扩展，已存在 `admin.js`（含 `WORKER_URL` 常量与 PIN 登录逻辑），新代码必须复用现有的编辑模式后端，不要重写。
- **编辑模式后端**复用现有 Cloudflare Worker：浏览器通过 fetch 请求 Worker，Worker 用 GitHub Token 把改动 commit 到仓库。任何"保存"操作必须走这个链路。

### 2.2 兼容性目标

- **桌面端为主**（Chrome/Edge/Firefox/Safari 最新版）。
- **移动端可看不可玩**：布局不破，能浏览内容即可；复杂交互（书本悬停抽出、画廊拖拽惯性）可降级为静态展示或简化版。
- 视口宽度 < 768px 进入"移动简化模式"。

### 2.3 文件结构（在已有项目上**追加**，不要删除现有文件）

```
项目根/
├── index.html              [改造] 主界面
├── library.html            [新增]
├── gallery.html            [新增]
├── games.html              [新增] 仅占位
├── admin.js                [保留，已存在] 复用其 PIN/Worker 逻辑
├── css/
│   ├── shared.css          [新增] 设计 tokens、视觉滤镜、字体、共用组件
│   ├── home.css            [新增]
│   ├── library.css         [新增]
│   ├── gallery.css         [新增]
│   └── games.css           [新增]
├── js/
│   ├── shared.js           [新增] 顶栏返回、字体切换、CRT 滤镜挂载
│   ├── edit-mode.js        [新增] 编辑模式 UI 框架（基于 admin.js 提供的能力）
│   ├── home.js             [新增] 掉落几何体逻辑
│   ├── library.js          [新增]
│   └── gallery.js          [新增]
├── content/                [新增] 所有可编辑内容
│   ├── library.json        书本数据
│   └── gallery.json        画廊数据
├── assets/
│   ├── images/             用户上传的图片放这里
│   └── fonts/              字体文件
└── worker/                 [已存在] 不动
```

### 2.4 内容数据流

1. 页面加载时 `fetch('/content/xxx.json')` 读取数据并渲染。
2. 编辑模式下，用户修改通过 `js/edit-mode.js` 暂存到内存。
3. 用户点"保存更改"→ 调用 Worker API → Worker commit 到 GitHub → GitHub Pages 自动重建 → ~1 分钟后生效。
4. 图片上传：编辑模式下用户选择本地图片 → base64 编码 → 一并随 JSON 提交 → Worker 在 GitHub 上创建 `assets/images/xxx.png` 并在 JSON 里写入相对路径。

> **Claude Code 注意**：如果现有 `admin.js` 暴露的接口与上述假设不一致，**先读 `admin.js` 和 `worker/` 下的代码搞清楚实际接口，再决定 `edit-mode.js` 怎么写**。不要假设。

---

## 3. 共享视觉系统（`css/shared.css`）

所有页面共用一套视觉 token，定义为 CSS 变量。具体数值可在合理范围内微调，但变量名必须固定。

### 3.1 设计 Tokens

```css
:root {
  /* 色板 —— 暗调 + 一抹荧光绿 */
  --bg-deep:       #0a0d0a;   /* 主背景 近黑带一点绿 */
  --bg-elev:       #141914;   /* 次级面板 */
  --ink:           #c8d4c4;   /* 主文字 灰绿白 */
  --ink-dim:       #6b7a68;   /* 次级文字 */
  --accent:        #7cff5e;   /* 夜视绿 */
  --accent-dim:    #3a7a2e;
  --danger:        #ff4a3d;   /* 仅用于编辑模式删除按钮等危险操作 */
  --glow:          rgba(124, 255, 94, 0.4);

  /* 字体 —— 通过 --font-body 一键切换 */
  --font-display:  'VT323', 'Courier New', monospace;   /* 特效字体 */
  --font-readable: 'Inter', -apple-system, sans-serif;  /* 可读模式 */
  --font-body:     var(--font-display);                 /* 当前生效字体 切换时改这个 */

  /* 几何 */
  --radius-sharp:  0;        /* 主基调：直角，no border-radius */
  --shadow-glow:   0 0 12px var(--glow);

  /* 动画 */
  --ease-out:      cubic-bezier(0.16, 1, 0.3, 1);
}

body.font-readable {
  --font-body: var(--font-readable);
}
```

### 3.2 全局视觉滤镜层

每个页面的 `<body>` 内最外层加一个 `<div id="crt-overlay">`，通过 `shared.js` 注入，包含：

- **扫描线**：CSS 重复线性渐变 `repeating-linear-gradient(...)`，2px 一行，半透明黑。`pointer-events: none`，盖在最上层。
- **噪点/雪花**：一张 256×256 的 SVG 噪点图，`background-repeat`，`mix-blend-mode: overlay`，5% 透明度，可选用 `animation` 让它每 0.2 秒位移制造闪烁。
- **角落暗角 (vignette)**：径向渐变，中心透明边缘黑。
- **轻微色差 (chromatic aberration)**：通过 `filter: drop-shadow(1px 0 0 red) drop-shadow(-1px 0 0 cyan)` 或两层叠加做。在性能不佳时通过 `prefers-reduced-motion` 关闭。

整个滤镜层支持**全局开关**，挂在 `shared.js` 的右上角小按钮上（标识 "FX"），方便用户在卡顿或想看清内容时关闭。

### 3.3 共用 UI 组件

- **顶栏 / 返回按钮**：除 `index.html` 外，每个子页面左上角一个 `[← HOME]` 按钮，跳回 `index.html`。Low-poly 风格——用 `clip-path` 切出多边形外框（如六边形/平行四边形），不用圆角。
- **字体切换按钮**：右上角小按钮 `[Aa]`，点击切换 `body` 上的 `.font-readable` 类，状态存 `localStorage`。
- **编辑模式入口**：复用现有 `admin.js` 的逻辑——管理员登录后右下角浮出 `[EDIT]` 按钮，点击进入编辑模式，所有页面都要挂载它。

### 3.4 Low-poly 装饰元素

提供一个 CSS 类 `.lowpoly-frame`，给容器加几何感外框：
- 使用 `clip-path: polygon(...)` 做出切角矩形（左上+右下被斜切）。
- 1px 实线边框，颜色 `--accent-dim`。
- 内部 `box-shadow` 做内发光。

---

## 4. 页面规格

### 4.1 Home（`index.html` / `home.css` / `home.js`）

#### 视觉
- 黑色（`--bg-deep`）背景，全屏。
- 屏幕中央偏上是网站标题（大号 display 字体，应用 CRT 滤镜效果会自动叠加）。
- 标题下方是 3 个导航入口：`LIBRARY` / `GALLERY` / `GAME COLLECTION`，每个用 `.lowpoly-frame` 包裹，横向排列。
- **屏幕下半部分**是"掉落几何体物理沙池"区域（见下方交互）。

#### 交互：掉落几何体
- 持续地从屏幕顶部边缘随机 X 位置生成低多边形 2D 形状（三角形、菱形、六边形、不规则四边形），用 `clip-path` 切出来，**纯 CSS 形状不是 3D 几何**——避免性能问题。
- 这些形状以变化的速度向下飘落（CSS animation + JS 控制初速度）。
- 落到屏幕底部"地面线"（约屏幕高度 70% 处一条不可见水平线）后**堆叠**：
  - 简化物理：用一个轻量 2D 物理近似（不引入物理引擎），维护一个数组记录已落下形状的位置和包围盒，新形状落下时检测与已有形状的碰撞，碰到就停在那一帧的位置并标记为"已停"。
  - 堆叠上限 30 个，超过后最早的形状渐隐消失。
- **鼠标交互**：鼠标在画面下半部分移动时，距离鼠标 80px 内的已停形状被推开（朝远离鼠标的方向位移 + 一点旋转），松开鼠标后形状缓慢恢复到原位（带阻尼）。
- 形状颜色：80% 用 `--ink-dim`，20% 用 `--accent`（点缀），描边 1px `--accent-dim`。
- **性能考量**：使用 `requestAnimationFrame`，所有形状用一个父 `<div>` 包裹，`will-change: transform`。如果 FPS < 30 自动减少新生成频率。

#### 编辑模式
- 主界面**仅允许编辑标题文字**（双击标题可编辑）。
- 不允许编辑导航按钮的目标，固定指向三个子页面。

---

### 4.2 Library（`library.html` / `library.css` / `library.js`）

#### 数据结构（`content/library.json`）

```json
{
  "books": [
    {
      "id": "book-001",
      "cover": "assets/images/library/cover-001.png",
      "title": "Book Title Here",
      "leftPage": "Markdown or plain text for left page...",
      "rightPage": "Markdown or plain text for right page...",
      "order": 0
    }
  ]
}
```

#### 视觉
- 暗背景。
- 一排书本沿**屏幕左下角到右上角的对角线**排列，使用 CSS Grid 或 `position: absolute` + 计算坐标。书本之间有重叠，前面的书本盖住后面书本的一部分书脊。
- 书本是**CSS 3D Transform 做出的伪 3D 立方体**：每本书是一个 `<div>` 容器，内含 6 个面（front=封面/back/spine 书脊×2/top/bottom），用 `transform: translateZ/rotateY` 拼成长方体。封面是用户上传的图片，经过像素化处理。
  - **像素化处理**：CSS `image-rendering: pixelated;`，并在 JS 中先将图片绘制到一个小尺寸 `<canvas>`（如 64×96）再放大，达到强制降采样的效果。
- 默认书本统一朝向：书脊向左，封面朝向相机，整本书略微逆时针倾斜（`rotateY(-15deg)`）放在斜线上，营造立体陈列感。
- 一个全局 `perspective: 1200px` 应用在 `<body>` 或容器上。

#### 交互：悬停
- 鼠标悬停某本书：
  - 该书 `transform` 平滑过渡到：`translateY(-20px) translateZ(40px) rotateY(-25deg) rotateZ(8deg)`（向斜上方"抽出"并轻微倾斜）。
  - 周围出现 `box-shadow: 0 0 30px var(--glow)` 微微发光。
  - 过渡 `transition: transform 0.4s var(--ease-out), box-shadow 0.4s ease`。
- 鼠标移开：回到默认 transform。

#### 交互：点击
- 点击书本 → 弹出**居中模态窗口**，大小约屏幕宽 50% × 高 60%。
- 模态窗口视觉：一本翻开的书，左右两页。背景半透明黑覆盖整个屏幕（`backdrop-filter: blur(8px)`）。
- 左页显示 `leftPage` 内容，右页显示 `rightPage` 内容，应用 `--font-body` 字体（受全局字体切换影响）。
- 右上角 `[×]` 关闭按钮，或点击外部黑色区域关闭。
- 打开/关闭动画：scale + fade。

#### 编辑模式
进入编辑模式后，Library 页面增加以下能力：
- 每本书右上角浮出小按钮：`[edit]` / `[delete]` / `[↑]` / `[↓]`（调整 order）。
- 页面右下角浮出 `[+ Add Book]` 按钮，新增书本时：
  - 弹出新增表单：上传封面图片、填写标题、左页、右页。
- 点击 `[edit]`：以表单形式编辑该书的所有字段，含替换封面图片。
- 所有改动暂存内存，顶部出现"未保存改动"提示和 `[Save All]` 按钮。
- 点击 `[Save All]` → 调用 `edit-mode.js` 中的统一保存接口 → 走 Worker 提交 → 显示进度与成功/失败提示。

---

### 4.3 Gallery（`gallery.html` / `gallery.css` / `gallery.js`）

#### 数据结构（`content/gallery.json`）

```json
{
  "items": [
    {
      "id": "img-001",
      "src": "assets/images/gallery/001.jpg",
      "caption": "Title or description text",
      "order": 0
    }
  ]
}
```

#### 视觉
- 极暗背景 (`--bg-deep`)，加 **荧光尘粒效果**：JS 生成 50-80 个小光点 `<div>`，每个 1-2px，颜色 `--accent`，随机位置，慢速漂浮（`@keyframes` 上下浮动 + opacity 闪烁），`pointer-events: none`。
- **视觉视角**：俯视角约 45°。整体容器应用 `perspective: 1500px` 和 `transform: rotateX(45deg)`。
- **图片库**是一个**水平环形排列**：N 张图片均匀分布在一个虚拟圆周上（圆周半径约 600px），每张图片用 `transform: rotateY(angle) translateZ(600px)` 推到圆周上的对应位置。
- 整个环挂在一个 `<div class="carousel">` 上，旋转环就是改这个 div 的 `rotateY`。
- **环的中心位置预留一个 3D low-poly 模型**：用纯 CSS 3D 拼出一个简单几何体（推荐八面体：8 个三角形 face，用 `clip-path` 切三角形 div 然后 3D 摆位）。给它一个持续的 `@keyframes` 自旋（rotateY + rotateX 联动）。
- **图片视觉层次**：
  - 离屏幕中心最近的图片：尺寸最大（缩放 1.2），完全清晰。
  - 越往两边（环周上远离前方的位置）：尺寸缩小（CSS 3D 透视自动产生）、**叠加越来越深的暗色蒙版**（用一个伪元素 `::after` 加 `background: rgba(0,0,0,X)`，X 根据 `rotateY` 的绝对值动态计算，从 0 到 0.85）。
  - 背面的图片可隐藏（`backface-visibility: hidden`）。

#### 交互：拖拽 + 惯性
- 鼠标按下 + 拖动：实时改变 carousel 的 `rotateY`，跟随鼠标 X 位移。
- 鼠标松开：保留松开时的"角速度"，进入惯性滑行，每帧角速度乘以 0.95（阻尼），直到角速度 < 0.05 deg/frame 时停止。
- 停止后**自动吸附**：找到当前最接近正前方（rotateY ≈ 0 mod 360）的那张图片对应的角度，用 `transition` 平滑过渡到该角度。
- 触摸事件同样支持（pointerevents API，统一处理鼠标和触屏）。

#### 交互：点击图片
- 仅当**该图片处于正前方**时（角度差在 ±15° 内），点击才生效。否则点击会平滑转动到该图片到正前方位置（不打开弹窗）。
- 弹窗：屏幕中心 50% × 60% 大小，显示大图 + 下方 `caption` 文本。背景遮罩 + blur。右上角 `[×]` 关闭。

#### 编辑模式
- 每张图片下方浮出按钮：`[delete]` / `[↑]` / `[↓]` / `[edit caption]`。
- 页面右下角浮出 `[+ Add Image]`：上传新图 + 填写 caption。
- 排序：用 order 字段控制环周上图片的顺序，调整后实时重新排布。
- 保存逻辑同 Library，走统一 `edit-mode.js`。

---

### 4.4 Game Collection（`games.html` / `games.css` / `games.js`）

**本阶段仅做占位**：
- 与其他页面共用视觉系统（顶栏返回按钮、字体切换、CRT 滤镜）。
- 页面中央显示一段大字 `// TRANSMISSION INCOMING //` 或类似占位文案，带闪烁动画。
- 不实现任何具体内容、不需要 JSON、不接入编辑模式。

---

## 5. 编辑模式规范（`js/edit-mode.js`）

`edit-mode.js` 是一个**框架层模块**，被三个子页面（library/gallery，games 暂不需要）和首页共同引用。

### 5.1 入口

```js
// 伪代码示意，实际实现以现有 admin.js 接口为准
import { isAdmin, pushChange, commitAll } from './edit-mode.js';
```

- `isAdmin()`：返回当前是否已通过 PIN 登录为管理员（读 admin.js 的状态）。
- 页面初始化时：若 `isAdmin()` 为 true，显示右下角 `[EDIT]` 按钮；否则隐藏。
- 进入编辑模式后给 `<body>` 加 class `editing`，所有编辑按钮/控件通过 CSS `body.editing .edit-only { display: ... }` 控制显隐。

### 5.2 暂存与提交

- 每次用户修改一个字段（标题、文本、上传图片、调整顺序），调用 `pushChange(file, newData)`，把"哪个 JSON 文件最新该长什么样"暂存到内存。
- 页面顶部固定一个状态栏，显示 `[N changes pending]` 和 `[Save All]` / `[Discard]` 按钮。
- `[Save All]` 调用 `commitAll()`：把所有 pending changes 整理成 Worker 期望的请求体，逐个 POST 到 Worker（每个 JSON 文件一次提交，或后端如果支持就批量），UI 显示进度。
- 图片上传：在选择文件时立即读为 base64 dataURL，写入对应 JSON 项的 `src` 字段（暂时是 dataURL，便于本地预览），同时把"待上传的真实图片二进制"放进一个独立的 pending 队列。`commitAll()` 时先把图片二进制 POST 到 Worker（Worker 写入 `assets/images/`），收到 Worker 返回的最终路径后再把 JSON 里的 `src` 替换为该路径，最后提交 JSON。

### 5.3 错误处理

- 任意一次提交失败：显示红色 toast `[SAVE FAILED]`，保留 pending changes 不清空，让用户重试。
- 全部提交成功：显示绿色 toast `[SAVED — site will rebuild in ~1min]`，清空 pending。

### 5.4 与现有 `admin.js` 的关系

> **Claude Code 必读**：开发前先 `view admin.js` 弄清楚：
> - 它现在暴露了什么全局变量或导出？
> - PIN 登录后，登录状态存在哪（localStorage？变量？）？
> - 它有没有现成的"保存"函数？接口签名是什么？
>
> `edit-mode.js` 应当**复用 admin.js 已有的能力**，只在其上层加一层"UI 操控 + 内存暂存 + 批量保存"的封装。不要重复实现 PIN 登录、不要绕开 Worker。

---

## 6. 开发顺序（建议里程碑）

按以下顺序提交，每个里程碑跑通了再做下一个：

1. **M1 — 视觉地基**
   - 创建 `css/shared.css`（tokens + CRT 滤镜 + lowpoly-frame）。
   - 创建 `js/shared.js`（CRT 注入 + 字体切换 + FX 开关 + 顶栏返回按钮组件）。
   - 改造现有 `index.html`，只接入 shared.css/shared.js，验证视觉滤镜效果。
   - 新建 `library.html` / `gallery.html` / `games.html`，全部只有顶栏 + 占位内容，验证导航通畅。

2. **M2 — Home 页交互**
   - 实现掉落几何体（先不做物理堆叠，先做单纯飘落）。
   - 加入鼠标推开逻辑。
   - 最后加入堆叠碰撞检测。

3. **M3 — Library 静态展示**
   - 创建 `content/library.json` 示例数据（3 本假书）。
   - 实现书本沿对角线排列 + CSS 3D 长方体。
   - 实现悬停抽出 + 发光。
   - 实现点击打开翻书模态窗口。

4. **M4 — Gallery 静态展示**
   - 创建 `content/gallery.json` 示例数据（6 张占位图）。
   - 实现环形排列 + 中心 lowpoly 模型 + 荧光尘粒。
   - 实现拖拽 + 惯性 + 吸附。
   - 实现点击打开图片详情模态。

5. **M5 — 编辑模式接入**
   - 阅读 `admin.js` 与 `worker/` 现有实现，搞清楚接口。
   - 实现 `js/edit-mode.js` 框架。
   - 把 Library 接入编辑模式（增删改 + 排序 + 封面上传）。
   - 把 Gallery 接入编辑模式。
   - 把 Home 的标题编辑接入。

6. **M6 — 移动端降级 + 性能调优**
   - 媒体查询 < 768px 时简化 Home 几何体、Library 改为静态排列、Gallery 改为简单横向滑动。
   - 在低性能设备上自动降低粒子数量。
   - 用 Lighthouse 跑分，目标 Performance > 80。

---

## 7. 验收清单

每个里程碑完成时，Claude Code 应自检：

- [ ] 视觉风格符合"低保真 DV + 90s + lowpoly"关键词，不像普通现代网站。
- [ ] 所有页面顶栏返回按钮可用，相互跳转无障碍。
- [ ] 字体一键切换按钮在所有页面都生效，状态跨页面持久化。
- [ ] CRT 滤镜全局开关可用。
- [ ] Library 书本悬停动画流畅（≥ 50 FPS），点击模态窗口正常。
- [ ] Gallery 拖拽手感自然，惯性衰减不突兀，吸附准确。
- [ ] 编辑模式仅管理员可见，未登录看不到任何编辑控件。
- [ ] 修改保存后，刷新页面或新开页面看到的是最新内容。
- [ ] 桌面端 Chrome/Firefox/Safari 均无破版。
- [ ] 移动端能正常浏览（即使交互简化）。

---

## 8. 不要做的事（重要）

- ❌ 不要引入 React/Vue/Svelte/Three.js/任何打包工具/任何 CSS 框架（Tailwind/Bootstrap 等）。
- ❌ 不要重写 `admin.js` 或 `worker/` 里的代码，复用现有。
- ❌ 不要使用 `border-radius` 制造圆角——本项目美学是锐利直角。极少数例外（如点击焦点的指示点）需要时再单独说明。
- ❌ 不要把图片直接 inline 成超大 base64 写进 JSON 长期使用，base64 仅用于编辑模式上传过程中的临时预览，最终落地到 `assets/images/` 文件路径。
- ❌ 不要为了"看起来现代"擅自换配色或加渐变美化——视觉规格里没有的元素就别加。
- ❌ 遇到本文档没说清的细节，**先问用户**，不要自由发挥。

---

## 9. 当前已知未定项（开发到那一步再问用户）

- Library 书本默认数量上限（建议 7-10 本，超出时是否分组或滚动？）。
- Gallery 图片数量上限（建议 12 张以内最佳，超过环周变拥挤）。
- 主界面是否需要 BGM/SFX（点击音效、环境噪音）？目前默认不做。
- Game Collection 页面的最终内容形态（待用户后续指定）。
- 是否需要"访客模式 vs 管理员模式"切换的视觉区分（如管理员模式整体加一个红色边框提示）？

---

**文档结束。开发开始前请阅读全文，遇到歧义先确认再写代码。**
