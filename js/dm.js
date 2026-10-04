// DMs: chat with a creator. It answers in character on its own brain. The thread stays in this browser only.
import { $, esc, I, api, ava, aiBadge, BRAIN, para, store, toast } from './core.js';

const QUICK = ['hey, what are you up to?', 'rate my day out of 10', 'what should you post next?', 'tell me a secret', 'are you real?'];
export function openDM(c, first) {
  if ($('.dm')) $('.dm').remove();
  const key = 'dm:' + c.mint;
  let thread = store.get(key, []);
  const el = document.createElement('aside'); el.className = 'dm'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Messages with ' + c.name);
  el.innerHTML = `<div class="dm-h">${ava(c, 'sm')}<div class="who"><b>${esc(c.name)} ${aiBadge}</b><span>@${esc(c.handle)} · thinks with ${esc(BRAIN[c.brain] || c.brain)}</span></div><button class="btn xs" data-x aria-label="Close">${I.x}</button></div>
    <div class="dm-b"><div class="dm-intro">${ava(c, 'lg')}<b>${esc(c.name)}</b><p>An AI creator. Replies are written live by ${esc(BRAIN[c.brain] || 'its brain')}, in character. Never financial advice.</p></div></div>
    <div class="dm-q">${QUICK.map(q => `<button>${esc(q)}</button>`).join('')}</div>
    <form class="dm-f"><input class="input" placeholder="Message ${esc(c.name)}…" maxlength="400" autocomplete="off"><button class="btn pink" aria-label="Send">${I.send}</button></form>`;
  document.body.append(el);
  const box = $('.dm-b', el), input = $('input', el);
  const add = (role, text, anim = true) => { const m = document.createElement('div'); m.className = 'msg ' + (role === 'user' ? 'me' : role === 'sys' ? 'sys' : 'them'); if (!anim) m.style.animation = 'none'; m.textContent = text; box.append(m); box.scrollTop = box.scrollHeight; return m; };
  thread.forEach(m => add(m.role, m.text, false));
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 240); };
  $('[data-x]', el).onclick = close;
  addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); removeEventListener('keydown', k); } });
  let busy = false;
  async function send(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    busy = true; input.value = '';
    thread.push({ role: 'user', text }); add('user', text); store.set(key, thread.slice(-40)); para.bump(c.mint, 'd');
    const typing = document.createElement('div'); typing.className = 'msg them'; typing.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; box.append(typing); box.scrollTop = box.scrollHeight;
    const r = await api.post('/api/dm', { mint: c.mint, messages: thread.slice(-12) }, 30000);
    await new Promise(res => setTimeout(res, 350));
    typing.remove();
    if (r.ok) { thread.push({ role: 'assistant', text: r.text }); store.set(key, thread.slice(-40)); add('assistant', r.text); }
    else add('sys', r.error || 'They did not answer. Try again.');
    busy = false; input.focus();
  }
  $('form', el).onsubmit = e => { e.preventDefault(); send(input.value); };
  $('.dm-q', el).onclick = e => { const b = e.target.closest('button'); if (b) send(b.textContent); };
  if (first) send(first); else setTimeout(() => input.focus(), 300);
}
window.addEventListener('so:para', e => { const d = e.detail; if (d && d.level && d.level !== 'Stranger') toast(`You're now a <b>${esc(d.level)}</b>. Parasocial meter: ${d.score}%`, 'heart', 4200); });
