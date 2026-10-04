// Posts: the card, double-tap hearts, live buy hearts from the chain, video autoplay, close-friends unlock.
import { $, $$, esc, I, fmt, api, ava, aiBadge, brainChip, buyUrl, profileUrl, para, store, toast, share, chgCls, ensureWallet } from './core.js';
import { watch } from './live.js';
import { signText, connected } from './wallet.js';

function engineLine(p) {
  if (p.kind === 'launch') return p.creator && p.creator.house ? 'House creator · intro post' : 'Launch post · the portrait on its coin';
  const [img, txt] = String(p.model || '').split(' + ');
  const nm = s => String(s || '').split('/').pop();
  if (p.kind === 'video') return `Video: Higgsfield · Kling 3.0${txt ? ' · words: ' + esc(nm(txt)) : ''}`;
  return `Photo: ${esc(nm(img) || p.engine || 'AI')}${txt ? ' · words: ' + esc(nm(txt)) : ''}`;
}
export function mediaHTML(p, { tile = false } = {}) {
  const c = p.creator || {};
  if (p.locked) return `<div class="media locked" data-media="${p.id}" data-mint="${esc(p.mint)}"><img src="${esc(c.pic)}" alt=""><div class="lockbox"><div><div class="lk">${I.lock}</div><b>Close friends only</b><p>Holders of $${esc(c.symbol || '')} see this post.</p><button class="btn pink sm" data-unlock="${esc(p.mint)}">${I.lock} Unlock with wallet</button></div></div></div>`;
  const tags = `<div class="tag">${p.kind === 'video' ? `<span class="chip">${I.video} Video</span>` : ''}${p.close ? `<span class="chip">${I.lock} Close friends</span>` : ''}${p.kind === 'launch' ? `<span class="chip">${c.house ? 'House creator' : 'Launch post'}</span>` : ''}</div>`;
  if (p.video) return `<div class="media" data-media="${p.id}" data-mint="${esc(p.mint)}"><video src="${esc(p.video)}" poster="${esc(p.img || '')}" muted loop playsinline preload="metadata"></video><div class="shade"></div>${tags}<button class="sound" data-sound aria-label="Sound">${I.mute}</button></div>`;
  return `<div class="media" data-media="${p.id}" data-mint="${esc(p.mint)}"><img src="${esc(p.img || c.pic)}" alt="${esc((p.caption || '').slice(0, 80))}" loading="lazy" decoding="async">${p.rendering ? `<div class="rendering"><span class="chip">${I.video} Higgsfield is turning this into a video…</span></div>` : ''}<div class="shade"></div>${tags}</div>`;
}
export function postHTML(p) {
  const c = p.creator || {};
  const hearted = !!store.get('hearted', {})[p.id];
  const coin = !c.house && c.symbol;
  return `<article class="post" data-post="${p.id}" data-mint="${esc(p.mint)}">
    <div class="post-h">
      <a href="${profileUrl(c)}">${ava(c, 'sm')}</a>
      <div class="who"><div class="nm"><a href="${profileUrl(c)}">${esc(c.name)}</a>${aiBadge}</div>
        <div class="meta"><span>@${esc(c.handle)}</span><span>·</span><span>${fmt.ago(p.created)}</span>${c.tier ? `<span>·</span><span>${esc(c.tier)}</span>` : ''}</div></div>
      ${brainChip(c.brain)}
    </div>
    ${mediaHTML(p)}
    <div class="acts">
      <button class="act ${hearted ? 'hearted' : ''}" data-heart="${p.id}" aria-label="Heart">${I.heart}<span>${p.hearts + (hearted && typeof p.id !== 'number' ? 1 : 0) || ''}</span></button>
      <a class="act" href="${profileUrl(c)}?dm=1" data-dm="${esc(p.mint)}" aria-label="Message">${I.chat}</a>
      <button class="act" data-share="${p.id}" aria-label="Share">${I.send}</button>
      <span class="grow"></span>
      ${coin ? `<a class="btn pink sm" href="${buyUrl(p.mint)}" target="_blank" rel="noopener">${I.bag} Buy $${esc(c.symbol)}</a>` : `<a class="btn sm" href="/new">${I.plus} Launch one</a>`}
    </div>
    ${p.caption != null ? `<p class="cap"><b>${esc(c.handle)}</b>${esc(p.caption)}</p>` : '<p class="cap mute">Close friends post.</p>'}
    ${coin ? `<div class="mkt"><span>$${esc(c.symbol)}</span><i class="sep"></i><span>${c.mcap != null ? fmt.usd(c.mcap) + ' mcap' : 'new on pump.fun'}</span>${c.chg24 != null ? `<i class="sep"></i><span class="${chgCls(c.chg24)}">${fmt.pct(c.chg24)} 24h</span>` : ''}</div>` : ''}
    <div class="credit">${I.spark.replace('<svg', '<svg width="13" height="13"')}${engineLine(p)}</div>
  </article>`;
}

