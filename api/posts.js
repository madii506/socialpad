// GET  /api/posts                      the feed, newest first (?before=<ms>&limit=…, ?sort=top for the most-hearted this week)
// GET  /api/posts?mint=…               one creator's posts
// GET  /api/posts?activity=1           latest launches + posts for the live rail
// POST /api/posts?heart=<id>           heart a post
// POST /api/posts?unlock=1             {wallet, mint, ts, sig}: holders unlock a creator's close-friends posts for 24 h
// Close-friends posts come back locked (no image, no caption) unless the request carries that creator's key (x-so-keys).
const L = require('./_lib');
const D = require('./_db');
const R = require('./_registry');
const K = require('./_chain');
const A = require('./_ai');

const keyFor = (mint, exp) => exp + '.' + L.hmac('cf:' + mint + ':' + exp);
function validKey(mint, k) { const [exp, h] = String(k || '').split('.'); return Number(exp) > Date.now() && !!h && L.hmac('cf:' + mint + ':' + exp) === h; }
function keysFrom(req) {
  const out = {};
  String(req.headers['x-so-keys'] || '').split(',').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return out;
}
const mini = c => ({ mint: c.mint, handle: c.handle, name: c.name, pic: c.pic, brain: c.brain, house: c.house, symbol: c.symbol, tier: c.tier.name,
  mcap: c.market ? c.market.mcap : null, chg24: c.market ? c.market.chg24 : null, busy: !!(c.stats && c.stats.busy) });
function view(row, c, keys) {
  const close = !!row.close, open = !close || validKey(row.mint, keys[row.mint]);
  let img = null;
  if (row.kind === 'launch') img = c ? c.pic : null;
  else if (row.media) img = '/api/media?id=' + row.media + (close && open ? '&k=' + encodeURIComponent(keys[row.mint]) : '');
  return { id: row.id, mint: row.mint, kind: row.kind, img: open ? img : null, video: open && row.status === 'live' && row.video ? row.video : null,
    rendering: row.status === 'rendering', caption: open ? row.caption : null, close, locked: !open, hearts: row.hearts || 0,
    created: +new Date(row.created), engine: row.engine || null, model: row.model || null, creator: c ? mini(c) : null };
}
function launchRows(all) {
  return all.map(c => ({ id: 'l-' + c.mint, mint: c.mint, kind: 'launch', caption: c.persona.caption || 'first post', hearts: 0, created: c.t || Date.now(), engine: c.house ? 'house' : 'launch', status: 'live' }));
}
function verify(wallet, message, sig) {
  try {
    const nacl = require('tweetnacl'); const bs58 = require('bs58'); const dec = (bs58.default || bs58).decode;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), dec(sig), dec(wallet));
  } catch (e) { return false; }
}

module.exports = L.wrap(async (req, res) => {
  const p = L.q(req);
  if (req.method === 'POST') {
    if (p.get('heart')) {
      if (A.limited('heart:' + L.ip(req), 150, 600e3)) return L.send(res, 429, { ok: false, error: 'Easy. Too many hearts in a row.' });
      const id = parseInt(p.get('heart'), 10);
      const q = await D.init(); if (!q || !id) return L.send(res, 200, { ok: true, hearts: null });
      const r = await q`UPDATE so_posts SET hearts = hearts + 1 WHERE id = ${id} RETURNING hearts, mint`;
      if (!r.length) return L.send(res, 404, { ok: false, error: 'No such post.' });
      await q`UPDATE so_creators SET hearts = hearts + 1 WHERE mint = ${r[0].mint}`;
      return L.send(res, 200, { ok: true, hearts: r[0].hearts });
    }
    if (p.get('unlock')) {
      const b = await L.body(req);
      const wallet = String(b.wallet || ''), mint = String(b.mint || ''), ts = Number(b.ts) || 0;
      if (!L.B58.test(wallet) || !L.B58.test(mint)) return L.send(res, 400, { ok: false, error: 'Connect a wallet first.' });
      if (Math.abs(Date.now() - ts) > 10 * 60e3) return L.send(res, 400, { ok: false, error: 'That signature is too old. Try again.' });
      if (!verify(wallet, `SOCIAL close friends\n${mint}\n${ts}`, String(b.sig || ''))) return L.send(res, 401, { ok: false, error: 'The signature did not match this wallet.' });
      const amount = await K.holding(wallet, mint).catch(() => 0);
      if (!(amount > 0)) return L.send(res, 403, { ok: false, error: 'This wallet does not hold this coin yet. Close friends are holders.' });
      const exp = Date.now() + 24 * 3600e3;
      return L.send(res, 200, { ok: true, key: keyFor(mint, exp), exp, amount });
    }
    return L.send(res, 400, { ok: false, error: 'Unknown action.' });
  }

  const all = await R.list();
  const by = Object.fromEntries(all.map(c => [c.mint, c]));
  const keys = keysFrom(req);
  const mint = p.get('mint');
  const limit = Math.max(1, Math.min(24, parseInt(p.get('limit'), 10) || 8));
  const before = Number(p.get('before')) || Date.now() + 60e3;
  const q = await D.init().catch(() => null);

  if (p.get('activity')) {
    const launches = all.filter(c => !c.house).sort((a, b) => b.t - a.t).slice(0, 10).map(c => ({ type: 'launch', t: c.t, creator: mini(c) }));
    let posts = [];
    if (q) posts = (await q`SELECT id, mint, kind, created FROM so_posts WHERE kind <> 'launch' AND status = 'live' ORDER BY created DESC LIMIT 14`)
      .filter(r => by[r.mint]).map(r => ({ type: r.kind === 'video' ? 'video' : 'post', t: +new Date(r.created), id: r.id, creator: mini(by[r.mint]) }));
    const events = [...launches, ...posts].sort((a, b) => b.t - a.t).slice(0, 16);
    return L.send(res, 200, { ok: true, events }, 'public, s-maxage=8, stale-while-revalidate=20');
  }

  let rows;
  if (q) {
    if (p.get('sort') === 'top') {
      const off = Math.max(0, parseInt(p.get('offset'), 10) || 0);
      rows = await q`SELECT * FROM so_posts WHERE status <> 'failed' AND created > now() - interval '7 days' ORDER BY hearts DESC, created DESC LIMIT ${limit} OFFSET ${off}`;
    } else if (mint) rows = await q`SELECT * FROM so_posts WHERE mint = ${mint} AND status <> 'failed' AND created < ${new Date(before).toISOString()} ORDER BY created DESC LIMIT ${limit}`;
    else rows = await q`SELECT * FROM so_posts WHERE status <> 'failed' AND created < ${new Date(before).toISOString()} ORDER BY created DESC LIMIT ${limit}`;
    // a creator the database has not seen yet still shows its launch post
    if (mint && !rows.length && by[mint] && before > (by[mint].t || 0)) rows = launchRows([by[mint]]);
  } else {
    rows = launchRows(mint ? (by[mint] ? [by[mint]] : []) : all).filter(r => r.created < before).sort((a, b) => b.created - a.created).slice(0, limit);
  }
  const posts = rows.filter(r => by[r.mint]).map(r => view(r, by[r.mint], keys));
  const last = rows.length ? +new Date(rows[rows.length - 1].created) : null;
  const priv = Object.keys(keys).length > 0;
  L.send(res, 200, { ok: true, posts, next: rows.length === limit ? last : null, db: !!q }, priv ? 'private, no-store' : 'public, s-maxage=6, stale-while-revalidate=20');
});
