const REPO_OWNER = 'gezyy';
const REPO_NAME = 'gezyy.github.io';
const SITE_ORIGIN = 'https://gezyy.github.io';

function corsHeaders(origin) {
  const allowed = origin === SITE_ORIGIN || origin === 'http://127.0.0.1:5500' || (origin && origin.startsWith('http://localhost'));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : SITE_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function makeDailyToken(pin) {
  const day = Math.floor(Date.now() / 86400000).toString();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(day));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifyToken(token, pin) {
  return token === await makeDailyToken(pin);
}

async function ghRequest(method, path, body, ghToken) {
  return fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
    method,
    headers: {
      'Authorization': `token ${ghToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'gezyy-site-admin',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    const route = url.pathname;

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });

    const checkAuth = async () => {
      const auth = request.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer ')) return false;
      return verifyToken(auth.slice(7), env.ADMIN_PIN);
    };

    // POST /auth  { pin }  →  { token }
    if (route === '/auth' && request.method === 'POST') {
      try {
        const { pin } = await request.json();
        if (pin === env.ADMIN_PIN) {
          return json({ token: await makeDailyToken(pin) });
        }
        return json({ error: 'Wrong PIN' }, 401);
      } catch {
        return json({ error: 'Bad request' }, 400);
      }
    }

    // PUT /content  { content: {...} }  →  update content.json in repo
    if (route === '/content' && request.method === 'PUT') {
      if (!await checkAuth()) return json({ error: 'Unauthorized' }, 401);
      try {
        const { content } = await request.json();
        const current = await ghRequest('GET', 'content.json', null, env.GITHUB_TOKEN);
        if (!current.ok) return json({ error: 'Could not read content.json from repo' }, 500);
        const { sha } = await current.json();
        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
        const result = await ghRequest('PUT', 'content.json', {
          message: 'Update site content via admin panel',
          content: encoded,
          sha,
        }, env.GITHUB_TOKEN);
        return result.ok ? json({ ok: true }) : json({ error: 'GitHub write failed', status: result.status }, 500);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // POST /upload  { filePath, data (base64) }  →  upload/overwrite file in repo
    if (route === '/upload' && request.method === 'POST') {
      if (!await checkAuth()) return json({ error: 'Unauthorized' }, 401);
      try {
        const { filePath, data } = await request.json();
        const body = { message: `Upload ${filePath}`, content: data };
        const existing = await ghRequest('GET', filePath, null, env.GITHUB_TOKEN);
        if (existing.ok) {
          const { sha } = await existing.json();
          body.sha = sha;
        }
        const result = await ghRequest('PUT', filePath, body, env.GITHUB_TOKEN);
        return result.ok ? json({ ok: true }) : json({ error: 'Upload failed' }, 500);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // DELETE /upload  { filePath }  →  delete file from repo
    if (route === '/upload' && request.method === 'DELETE') {
      if (!await checkAuth()) return json({ error: 'Unauthorized' }, 401);
      try {
        const { filePath } = await request.json();
        const existing = await ghRequest('GET', filePath, null, env.GITHUB_TOKEN);
        if (!existing.ok) return json({ error: 'File not found' }, 404);
        const { sha } = await existing.json();
        const result = await ghRequest('DELETE', filePath, {
          message: `Delete ${filePath}`,
          sha,
        }, env.GITHUB_TOKEN);
        return result.ok ? json({ ok: true }) : json({ error: 'Delete failed' }, 500);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};
