// SOCIAL on-chain helpers: the registry transaction and pump.fun bonding-curve reads. Nothing here holds a key.
const W = require('@solana/web3.js');
const L = require('./_lib');
const C = require('./_cfg');

const PUMP_ID = new W.PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const MEMO = new W.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const INITIAL_REAL_TOKENS = 793100000n * 1000000n; // pump.fun curve: tokens sold before graduation
const curvePda = mint => W.PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), mint.toBuffer()], PUMP_ID)[0];

// tx 1 of a launch: a memo "so:v1:<mint>:<personaCid>" plus a 0-lamport self-transfer that carries the
// read-only REG key and the mint, so getSignaturesForAddress(REG) and (mint) both find it.
async function regTx({ wallet, mint, personaCid, blockhash }) {
  const f = new W.PublicKey(wallet), m = new W.PublicKey(mint);
  const t = W.SystemProgram.transfer({ fromPubkey: f, toPubkey: f, lamports: 0 });
  t.keys.push({ pubkey: new W.PublicKey(C.REG), isSigner: false, isWritable: false }, { pubkey: m, isSigner: false, isWritable: false });
  const ixs = [
    W.ComputeBudgetProgram.setComputeUnitLimit({ units: 40000 }),
    W.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
    new W.TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from(C.MEMO_PREFIX + mint + ':' + (personaCid || '-'), 'utf8') }),
    t,
  ];
  const msg = new W.TransactionMessage({ payerKey: f, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  return Buffer.from(new W.VersionedTransaction(msg).serialize()).toString('base64');
}
async function blockhash() { const r = await L.rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]); return r.value.blockhash; }

function decodeCurve(data) {
  const b = Buffer.from(data, 'base64');
  if (b.length < 81) return null;
  const realTok = b.readBigUInt64LE(24), realSol = b.readBigUInt64LE(32);
  const complete = b[48] === 1;
  const sold = INITIAL_REAL_TOKENS > realTok ? INITIAL_REAL_TOKENS - realTok : 0n;
  const progress = complete ? 1 : Math.max(0, Math.min(1, Number(sold * 10000n / INITIAL_REAL_TOKENS) / 10000));
  return { complete, progress, creator: new W.PublicKey(b.subarray(49, 81)).toBase58(), realSol: Number(realSol) / 1e9 };
}
// bonding-curve state for many mints in batched reads
async function curves(mints) {
  const out = {};
  const ok = mints.filter(m => L.B58.test(m));
  for (let i = 0; i < ok.length; i += 100) {
    const part = ok.slice(i, i + 100);
    try {
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
module.exports = { regTx, blockhash, decodeCurve, curves, holding, curvePda };
