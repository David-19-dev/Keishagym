/* The file backend — today's self-hosted storage, unchanged behavior, wrapped behind the
 * store interface. This is what a `docker compose up` instance still uses by default: no
 * DATABASE_URL, no Postgres, one JSON file per entity under DATA_DIR.
 *
 * Every function here does exactly what server.js and api/coach/*.js used to do inline —
 * this file is an extraction, not a rewrite. `getSecret()` deliberately re-reads the secret
 * file on every call rather than caching it at module scope: api/coach/config.js relies on
 * that to detect a `./data` restore under a different (or missing) secret at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA = process.env.DATA_DIR || '/data';
const COACH_DIR = path.join(DATA, 'coach');

fs.mkdirSync(DATA, { recursive: true });
// 0700 is what stops the unprivileged user Coach jobs run as from reading any of this — state
// files, db.json, the session secret, the provider credential. Best-effort: a bind-mounted
// host directory may refuse the chmod, and that is not a reason to refuse to boot.
try { fs.chmodSync(DATA, 0o700); } catch { /* host filesystem says no — carry on */ }

function atomicWrite(file, content, opts) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, opts);
  fs.renameSync(tmp, file);
}

const secretFile = path.join(DATA, 'secret');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });

const dbFile = path.join(DATA, 'db.json');
const coachConfigFile = path.join(DATA, 'coach.json');
const safe = uid => String(uid).replace(/[^a-zA-Z0-9_-]/g, '');
const stateFile = uid => path.join(DATA, 'state-' + safe(uid) + '.json');
const coachUserFile = uid => path.join(COACH_DIR, safe(uid) + '.json');

export default {
  async getSecret() {
    return fs.readFileSync(secretFile, 'utf8').trim();
  },

  async loadDb() {
    try { return JSON.parse(fs.readFileSync(dbFile, 'utf8')); }
    catch { return { users: [], creds: [], subs: [], invites: [] }; }
  },
  async saveDb(db) { atomicWrite(dbFile, JSON.stringify(db, null, 2)); },

  async readState(uid) {
    try { return JSON.parse(fs.readFileSync(stateFile(uid), 'utf8')); } catch { return null; }
  },
  async writeState(uid, state) { atomicWrite(stateFile(uid), JSON.stringify(state)); },

  async loadCoachConfig() {
    try { return JSON.parse(fs.readFileSync(coachConfigFile, 'utf8')); } catch { return null; }
  },
  async saveCoachConfig(cfg) { atomicWrite(coachConfigFile, JSON.stringify(cfg, null, 2), { mode: 0o600 }); },

  async readCoachUser(uid) {
    try { return JSON.parse(fs.readFileSync(coachUserFile(uid), 'utf8')); } catch { return null; }
  },
  async writeCoachUser(uid, rec) {
    fs.mkdirSync(COACH_DIR, { recursive: true, mode: 0o700 });
    atomicWrite(coachUserFile(uid), JSON.stringify(rec), { mode: 0o600 });
  },
  async deleteCoachUser(uid) {
    try { fs.unlinkSync(coachUserFile(uid)); } catch { /* nothing to clear */ }
  },
  async listCoachUserIds() {
    try { return fs.readdirSync(COACH_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')); }
    catch { return []; }
  }
};
