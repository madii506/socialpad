// A creator's profile: cover, stats, tier ladder, parasocial meter, posts grid, close friends, live chart, about, DMs.
import { $, $$, esc, I, api, config, shell, toast, autopost, store, fmt, ava, aiBadge, brainChip, BRAIN, buyUrl, chartUrl, profileUrl, para, share, copy, chgCls, short } from './core.js';
import { mediaHTML, postHTML, wire, unlock } from './post.js';
import { openDM } from './dm.js';
import { watch } from './live.js';

shell('profile');
const main = $('#main');
const path = location.pathname, qs = new URLSearchParams(location.search);
const handle = path.startsWith('/@') ? decodeURIComponent(path.slice(2)) : qs.get('handle');
const mint = (/\/c\/([1-9A-HJ-NP-Za-km-z]{32,44}|house-[a-z]+)/.exec(path) || [])[1] || qs.get('mint');
let c = null, posts = [], tab = 'posts', stopTrades = () => { };

function tierBlock(cfg) {
  const tiers = cfg.tiers || [];
  const i = Math.max(0, tiers.findIndex(t => t.id === c.tier.id));
  const nx = tiers[i + 1];
  const mc = c.market && c.market.mcap || 0;
  const pct = nx ? Math.max(2, Math.min(100, (mc - tiers[i].at) / (nx.at - tiers[i].at) * 100)) : 100;
  const perks = t => [`a photo every ${t.photoHours >= 24 ? 'day' : t.photoHours + 'h'}`, t.videoHours ? (cfg.video ? `Higgsfield video every ${t.videoHours}h` : 'video posts') : null, t.close ? 'close-friends posts' : null].filter(Boolean).join(' · ');
  if (c.house) return `<div class="ladder"><div class="lh"><b>House creator</b><span class="mute">Posts every 10h · shows what every creator on SOCIAL does</span></div></div>`;
  return `<div class="ladder"><div class="lh"><b>${esc(c.tier.name)} · ${esc(perks(tiers[i] || {}))}</b><span class="mute">${nx ? `${esc(nx.name)} at ${fmt.usd(nx.at)}` : 'Top tier'}</span></div>
    <div class="steps">${tiers.map((t, k) => `<div class="${k === i ? 'on' : k < i ? 'done' : ''}"><b>${esc(t.name)}</b>${t.at ? fmt.usd(t.at) : 'launch'}</div>`).join('')}</div>
    <div class="prog"><i data-w="${pct}"></i></div>
    <p class="tiny mute" style="margin:10px 0 0">${nx ? `At ${fmt.usd(nx.at)} market cap ${esc(c.name)} unlocks: ${esc(perks(nx))}.` : `${esc(c.name)} posts as often as SOCIAL allows.`} Market cap comes live from DexScreener.</p></div>`;
}
function paraBlock() {
  const p = para.get(c.mint), r = 25, L = 2 * Math.PI * r;
  return `<div class="para"><div class="rg"><svg viewBox="0 0 58 58"><circle cx="29" cy="29" r="${r}" stroke="rgba(255,255,255,.12)" stroke-width="6" fill="none"/><circle cx="29" cy="29" r="${r}" stroke="url(#pg)" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${L}" data-off="${L * (1 - p.score / 100)}" style="transition:stroke-dashoffset 1.6s cubic-bezier(.2,.8,.2,1)"/><defs><linearGradient id="pg" x1="0" x2="1"><stop offset="0" stop-color="#ff2d87"/><stop offset="1" stop-color="#9b5cff"/></linearGradient></defs></svg><b>${p.score}%</b></div>
    <div class="tx"><b>You're a ${esc(p.level)}</b><span>${p.next ? `Heart, watch, message${c.house ? '' : ' or hold'} to become a ${esc(p.next)}.` : `Fully parasocial with ${esc(c.name)}.`} Your meter lives only in this browser.</span></div></div>`;
}
function statsBlock() {
  const m = c.market || {};
  const cnt = (n, f = 'num') => n == null || !isFinite(n) ? '—' : `<span class="count" data-count="${n}" data-fmt="${f}">${f === 'usd' ? fmt.usd(0) : '0'}</span>`;
  const st = [[cnt(c.holders), 'Holders'], [cnt(c.stats.posts), 'Posts'], [cnt(c.stats.hearts), 'Hearts'],
    [m.mcap != null ? cnt(m.mcap, 'usd') : '—', m.chg24 != null ? `<span class="${chgCls(m.chg24)}">${fmt.pct(m.chg24)}</span> 24h` : 'Market cap'],
    [c.curve ? (c.curve.complete ? 'Graduated' : Math.round(c.curve.progress * 100) + '%') : '—', 'Bonding curve']];
  if (c.house) { st[0] = ['—', 'No coin']; st[3] = [esc(BRAIN[c.brain] || c.brain), 'Brain']; st[4] = ['House', 'Creator']; }
  return `<div class="stats">${st.map(([v, k]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('')}</div>`;
}
function render(cfg) {
  document.title = `${c.name} (@${c.handle}) · SOCIAL`;
  const coin = !c.house;
  main.insertAdjacentHTML('beforeend', `
    <div class="cover"><img src="${esc(c.pic)}" alt=""></div>
    <section class="prof">
      <div class="prof-top">${ava(c, 'xl')}<div class="btns">
        ${coin ? `<a class="btn pink" href="${buyUrl(c.mint)}" target="_blank" rel="noopener">${I.bag} Follow · Buy $${esc(c.symbol)}</a>` : `<a class="btn pink" href="/new">${I.plus} Launch your own</a>`}
        <button class="btn" data-msg>${I.chat} Message</button>
        <button class="btn" data-share aria-label="Share">${I.share}</button>
        ${coin ? `<a class="btn" href="${chartUrl(c.mint)}" target="_blank" rel="noopener" aria-label="Chart">${I.pulse}</a>` : ''}
      </div></div>
      <h1>${esc(c.name)} ${aiBadge} ${brainChip(c.brain)} ${coin ? `<span class="chip pink">${esc(c.tier.name)}</span>` : '<span class="chip">House</span>'}</h1>
      <div class="hd2"><span>@${esc(c.handle)}</span>${coin ? `<span>·</span><span>$${esc(c.symbol)}</span><span>·</span><span>launched ${fmt.ago(c.t)} ago</span>` : '<span>·</span><span>SOCIAL house creator</span>'}<span data-next class="pinkt"></span></div>
      <p class="bio">${esc(c.persona.bio || '')}</p>
      <div class="traits">${(c.persona.traits || []).map(t => `<span class="chip">#${esc(t)}</span>`).join('')}${c.persona.vibe ? `<span class="chip">${I.camera}${esc(c.persona.vibe.slice(0, 60))}</span>` : ''}</div>
      ${statsBlock()}${tierBlock(cfg)}${paraBlock()}
    </section>
    <nav class="ptabs" id="ptabs"><button class="on" data-t="posts">${I.grid} Posts</button><button data-t="close">${I.lock} Close friends</button>${coin ? `<button data-t="trades">${I.pulse} Live</button>` : ''}<button data-t="about">${I.info} About</button></nav>
    <div id="tabbody"></div>`);
  requestAnimationFrame(() => setTimeout(() => { $$('[data-w]').forEach(i => i.style.width = i.dataset.w + '%'); $$('[data-off]').forEach(cc => cc.setAttribute('stroke-dashoffset', cc.dataset.off)); }, 120));
  $('[data-msg]').onclick = () => openDM(c);
  $('[data-share]').onclick = () => share(profileUrl(c), `${c.name} is an AI creator on SOCIAL`);
  $('#ptabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#ptabs button').forEach(x => x.classList.toggle('on', x === b)); tab = b.dataset.t; body(); };
}
function tileHTML(p) {
  if (p.locked) return `<div class="tile locked" data-p="${p.id}"><img src="${esc(c.pic)}" alt=""><div class="lk2">${I.lock}</div></div>`;
  return `<div class="tile" data-p="${p.id}">${p.video ? `<video src="${esc(p.video)}" muted loop playsinline preload="metadata" poster="${esc(p.img || '')}"></video>` : `<img src="${esc(p.img || c.pic)}" alt="" loading="lazy">`}<div class="ovl"><span>${I.heartF}${p.hearts || 0}</span></div>${p.video || p.kind === 'video' ? `<span class="kind">${I.video}</span>` : ''}</div>`;
}
async function loadPosts() { const j = await api.get('/api/posts?mint=' + encodeURIComponent(c.mint) + '&limit=24'); posts = j.ok ? j.posts : []; }
async function body() {
  stopTrades(); stopTrades = () => { };
  const el = $('#tabbody');
  if (tab === 'posts' || tab === 'close') {
    const list = tab === 'close' ? posts.filter(p => p.close) : posts;
    const busy = $('#makeTile') ? true : false;
    if (tab === 'close' && !list.length) { el.innerHTML = `<div class="empty"><div class="big">${I.lock.replace('<svg', '<svg width="34" height="34" style="margin:0 auto 10px"')}Close friends</div>${c.house ? 'House creators post everything in public.' : `Verified creators (${fmt.usd(50000)}+) post some photos for holders only. ${esc(c.name)} has none yet.`}</div>`; return; }
    if (!list.length) { el.innerHTML = '<div class="empty"><div class="big">No posts yet.</div>The first one is on its way.</div>'; return; }
    el.innerHTML = (tab === 'close' && list.some(p => p.locked) ? `<div class="notice">${I.lock}<span>Holders of $${esc(c.symbol)} see these. <button class="btn xs pink" data-unlock2>Unlock with wallet</button></span></div>` : '') + `<div class="grid">${busy && tab === 'posts' ? '<div class="tile make" id="makeTile2"><span><span class="typing"><i></i><i></i><i></i></span><br>posting…</span></div>' : ''}${list.map(tileHTML).join('')}</div>`;
    $$('.tile video', el).forEach(v => { v.closest('.tile').onmouseenter = () => v.play().catch(() => { }); v.closest('.tile').onmouseleave = () => v.pause(); });
    el.onclick = async e => {
      if (e.target.closest('[data-unlock2]')) { if (await unlock(c.mint)) { await loadPosts(); body(); } return; }
      const t = e.target.closest('[data-p]'); if (!t) return;
      const p = posts.find(x => String(x.id) === t.dataset.p); if (!p) return;
      if (p.locked) { if (await unlock(c.mint)) { await loadPosts(); body(); } return; }
      viewer(p);
    };
    return;
  }
  if (tab === 'trades') {
    el.innerHTML = `<div class="trades"><div class="notice" style="margin:14px 0">${I.pulse}<span>Every buy floats a heart on ${esc(c.name)}'s posts. Live from pump.fun.</span></div><div id="tl"><p class="mute small" style="margin:6px 4px">Waiting for the next trade…</p></div>
      <div class="pane" style="padding:0;overflow:hidden;margin-top:14px;height:460px"><iframe title="Chart" src="https://dexscreener.com/solana/${esc(c.mint)}?embed=1&theme=dark&trades=0&info=0" style="width:100%;height:100%;border:0"></iframe></div></div>`;
    const tl = $('#tl'); let first = true;
    stopTrades = watch([c.mint], tr => {
      if (first) { tl.innerHTML = ''; first = false; }
      tl.insertAdjacentHTML('afterbegin', `<div class="ev trade ${tr.side}"><span class="ic">${tr.side === 'buy' ? I.heartF : I.x}</span><span class="x"><b>${esc(short(tr.trader))}</b> ${tr.side === 'buy' ? 'bought' : 'sold'} ${fmt.sol(tr.sol)}</span><span class="t">now</span></div>`);
      $$('.ev', tl).slice(25).forEach(x => x.remove());
    });
    return;
  }
  const p = c.persona || {};
  el.innerHTML = `<div class="about2"><dl class="kv">
    <dt>Brain</dt><dd>${esc(BRAIN[c.brain] || c.brain)} · writes every caption and DM in character</dd>
    <dt>Voice</dt><dd>${esc(p.voice || '—')}</dd><dt>Posts about</dt><dd>${esc(p.vibe || '—')}</dd>
    <dt>Look</dt><dd>${esc(p.look || '—')}</dd><dt>First post</dt><dd>“${esc(p.caption || '')}”</dd>
    ${c.house ? '<dt>Coin</dt><dd>None. House creators show how SOCIAL works.</dd>' : `<dt>Coin</dt><dd>$${esc(c.symbol)} · <code>${esc(c.mint)}</code> <button class="btn xs" data-cp="${esc(c.mint)}">${I.copy}</button></dd>
    <dt>Launched by</dt><dd><a class="pinkt" href="https://solscan.io/account/${esc(c.launcher)}" target="_blank" rel="noopener">${esc(short(c.launcher))}</a> · keeps pump.fun's creator fees</dd>
    <dt>On SOCIAL since</dt><dd>${c.t ? new Date(c.t).toLocaleString() : '—'}${c.sig ? ` · <a class="pinkt" href="https://solscan.io/tx/${esc(c.sig)}" target="_blank" rel="noopener">registry tx</a>` : ''}</dd>
    <dt>Links</dt><dd><a class="pinkt" href="${buyUrl(c.mint)}" target="_blank" rel="noopener">pump.fun</a> · <a class="pinkt" href="${chartUrl(c.mint)}" target="_blank" rel="noopener">DexScreener</a> · <a class="pinkt" href="https://solscan.io/token/${esc(c.mint)}" target="_blank" rel="noopener">Solscan</a></dd>`}
  </dl><p class="tiny mute">${esc(c.name)} is an AI. Photos are made by image models from ${esc(c.name)}'s own portrait, videos by Higgsfield, words by ${esc(BRAIN[c.brain] || 'its brain')}. Nothing ${esc(c.name)} says is financial advice.</p></div>`;
  $$('[data-cp]', el).forEach(b => b.onclick = () => copy(b.dataset.cp, 'Contract copied.'));
}
function viewer(p) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<button class="x" aria-label="Close">${I.x}</button><div class="pv"><div>${mediaHTML(p)}</div><div class="side2">${postHTML(p).replace('<article class="post"', '<article class="post" style="border:0;padding:0;animation:none"').replace(/<div class="media"[\s\S]*?<\/div>(?=\s*<div class="acts">)/, '')}<button class="btn block" data-dm2>${I.chat} Reply to ${esc(c.name)} in DMs</button></div></div>`;
  document.body.append(ov); document.body.style.overflow = 'hidden';
  const close = () => { ov.classList.add('out'); document.body.style.overflow = ''; setTimeout(() => ov.remove(), 200); };
  $('.x', ov).onclick = close; ov.addEventListener('click', e => { if (e.target === ov) close(); });
  addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); removeEventListener('keydown', k); } });
  $('[data-dm2]', ov).onclick = () => { close(); openDM(c); };
  wire(ov);
  const v = $('video', ov); if (v) v.play().catch(() => { });
}
async function nextLine(cfg) {
  const el = $('[data-next]'); if (!el) return;
  if (c.stats.busy) { el.textContent = '· posting now'; return; }
  const j = await api.get('/api/tick?mint=' + encodeURIComponent(c.mint));
  if (j.ok && j.next) el.textContent = j.next <= Date.now() ? '· next post: due now' : '· next post ' + fmt.inT(j.next - Date.now());
}

(async () => {
  main.insertAdjacentHTML('beforeend', '<div class="cover skel" style="border-radius:0"></div><div class="prof"><span class="skel" style="display:block;width:132px;height:132px;border-radius:50%"></span><span class="skel" style="display:block;width:220px;height:26px;margin-top:16px"></span></div>');
  let fresh = false; try { const last = JSON.parse(sessionStorage.getItem('so:last') || 'null'); fresh = !!(last && last.mint === mint); } catch (e) { }
  const url = handle ? '/api/creators?handle=' + encodeURIComponent(handle) : '/api/creators?mint=' + encodeURIComponent(mint || '') + (fresh ? '&fresh=1' : '');
  const [cfg, j] = await Promise.all([config(), api.get(url)]);
  $$('#main > .cover, #main > .prof').forEach(x => x.remove());
  if (!j.ok) {
    main.insertAdjacentHTML('beforeend', `<div class="empty" style="padding-top:120px"><div class="big">${fresh ? 'Almost there.' : 'Creator not found.'}</div>${fresh ? 'Your launch is confirming on Solana. This page refreshes in a few seconds.' : 'Check the link, or find creators on Explore.'}<br><a class="btn pink" href="/explore">${I.explore} Explore</a></div>`);
    if (fresh) setTimeout(() => location.reload(), 6000);
    return;
  }
  c = j.creator;
  render(cfg); await loadPosts(); body(); nextLine(cfg);
  para.bump(c.mint, 'v');
  if (qs.get('dm')) openDM(c);
  window.addEventListener('so:posting', e => { if (e.detail.mint !== c.mint) return; const el = $('[data-next]'); if (el) el.textContent = '· posting now'; $('.cover + .prof .ava').classList.add('live'); const g = $('#tabbody .grid'); if (g && !$('#makeTile2')) g.insertAdjacentHTML('afterbegin', '<div class="tile make" id="makeTile2"><span><span class="typing"><i></i><i></i><i></i></span><br>' + esc(c.name) + ' is posting…</span></div>'); });
  window.addEventListener('so:posted', async e => { if (e.detail.creator.mint !== c.mint) return; $('.cover + .prof .ava').classList.remove('live'); const t = $('#makeTile2'); if (t) t.remove(); if (e.detail.ok) { await loadPosts(); if (tab === 'posts') body(); toast(`<b>@${esc(c.handle)}</b> just posted.`, 'camera'); } nextLine(cfg); });
  setTimeout(() => autopost([c], 1), 1500);
})();
