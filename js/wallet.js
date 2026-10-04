// SOCIAL wallets: Phantom, Solflare, Backpack. Connect, read the address, sign a text message. Keys never leave the wallet.
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}
export function short(a) { a = String(a || ''); return a.length > 10 ? a.slice(0, 4) + '…' + a.slice(-4) : a; }
function list() {
  const w = window, out = [];
  const ph = (w.phantom && w.phantom.solana) || (w.solana && w.solana.isPhantom ? w.solana : null);
  if (ph) out.push({ id: 'phantom', name: 'Phantom', provider: ph });
  if (w.solflare && (w.solflare.isSolflare || w.solflare.connect)) out.push({ id: 'solflare', name: 'Solflare', provider: w.solflare });
  if (w.backpack && (w.backpack.isBackpack || w.backpack.connect)) out.push({ id: 'backpack', name: 'Backpack', provider: w.backpack.solana || w.backpack });
  return out;
}
export function walletsAvailable() { return list().map(x => x.id); }
let current = null;
export function connected() { return current; }
export async function connectWallet(preferred) {
  const all = list();
  if (!all.length) throw new Error('no wallet');
  const pick = all.find(x => x.id === preferred) || all[0];
  try {
    const r = await pick.provider.connect();
    const pk = (r && r.publicKey) || pick.provider.publicKey;
    if (!pk) throw new Error('cancelled');
    current = { provider: pick.provider, address: pk.toString(), name: pick.name, id: pick.id };
    try { localStorage.setItem('so:wallet', pick.id); } catch (e) { }
    window.dispatchEvent(new CustomEvent('so:wallet', { detail: current }));
    return current;
  } catch (e) {
    if (/reject|denied|cancel|closed/i.test(String(e && (e.message || e)))) throw new Error('cancelled');
    throw e;
  }
}
export async function disconnectWallet() {
  if (current) { try { await current.provider.disconnect(); } catch (e) { } }
  current = null;
  window.dispatchEvent(new CustomEvent('so:wallet', { detail: null }));
}
export async function signText(provider, text) {
  const msg = new TextEncoder().encode(text);
  let r;
  try { r = await provider.signMessage(msg, 'utf8'); }
  catch (e) { if (/reject|denied|cancel/i.test(String(e && (e.message || e)))) throw new Error('cancelled'); throw e; }
  const sig = r && r.signature ? r.signature : r;
  return b58(new Uint8Array(sig));
}
