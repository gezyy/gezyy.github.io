# 部署 Cloudflare Worker

## 前置步骤

1. 注册 Cloudflare 免费账号：https://dash.cloudflare.com/sign-up
2. 安装 wrangler CLI：
   ```
   npm install -g wrangler
   ```
3. 登录：
   ```
   wrangler login
   ```

## 部署 Worker

在 `worker/` 目录下运行：

```bash
wrangler deploy
```

部署完成后会输出类似：
```
https://gezyy-admin.YOUR_SUBDOMAIN.workers.dev
```

## 设置 Secrets（必须，不要写进代码）

```bash
wrangler secret put ADMIN_PIN
# 提示时输入你的管理员 PIN（任意字符串，如 mypin123）

wrangler secret put GITHUB_TOKEN
# 提示时输入 GitHub Personal Access Token（见下方说明）
```

## 获取 GitHub Token

1. 打开 https://github.com/settings/tokens/new
2. 勾选 `repo` 权限（Contents: Read & Write）
3. 生成并复制 token
4. 粘贴到上面的 `wrangler secret put GITHUB_TOKEN` 中

## 更新前端配置

在 `admin.js` 第一行，将 Worker URL 替换为你实际的 URL：

```js
const WORKER_URL = 'https://gezyy-admin.YOUR_SUBDOMAIN.workers.dev';
// 改为 ↓
const WORKER_URL = 'https://gezyy-admin.abc123.workers.dev';  // 实际 URL
```

然后 git commit & push，等 GitHub Pages 部署完成即可。

## 使用流程

1. 访问网站，弹出身份选择框
2. 选择"管理员"，输入你设置的 ADMIN_PIN
3. 右下角出现"编辑模式"按钮
4. 点击进入编辑模式，进行修改
5. 点击"保存更改"，约 1 分钟后 GitHub Pages 自动更新
