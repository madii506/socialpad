// The post engine. A creator posts when its tier says it is due; the brain plans the shot and writes the caption,
// the photo keeps the creator's face (edit from its portrait), and Verified+ creators also get Higgsfield video.
// POST /api/tick {mint}        lazy: someone is looking at this creator; if it is due, it posts right now
// GET  /api/tick?cron=1        scheduled: up to 3 due creators post, finished videos are collected
// GET  /api/tick?mint=…        when this creator posts next
const L = require('./_lib');
const C = require('./_cfg');
const A = require('./_ai');
const D = require('./_db');
const R = require('./_registry');
const P = require('./_persona');

const tierOf = c => C.TIERS.find(t => t.id === c.tier.id) || C.TIERS[0];
const every = c => c.house ? C.HOUSE_EVERY : tierOf(c).photo;
const videoEvery = c => c.house ? 24 * 3600e3 : tierOf(c).video;

async function claim(q, c) {
  const secs = Math.round(every(c) / 1000);
  const r = await q`UPDATE so_creators SET busy_until = now() + interval '110 seconds'
    WHERE mint = ${c.mint} AND (busy_until IS NULL OR busy_until < now())
      AND (last_post IS NULL OR last_post < now() - make_interval(secs => ${secs})) RETURNING mint`;
  return r.length > 0;
}
async function release(q, c) { try { await q`UPDATE so_creators SET busy_until = NULL WHERE mint = ${c.mint}`; } catch (e) { } }

async function make(req, c, q) {
  if (!await D.take('images', C.CAPS.images)) throw new Error('daily photo budget reached');
  const recent = (await q`SELECT caption FROM so_posts WHERE mint = ${c.mint} AND caption IS NOT NULL ORDER BY created DESC LIMIT 4`).map(r => r.caption);
  const state = { symbol: c.symbol, mcap: c.market ? c.market.mcap : null, chg24: c.market ? c.market.chg24 : null, tier: c.tier.name };
  const plan = await P.plan(req, c, state, recent);
  let img = null;
  try { const ref = await A.fetchImage(L.origin(req) + c.pic); img = await A.edit(req, P.photoPrompt(c, plan.scene), ref); } catch (e) { img = null; }
  if (!img) img = await A.generate(req, `Candid social media photo of ${(c.persona && c.persona.look) || 'a young adult creator'}: ${plan.scene}. Photorealistic, shot on a phone, natural light, vertical 4:5 framing. No text, no logos, no watermark.`);
  const close = !c.house && tierOf(c).close && Math.random() < 0.34;
  const m = await q`INSERT INTO so_media (mint, kind, mime, data) VALUES (${c.mint}, 'image', ${img.mime}, ${img.buf.toString('base64')}) RETURNING id`;
  const mediaId = m[0].id;
  const post = await q`INSERT INTO so_posts (mint, kind, media, caption, scene, close, engine, model)
    VALUES (${c.mint}, 'photo', ${mediaId}, ${plan.caption}, ${plan.scene}, ${close}, ${img.engine}, ${img.model + ' + ' + plan.model}) RETURNING id`;
  await q`UPDATE so_creators SET last_post = now(), posts = posts + 1, busy_until = NULL WHERE mint = ${c.mint}`;
  // video: Higgsfield turns the new photo into a 5-second clip, when this creator's tier allows it
  const ve = videoEvery(c);
  if (A.HF.on() && ve) {
    const due = await q`SELECT 1 FROM so_creators WHERE mint = ${c.mint} AND (last_video IS NULL OR last_video < now() - make_interval(secs => ${Math.round(ve / 1000)}))`;
    if (due.length && await D.take('videos', C.CAPS.videos)) {
      try {
        const src = L.origin(req) + '/api/media?id=' + mediaId + (close ? '&k=' + L.hmac('hf:' + mediaId) : '');
        const job = await A.HF.video(src, plan.motion || 'the person moves naturally and smiles at the camera, handheld phone camera, subtle motion');
        await q`INSERT INTO so_posts (mint, kind, media, caption, scene, close, engine, model, job, status)
          VALUES (${c.mint}, 'video', ${mediaId}, ${plan.caption}, ${plan.motion}, ${close}, 'higgsfield', 'kling-v3.0-turbo', ${job}, 'rendering')`;
        await q`UPDATE so_creators SET last_video = now() WHERE mint = ${c.mint}`;
      } catch (e) { }
    }
  }
  return post[0].id;
}
// finished Higgsfield renders go live (and jump to the top of the feed)
async function collect(q) {
  if (!A.HF.on()) return 0;
  const rows = await q`SELECT id, job, created FROM so_posts WHERE status = 'rendering' AND job IS NOT NULL ORDER BY created ASC LIMIT 6`;
  let n = 0;
  for (const r of rows) {
    try {
      const st = await A.HF.status(r.job);
      if (st.status === 'completed' && st.video) { await q`UPDATE so_posts SET video = ${st.video}, status = 'live', created = now() WHERE id = ${r.id}`; n++; }
      else if (/failed|nsfw|cancel/.test(st.status || '') || Date.now() - +new Date(r.created) > 3 * 3600e3) await q`UPDATE so_posts SET status = 'failed' WHERE id = ${r.id}`;
    } catch (e) { }
  }
  return n;
}
function nextAt(c) { const last = c.stats && c.stats.lastPost; return last ? last + every(c) : Date.now(); }

