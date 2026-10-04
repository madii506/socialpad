// SOCIAL AI: Vercel AI Gateway over OIDC (the brains + photos) and Higgsfield (video, and photoreal faces when keyed).
const L = require('./_lib');
const C = require('./_cfg');
const GW = 'https://ai-gateway.vercel.sh/v1';
const FALLBACK_CHAT = ['openai/gpt-4.1-mini', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini'];
const GEN = ['bfl/flux-2-pro', 'bfl/flux-pro-1.1', 'bytedance/seedream-4.5'];

function token(req) { return (req && req.headers && req.headers['x-vercel-oidc-token']) || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY || ''; }
const buckets = new Map(); // best-effort limiter per serverless instance
function limited(key, max, ms) {
  const now = Date.now(); const h = (buckets.get(key) || []).filter(t => now - t < ms); h.push(now); buckets.set(key, h);
  if (buckets.size > 8000) buckets.clear();
  return h.length > max;
}
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>`]/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
function auth(req) { const tk = token(req); if (!tk) throw new Error('no ai'); return { 'content-type': 'application/json', authorization: 'Bearer ' + tk }; }

// chat on a creator's brain; falls back to the house models so a reply always comes from somewhere (and says which)
async function chat(req, messages, { brain, max_tokens = 400, temperature = 0.95, json = false, ms = 20000 } = {}) {
  const h = auth(req);
  const list = [...(brain ? C.brain(brain).models : []), ...FALLBACK_CHAT].filter((m, i, a) => a.indexOf(m) === i);
  let last;
  for (const model of list) {
    try {
      const body = { model, messages, temperature, max_tokens };
      if (json && !/^anthropic|^deepseek|^spacexai/.test(model)) body.response_format = { type: 'json_object' };
      const r = await L.get(GW + '/chat/completions', { method: 'POST', headers: h, body: JSON.stringify(body) }, ms);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.error && (j.error.message || j.error.type)) || ('gateway ' + r.status));
      const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!text) throw new Error('empty');
      return { text: String(text), model };
    } catch (e) { last = e; }
  }
  throw last || new Error('no model answered');
}
function parseJson(text) {
  const s = String(text || '').replace(/```(?:json)?/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no json');
  return JSON.parse(s.slice(a, b + 1));
}

const dataUrl = (buf, mime) => 'data:' + (mime || 'image/jpeg') + ';base64,' + Buffer.from(buf).toString('base64');
function fromDataUrl(u) { const m = /^data:([^;]+);base64,(.+)$/.exec(String(u || '')); return m ? { buf: Buffer.from(m[2], 'base64'), mime: m[1] } : null; }
const sniff = buf => buf[0] === 0x89 ? 'image/png' : buf[0] === 0x52 && buf[8] === 0x57 ? 'image/webp' : 'image/jpeg';

// text → image (no reference)
async function generate(req, prompt, { size = '896x1120', format = 'jpeg' } = {}) {
  const h = auth(req); let last;
  for (const model of GEN) {
    for (const sz of [size, null]) {
      try {
        const body = { model, prompt, n: 1, providerOptions: { blackForestLabs: { outputFormat: format } } };
        if (sz) body.size = sz;
        const r = await L.get(GW + '/images/generations', { method: 'POST', headers: h, body: JSON.stringify(body) }, 55000);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { last = new Error(model + ' ' + r.status + ' ' + JSON.stringify(j.error || j).slice(0, 120)); if (r.status === 400 && sz) continue; break; }
        const b64 = j.data && j.data[0] && j.data[0].b64_json;
        if (!b64) { last = new Error(model + ' no image'); break; }
        const buf = Buffer.from(b64, 'base64');
        return { buf, mime: sniff(buf), model, engine: 'flux' };
      } catch (e) { last = e; break; }
    }
  }
  throw last || new Error('no image model answered');
}

