// Launch: create an AI creator in four steps (who, profile, face, go live). Its coin launches on pump.fun from your wallet.
import { $, $$, esc, I, api, config, shell, toast, store, fmt, aiBadge, BRAIN, confetti, tweet, ensureWallet } from './core.js';
import { launchCreator } from './launchtx.js';

shell('new');
const EX = ['a Tokyo ramen critic who rates everything out of 10', 'a gym bro who only speaks in motivational quotes', 'a mysterious DJ who only posts at 3am', 'a chaotic gamer girl who rates every energy drink', 'a retired astronaut turned street-food vlogger', 'a French art student who paints the chart every morning', 'a surfer philosopher from Bali', 'a fashion intern who thinks every day is fashion week'];
const BR = [['gpt', 'the all-rounder'], ['claude', 'the thoughtful one'], ['gemini', 'the trend surfer'], ['grok', 'the unhinged one'], ['deepseek', 'the dark horse']];
const S = store.get('draft', null) || { step: 1, brief: '', brain: 'grok', kit: { name: '', handle: '', ticker: '', bio: '', voice: '', look: '', vibe: '', traits: [], caption: '' }, image: null, dev: 0 };
S.image = null; // never restore a big image from storage
const save = () => { const { image, ...rest } = S; store.set('draft', rest); };
const pane = $('#pane'), steps = $$('#mksteps span');

