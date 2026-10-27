const UPSTREAM = 'https://venice.ai';
const BASE = new URL(self.registration.scope).pathname;
const PROXIES = [
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/raw?url=',
  'https://thingproxy.freeboard.io/fetch/',
];
const OWN = ['', 'sw.js', 'index.html', 'manifest.webmanifest', 'icon.svg'];
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0c0e"/><text x="32" y="43" font-size="32" text-anchor="middle" fill="#fff" font-family="sans-serif">V</text></svg>';
const MANIFEST = JSON.stringify({
  name: 'Venice Shell', short_name: 'Venice', start_url: BASE + 'chat/agent',
  scope: BASE, display: 'standalone', background_color: '#0b0c0e', theme_color: '#0b0c0e',
  icons: [{src: BASE + 'icon.svg', sizes: 'any', type: 'image/svg+xml'}],
});
const INJECT = '<link rel="manifest" href="' + BASE + 'manifest.webmanifest"><meta name="theme-color" content="#0b0c0e">';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const rel = url.pathname.slice(BASE.length);
  if (rel === 'manifest.webmanifest')
    return e.respondWith(new Response(MANIFEST, {headers: {'content-type': 'application/manifest+json'}}));
  if (rel === 'icon.svg')
    return e.respondWith(new Response(ICON, {headers: {'content-type': 'image/svg+xml'}}));
  if (OWN.includes(rel)) return;
  e.respondWith(proxy(req, url, rel));
});

async function tryFetch(url, init) {
  try {
    const res = await fetch(url, init);
    if (res && res.status !== 0) return res;
  } catch (e) {}
  return null;
}

async function proxy(req, url, rel) {
  const target = UPSTREAM + '/' + rel + url.search;
  const headers = new Headers();
  const accept = req.headers.get('accept');
  if (accept) headers.set('accept', accept);
  const ctype = req.headers.get('content-type');
  if (ctype) headers.set('content-type', ctype);
  let body = null;
  if (req.method !== 'GET' && req.method !== 'HEAD')
    try { body = await req.arrayBuffer(); } catch (e) {}

  let res = await tryFetch(target, {method: req.method, headers, body, credentials: 'omit', mode: 'cors'});
  for (let i = 0; i < PROXIES.length && !res; i++)
    res = await tryFetch(PROXIES[i] + encodeURIComponent(target),
      {method: req.method, headers, body, credentials: 'omit', mode: 'cors'});
  if (!res) return diagPage(target);

  const out = new Headers(res.headers);
  out.delete('content-length');
  out.delete('content-encoding');
  out.delete('x-frame-options');
  const ct = out.get('content-type') || '';
  if (ct.includes('text/html')) {
    const html = await res.text();
    const i = html.search(/<head[^>]*>/i);
    const text = i >= 0
      ? html.replace(/<head[^>]*>/i, m => m + INJECT)
      : INJECT + html;
    return new Response(text, {status: res.status, headers: out});
  }
  return new Response(res.body, {status: res.status, headers: out});
}

function diagPage(target) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const body = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Venice Shell</title>'
    + '<style>body{background:#0b0c0e;color:#e8e8ea;font:14px/1.7 system-ui,sans-serif;padding:28px}code{background:#1a1a1d;padding:2px 6px;border-radius:4px;font-size:12px;word-break:break-all}p{color:#8a8a92}</style>'
    + '<h1>上流に届きませんでした</h1><p>転送先</p><code>' + esc(target) + '</code><p>再読み込みしてください。</p>';
  return new Response(body, {status: 502, headers: {'content-type': 'text/html; charset=utf-8'}});
}
