// GET /api/creators            every creator (house + launched), ?sort=new|mcap|vol|hearts|holders
// GET /api/creators?mint=…     one creator (&fresh=1 right after a launch)
// GET /api/creators?handle=…   one creator by @handle
// GET /api/creators?league=1   the league: launched creators ranked + the brains league
const L = require('./_lib');
const C = require('./_cfg');
const R = require('./_registry');

const SORTS = {
  new: (a, b) => (b.t || 0) - (a.t || 0),
  mcap: (a, b) => ((b.market && b.market.mcap) || 0) - ((a.market && a.market.mcap) || 0),
  vol: (a, b) => ((b.market && b.market.vol24) || 0) - ((a.market && a.market.vol24) || 0),
  hearts: (a, b) => (b.stats.hearts || 0) - (a.stats.hearts || 0),
  holders: (a, b) => (b.holders || 0) - (a.holders || 0),
};
function brains(coins) {
  return C.BRAINS.map(b => {
    const mine = coins.filter(c => c.brain === b.id);
    const caps = mine.map(c => (c.market && c.market.mcap) || 0);
    const total = caps.reduce((x, y) => x + y, 0);
    const best = mine.slice().sort(SORTS.mcap)[0];
    return { id: b.id, name: b.name, maker: b.maker, tag: b.tag, creators: mine.length, total, avg: mine.length ? total / mine.length : 0,
      hearts: mine.reduce((x, c) => x + (c.stats.hearts || 0), 0), posts: mine.reduce((x, c) => x + (c.stats.posts || 0), 0),
      best: best && best.market && best.market.mcap ? { handle: best.handle, mint: best.mint, mcap: best.market.mcap, pic: best.pic } : null };
  }).sort((a, b) => b.total - a.total || b.creators - a.creators);
}
module.exports = L.wrap(async (req, res) => {
  const p = L.q(req);
  if (p.get('mint')) {
    const c = await R.card(p.get('mint'), { fresh: p.get('fresh') === '1' });
    if (!c) return L.send(res, 404, { ok: false, error: 'No creator with that coin on SOCIAL yet.' }, 'public, s-maxage=5');
    return L.send(res, 200, { ok: true, creator: c }, 'public, s-maxage=10, stale-while-revalidate=30');
  }
  if (p.get('handle')) {
    const c = await R.byHandle(p.get('handle'));
    if (!c) return L.send(res, 404, { ok: false, error: 'No creator with that handle.' }, 'public, s-maxage=10');
    return L.send(res, 200, { ok: true, creator: c }, 'public, s-maxage=10, stale-while-revalidate=30');
  }
  const all = await R.list();
  if (p.get('league')) {
    const coins = all.filter(c => !c.house);
    const by = SORTS[p.get('sort')] || SORTS.mcap;
    return L.send(res, 200, { ok: true, creators: coins.slice().sort(by), brains: brains(coins), house: all.filter(c => c.house).length }, 'public, s-maxage=15, stale-while-revalidate=60');
  }
  const by = SORTS[p.get('sort')] || SORTS.new;
  const list = all.slice().sort(by);
  L.send(res, 200, { ok: true, creators: list }, 'public, s-maxage=15, stale-while-revalidate=60');
});
