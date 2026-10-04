// The SOCIAL registry, read straight from chain. Every launch's second transaction carries the memo
// "so:v1:<mint>:<personaCid>" and the read-only REG key, so getSignaturesForAddress(REG) lists every creator.
// The persona (handle, bio, voice, look, brain, first caption) is a small JSON on IPFS whose CID is in that memo.
const L = require('./_lib');
const C = require('./_cfg');
const K = require('./_chain');
const D = require('./_db');
const P = require('./_persona');

const META = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
const GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/'];
const CID = /^[A-Za-z0-9]{40,80}$/;
const s = (v, n) => String(v == null ? '' : v).slice(0, n);

function parse(tx, sig, t) {
  if (!tx || (tx.meta && tx.meta.err)) return null;
  const logs = (tx.meta && tx.meta.logMessages) || [];
  const hit = logs.map(l => /Memo \(len \d+\): "(so:v1:[^"]+)"/.exec(l)).find(Boolean);
  if (!hit) return null;
  const [, , mint, cid] = hit[1].split(':');
  if (!L.B58.test(mint || '')) return null;
  const keys = (tx.transaction && tx.transaction.message && tx.transaction.message.accountKeys) || [];
  const payer = keys[0] && (keys[0].pubkey || keys[0]);
  return { mint, personaCid: CID.test(cid || '') ? cid : null, launcher: String(payer || ''), sig, t: (t || 0) * 1000 };
}
async function getTx(sig) {
  try { return await L.rpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]); } catch (e) { return null; }
}
async function ipfsJson(cid) {
  if (!cid) return null;
  return L.cached('ipfs:' + cid, 6 * 3600e3, async () => {
    for (const g of GATEWAYS) { try { return await L.getJson(g + cid, {}, 6000); } catch (e) { } }
    return null;
  }).catch(() => null);
}
// coin metadata: pump.fun's API first, then the Metaplex account + its IPFS JSON
async function coinMeta(mint) {
  return L.cached('meta:' + mint, 10 * 60e3, async () => {
    try {
      const c = await L.getJson('https://frontend-api-v3.pump.fun/coins/' + mint, { headers: { accept: 'application/json' } }, 6000);
      if (c && c.mint === mint) return { name: c.name, symbol: c.symbol, image: c.image_uri || null, description: c.description || '' };
    } catch (e) { }
    try {
      const X = require('@solana/web3.js');
      const [pda] = X.PublicKey.findProgramAddressSync([Buffer.from('metadata'), new X.PublicKey(META).toBuffer(), new X.PublicKey(mint).toBuffer()], new X.PublicKey(META));
      const a = await L.rpc('getAccountInfo', [pda.toBase58(), { encoding: 'base64' }]);
      if (!a || !a.value) return null;
      const b = Buffer.from(a.value.data[0], 'base64'); let o = 65;
      const str = () => { const n = b.readUInt32LE(o); o += 4; const v = b.slice(o, o + n).toString('utf8').replace(/\0+$/, ''); o += n; return v; };
      const name = str(), symbol = str(), uri = str();
      const cid = /\/ipfs\/([A-Za-z0-9]{40,})/.exec(uri);
      const j = (cid && await ipfsJson(cid[1])) || {};
      return { name: j.name || name, symbol: j.symbol || symbol, image: j.image || null, description: j.description || '' };
    } catch (e) { return null; }
  });
}
// market data (DexScreener, best Solana pair by liquidity) for up to 30 mints per call
async function markets(mints) {
  const out = {};
  for (let i = 0; i < mints.length; i += 30) {
    const part = mints.slice(i, i + 30);
    try {
      const j = await L.getJson('https://api.dexscreener.com/latest/dex/tokens/' + part.join(','), {}, 8000);
      for (const p of (j.pairs || [])) {
        if (p.chainId !== 'solana') continue;
        const m = p.baseToken && p.baseToken.address; if (!part.includes(m)) continue;
        const liq = (p.liquidity && p.liquidity.usd) || 0;
        if (out[m] && out[m]._liq > liq) continue;
        out[m] = { mcap: p.marketCap ?? p.fdv ?? null, vol24: (p.volume && p.volume.h24) ?? null, chg24: (p.priceChange && p.priceChange.h24) ?? null, chg1h: (p.priceChange && p.priceChange.h1) ?? null, price: p.priceUsd ? +p.priceUsd : null, buys24: p.txns && p.txns.h24 ? p.txns.h24.buys : null, _liq: liq };
      }
    } catch (e) { }
  }
  for (const m in out) delete out[m]._liq;
  return out;
}
// holder counts from Jupiter's token index
async function holders(mints) {
  const out = {};
  for (let i = 0; i < mints.length; i += 50) {
    try { const r = await L.jup(mints.slice(i, i + 50).join(',')); for (const t of r || []) if (t && t.id) out[t.id] = t.holderCount ?? null; } catch (e) { }
  }
  return out;
}
function persona(rec) {
  let x = {}; try { x = JSON.parse((rec && rec.description) || '{}') || {}; } catch (e) { x = {}; }
  return { handle: s(x.h, 20).toLowerCase().replace(/[^a-z0-9._]/g, ''), brain: C.brain(x.br).id, bio: s(x.b, 160), voice: s(x.v, 80), look: s(x.l, 220), vibe: s(x.vi, 120), traits: (Array.isArray(x.tr) ? x.tr : []).map(t => s(t, 16)).slice(0, 3), caption: s(x.c, 140) };
}
function shape(base, mk, cv, hold, stats) {
  const t = C.tier(mk ? mk.mcap : null, cv ? cv.complete : false);
  const nx = C.nextTier(t);
  return { ...base, market: mk || null, curve: cv ? { progress: cv.progress, complete: cv.complete } : null, holders: hold ?? null,
    tier: { id: t.id, name: t.name, at: t.at }, next: nx ? { id: nx.id, name: nx.name, at: nx.at } : null,
    stats: stats || { posts: 0, hearts: 0, lastPost: null } };
}
async function dbStats() {
  const q = await D.init().catch(() => null); if (!q) return {};
  const r = await q`SELECT mint, handle, posts, hearts, last_post, busy_until FROM so_creators`;
  return Object.fromEntries(r.map(x => [x.mint, { handle: x.handle, posts: x.posts, hearts: Number(x.hearts), lastPost: x.last_post ? +new Date(x.last_post) : null, busy: x.busy_until ? +new Date(x.busy_until) > Date.now() : false }]));
}
// remember every creator in the database (the post engine needs their persona); unique handles get a suffix
async function remember(list) {
  const q = await D.init().catch(() => null); if (!q) return;
  for (const c of list) {
    const when = c.t ? new Date(c.t).toISOString() : new Date().toISOString();
    try {
      await q`INSERT INTO so_creators (mint, handle, name, symbol, brain, persona, portrait, house, launcher, sig, created)
        VALUES (${c.mint}, ${c.handle}, ${c.name}, ${c.symbol}, ${c.brain}, ${JSON.stringify(c.persona)}, ${c.avatar}, ${!!c.house}, ${c.launcher || null}, ${c.sig || null}, ${c.t ? new Date(c.t).toISOString() : new Date().toISOString()})
        ON CONFLICT (mint) DO NOTHING`;
      await seed(q, c, when);
    } catch (e) {
      try {
        await q`INSERT INTO so_creators (mint, handle, name, symbol, brain, persona, portrait, house, launcher, sig, created)
          VALUES (${c.mint}, ${c.handle + '_' + c.mint.slice(0, 4).toLowerCase()}, ${c.name}, ${c.symbol}, ${c.brain}, ${JSON.stringify(c.persona)}, ${c.avatar}, ${!!c.house}, ${c.launcher || null}, ${c.sig || null}, ${c.t ? new Date(c.t).toISOString() : new Date().toISOString()})
          ON CONFLICT (mint) DO NOTHING`;
        await seed(q, c, when);
      } catch (e2) { }
    }
  }
}
// every creator's first post is its launch portrait with its first caption
async function seed(q, c, when) {
  const have = await q`SELECT 1 FROM so_posts WHERE mint = ${c.mint} AND kind = 'launch' LIMIT 1`;
  if (have.length) return;
  await q`INSERT INTO so_posts (mint, kind, caption, engine, created) VALUES (${c.mint}, 'launch', ${(c.persona && c.persona.caption) || 'first post'}, ${c.house ? 'house' : 'launch'}, ${when})`;
  await q`UPDATE so_creators SET posts = posts + 1 WHERE mint = ${c.mint}`;
}
async function entriesFrom(sigs) {
  const ok = (sigs || []).filter(x => !x.err);
  const txs = [];
  for (let i = 0; i < ok.length; i += 20) txs.push(...await Promise.all(ok.slice(i, i + 20).map(x => getTx(x.signature))));
  const seen = new Set();
  return txs.map((tx, i) => parse(tx, ok[i].signature, ok[i].blockTime)).filter(e => e && !seen.has(e.mint) && seen.add(e.mint));
}
async function base(entries) {
  const metas = await Promise.all(entries.map(e => coinMeta(e.mint)));
  const recs = await Promise.all(entries.map(e => ipfsJson(e.personaCid)));
  return entries.map((e, i) => {
    const m = metas[i] || {}, r = recs[i] || {}, p = persona(r);
    const name = s(r.name || m.name, 32) || 'Creator';
    const handle = p.handle || name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || e.mint.slice(0, 6).toLowerCase();
    return { mint: e.mint, sig: e.sig, t: e.t, launcher: e.launcher, house: false, handle, name, symbol: s(m.symbol || r.symbol, 10), brain: p.brain,
      avatar: m.image || r.image || null, persona: { bio: p.bio, voice: p.voice, look: p.look, vibe: p.vibe, traits: p.traits, caption: p.caption } };
  }).filter(c => P.ok(c.name + ' ' + c.handle + ' ' + c.symbol));
}
function house() {
  return P.HOUSE.map((h, i) => ({ mint: h.mint, sig: null, t: Date.UTC(2026, 9, 4) - i * 7 * 60e3, launcher: null, house: true, handle: h.handle, name: h.name, symbol: null, brain: h.brain, avatar: '/assets/house/' + h.img + '.jpg', persona: h.persona }));
}
async function decorate(list, st) {
  const mints = list.filter(c => !c.house).map(c => c.mint);
  const [mk, cv, hd] = await Promise.all([markets(mints), K.curves(mints), holders(mints)]);
  return list.map(c => {
    const x = st[c.mint];
    const pic = c.house ? c.avatar : '/api/media?mint=' + c.mint;
    return shape({ ...c, pic, handle: (x && x.handle) || c.handle }, mk[c.mint], cv[c.mint], hd[c.mint], x ? { posts: x.posts, hearts: x.hearts, lastPost: x.lastPost, busy: x.busy } : null);
  });
}
// every creator (house first, then newest launches)
async function list({ fresh = false } = {}) {
  if (fresh) L.forget('registry:');
  return L.cached('registry:list', 30e3, async () => {
    const sigs = await L.rpc('getSignaturesForAddress', [C.REG, { limit: 300, commitment: 'confirmed' }]).catch(() => []);
    const coins = await base(await entriesFrom(sigs));
    const all = [...house(), ...coins];
    let st = await dbStats().catch(() => ({}));
    const missing = all.filter(c => !st[c.mint]);
    if (missing.length && D.on()) { await remember(missing).catch(() => { }); st = await dbStats().catch(() => st); }
    return decorate(all, st);
  });
}
async function card(mint, { fresh = false } = {}) {
  const all = await list({ fresh });
  let c = all.find(x => x.mint === mint);
  if (!c && !fresh && L.B58.test(mint || '')) { const again = await list({ fresh: true }); c = again.find(x => x.mint === mint); }
  return c || null;
}
async function byHandle(h) {
  const all = await list();
  return all.find(x => x.handle.toLowerCase() === String(h || '').toLowerCase()) || null;
}
async function handleFree(h) {
  h = String(h || '').toLowerCase();
  if (!/^[a-z0-9._]{3,15}$/.test(h)) return { ok: false, why: 'Use 3 to 15 letters, numbers, dots or underscores.' };
  if (P.RESERVED.has(h)) return { ok: false, why: 'That handle is reserved.' };
  const all = await list().catch(() => []);
  if (all.some(c => c.handle.toLowerCase() === h)) return { ok: false, why: '@' + h + ' is taken on SOCIAL.' };
  return { ok: true };
}
module.exports = { handleFree, list, card, byHandle, parse, markets, coinMeta, ipfsJson, house };