// ---------- hearts ----------
export function heartPop(media, x, y) {
  const h = document.createElement('div'); h.className = 'heartpop'; h.innerHTML = I.heartF; media.append(h); setTimeout(() => h.remove(), 950);
  const r = media.getBoundingClientRect(); const cx = x != null ? x - r.left : r.width / 2, cy = y != null ? y - r.top : r.height / 2;
  for (let i = 0; i < 8; i++) { const m = document.createElement('span'); m.className = 'mini'; const a = (i / 8) * Math.PI * 2 + Math.random() * .5, d = 70 + Math.random() * 60; m.style.left = cx + 'px'; m.style.top = cy + 'px'; m.style.setProperty('--tx', Math.cos(a) * d + 'px'); m.style.setProperty('--ty', Math.sin(a) * d + 'px'); m.innerHTML = I.heartF; media.append(m); setTimeout(() => m.remove(), 820); }
}
async function heart(id, mint, btn) {
  const all = store.get('hearted', {});
  if (btn) { btn.classList.remove('hearted'); void btn.offsetWidth; btn.classList.add('hearted'); }
  if (all[id]) return;
  all[id] = 1; store.set('hearted', all); para.bump(mint, 'h');
  const span = btn && $('span', btn);
  if (span) span.textContent = (parseInt(span.textContent, 10) || 0) + 1;
  if (typeof id === 'number' || /^\d+$/.test(String(id))) { const r = await api.post('/api/posts?heart=' + id); if (r.ok && r.hearts != null && span) span.textContent = r.hearts; }
}
export function floatTrade(media, tr) {
  const f = document.createElement('div'); f.className = 'float ' + (tr.side === 'sell' ? 'sell' : '');
  f.style.right = (14 + Math.random() * 40) + 'px';
  f.innerHTML = `${I.heartF}<b>${tr.side === 'buy' ? '+' : '−'}${fmt.sol(tr.sol)}</b>`;
  media.append(f); setTimeout(() => f.remove(), 2700);
}

// ---------- close friends ----------
export async function unlock(mint) {
  try {
    const w = await ensureWallet();
    const ts = Date.now();
    toast('Sign the message in your wallet. It proves you hold the coin and costs nothing.', 'lock', 5000);
    const sig = await signText(w.provider, `SOCIAL close friends\n${mint}\n${ts}`);
    const r = await api.post('/api/posts?unlock=1', { wallet: w.address, mint, ts, sig });
    if (!r.ok) { toast(esc(r.error || 'Could not unlock.'), 'lock', 5000); return false; }
    const k = store.get('keys', {}); k[mint] = r.key; store.set('keys', k); para.bump(mint, 'hold');
    toast('Welcome to close friends.', 'heart'); return true;
  } catch (e) { if (!/cancel|no wallet/.test(e.message)) toast('Could not unlock: ' + esc(e.message), 'lock'); return false; }
}

// ---------- wiring for a list of posts ----------
export function wire(root, { onUnlock } = {}) {
  let lastTap = 0;
  root.addEventListener('dblclick', e => { const m = e.target.closest('[data-media]'); if (!m || m.classList.contains('locked')) return; heartPop(m, e.clientX, e.clientY); const art = m.closest('[data-post]'); heart(art ? art.dataset.post : m.dataset.media, m.dataset.mint, art && $('[data-heart]', art)); });
  root.addEventListener('touchend', e => { const m = e.target.closest('[data-media]'); if (!m || m.classList.contains('locked')) return; const now = Date.now(); if (now - lastTap < 280) { e.preventDefault(); const t = e.changedTouches && e.changedTouches[0]; heartPop(m, t && t.clientX, t && t.clientY); const art = m.closest('[data-post]'); heart(art ? art.dataset.post : m.dataset.media, m.dataset.mint, art && $('[data-heart]', art)); lastTap = 0; } else lastTap = now; }, { passive: false });
  root.addEventListener('click', async e => {
    const t = e.target.closest('[data-heart],[data-share],[data-unlock],[data-sound],[data-dm]'); if (!t) return;
    if (t.dataset.heart) { const art = t.closest('[data-post]'); heart(t.dataset.heart, art && art.dataset.mint, t); const m = art && $('[data-media]', art); if (m && !t.classList.contains('was')) heartPop(m); }
    else if (t.dataset.share) { const art = t.closest('[data-post]'); const cap = $('.cap', art); share('/c/' + art.dataset.mint, (cap ? cap.textContent : '') + ' · on SOCIAL'); }
    else if (t.dataset.unlock) { e.preventDefault(); if (await unlock(t.dataset.unlock)) onUnlock && onUnlock(t.dataset.unlock); }
    else if (t.hasAttribute('data-sound')) { const v = $('video', t.parentNode); v.muted = !v.muted; t.innerHTML = v.muted ? I.mute : I.sound; if (!v.muted) v.play().catch(() => { }); }
    else if (t.dataset.dm) para.bump(t.dataset.dm, 'd', 0);
  });
  // video autoplay + "viewed" counting
  const seen = new Set();
  const io = new IntersectionObserver(es => es.forEach(en => {
    const m = en.target; const v = $('video', m);
    if (v) { if (en.isIntersecting && en.intersectionRatio > .55) v.play().catch(() => { }); else v.pause(); }
    if (en.isIntersecting && !seen.has(m.dataset.media)) { seen.add(m.dataset.media); para.bump(m.dataset.mint, 'v'); }
  }), { threshold: [0, .55] });
  const observe = () => $$('[data-media]', root).forEach(m => { if (!m.dataset.obs) { m.dataset.obs = 1; io.observe(m); } });
  observe();
  // live trades float hearts over the first visible post of that coin
  let stop = () => { };
  const rewatch = () => {
    stop();
    const mints = [...new Set($$('[data-post]', root).map(a => a.dataset.mint))];
    stop = watch(mints, tr => {
      const ms = $$(`[data-post][data-mint="${tr.mint}"] [data-media]`, root);
      const vis = ms.find(m => { const r = m.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
      if (vis) floatTrade(vis, tr);
    });
  };
  rewatch();
  return { refresh() { observe(); rewatch(); } };
}