module.exports = L.wrap(async (req, res) => {
  const p = L.q(req);
  const q = await D.init().catch(() => null);
  if (req.method === 'GET' && p.get('mint')) {
    const c = await R.card(p.get('mint'));
    if (!c) return L.send(res, 404, { ok: false, error: 'not found' });
    return L.send(res, 200, { ok: true, busy: !!c.stats.busy, lastPost: c.stats.lastPost, next: nextAt(c), every: every(c), engine: { ai: !!A.token(req), db: !!q, video: A.HF.on() } }, 'public, s-maxage=10');
  }
  if (!q) return L.send(res, 503, { ok: false, error: 'The post engine needs its database.' });
  if (!A.token(req)) return L.send(res, 503, { ok: false, error: 'The AI studio is offline.' });
  if (req.method === 'GET') {
    const secret = process.env.CRON_SECRET;
    if (!p.get('cron') || (secret && req.headers.authorization !== 'Bearer ' + secret)) return L.send(res, 401, { ok: false, error: 'cron only' });
    const t0 = Date.now();
    const got = await collect(q);
    const all = await R.list({ fresh: true });
    const due = all.filter(c => !c.stats.busy && Date.now() >= nextAt(c)).sort((a, b) => (a.stats.lastPost || 0) - (b.stats.lastPost || 0)).slice(0, 3);
    const done = await Promise.allSettled(due.map(async c => { if (!await claim(q, c)) return null; try { return await make(req, c, q); } catch (e) { await release(q, c); throw e; } }));
    return L.send(res, 200, { ok: true, posted: done.filter(d => d.status === 'fulfilled' && d.value).length, failed: done.filter(d => d.status === 'rejected').map(d => String(d.reason && d.reason.message || d.reason).slice(0, 120)), videos: got, ms: Date.now() - t0 });
  }
  // lazy
  if (A.limited('tick:' + L.ip(req), 12, 3600e3)) return L.send(res, 429, { ok: false, error: 'slow down' });
  const b = await L.body(req);
  await collect(q).catch(() => 0);
  const c = await R.card(String(b.mint || ''));
  if (!c) return L.send(res, 404, { ok: false, error: 'not found' });
  if (!await claim(q, c)) return L.send(res, 200, { ok: true, posted: false, next: nextAt(c) });
  try {
    const id = await make(req, c, q);
    L.forget('registry:');
    return L.send(res, 200, { ok: true, posted: true, id });
  } catch (e) {
    await release(q, c);
    return L.send(res, 503, { ok: false, error: /budget/.test(String(e.message)) ? 'The studio posted all it can for today.' : 'The studio is busy. They will post soon.' });
  }
});
