# Data Retention

The retention periods below are the source of truth for how long each data class is kept. Most are enforced by
the code (TTL indexes / env knobs); the rest are policy. Keep this doc in sync with the defaults in the backend.

| Data | Where | Retention | Control |
|------|-------|-----------|---------|
| System metrics (per-sample) | Mongo `metrics` (TTL index) | **7 days** | `QINIT_METRICS_TTL_DAYS` (default 7) |
| Incidents (outage / overload) | Mongo `incidents` (TTL index) | **90 days** | `QINIT_INCIDENT_TTL_DAYS` (default 90) |
| Warm collab doc state cache | Redis `collab:*:state` | **1 hour** | `STATE_TTL` (collab.ts, 1h) |
| Share links | Mongo `shares` | Until revoked, or your **expiry** | per-link TTL set on creation (optional) |
| Session token (JWT) | Client local storage | **30 days** (token `exp`) | `TOKEN_TTL` (auth.ts, 30d) |
| Build result cache | In-memory (per instance) | Until restart / eviction | hash-keyed, transient |
| Request IP (rate limiting) | In-memory (per instance) | ≤ the rate-limit window (1 min) | not persisted |
| Accounts (profile from OAuth) | Mongo `users` | Until account deletion | manual today (self-service is a roadmap gap) |
| Projects (your contract source) | Mongo `projects` | Until you delete them | per-project delete in the IDE |

## Notes

- **Metrics & incidents** auto-expire via Mongo TTL indexes created at startup (`metrics.ts ensureIndex`).
  Lower the env values for shorter retention.
- **Share links** with an expiry are treated as gone after it passes; revoking deletes the link.
- **Accounts & projects** persist until deletion. Self-service account deletion + data export are not yet
  implemented (tracked as a production gap); requests are handled manually via the contact in
  [privacy.md](./privacy.md).
- **No content in metrics** — operational metrics never include contract source or personal data.