// reference + scene → a new photo of the same person. Tries the methods in order and remembers the one that works.
let EDIT_FIRST = null;
const EDITS = {
  async kontext(req, prompt, ref) {
    const h = auth(req);
    const r = await L.get(GW + '/images/edits', { method: 'POST', headers: h, body: JSON.stringify({ model: 'bfl/flux-kontext-pro', prompt, image: dataUrl(ref.buf, ref.mime), n: 1, providerOptions: { blackForestLabs: { outputFormat: 'jpeg' } } }) }, 55000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('kontext ' + r.status + ' ' + JSON.stringify(j.error || j).slice(0, 120));
    const b64 = j.data && j.data[0] && j.data[0].b64_json; if (!b64) throw new Error('kontext no image');
    const buf = Buffer.from(b64, 'base64'); return { buf, mime: sniff(buf), model: 'bfl/flux-kontext-pro', engine: 'flux' };
  },
  async flux2(req, prompt, ref) {
    const h = auth(req);
    const r = await L.get(GW + '/images/edits', { method: 'POST', headers: h, body: JSON.stringify({ model: 'bfl/flux-2-pro', prompt, image: dataUrl(ref.buf, ref.mime), n: 1, providerOptions: { blackForestLabs: { outputFormat: 'jpeg' } } }) }, 55000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('flux2-edit ' + r.status + ' ' + JSON.stringify(j.error || j).slice(0, 120));
    const b64 = j.data && j.data[0] && j.data[0].b64_json; if (!b64) throw new Error('flux2-edit no image');
    const buf = Buffer.from(b64, 'base64'); return { buf, mime: sniff(buf), model: 'bfl/flux-2-pro', engine: 'flux' };
  },
  async gemini(req, prompt, ref) {
    const h = auth(req);
    const body = { model: 'google/gemini-2.5-flash-image', modalities: ['text', 'image'], stream: false,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt + '\nKeep this exact person: same face, same hair, same identity. Return one photo, vertical 4:5 framing, no text on the image.' }, { type: 'image_url', image_url: { url: dataUrl(ref.buf, ref.mime) } }] }] };
    const r = await L.get(GW + '/chat/completions', { method: 'POST', headers: h, body: JSON.stringify(body) }, 55000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('gemini-image ' + r.status + ' ' + JSON.stringify(j.error || j).slice(0, 120));
    const m = j.choices && j.choices[0] && j.choices[0].message;
    const u = m && Array.isArray(m.images) && m.images[0] && m.images[0].image_url && m.images[0].image_url.url;
    const d = fromDataUrl(u); if (!d) throw new Error('gemini-image no image');
    return { buf: d.buf, mime: d.mime, model: 'google/gemini-2.5-flash-image', engine: 'gemini' };
  },
};
async function edit(req, prompt, ref) {
  const order = ['kontext', 'gemini', 'flux2'];
  if (EDIT_FIRST) order.sort((a, b) => (b === EDIT_FIRST) - (a === EDIT_FIRST));
  let last;
  for (const k of order) {
    try { const out = await EDITS[k](req, prompt, ref); EDIT_FIRST = k; return out; } catch (e) { last = e; }
  }
  throw last || new Error('no edit method answered');
}
async function fetchImage(url) {
  const r = await L.get(url, {}, 15000);
  if (!r.ok) throw new Error('image ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return { buf, mime: (r.headers.get('content-type') || '').split(';')[0] || sniff(buf) };
}

// --- Higgsfield (https://docs.higgsfield.ai): Authorization: Key <id>:<secret>; submit → request_id; poll /requests/<id>/status
const HF_BASE = 'https://api.higgsfield.ai';
function hfKey() {
  const both = process.env.HF_CREDENTIALS || process.env.HIGGSFIELD_KEY || '';
  if (both.includes(':')) return both.trim();
  const id = process.env.HF_API_KEY_ID || process.env.HF_API_KEY || '', secret = process.env.HF_API_KEY_SECRET || process.env.HF_API_SECRET || '';
  return id && secret ? id.trim() + ':' + secret.trim() : '';
}
const HF = {
  on() { return !!hfKey(); },
  async submit(path, input) {
    const r = await L.get(HF_BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Key ' + hfKey() }, body: JSON.stringify(input) }, 20000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.request_id) throw new Error('higgsfield ' + r.status + ' ' + JSON.stringify(j).slice(0, 160));
    return j;
  },
  async status(id) {
    const r = await L.get(HF_BASE + '/requests/' + encodeURIComponent(id) + '/status', { headers: { authorization: 'Key ' + hfKey() } }, 15000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('higgsfield status ' + r.status);
    return { status: j.status, video: j.video && j.video.url || null, image: j.images && j.images[0] && j.images[0].url || null };
  },
  async soul(prompt) { // photoreal portrait, polled up to ~45 s
    const s = await HF.submit('/higgsfield-ai/soul/v2/standard', { prompt, aspect_ratio: '1:1' });
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const st = await HF.status(s.request_id);
      if (st.status === 'completed' && st.image) return st.image;
      if (/failed|nsfw|cancel/.test(st.status || '')) throw new Error('higgsfield ' + st.status);
    }
    throw new Error('higgsfield timeout');
  },
  // image-to-video (Kling 3.0 Turbo on Higgsfield); returns the request id to poll later
  async video(imageUrl, prompt) {
    const s = await HF.submit('/kling-video/v3.0-turbo/image-to-video', { prompt, image_url: imageUrl, duration: 5, resolution: '720p' });
    return s.request_id;
  },
};

// a portrait for a new creator: Higgsfield Soul when keyed, else FLUX
async function portrait(req, look) {
  const prompt = `Photorealistic close-up portrait of a fictional social media creator: ${look}. Looking into the camera, natural expression, soft key light with a hot-pink rim light, dark charcoal studio backdrop, 85mm lens, shallow depth of field, natural skin texture, editorial quality. Square framing, head and shoulders. No text, no logos, no watermark.`;
  if (HF.on()) {
    try { const u = await HF.soul(prompt); const im = await fetchImage(u); return { ...im, model: 'higgsfield/soul-v2', engine: 'higgsfield' }; } catch (e) { /* fall back */ }
  }
  return generate(req, prompt, { size: '1024x1024' });
}

module.exports = { EDITS, token, limited, clean, chat, parseJson, generate, edit, fetchImage, portrait, dataUrl, fromDataUrl, sniff, HF, GW, auth };
