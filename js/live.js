// Live pump.fun trades for every coin on screen, over one PumpPortal websocket (subscribeTokenTrade), with reconnect backoff.
const subs = new Map(); // mint -> Set(callback)
let ws = null, tries = 0, timer = null, sent = new Set();
function open() {
  try { ws = new WebSocket('wss://pumpportal.fun/api/data'); } catch (e) { return retry(); }
  ws.onopen = () => { tries = 0; sent = new Set(); flush(); };
  ws.onmessage = ev => {
    let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
    if (!d || !d.mint || !(d.txType === 'buy' || d.txType === 'sell')) return;
    const set = subs.get(d.mint); if (!set) return;
    const tr = { mint: d.mint, side: d.txType, sol: Number(d.solAmount) || 0, trader: d.traderPublicKey || '', mcapSol: Number(d.marketCapSol) || null, sig: d.signature };
    for (const cb of set) { try { cb(tr); } catch (e) { } }
  };
  ws.onclose = () => { ws = null; retry(); };
  ws.onerror = () => { try { ws.close(); } catch (e) { } };
}
function retry() { clearTimeout(timer); if (!subs.size) return; timer = setTimeout(open, Math.min(30000, 1500 * 2 ** tries++)); }
function flush() {
  if (!ws || ws.readyState !== 1) return;
  const keys = [...subs.keys()].filter(k => !sent.has(k));
  if (!keys.length) return;
  for (let i = 0; i < keys.length; i += 50) ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: keys.slice(i, i + 50) }));
  keys.forEach(k => sent.add(k));
}
// watch(mints, cb) -> stop()
export function watch(mints, cb) {
  const list = [...new Set(mints)].filter(m => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m));
  if (!list.length) return () => { };
  for (const m of list) { if (!subs.has(m)) subs.set(m, new Set()); subs.get(m).add(cb); }
  if (!ws) open(); else flush();
  return () => { for (const m of list) { const s = subs.get(m); if (s) { s.delete(cb); if (!s.size) subs.delete(m); } } };
}
