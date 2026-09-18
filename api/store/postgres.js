/* The Postgres backend — for the hosted SaaS, pointed at Supabase's Postgres (or any Postgres)
 * via DATABASE_URL. Same interface as store/file.js, same blob-per-entity shape: each table
 * mirrors one of the JSON files the file backend reads/writes, so none of the Coach's business
 * logic (payload building, validation, snapshot/revert, cadence) has to know which backend is
 * live. Only the I/O at the edges changes.
 *
 * Deliberately just `pg` against Postgres, not the Supabase JS client — openGym keeps its own
 * WebAuthn auth (@simplewebauthn/server); Supabase Auth, Realtime and Storage are not used.
 */
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

let ready = null;
async function ensureSchema() {
  if (ready) return ready;
  ready = pool.query(`
    create table if not exists secret       (value text not null);
    create table if not exists users        (id text primary key, name text, created timestamptz, disabled boolean default false, admin boolean default false, invited_by text, sv int default 0, last_reminder text);
    create table if not exists credentials  (id text primary key, user_id text references users(id) on delete cascade, data jsonb not null);
    create table if not exists push_subs    (id text primary key, user_id text references users(id) on delete cascade, data jsonb not null);
    create table if not exists invites      (code text primary key, data jsonb not null);
    create table if not exists user_state   (user_id text primary key references users(id) on delete cascade, state jsonb not null, ts timestamptz default now());
    create table if not exists coach_config (id smallint primary key default 1, data jsonb not null);
    create table if not exists coach_user   (user_id text primary key references users(id) on delete cascade, data jsonb not null);
  `);
  return ready;
}

async function q(text, params) {
  await ensureSchema();
  return pool.query(text, params);
}

/* `db.json`'s shape is {users, creds, subs, invites} with a handful of ad-hoc fields per user
 * (sv, lastReminder) that server.js reads/writes directly on the in-memory user object. Rows
 * carry the canonical columns; loadDb() reassembles the exact object shape server.js expects,
 * saveDb() writes it back out the same way db.json always did (whole-collection replace,
 * inside a transaction instead of a rename). */
export default {
  async getSecret() {
    const { rows } = await q('select value from secret limit 1');
    if (rows.length) return rows[0].value;
    const crypto = await import('node:crypto');
    const value = crypto.randomBytes(32).toString('hex');
    await q('insert into secret (value) values ($1)', [value]);
    return value;
  },

  async loadDb() {
    const [users, creds, subs, invites] = await Promise.all([
      q('select id, name, created, disabled, admin, invited_by as "invitedBy", sv, last_reminder as "lastReminder" from users'),
      q('select data from credentials'),
      q('select data from push_subs'),
      q('select data from invites')
    ]);
    return {
      users: users.rows.map(u => ({
        ...u,
        created: u.created ? u.created.toISOString() : null,
        lastReminder: u.lastReminder || undefined
      })),
      creds: creds.rows.map(r => r.data),
      subs: subs.rows.map(r => r.data),
      invites: invites.rows.map(r => r.data)
    };
  },
  async saveDb(db) {
    const client = await pool.connect();
    try {
      await ensureSchema();
      await client.query('begin');
      await client.query('delete from users where id <> all($1::text[])', [db.users.map(u => u.id)]);
      for (const u of db.users) {
        await client.query(
          `insert into users (id, name, created, disabled, admin, invited_by, sv, last_reminder)
           values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (id) do update set name=$2, disabled=$4, admin=$5, sv=$7, last_reminder=$8`,
          [u.id, u.name, u.created || null, !!u.disabled, !!u.admin, u.invitedBy || null, u.sv || 0, u.lastReminder || null]
        );
      }
      await client.query('delete from credentials');
      for (const c of db.creds) await client.query('insert into credentials (id, user_id, data) values ($1,$2,$3)', [c.id, c.userId, c]);
      await client.query('delete from push_subs');
      for (const s of db.subs) await client.query('insert into push_subs (id, user_id, data) values ($1,$2,$3)', [s.endpoint, s.userId, s]);
      await client.query('delete from invites');
      for (const i of db.invites) await client.query('insert into invites (code, data) values ($1,$2)', [i.code, i]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  },

  async readState(uid) {
    const { rows } = await q('select state from user_state where user_id = $1', [uid]);
    return rows.length ? rows[0].state : null;
  },
  async writeState(uid, state) {
    await q(
      `insert into user_state (user_id, state, ts) values ($1,$2,now())
       on conflict (user_id) do update set state=$2, ts=now()`,
      [uid, state]
    );
  },

  async loadCoachConfig() {
    const { rows } = await q('select data from coach_config where id = 1');
    return rows.length ? rows[0].data : null;
  },
  async saveCoachConfig(cfg) {
    await q(
      `insert into coach_config (id, data) values (1, $1)
       on conflict (id) do update set data=$1`,
      [cfg]
    );
  },

  async readCoachUser(uid) {
    const { rows } = await q('select data from coach_user where user_id = $1', [uid]);
    return rows.length ? rows[0].data : null;
  },
  async writeCoachUser(uid, rec) {
    await q(
      `insert into coach_user (user_id, data) values ($1,$2)
       on conflict (user_id) do update set data=$2`,
      [uid, rec]
    );
  },
  async deleteCoachUser(uid) { await q('delete from coach_user where user_id = $1', [uid]); },
  async listCoachUserIds() {
    const { rows } = await q('select user_id from coach_user');
    return rows.map(r => r.user_id);
  }
};
