// bfe-piano-hero 1.0.0 — serves https://bucklerfamily.estate/piano-hero/ from unclehowell/cedwyn-piano-hero main, folder public/
// (raw, edge-cached 5 min). Same pattern as bfe-erp. — Sion's Tab agent
const VERSION = '1.0.0';
const RAW = 'https://raw.githubusercontent.com/unclehowell/cedwyn-piano-hero/main/public';
const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain; charset=utf-8' };
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    if (u.pathname === '/piano-hero') return Response.redirect(u.origin + '/piano-hero/' + u.search, 301);
    if (!u.pathname.startsWith('/piano-hero/')) return new Response('Not found', { status: 404 });
    let p = u.pathname.slice(11);
    try { p = decodeURIComponent(p); } catch (e) { return new Response('Bad path', { status: 400 }); }
    if (p.includes('..') || p.includes('\\')) return new Response('Bad path', { status: 400 });
    if (p.endsWith('/')) p += 'index.html';
    const ext = (p.split('.').pop() || '').toLowerCase();
    const type = TYPES[ext];
    if (!type) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    let r = null, src = 'github:main';
    try { r = await fetch(RAW + p, { cf: { cacheTtl: 300, cacheEverything: true } }); } catch (e) { r = null; }
    if (!r || (!r.ok && r.status !== 404)) {   // one retry without the edge cache
      src = 'github:main:retry';
      try { r = await fetch(RAW + p + '?r=' + Date.now()); } catch (e) { r = null; }
    }
    if (!r || !r.ok) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-bfe-piano-hero-router': VERSION } });
    const h = new Headers({ 'content-type': type, 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff',
      'x-bfe-piano-hero-router': VERSION, 'x-bfe-piano-hero-source': src });
    return new Response(req.method === 'HEAD' ? null : r.body, { status: 200, headers: h });
  }
};
