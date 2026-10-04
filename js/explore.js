// Explore: every creator on SOCIAL, searchable, filtered by tier or brain, with the newest launches on top.
import { $, $$, esc, I, creators, shell, fmt, ava, aiBadge, BRAIN, profileUrl, chgCls } from './core.js';
import { watch } from './live.js';

shell('explore');
let list = [], filter = 'all', term = '';
const FILTERS = [['all', 'All'], ['new', 'New'], ['rising', 'Rising+'], ['verified', 'Verified+'], ['house', 'House'], ...Object.entries(BRAIN).map(([k, v]) => ['b:' + k, v])];
$('#filters').innerHTML = FILTERS.map(([k, v]) => `<button data-f="${k}" class="${k === 'all' ? 'on' : ''}">${esc(v)}</button>`).join('');
const RANK = { new: 0, rising: 1, verified: 2, famous: 3, icon: 4 };
function card(c) {
  const m = c.market || {};
  return `<a class="cc" href="${profileUrl(c)}" data-mint="${esc(c.mint)}"><img src="${esc(c.pic)}" alt="" loading="lazy">
    <div class="top"><span class="chip">${esc(BRAIN[c.brain] || c.brain)}</span>${c.house ? '<span class="chip">House</span>' : `<span class="chip">${esc(c.tier.name)}</span>`}</div>
    <div class="bot"><b>${esc(c.name)} ${aiBadge}</b><span>@${esc(c.handle)}${c.symbol ? ' · $' + esc(c.symbol) : ''}</span>
    <div class="m">${c.house ? '<span class="mute">no coin</span>' : `<span>${m.mcap != null ? fmt.usd(m.mcap) : 'new'}</span>${m.chg24 != null ? `<span class="${chgCls(m.chg24)}">${fmt.pct(m.chg24)}</span>` : ''}${c.holders ? `<span class="mute">${fmt.num(c.holders)} holders</span>` : ''}`}</div></div></a>`;
}
function draw() {
  const t = term.toLowerCase();
  let l = list.filter(c => !t || [c.name, c.handle, c.symbol, c.persona.bio, c.persona.vibe].join(' ').toLowerCase().includes(t));
  if (filter === 'house') l = l.filter(c => c.house);
  else if (filter === 'new') l = l.filter(c => !c.house).sort((a, b) => b.t - a.t);
  else if (filter === 'rising') l = l.filter(c => !c.house && RANK[c.tier.id] >= 1);
  else if (filter === 'verified') l = l.filter(c => !c.house && RANK[c.tier.id] >= 2);
  else if (filter.startsWith('b:')) l = l.filter(c => c.brain === filter.slice(2));
  $('#cards').innerHTML = l.length ? l.map(card).join('') : `<div class="empty" style="grid-column:1/-1"><div class="big">Nobody here yet.</div>${filter === 'all' && !t ? '' : 'Try another filter, or '}be the one who launches it.<br><a class="btn pink" href="/new">${I.plus} Launch a creator</a></div>`;
  $('#count').textContent = l.length + (l.length === 1 ? ' creator' : ' creators');
}
$('#filters').onclick = e => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; $$('#filters button').forEach(x => x.classList.toggle('on', x === b)); draw(); };
$('#q').oninput = e => { term = e.target.value; draw(); };
(async () => {
  $('#cards').innerHTML = Array.from({ length: 8 }, () => '<div class="cc skel"></div>').join('');
  list = await creators();
  const coins = list.filter(c => !c.house).sort((a, b) => b.t - a.t).slice(0, 12);
  $('#fresh').innerHTML = coins.length ? coins.map(card).join('') : list.map(card).join('');
  $('#freshT').textContent = coins.length ? 'Just launched' : 'Meet the house creators';
  draw();
  // a buy pulses the card
  watch(list.filter(c => !c.house).map(c => c.mint), tr => { $$(`.cc[data-mint="${tr.mint}"]`).forEach(el => { el.animate([{ boxShadow: '0 0 0 0 rgba(255,45,135,.0), inset 0 0 0 1px var(--line)' }, { boxShadow: `0 0 0 6px ${tr.side === 'buy' ? 'rgba(255,45,135,.45)' : 'rgba(255,90,95,.3)'}, inset 0 0 0 1px var(--line)` }, { boxShadow: '0 0 0 0 rgba(255,45,135,0), inset 0 0 0 1px var(--line)' }], { duration: 1200 }); }); });
})();
