// SOCIAL database (Neon Postgres via DATABASE_URL). Posts, media, hearts and daily usage live here.
// Without it the site still lists every creator from chain + IPFS and shows their launch post.
let sql = null, ready = null;
function on() { return !!(process.env.DATABASE_URL || process.env.POSTGRES_URL); }
function db() {
  if (!on()) return null;
  if (!sql) { const { neon } = require('@neondatabase/serverless'); sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL); }
  return sql;
}
async function init() {
  const q = db(); if (!q) return null;
  if (!ready) ready = (async () => {
    await q`CREATE TABLE IF NOT EXISTS so_creators (mint text PRIMARY KEY, handle text, name text, symbol text, brain text, persona jsonb NOT NULL DEFAULT '{}', portrait text, house boolean NOT NULL DEFAULT false, launcher text, sig text, created timestamptz NOT NULL DEFAULT now(), last_post timestamptz, last_video timestamptz, posts int NOT NULL DEFAULT 0, hearts bigint NOT NULL DEFAULT 0, busy_until timestamptz)`;
    await q`CREATE UNIQUE INDEX IF NOT EXISTS so_creators_handle ON so_creators (lower(handle))`;
    await q`CREATE TABLE IF NOT EXISTS so_media (id serial PRIMARY KEY, mint text, kind text NOT NULL, mime text, data text, url text, created timestamptz NOT NULL DEFAULT now())`;
    await q`CREATE TABLE IF NOT EXISTS so_posts (id serial PRIMARY KEY, mint text NOT NULL, kind text NOT NULL, media int, video text, caption text, scene text, close boolean NOT NULL DEFAULT false, hearts int NOT NULL DEFAULT 0, engine text, model text, job text, status text NOT NULL DEFAULT 'live', created timestamptz NOT NULL DEFAULT now())`;
    await q`CREATE INDEX IF NOT EXISTS so_posts_created ON so_posts (created DESC)`;
    await q`CREATE INDEX IF NOT EXISTS so_posts_mint ON so_posts (mint, created DESC)`;
    await q`CREATE TABLE IF NOT EXISTS so_usage (day date NOT NULL, kind text NOT NULL, n int NOT NULL DEFAULT 0, PRIMARY KEY (day, kind))`;
  })().catch(e => { ready = null; throw e; });
  await ready;
  return q;
}
// daily usage: take one unit of `kind` if today's count is under `cap`; returns false when the cap is reached
async function take(kind, cap) {
  const q = await init(); if (!q) return true;
  const r = await q`INSERT INTO so_usage (day, kind, n) VALUES (current_date, ${kind}, 1)
    ON CONFLICT (day, kind) DO UPDATE SET n = so_usage.n + 1 WHERE so_usage.n < ${cap} RETURNING n`;
  return r.length > 0;
}
async function usage() {
  const q = await init(); if (!q) return {};
  const r = await q`SELECT kind, n FROM so_usage WHERE day = current_date`;
  return Object.fromEntries(r.map(x => [x.kind, x.n]));
}
module.exports = { on, init, take, usage };
