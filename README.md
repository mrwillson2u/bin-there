# Bin→There

(Written "Bin→There", with the arrow; the code slug stays `bin-there`, DEC-045.)

A self-hosted, scan-driven inventory app for a home garage workshop. Find any part, see how
many you have and exactly which rack → box → bin it's in, and keep it current with one-tap
use / put-back / move.

- **Plan & decisions:** `framework/` (start with `framework/AI-Context.md`).
  Scaffolded from ai-framework-kit 1.1.0; AI tools follow `AGENTS.md`.
- **Stack:** TypeScript · React (Vite) · Hono · SQLite (Drizzle) · one Docker container · Tailscale Serve
- **Deploy:** see `DEPLOY.md`

## Layout

```
src/server/   Hono API, SQLite schema (db/schema.ts), domain logic
src/web/      React app; scan/ holds the scanner detector + camera scanner
src/shared/   Request/response types shared by both
drizzle/      SQL migrations (npm run db:generate after schema changes)
```
