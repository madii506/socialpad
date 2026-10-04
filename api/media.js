// GET /api/media?id=<n>[&k=<key>]   a post's photo (close-friends photos need the holder key)
// GET /api/media?mint=<mint>          a launched creator's portrait (its coin image), cached at the edge
const L = require('./_lib');
const D = require('./_db');
const R = require('./_registry');

function validKey(mint, k) { const [exp, h] = String(k || '').split('.'); return Number(exp) > Date.now() && !!h && L.hmac('cf:' + mint + ':' + exp) === h; }
function bytes(res, buf, mime, cache) {
  res.setHeader('Content-Type', mime || 'image/jpeg');
  res.setHeader('Cache-Control', cache);
  res.status(200).send(buf);
}
module.exports = L.wrap(async (req, res) => {
  const p = L.q(req);
  const mint = p.get('mint');
  if (mint) {
    if (!L.B58.test(mint)) return L.send(res, 400, { ok: false, error: 'bad mint' });
    const m = await R.coinMeta(mint);
    let url = m && m.image;
    if (!url) return L.send(res, 404, { ok: false, error: 'no image' }, 'public, s-maxage=60');
    const cid = /\/ipfs\/([A-Za-z0-9]{40,})/.exec(url);
    const tries = cid ? ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/'].map(g => g + cid[1]) : [url];
    if (cid && !/ipfs\.io|dweb\.link|pinata/.test(url)) tries.unshift(url);
    for (const u of tries) {
      try {
        const r = await L.get(u, {}, 9000);
        if (!r.ok) continue;
        const type = (r.headers.get('content-type') || '').split(';')[0];
        if (!/^image\//.test(type)) continue;
        return bytes(res, Buffer.from(await r.arrayBuffer()), type, 'public, max-age=86400, s-maxage=604800, immutable');
      } catch (e) { }
    }
    return L.send(res, 504, { ok: false, error: 'IPFS is slow right now' }, 'public, s-maxage=30');
  }
  const id = parseInt(p.get('id'), 10);
  const q = await D.init(); if (!q || !id) return L.send(res, 404, { ok: false, error: 'not found' });
  const r = await q`SELECT m.mime, m.data, m.mint, bool_or(p.close) AS close FROM so_media m LEFT JOIN so_posts p ON p.media = m.id WHERE m.id = ${id} GROUP BY m.id`;
  if (!r.length || !r[0].data) return L.send(res, 404, { ok: false, error: 'not found' }, 'public, s-maxage=60');
  const row = r[0];
  if (row.close && !validKey(row.mint, p.get('k')) && p.get('k') !== L.hmac('hf:' + id)) return L.send(res, 403, { ok: false, error: 'Close friends only. Hold the coin to see it.' });
  bytes(res, Buffer.from(row.data, 'base64'), row.mime, row.close ? 'private, max-age=3600' : 'public, max-age=31536000, s-maxage=31536000, immutable');
});
