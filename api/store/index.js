/* The one place that decides which storage backend is live. Presence of DATABASE_URL is the
 * whole switch — self-hosted stays the zero-config file backend, a SaaS deployment sets
 * DATABASE_URL to a Postgres connection string (Supabase's, or any other) and gets the same
 * interface backed by real tables. Every other module imports this, never `file.js`/
 * `postgres.js` directly. */
const backend = process.env.DATABASE_URL
  ? await import('./postgres.js')
  : await import('./file.js');

export default backend.default;
