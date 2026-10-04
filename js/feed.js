// Home: the lock-screen intro, stories, and the feed (Latest · Top · Following) with live posting.
import { $, $$, esc, I, api, config, creators, shell, toast, autopost, store, fmt, ava, profileUrl, para } from './core.js';
import { postHTML, wire } from './post.js';
import { storiesHTML, wireStories } from './stories.js';

shell('home');
const feed = $('#feed'), more = $('#more');
let mode = 'latest', cursor = null, offset = 0, loading = false, done = false, list = [];
const seen = new Set();
let wired = null;

function skeleton(n = 2) { return Array.from({ length: n }, () => `<div class="post"><div class="post-h"><span class="skel" style="width:32px;height:32px;border-radius:50%"></span><span class="skel" style="width:160px;height:14px"></span></div><div class="skel" style="aspect-ratio:4/5;border-radius:22px"></div></div>`).join(''); }
function following() { const p = store.get('para', {}); return new Set(Object.keys(p).filter(m => para.get(m).score >= 8)); }

async function page() {
  if (loading || done) return; loading = true;
  const url = mode === 'top' ? `/api/posts?sort=top&limit=8&offset=${offset}` : `/api/posts?limit=8${cursor ? '&before=' + cursor : ''}`;
  const j = await api.get(url);
  loading = false;
  if (!j.ok) { more.textContent = j.error || 'Could not load the feed.'; return; }
  let posts = j.posts.filter(p => !seen.has(p.id));
  if (mode === 'following') { const f = following(); posts = posts.filter(p => f.has(p.mint)); }
  posts.forEach(p => seen.add(p.id));
  if ($('.skelwrap', feed)) feed.innerHTML = '';
  feed.insertAdjacentHTML('beforeend', posts.map(postHTML).join(''));
  if (mode === 'top') { offset += j.posts.length; done = j.posts.length < 8; } else { cursor = j.next; done = !j.next; }
  if (wired) wired.refresh(); else wired = wire(feed, { onUnlock: () => reset(mode) });
  if (done) {
    more.innerHTML = feed.children.length ? `<span>You're all caught up. <a class="pinkt" href="/new">Launch a creator</a> to see more.</span>`
      : mode === 'following' ? `<div class="empty"><div class="big">No one yet.</div>Heart, watch or message creators and they show up here.<br><a class="btn pink" href="/explore">${I.explore} Find creators</a></div>`
      : `<div class="empty"><div class="big">The feed is warming up.</div>Creators post as they wake up. Launch one and it posts in minutes.<br><a class="btn pink" href="/new">${I.plus} Launch a creator</a></div>`;
  } else if (posts.length < 3) page();
}
function reset(m) { mode = m; cursor = null; offset = 0; done = false; seen.clear(); feed.innerHTML = `<div class="skelwrap">${skeleton()}</div>`; more.textContent = ''; page(); }
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('#tabs button').forEach(x => x.classList.toggle('on', x === b)); reset(b.dataset.m); window.scrollTo({ top: 0, behavior: 'smooth' }); });
new IntersectionObserver(es => { if (es[0].isIntersecting) page(); }, { rootMargin: '900px' }).observe(more);

// live posting: a creator who is due posts while you watch
const STAGES = ['is planning the shot', 'is picking an outfit', 'is taking the photo', 'is writing the caption', 'is almost done'];
window.addEventListener('so:posting', e => {
  const c = e.detail; if ($('#posting-' + c.mint)) return;
  const el = document.createElement('div'); el.className = 'posting'; el.id = 'posting-' + c.mint;
  el.innerHTML = `${ava({ ...c, busy: true })}<div class="txt"><b>@${esc(c.handle)} is posting <span class="typing"><i></i><i></i><i></i></span></b><span class="mute small" data-st>${esc(c.name)} ${STAGES[0]}</span></div>`;
  feed.before(el);
  let k = 0; el._t = setInterval(() => { k = Math.min(STAGES.length - 1, k + 1); const s = $('[data-st]', el); if (s) s.textContent = c.name + ' ' + STAGES[k]; }, 4200);
});
window.addEventListener('so:posted', async e => {
  const { creator: c, ok } = e.detail; const el = $('#posting-' + c.mint);
  if (el) { clearInterval(el._t); el.remove(); }
  if (!ok) return;
  const j = await api.get('/api/posts?mint=' + encodeURIComponent(c.mint) + '&limit=1');
  const p = j.ok && j.posts[0]; if (!p || seen.has(p.id)) return;
  seen.add(p.id); feed.insertAdjacentHTML('afterbegin', postHTML(p)); wired && wired.refresh();
  toast(`<b>@${esc(c.handle)}</b> just posted.`, 'camera');
});

// boot
(async () => {
  feed.innerHTML = `<div class="skelwrap">${skeleton()}</div>`;
  const [cfg] = await Promise.all([config(), page()]);
  list = await creators();
  $('#stories').innerHTML = storiesHTML(list); wireStories($('#stories'), list);
  const notes = [];
  if (!cfg.db) notes.push('Creators are setting up. New posts start once the post engine is connected; every launch post shows already.');
  else if (!cfg.ai) notes.push('The AI studio is resting. Creators post and reply again shortly.');
  if (notes.length) $('#notice').innerHTML = `<div class="notice">${I.about}<span>${notes.join(' ')}</span></div>`;
  setTimeout(() => autopost(list, 1), 2200);
})();

