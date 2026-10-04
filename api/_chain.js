// SOCIAL on-chain helpers: the registry transaction and pump.fun bonding-curve reads. Nothing here holds a key.
const L = require('./_lib');
const C = require('./_cfg');
// web3.js loads lazily, so pages that only read never depend on it
let W3 = null;
const w3 = () => W3 || (W3 = require('@solana/web3.js'));
const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const INITIAL_REAL_TOKENS = 793100000n * 1000000n; // pump.fun curve: tokens sold before graduation
const curvePda = mint => { const W = w3(); return W.PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), mint.toBuffer()], new W.PublicKey(PUMP))[0]; };

// tx 1 of a launch: a memo "so:v1:<mint>:<personaCid>" plus a 0-lamport self-transfer that carries the
// read-only REG key and the mint, so getSignaturesForAddress(REG) and (mint) both find it.
// Built by hand as a legacy transaction (no web3.js needed on the server); the wallet signs it as usual.
const b58 = () => { const m = require('bs58'); return m.default || m; };
function cu16(n) { const out = []; for (;;) { let b = n & 0x7f; n >>= 7; if (n) { out.push(b | 0x80); } else { out.push(b); return Buffer.from(out); } } }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function u64(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
async function regTx({ wallet, mint, personaCid, blockhash }) {
  const B = b58();
  const keys = [wallet, 'ComputeBudget111111111111111111111111111111', MEMO, '11111111111111111111111111111111', C.REG, mint].map(k => Buffer.from(B.decode(k)));
  if (keys.some(k => k.length !== 32)) throw new Error('bad key');
  const ix = (prog, accts, data) => Buffer.concat([Buffer.from([prog]), cu16(accts.length), Buffer.from(accts), cu16(data.length), data]);
  const ixs = [
    ix(1, [], Buffer.concat([Buffer.from([2]), u32(40000)])),               // set compute unit limit
    ix(1, [], Buffer.concat([Buffer.from([3]), u64(200000)])),              // set compute unit price (micro-lamports)
    ix(2, [], Buffer.from(C.MEMO_PREFIX + mint + ':' + (personaCid || '-'), 'utf8')), // memo
    ix(3, [0, 0, 4, 5], Buffer.concat([u32(2), u64(0)])),                 // 0-lamport self-transfer + REG + mint (read-only)
  ];
  const msg = Buffer.concat([Buffer.from([1, 0, 5]), cu16(keys.length), ...keys, Buffer.from(B.decode(blockhash)), cu16(ixs.length), ...ixs]);
  const tx = Buffer.concat([cu16(1), Buffer.alloc(64), msg]);
  if (tx.length > 1232) throw new Error('registry transaction too large');
  return tx.toString('base64');
}
async function blockhash() { const r = await L.rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]); return r.value.blockhash; }

function decodeCurve(data) {
  const b = Buffer.from(data, 'base64');
  if (b.length < 81) return null;
  const realTok = b.readBigUInt64LE(24), realSol = b.readBigUInt64LE(32);
  const complete = b[48] === 1;
  const sold = INITIAL_REAL_TOKENS > realTok ? INITIAL_REAL_TOKENS - realTok : 0n;
  const progress = complete ? 1 : Math.max(0, Math.min(1, Number(sold * 10000n / INITIAL_REAL_TOKENS) / 10000));
  let creator = null; try { creator = b58().encode(b.subarray(49, 81)); } catch (e) { }
  return { complete, progress, creator, realSol: Number(realSol) / 1e9 };
}
// bonding-curve state for many mints in batched reads
async function curves(mints) {
  const out = {};
  const ok = mints.filter(m => L.B58.test(m));
  for (let i = 0; i < ok.length; i += 100) {
    const part = ok.slice(i, i + 100);
    try {
      const W = w3();
      const r = await L.rpc('getMultipleAccounts', [part.map(m => curvePda(new W.PublicKey(m)).toBase58()), { encoding: 'base64', commitment: 'confirmed' }]);
      (r.value || []).forEach((a, j) => { if (a) out[part[j]] = decodeCurve(a.data[0]); });
    } catch (e) { }
  }
  return out;
}
// how many tokens of `mint` a wallet holds (raw units summed over its token accounts, both token programs)
async function holding(wallet, mint) {
  // the mint filter finds the accounts whichever token program the mint uses
  const r = await L.rpc('getTokenAccountsByOwner', [wallet, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  let total = 0;
  for (const a of (r && r.value) || []) { const amt = a.account.data.parsed.info.tokenAmount; total += Number(amt.uiAmount || 0); }
  return total;
}
module.exports = { regTx, blockhash, decodeCurve, curves, holding, curvePda, INITIAL_REAL_TOKENS };
