# Privacy Policy

> **Template — not legal advice.** Replace every `{{PLACEHOLDER}}` and have it reviewed before publishing. This
> document describes the data the Service actually handles, derived from the codebase, so it stays accurate.
> Last updated: `{{DATE}}`.

{{ENTITY}} ("we") operates the {{PRODUCT_NAME}} web IDE. This policy explains what we collect, why, and your
choices.

## 1. Data we collect

**Account (when you sign in with Google/GitHub):** your provider id, name, email address, and avatar URL, as
returned by the provider's OAuth userinfo. We store these to identify your account and show your profile.

**Authentication token:** a signed session token (JWT) is issued to your browser and stored in your browser's
local storage. It is sent with API requests to authenticate you. It is not a tracking cookie.

**Projects:** the contract source files and project metadata you create and choose to sync to your account.

**Share links:** when you create a share link, we store the link id, the project it points to, its mode
(view/edit), and any expiry you set.

**Contract source you compile:** submitted to the build service, compiled in a sandbox, and (for performance)
cached by a hash of the input. Cached results are transient and not tied to your identity.

**Operational data:** request IP addresses are used transiently for rate limiting (not stored long-term).
Aggregate system-health metrics (CPU, memory, build-queue depth, room counts) are recorded for monitoring and
do not contain user content.

## 2. How we use it

- To provide the Service: authenticate you, store and sync your projects, resolve share links, run live
  collaboration, and compile contracts.
- To keep the Service reliable and secure: monitoring, abuse/rate-limit enforcement, and incident detection.

We do **not** sell your personal data.

## 3. Third parties

- **Google / GitHub** — OAuth identity providers (only when you choose to sign in with them).
- **Database hosting ({{DB_PROVIDER}})** — stores accounts, projects, share links, and metrics.
- {{OTHER_PROCESSORS}}

## 4. Retention

See [retention.md](./retention.md) for specific retention periods. In summary: metrics and incident history are
time-limited; projects and account data persist until you delete them or your account.

## 5. Your rights

Depending on your jurisdiction you may request access to, correction of, export of, or deletion of your personal
data. Contact us at {{CONTACT_EMAIL}}. (Note: self-service account deletion / data export is on our roadmap; in
the meantime we handle requests manually.)

## 6. Security

Tokens are signed with a server secret; the build service runs untrusted source in a resource-limited sandbox;
API access is rate-limited and origin-restricted (CORS). No system is perfectly secure — do not store secrets
you cannot afford to expose in contract source.

## 7. Changes

We may update this policy; material changes will be reflected by the "Last updated" date.

## 8. Contact

{{CONTACT_EMAIL}}