function go(n) { S.step = n; save(); steps.forEach((s, i) => { s.className = i + 1 < n ? 'done' : i + 1 === n ? 'on' : ''; }); ({ 1: who, 2: profile, 3: face, 4: live })[n](); preview(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function preview() {
  const k = S.kit, pic = S.image || '/assets/pfp.png';
  $('#pv').innerHTML = `<div class="pcard"><div class="pc-cover"><img src="${esc(pic)}" alt=""></div><div class="pc-b"><span class="ava ring lg"><img src="${esc(pic)}" alt=""></span>
    <b>${esc(k.name || 'Your creator')} ${aiBadge}</b><div class="h">@${esc(k.handle || 'handle')}${k.ticker ? ' · $' + esc(k.ticker) : ''} · ${esc(BRAIN[S.brain])}</div><p>${esc(k.bio || 'Their bio shows up here.')}</p></div>
    <div class="pc-post">${S.image ? `<img src="${esc(S.image)}" alt="">` : '<div style="display:grid;place-items:center;height:100%;color:var(--faint)">first post</div>'}<p><b>${esc(k.handle || 'handle')}</b> ${esc(k.caption || '')}</p></div></div>
    <p class="tiny mute" style="margin:0 6px">This is how they appear on SOCIAL. Everything stays editable until you launch.</p>`;
}

// ---------- 1. who ----------
function who() {
  pane.innerHTML = `<div class="pane"><h2>Who are they?</h2><p class="lead">One sentence is enough. Their brain writes the rest: name, handle, ticker, bio, voice, look and first post.</p>
    <div class="fx"><div class="field"><label>Describe your creator</label><textarea class="area" id="brief" maxlength="300" placeholder="${esc(EX[0])}">${esc(S.brief)}</textarea></div>
    <div class="examples">${EX.slice(0, 6).map(e => `<button data-ex>${esc(e)}</button>`).join('')}</div>
    <div class="field"><label>Pick their brain <span class="faint">writes every caption and DM</span></label><div class="brainpick">${BR.map(([id, tag]) => `<button data-b="${id}" class="${S.brain === id ? 'on' : ''}"><b>${esc(BRAIN[id])}</b><span>${esc(tag)}</span></button>`).join('')}</div></div></div>
    <div class="navrow"><button class="btn ghost" data-manual>I'll write it myself</button><span style="display:flex;gap:8px"><button class="btn" data-surprise>${I.spark} Surprise me</button><button class="btn pink" data-write>${I.spark} Write them with <span data-bn>${esc(BRAIN[S.brain])}</span></button></span></div></div>`;
  const brief = $('#brief');
  brief.oninput = () => { S.brief = brief.value; save(); };
  pane.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-ex')) { brief.value = S.brief = b.textContent; save(); }
    else if (b.dataset.b) { S.brain = b.dataset.b; $$('[data-b]').forEach(x => x.classList.toggle('on', x === b)); $('[data-bn]').textContent = BRAIN[S.brain]; save(); preview(); }
    else if (b.hasAttribute('data-manual')) go(2);
    else if (b.hasAttribute('data-surprise')) { brief.value = S.brief = EX[Math.random() * EX.length | 0]; S.brain = BR[Math.random() * BR.length | 0][0]; who(); write(); }
    else if (b.hasAttribute('data-write')) write();
  };
}
async function write() {
  const btn = $('[data-write]'); if (btn) { btn.disabled = true; btn.innerHTML = `<span class="typing"><i></i><i></i><i></i></span> ${esc(BRAIN[S.brain])} is writing…`; }
  const r = await api.post('/api/make', { kind: 'kit', brief: S.brief || EX[Math.random() * EX.length | 0], brain: S.brain }, 45000);
  if (!r.ok) { toast(esc(r.error || 'The brain is busy.'), 'spark', 5000); if (btn) { btn.disabled = false; btn.innerHTML = `${I.spark} Try again`; } return; }
  S.kit = { ...S.kit, ...r.kit }; save(); go(2); typeIn();
}
function typeIn() { $$('#pane [data-k]').forEach((el, i) => { const full = el.value; el.value = ''; let n = 0; setTimeout(function t() { el.value = full.slice(0, n += 3); if (n < full.length) setTimeout(t, 12); else el.dispatchEvent(new Event('input')); }, i * 110); }); }

// ---------- 2. profile ----------
let hT = 0, tT = 0;
function profile() {
  const k = S.kit;
  const f = (key, label, ph, max, area) => `<div class="field"><label>${label}<span class="faint" data-n="${key}"></span></label>${area ? `<textarea class="area" data-k="${key}" maxlength="${max}" placeholder="${esc(ph)}" style="min-height:70px">${esc(k[key] || '')}</textarea>` : `<input class="input" data-k="${key}" maxlength="${max}" placeholder="${esc(ph)}" value="${esc(k[key] || '')}">`}<span class="hint" data-h="${key}"></span></div>`;
  pane.innerHTML = `<div class="pane"><h2>Their profile</h2><p class="lead">Written by ${esc(BRAIN[S.brain])}. Change anything; this is what goes on chain.</p>
    <div class="fx"><div class="two">${f('name', 'Name', 'Mika', 16)}${f('handle', 'Handle', 'mika', 15)}</div>
    <div class="two">${f('ticker', 'Ticker', 'MIKA', 10)}<div class="field"><label>Traits</label><input class="input" data-k="traits" maxlength="50" placeholder="deadpan, foodie, precise" value="${esc((k.traits || []).join(', '))}"></div></div>
    ${f('bio', 'Bio', 'rating every ramen in tokyo. currently 7.8/10 on life.', 150, 1)}
    <div class="two">${f('voice', 'How they talk', 'dry, deadpan, rates everything out of 10', 80)}${f('vibe', 'What they post about', 'tokyo cafés, konbini hauls, ramen rankings', 120)}</div>
    ${f('look', 'How they look', 'a 23-year-old woman with a sleek black bob, silver hoops, black crop tee', 220, 1)}
    ${f('caption', 'First post caption', 'hello. this feed will be 80% noodles.', 120)}</div>
    <div class="navrow"><button class="btn" data-back>Back</button><button class="btn pink" data-next>Next: their face</button></div></div>`;
  pane.oninput = e => {
    const el = e.target.closest('[data-k]'); if (!el) return; const key = el.dataset.k;
    let v = el.value;
    if (key === 'handle') { v = v.toLowerCase().replace(/[^a-z0-9._]/g, ''); if (v !== el.value) el.value = v; clearTimeout(hT); hT = setTimeout(checkHandle, 450); }
    if (key === 'ticker') { v = v.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (v !== el.value) el.value = v; clearTimeout(tT); tT = setTimeout(checkTicker, 600); }
    S.kit[key] = key === 'traits' ? v.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 3) : v;
    const n = $(`[data-n="${key}"]`); if (n && el.maxLength > 0) n.textContent = el.value.length + '/' + el.maxLength;
    save(); preview();
  };
  pane.onclick = e => { if (e.target.closest('[data-back]')) go(1); else if (e.target.closest('[data-next]')) { const miss = ['name', 'handle', 'ticker', 'bio', 'look', 'caption'].filter(x => !String(S.kit[x] || '').trim()); if (miss.length) { toast('Fill in: ' + miss.join(', '), 'about'); const el = $(`[data-k="${miss[0]}"]`); el && el.focus(); return; } go(3); } };
  if (k.handle) checkHandle(); if (k.ticker) checkTicker();
}
async function checkHandle() {
  const h = S.kit.handle, el = $('[data-h="handle"]'); if (!el) return;
  if (h.length < 3) { el.className = 'hint bad'; el.textContent = 'At least 3 characters.'; return; }
  const r = await api.get('/api/make?handle=' + encodeURIComponent(h));
  if (S.kit.handle !== h || !r.ok) return;
  el.className = 'hint ' + (r.handle.ok ? 'ok' : 'bad'); el.textContent = r.handle.ok ? '@' + h + ' is free.' : r.handle.why;
}
async function checkTicker() {
  const t = S.kit.ticker, el = $('[data-h="ticker"]'); if (!el || t.length < 2) return;
  const r = await api.get('/api/make?ticker=' + encodeURIComponent(t));
  if (S.kit.ticker !== t || !r.ok) return;
  const n = r.ticker.coins;
  el.className = 'hint ' + (n ? 'bad' : 'ok'); el.textContent = n == null ? '' : n ? `${n} Solana coin${n > 1 ? 's' : ''} already use $${t}. Yours still works.` : `No coin uses $${t} yet.`;
}

