// POST /api/make {kind:'kit', brief, brain}   the chosen brain writes a whole creator from one sentence
// POST /api/make {kind:'face', look}          a photoreal portrait for that creator (Higgsfield Soul when keyed, else FLUX)
// GET  /api/make?handle=…&ticker=…            is the handle free on SOCIAL, and is the ticker already a coin?
const L = require('./_lib');
const C = require('./_cfg');
const A = require('./_ai');
const D = require('./_db');
const P = require('./_persona');
const R = require('./_registry');

const handleFree = R.handleFree;
module.exports = L.wrap(async (req, res) => {
  if (req.method === 'GET') {
    const p = L.q(req), out = { ok: true };
    if (p.get('handle')) out.handle = await handleFree(p.get('handle'));
    if (p.get('ticker')) {
      const t = String(p.get('ticker')).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      let n = 0; try { const j = await L.getJson('https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(t), {}, 6000); n = new Set((j.pairs || []).filter(x => x.chainId === 'solana' && String(x.baseToken.symbol).toUpperCase() === t).map(x => x.baseToken.address)).size; } catch (e) { n = null; }
      out.ticker = { symbol: t, coins: n };
    }
    return L.send(res, 200, out, 'public, s-maxage=20');
  }
  if (req.method !== 'POST') return L.send(res, 405, { ok: false, error: 'POST only' });
  const b = await L.body(req);
  if (!A.token(req)) return L.send(res, 503, { ok: false, error: 'The AI studio is offline. Write it yourself below.' });
  if (b.kind === 'face') {
    if (A.limited('face:' + L.ip(req), 6, 600e3)) return L.send(res, 429, { ok: false, error: 'Too many faces in a row. Wait a few minutes or upload one.' });
    const look = A.clean(b.look, 240);
    if (look.length < 10 || !P.ok(look)) return L.send(res, 400, { ok: false, error: 'Describe how they look first.' });
    if (!await D.take('faces', C.CAPS.faces).catch(() => true)) return L.send(res, 429, { ok: false, error: 'The studio made all its faces for today. Upload one instead.' });
    try {
      const im = await A.portrait(req, look);
      return L.send(res, 200, { ok: true, image: A.dataUrl(im.buf, im.mime), engine: im.engine, model: im.model });
    } catch (e) { return L.send(res, 503, { ok: false, error: 'The image studio is busy. Try again, or upload a face.' }); }
  }
  // kit
  if (A.limited('kit:' + L.ip(req), 10, 600e3)) return L.send(res, 429, { ok: false, error: 'Too many in a row. Wait a few minutes.' });
  if (!await D.take('kits', C.CAPS.kits).catch(() => true)) return L.send(res, 429, { ok: false, error: 'The studio is resting for today. Write your creator yourself below.' });
  const brain = C.brain(b.brain).id;
  for (let i = 0; i < 2; i++) {
    try {
      const k = await P.kit(req, b.brief, brain);
      const free = await handleFree(k.handle);
      if (!free.ok) k.handle = (k.handle.slice(0, 11) + Math.floor(100 + Math.random() * 900)).slice(0, 15);
      return L.send(res, 200, { ok: true, kit: k });
    } catch (e) { if (i === 1) return L.send(res, 503, { ok: false, error: 'The brain is busy. Try again, or write it yourself.' }); }
  }
});
