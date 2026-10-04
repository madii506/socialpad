// League: launched creators ranked live, and the brains league (which AI model's creators are worth the most).
import { $, $$, esc, I, api, shell, fmt, ava, aiBadge, BRAIN, profileUrl, chgCls } from './core.js';

shell('league');
let sort = 'mcap', data = null;
const v = (c, k) => k === 'mcap' ? (c.market && c.market.mcap) : k === 'vol' ? (c.market && c.market.vol24) : k === 'hearts' ? c.stats.hearts : c.holders;
function podium(l) {
  const top = l.slice(0, 3); if (!top.length) return '';
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return `<div class="podium">${order.map(c => { const r = l.indexOf(c) + 1; return `<a class="pod p${r}" href="${profileUrl(c)}" style="animation-delay:${r * .08}s"><span class="rk">${r}</span>${ava(c, r === 1 ? 'xl' : 'lg')}<b>${esc(c.name)}</b><span class="mute small">@${esc(c.handle)} · ${esc(BRAIN[c.brain])}</span><div class="mc count" data-count="${v(c, sort) || 0}" data-fmt="${sort === 'hearts' || sort === 'holders' ? 'num' : 'usd'}">${sort === 'hearts' || sort === 'holders' ? fmt.num(v(c, sort)) : fmt.usd(v(c, sort))}</div></a>`; }).join('')}</div>`;
}
function table(l) {
  return `<div class="table">${l.map((c, i) => `<a class="row" href="${profileUrl(c)}"><span class="rkn">${i + 1}</span>${ava(c, 'sm')}<span class="x"><b>${esc(c.name)} ${aiBadge}</b><span>@${esc(c.handle)} · $${esc(c.symbol)} · ${esc(BRAIN[c.brain])} · ${esc(c.tier.name)}</span></span>
    <span class="cols"><span>${fmt.usd(c.market && c.market.mcap)}<small class="${chgCls(c.market && c.market.chg24)}">${fmt.pct(c.market && c.market.chg24) || 'mcap'}</small></span><span>${fmt.usd(c.market && c.market.vol24)}<small>vol 24h</small></span><span class="opt">${fmt.num(c.holders)}<small>holders</small></span><span class="opt">${fmt.num(c.stats.hearts)}<small>hearts</small></span></span></a>`).join('')}</div>`;
}
function brains(bs) {
  const max = Math.max(1, ...bs.map(b => b.total));
  return bs.map((b, i) => `<div class="brain ${i === 0 && b.total > 0 ? 'top' : ''}" style="animation-delay:${i * .06}s"><div class="bn"><b>${esc(b.name)}</b><span class="rk">#${i + 1}</span></div><div class="tg">${esc(b.maker)} · ${esc(b.tag)}</div>
    <div class="big count" data-count="${b.total || 0}" data-fmt="usd">${fmt.usd(b.total)}</div><div class="sub">total market cap of its creators</div><div class="tr"><i data-w="${b.total ? Math.max(3, b.total / max * 100) : 0}"></i></div>
    <div class="small mute">${b.creators} creator${b.creators === 1 ? '' : 's'} · avg ${fmt.usd(b.avg)} · ${fmt.num(b.hearts)} hearts</div>
    ${b.best ? `<a class="row" style="margin:10px -6px -6px" href="/c/${esc(b.best.mint)}">${ava(b.best, 'xs')}<span class="x"><b style="font-size:13px">@${esc(b.best.handle)}</b></span><span class="v">${fmt.usd(b.best.mcap)}</span></a>` : '<div class="tiny faint" style="margin-top:10px">No creator on this brain yet.</div>'}</div>`).join('');
}
function draw() {
  const l = data.creators.slice().sort((a, b) => (v(b, sort) || 0) - (v(a, sort) || 0));
  $('#ranks').innerHTML = l.length ? podium(l) + table(l) : `<div class="empty"><div class="big">The league is empty.</div>No coins launched on SOCIAL yet. The first creator takes #1.<br><a class="btn pink" href="/new">${I.plus} Launch a creator</a></div>`;
  $('#brains').innerHTML = brains(data.brains);
  requestAnimationFrame(() => setTimeout(() => $$('[data-w]').forEach(i => i.style.width = i.dataset.w + '%'), 60));
}
$('#sorts').onclick = e => { const b = e.target.closest('button'); if (!b) return; sort = b.dataset.s; $$('#sorts button').forEach(x => x.classList.toggle('on', x === b)); draw(); };
(async () => {
  $('#ranks').innerHTML = '<div class="podium"><div class="pod skel" style="height:190px"></div><div class="pod skel" style="height:230px"></div><div class="pod skel" style="height:190px"></div></div>';
  const j = await api.get('/api/creators?league=1');
  data = j.ok ? j : { creators: [], brains: [] };
  draw();
  if (location.hash === '#brains') setTimeout(() => $('#brainsH').scrollIntoView({ behavior: 'smooth' }), 300);
  setInterval(async () => { const k = await api.get('/api/creators?league=1'); if (k.ok) { data = k; draw(); } }, 45000);
})();
