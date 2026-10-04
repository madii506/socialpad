// GET /api/health : what is switched on (no secrets, only yes/no and public values). ?diag=1 runs live checks.
const L = require('./_lib');
const C = require('./_cfg');
const A = require('./_ai');
const D = require('./_db');
module.exports = L.wrap(async (req, res) => {
  const p = L.q(req);
  const base = {
    ok: true, ai: !!A.token(req), db: D.on(), video: A.HF.on(),
    socialMint: C.SOCIAL_MINT || null, x: C.X || null, reg: C.REG,
    tiers: C.TIERS.map(t => ({ id: t.id, name: t.name, at: t.at, photoHours: t.photo / 3600e3, videoHours: t.video ? t.video / 3600e3 : null, close: t.close })),
    brains: C.BRAINS.map(b => ({ id: b.id, name: b.name, maker: b.maker, tag: b.tag })), caps: C.CAPS,
  };
  if (!p.get('diag')) {
    base.usage = await D.usage().catch(() => null);
    return L.send(res, 200, base, 'public, s-maxage=20');
  }
  if (A.limited('diag', 6, 600e3)) return L.send(res, 429, { ok: false, error: 'slow down' });
  const out = { ...base, checks: {} };
  const t = async (k, fn) => { const t0 = Date.now(); try { out.checks[k] = { ok: true, v: await fn(), ms: Date.now() - t0 }; } catch (e) { out.checks[k] = { ok: false, error: String(e && e.message || e).slice(0, 220), ms: Date.now() - t0 }; } };
  await t('db', async () => { const q = await D.init(); if (!q) return 'off'; const r = await q`SELECT count(*)::int AS n FROM so_posts`; return r[0].n + ' posts'; });
  await t('credits', async () => { const r = await L.get(A.GW + '/credits', { headers: A.auth(req) }, 8000); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(r.status + ' ' + JSON.stringify(j).slice(0, 120)); return j; });
  await t('chat', async () => { const r = await A.chat(req, [{ role: 'user', content: 'Reply with the single word: ok' }], { max_tokens: 5, temperature: 0 }); return r.model + ': ' + r.text.slice(0, 20); });
  if (p.get('diag') === 'img') {
    const ref = await A.fetchImage(L.origin(req) + '/assets/house/lux.jpg').catch(() => null);
    for (const k of ['kontext', 'gemini', 'flux2']) await t('edit_' + k, async () => { if (!ref) throw new Error('no ref'); const r = await A.EDITS[k](req, 'A candid photo of this same woman sitting in a cozy cafe holding a latte, smiling. Keep her exact face.', ref); return r.model + ' ' + r.buf.length + ' bytes'; });
    await t('generate', async () => { const r = await A.generate(req, 'A cozy cafe interior at golden hour, photo', {}); return r.model + ' ' + r.buf.length + ' bytes'; });
  }
  L.send(res, 200, out);
});
