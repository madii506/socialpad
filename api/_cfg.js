// SOCIAL config. Every value here is public. No wallet key ever lives in this repo or on this server.
const env = k => (process.env[k] || '').trim();
const num = (k, d) => { const v = Number(env(k)); return Number.isFinite(v) && v > 0 ? v : d; };
const H = 3600e3;

module.exports = {
  // read-only registry key: every SOCIAL launch carries it, so getSignaturesForAddress(REG) lists every creator
  REG: '6BnYiwjcg2jAHvLjh3zHqMXWcXKkdz7Xu9x8crhZgQEC',
  MEMO_PREFIX: 'so:v1:',
  SOCIAL_MINT: env('SOCIAL_MINT'),   // the $SOCIAL coin, once it exists
  X: env('X_URL'),                   // https://x.com/<handle>
  // A creator posts more as its coin grows. Market cap in USD; "every" = minimum time between posts.
  TIERS: [
    { id: 'new', name: 'New account', at: 0, photo: 24 * H, video: null, close: false },
    { id: 'rising', name: 'Rising', at: 10000, photo: 8 * H, video: null, close: false },
    { id: 'verified', name: 'Verified', at: 50000, photo: 4 * H, video: 24 * H, close: true },
    { id: 'famous', name: 'Famous', at: 250000, photo: 2 * H, video: 8 * H, close: true },
    { id: 'icon', name: 'Icon', at: 1000000, photo: 1 * H, video: 4 * H, close: true },
  ],
  HOUSE_EVERY: 10 * H,                // SOCIAL's own house creators post this often
  // Daily spend guards (whole site), enforced against the usage table.
  CAPS: { images: num('IMAGES_PER_DAY', 120), videos: num('VIDEOS_PER_DAY', 8), dms: num('DMS_PER_DAY', 3000), kits: num('KITS_PER_DAY', 300), faces: num('FACES_PER_DAY', 150) },
  // The brains a creator can run on (Vercel AI Gateway model ids, first that answers wins).
  BRAINS: [
    { id: 'gpt', name: 'GPT', maker: 'OpenAI', tag: 'the all-rounder', models: ['openai/gpt-4.1-mini', 'openai/gpt-5-mini', 'openai/gpt-4o-mini'] },
    { id: 'claude', name: 'Claude', maker: 'Anthropic', tag: 'the thoughtful one', models: ['anthropic/claude-haiku-4.5', 'anthropic/claude-3-haiku'] },
    { id: 'gemini', name: 'Gemini', maker: 'Google', tag: 'the trend surfer', models: ['google/gemini-2.5-flash', 'google/gemini-3-flash'] },
    { id: 'grok', name: 'Grok', maker: 'xAI', tag: 'the unhinged one', models: ['spacexai/grok-4.1-fast-non-reasoning', 'spacexai/grok-4.20-non-reasoning'] },
    { id: 'deepseek', name: 'DeepSeek', maker: 'DeepSeek', tag: 'the dark horse', models: ['deepseek/deepseek-v3.2', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-v3.1'] },
  ],
  brain(id) { return this.BRAINS.find(b => b.id === id) || this.BRAINS[0]; },
  tier(mcap, graduated) {
    let t = this.TIERS[0];
    for (const x of this.TIERS) if ((mcap || 0) >= x.at) t = x;
    if (graduated && this.TIERS.indexOf(t) < 2) t = this.TIERS[2]; // graduating off the curve = Verified
    return t;
  },
  nextTier(t) { const i = this.TIERS.indexOf(t); return i >= 0 && i < this.TIERS.length - 1 ? this.TIERS[i + 1] : null; },
};
