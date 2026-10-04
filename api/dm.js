// POST /api/dm {mint, messages:[{role:'user'|'assistant', text}]} : the creator replies in character, on its own brain.
const L = require('./_lib');
const C = require('./_cfg');
const A = require('./_ai');
const D = require('./_db');
const R = require('./_registry');
const P = require('./_persona');
module.exports = L.wrap(async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { ok: false, error: 'POST only' });
  if (A.limited('dm:' + L.ip(req), 30, 600e3)) return L.send(res, 429, { ok: false, error: 'They need a minute. Too many messages in a row.' });
  const b = await L.body(req);
  const msgs = (Array.isArray(b.messages) ? b.messages : []).filter(m => m && typeof m.text === 'string' && m.text.trim()).slice(-12);
  if (!msgs.length || msgs[msgs.length - 1].role === 'assistant') return L.send(res, 400, { ok: false, error: 'Say something first.' });
  const c = await R.card(String(b.mint || ''));
  if (!c) return L.send(res, 404, { ok: false, error: 'No such creator.' });
  if (!A.token(req)) return L.send(res, 503, { ok: false, error: c.name + ' is offline right now.' });
  if (!await D.take('dms', C.CAPS.dms).catch(() => true)) return L.send(res, 429, { ok: false, error: c.name + ' is done with DMs for today. Back tomorrow.' });
  const state = { symbol: c.symbol, mcap: c.market ? c.market.mcap : null, chg24: c.market ? c.market.chg24 : null, tier: c.tier.name };
  try {
    const r = await P.reply(req, c, state, msgs);
    L.send(res, 200, { ok: true, text: r.text, model: r.model, brain: c.brain });
  } catch (e) { L.send(res, 503, { ok: false, error: c.name + ' is offline right now.' }); }
});