// ---------- 3. face ----------
function squareJpeg(src, size = 1024) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const s = Math.min(im.width, im.height); x.drawImage(im, (im.width - s) / 2, (im.height - s) * .3, s, s, 0, 0, size, size); res(c.toDataURL('image/jpeg', .88)); }; im.onerror = () => rej(new Error('That image could not be read.')); im.src = src; });
}
function face() {
  pane.innerHTML = `<div class="pane"><h2>Their face</h2><p class="lead">A photoreal portrait from their look. It becomes the coin image, their avatar, and the reference for every photo they post.</p>
    <div class="two" style="align-items:start"><div class="facebox" id="fb">${S.image ? `<img src="${S.image}" alt="">` : `<div class="ph">${I.camera}No face yet.<br>Generate one or upload your own.</div>`}</div>
    <div class="fx"><button class="btn pink big" data-gen>${I.spark} ${S.image ? 'Generate another' : 'Generate their face'}</button><label class="btn big" style="cursor:pointer">${I.up} Upload a face<input type="file" accept="image/png,image/jpeg,image/webp" hidden data-up></label>
    <p class="tiny mute" style="margin:0">Only upload art you own or made. No real people. Square crop, max 1024 px, compressed for pump.fun.</p>
    <div class="field"><label>Look prompt</label><textarea class="area" data-look maxlength="220" style="min-height:90px">${esc(S.kit.look)}</textarea></div></div></div>
    <div class="navrow"><button class="btn" data-back>Back</button><button class="btn pink" data-next ${S.image ? '' : 'disabled'}>Next: go live</button></div></div>`;
  $('[data-look]').oninput = e => { S.kit.look = e.target.value; save(); };
  $('[data-up]').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 12e6) return toast('That file is too big.', 'camera'); const url = URL.createObjectURL(f); try { setFace(await squareJpeg(url)); } catch (er) { toast(er.message, 'camera'); } };
  pane.onclick = async e => {
    if (e.target.closest('[data-back]')) return go(2);
    if (e.target.closest('[data-next]')) return go(4);
    const g = e.target.closest('[data-gen]'); if (!g) return;
    g.disabled = true; g.innerHTML = `<span class="typing"><i></i><i></i><i></i></span> Generating…`;
    $('#fb').insertAdjacentHTML('beforeend', '<div class="scan"></div>');
    const r = await api.post('/api/make', { kind: 'face', look: S.kit.look }, 75000);
    $$('#fb .scan').forEach(x => x.remove());
    g.disabled = false; g.innerHTML = `${I.spark} Generate another`;
    if (!r.ok) return toast(esc(r.error || 'The studio is busy.'), 'camera', 5000);
    setFace(await squareJpeg(r.image));
  };
}
function setFace(d) { S.image = d; $('#fb').innerHTML = `<img class="reveal" src="${d}" alt="">`; const n = $('[data-next]'); if (n) n.disabled = false; preview(); }

