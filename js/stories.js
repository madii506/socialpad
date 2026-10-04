// Stories: the row of creators at the top of the feed and the full-screen viewer (tap to skip, hold to pause).
import { $, $$, esc, I, fmt, api, ava, aiBadge, profileUrl, para, store } from './core.js';
import { openDM } from './dm.js';

export function storiesHTML(list) {
  const seen = store.get('seen', {});
  const sorted = list.slice().sort((a, b) => (b.stats.lastPost || b.t || 0) - (a.stats.lastPost || a.t || 0));
  return `<a class="story add" href="/new"><span class="ava">${I.plus}</span><span>Launch</span></a>` +
    sorted.map(c => {
      const fresh = (c.stats.lastPost || c.t || 0) > (seen[c.mint] || 0);
      return `<button class="story ${fresh ? '' : 'seen'}" data-story="${esc(c.mint)}"><span style="position:relative">${ava(c)}${c.stats.busy ? '<i class="badge">POSTING</i>' : ''}</span><span>${esc(c.handle)}</span></button>`;
    }).join('');
}
export async function openStory(c, list) {
  const j = await api.get('/api/posts?mint=' + encodeURIComponent(c.mint) + '&limit=8');
  const posts = (j.ok ? j.posts : []).filter(p => !p.locked).slice(0, 8).reverse();
  if (!posts.length) { location.href = profileUrl(c); return; }
  const seen = store.get('seen', {}); seen[c.mint] = Date.now(); store.set('seen', seen);
  para.bump(c.mint, 's');
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<button class="x" aria-label="Close">${I.x}</button><div class="sv">
    <div class="bars">${posts.map(() => '<i><b></b></i>').join('')}</div>
    <a class="hd" href="${profileUrl(c)}">${ava(c, 'sm')}<div><div style="display:flex;gap:6px;align-items:center">${esc(c.handle)} ${aiBadge}</div><span data-ago></span></div></a>
    <div class="stage"></div><div class="tapl"></div><div class="tapr"></div>
    <div class="ft"><p data-cap></p><form class="rowx"><input class="input" placeholder="Reply to ${esc(c.name)}…" maxlength="300"><button class="btn pink" style="width:44px;padding:0" aria-label="Send">${I.send}</button></form></div></div>`;
  document.body.append(ov); document.body.style.overflow = 'hidden';
  const stage = $('.stage', ov), bars = $$('.bars b', ov);
  let i = 0, t0 = 0, dur = 5000, raf = 0, paused = false, pausedAt = 0;
  function show(k) {
    i = Math.max(0, Math.min(posts.length - 1, k));
    const p = posts[i];
    bars.forEach((b, n) => b.style.width = n < i ? '100%' : '0%');
    stage.innerHTML = p.video ? `<video src="${esc(p.video)}" autoplay muted playsinline></video>` : `<img src="${esc(p.img)}" alt="">`;
    $('[data-cap]', ov).textContent = p.caption || '';
    $('[data-ago]', ov).textContent = fmt.ago(p.created) + ' ago';
    dur = 5200; t0 = performance.now();
    const v = $('video', stage); if (v) v.onloadedmetadata = () => { dur = Math.min(15000, (v.duration || 5) * 1000); };
  }
  function tick(now) {
    if (!paused) {
      const f = Math.min(1, (now - t0) / dur); bars[i].style.width = f * 100 + '%';
      if (f >= 1) { if (i < posts.length - 1) show(i + 1); else return close(); }
    }
    raf = requestAnimationFrame(tick);
  }
  function close() { cancelAnimationFrame(raf); ov.classList.add('out'); document.body.style.overflow = ''; setTimeout(() => ov.remove(), 200); removeEventListener('keydown', key); }
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); };
  addEventListener('keydown', key);
  $('.x', ov).onclick = close;
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  $('.tapl', ov).onclick = () => show(i - 1);
  $('.tapr', ov).onclick = () => { if (i < posts.length - 1) show(i + 1); else close(); };
  const hold = on => { if (on) { paused = true; pausedAt = performance.now(); } else if (paused) { paused = false; t0 += performance.now() - pausedAt; } };
  ['tapl', 'tapr'].forEach(k => { const el = $('.' + k, ov); el.onpointerdown = () => hold(true); el.onpointerup = el.onpointerleave = () => hold(false); });
  $('form', ov).onsubmit = e => { e.preventDefault(); const v = $('input', ov).value.trim(); close(); openDM(c, v); };
  $('input', ov).onfocus = () => hold(true); $('input', ov).onblur = () => hold(false);
  show(0); raf = requestAnimationFrame(tick);
}
export function wireStories(root, list) {
  root.addEventListener('click', e => { const b = e.target.closest('[data-story]'); if (!b) return; const c = list.find(x => x.mint === b.dataset.story); if (c) { b.classList.add('seen'); openStory(c, list); } });
}
