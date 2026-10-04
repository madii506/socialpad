// POST /api/build : uploads the creator to pump.fun IPFS and returns the two launch transactions, unsigned.
//   tx 0  pump.fun create (+ optional dev buy), built by PumpPortal; signed by the browser-made mint key + the launcher's wallet
//   tx 1  the SOCIAL registry tag (memo + read-only REG key), so the creator shows up on SOCIAL from chain alone
// Nothing here signs anything or ever sees a private key. The launcher keeps pump.fun's creator fees; SOCIAL takes no fee.
const L = require('./_lib');
const C = require('./_cfg');
const K = require('./_chain');
const P = require('./_persona');
const R = require('./_registry');

const IMG = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);

async function ipfs({ image, name, symbol, description, website, twitter }) {
  const m = IMG.exec(image || '');
  if (!m) throw new Error('image missing');
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), 'image.' + (m[1].split('/')[1] === 'jpeg' ? 'jpg' : m[1].split('/')[1]));
  fd.append('name', name); fd.append('symbol', symbol); fd.append('description', description);
  if (website) fd.append('website', website);
  if (twitter) fd.append('twitter', twitter);
  fd.append('showName', 'true');
  const r = await L.get('https://pump.fun/api/ipfs', { method: 'POST', body: fd }, 25000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.metadataUri) throw new Error('pump.fun did not accept the upload (' + r.status + ')');
  const cid = /\/ipfs\/([A-Za-z0-9]{40,})/.exec(j.metadataUri);
  return { uri: j.metadataUri, cid: cid ? cid[1] : null, image: j.metadata && j.metadata.image || null };
}

module.exports = L.wrap(async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { ok: false, error: 'POST only' });
  const b = await L.body(req);
  const wallet = String(b.wallet || ''), mint = String(b.mint || '');
  if (!L.B58.test(wallet) || !L.B58.test(mint)) return L.send(res, 400, { ok: false, error: 'Connect a wallet first.' });
  if (b.retag) {
    const cid = /^[A-Za-z0-9]{40,80}$/.test(String(b.personaCid || '')) ? String(b.personaCid) : null;
    return L.send(res, 200, { ok: true, txs: [await K.regTx({ wallet, mint, personaCid: cid, blockhash: await K.blockhash() })] });
  }
  const k = b.kit || {};
  const name = clip(k.name, 24), symbol = clip(k.ticker, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const handle = String(k.handle || '').toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 15);
  if (name.length < 2 || symbol.length < 2) return L.send(res, 400, { ok: false, error: 'Give your creator a name and a ticker.' });
  const free = await R.handleFree(handle);
  if (!free.ok) return L.send(res, 409, { ok: false, error: free.why });
  const bio = clip(k.bio, 150), voice = clip(k.voice, 80), look = clip(k.look, 220), vibe = clip(k.vibe, 120), caption = clip(k.caption, 120);
  const traits = (Array.isArray(k.traits) ? k.traits : []).map(t => clip(t, 16)).filter(Boolean).slice(0, 3);
  if (!P.ok([name, handle, symbol, bio, voice, look, vibe, caption, traits.join(' ')].join(' '))) return L.send(res, 400, { ok: false, error: 'Some words in there are not allowed on SOCIAL. Edit and try again.' });
  if (!IMG.test(b.image || '')) return L.send(res, 400, { ok: false, error: 'Add their face first.' });
  if (String(b.image).length > 2.6e6) return L.send(res, 413, { ok: false, error: 'That image is too large. Use one under 1.9 MB.' });
  const devBuy = Math.max(0, Math.min(5, Number(b.devBuySol) || 0));
  const brain = C.brain(k.brain).id;
  const page = L.origin(req) + '/c/' + mint;
  const twitter = /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(String(b.twitter || '')) ? b.twitter : '';

  // 1. the persona record (portrait + compact JSON), so the profile can be rebuilt from chain + IPFS alone
  const rec = { h: handle, b: bio, v: voice, l: look, vi: vibe, tr: traits, c: caption, br: brain };
  let personaCid = null;
  try { personaCid = (await ipfs({ image: b.image, name, symbol, description: JSON.stringify(rec), website: page })).cid; }
  catch (e) { return L.send(res, 502, { ok: false, error: 'pump.fun storage is busy. Try again in a minute.' }); }
  // 2. the coin itself
  const description = [`@${handle} is an AI creator on SOCIAL. ${bio}`, '', `Brain: ${C.brain(brain).name}. Every post is AI-made.`, page].join('\n').slice(0, 500);
  const coin = await ipfs({ image: b.image, name, symbol, description, website: page, twitter });
  // 3. tx 0: create + dev buy (PumpPortal builds it; the creator is the launcher's wallet)
  const r = await L.get('https://pumpportal.fun/api/trade-local', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicKey: wallet, action: 'create', tokenMetadata: { name, symbol, uri: coin.uri }, mint, denominatedInSol: 'true', amount: devBuy, slippage: 10, priorityFee: 0.0005, pool: 'pump' }) }, 20000);
  if (!r.ok) return L.send(res, 502, { ok: false, error: 'pump.fun is busy right now. Try again in a minute.' });
  const tx0 = Buffer.from(await r.arrayBuffer()).toString('base64');
  // 4. tx 1: the SOCIAL registry tag
  const tx1 = await K.regTx({ wallet, mint, personaCid, blockhash: await K.blockhash() });
  L.send(res, 200, {
    ok: true, mint, handle, metadataUri: coin.uri, imageUrl: coin.image, personaCid, page: '/c/' + mint, txs: [tx0, tx1],
    labels: [devBuy > 0 ? `Create $${symbol} on pump.fun + ${devBuy} SOL dev buy` : `Create $${symbol} on pump.fun`, `Put @${handle} on SOCIAL`],
  });
});