// ---------- 4. go live ----------
function live() {
  if (!S.image) return go(3);
  const k = S.kit;
  pane.innerHTML = `<div class="pane"><h2>Go live</h2><p class="lead">@${esc(k.handle)} and $${esc(k.ticker)} launch together. Two transactions, one wallet prompt.</p>
    <div class="checklist"><div>${I.check}<span>Your wallet creates $${esc(k.ticker)} on pump.fun. About 0.02 SOL plus any dev buy.</span></div><div>${I.check}<span>You keep pump.fun's creator fees. SOCIAL takes no fee and never holds your keys.</span></div><div>${I.check}<span>@${esc(k.handle)} starts posting within minutes and posts more as the coin grows.</span></div><div>${I.check}<span>Name, ticker and face are fixed on chain once launched.</span></div></div>
    <div class="two" style="margin-top:14px"><div class="field"><label>Dev buy (SOL, optional)</label><input class="input" type="number" min="0" max="5" step="0.05" value="${S.dev || 0}" data-dev></div><div class="field"><label>X link (optional)</label><input class="input" placeholder="https://x.com/yourcreator" data-x value="${esc(S.x || '')}"></div></div>
    <div class="prog-steps" id="ps"></div>
    <div class="navrow"><button class="btn" data-back>Back</button><button class="btn pink big" data-go>${I.rocket} Launch @${esc(k.handle)}</button></div></div>`;
  $('[data-dev]').oninput = e => { S.dev = Math.max(0, Math.min(5, Number(e.target.value) || 0)); save(); };
  $('[data-x]').oninput = e => { S.x = e.target.value.trim(); save(); };
  pane.onclick = async e => {
    if (e.target.closest('[data-back]')) return go(3);
    const b = e.target.closest('[data-go]'); if (!b) return;
    let w; try { w = await ensureWallet(); } catch (er) { return; }
    b.disabled = true; $('[data-back]').disabled = true;
    const rows = {};
    const ps = $('#ps');
    try {
      const out = await launchCreator({ provider: w.provider, address: w.address, kit: { ...k, brain: S.brain }, image: S.image, devBuySol: S.dev || 0, twitter: S.x || '',
        onStep: (i, n, text, st) => { if (!rows[i]) { ps.insertAdjacentHTML('beforeend', `<div class="ps" id="ps${i}"><span class="n">${i}</span><span class="t"></span></div>`); rows[i] = $('#ps' + i); } rows[i].className = 'ps ' + st; $('.t', rows[i]).innerHTML = text; if (st === 'ok') $('.n', rows[i]).innerHTML = '✓'; } });
      store.set('draft', null); confetti();
      pane.innerHTML = `<div class="pane done-card"><span class="ava ring xl"><img src="${S.image}" alt=""></span><h2>@${esc(k.handle)} is live.</h2><p class="lead">$${esc(k.ticker)} is on pump.fun and ${esc(k.name)} is on SOCIAL. Their first photo shows up in a few minutes.</p>
        <div class="navrow" style="justify-content:center"><a class="btn pink big" href="${out.page}">${I.user} Open their profile</a><button class="btn big" data-tw>${I.share} Share on X</button><a class="btn big" href="https://pump.fun/coin/${out.mint}" target="_blank" rel="noopener">pump.fun</a></div></div>`;
      $('[data-tw]').onclick = () => tweet(`I just launched @${k.handle}, an AI creator with its own coin $${k.ticker} on SOCIAL. They post, they reply, they're ${k.traits && k.traits[0] || 'unhinged'}.`, out.page);
    } catch (er) { b.disabled = false; $('[data-back]').disabled = false; b.innerHTML = `${I.rocket} Try again`; }
  };
}

(async () => {
  const cfg = await config();
  if (!cfg.ai) $('#aiNote').innerHTML = `<div class="notice" style="margin:14px 22px 0">${I.about}<span>The AI studio is offline right now. You can still launch: write the profile yourself and upload a face.</span></div>`;
  go(S.step >= 3 ? 3 : (S.step || 1));
})();
