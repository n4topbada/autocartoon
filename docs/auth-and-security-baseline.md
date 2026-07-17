# Authentication and Security Baseline

Last verified: 2026-07-18 KST

This document records the current prototype posture, the changes already implemented, and the intentionally staged GCP hardening work. It is written so that a later agent can make the next change without treating a short development spike as a production incident.

## Account Creation

- New accounts can be created only by Kakao OAuth or Google OAuth.
- Existing email/password members remain able to sign in, reset a password, and change a password.
- POST /api/auth/register returns 403; it no longer creates password-only accounts.
- A new OAuth account consumes one signup slot only after its User record and welcome-credit ledger entry are committed.
- A source network can create at most two new OAuth accounts. Existing account sign-ins and email-matched provider linking do not consume a slot.
- RegistrationIp stores a SHA-256 HMAC of the source IP, not the raw IP. The key is SIGNUP_IP_HASH_SECRET, falling back to SESSION_SECRET only when the dedicated key is absent. Production has a dedicated Secret Manager secret named signup-ip-hash-secret attached to Cloud Run.

The cap is lifetime-based. It is deliberately simple anti-abuse protection for welcome credits, not an identity system: a home, office, school, or carrier NAT can share one public IP. A legitimate exception requires an administrator to adjust the HMAC-keyed counter in the database; no public bypass exists.

## Google OAuth Setup Still Required

The application code is ready, but production Google sign-in stays unavailable until the Google Cloud OAuth client is configured. The current Cloud Run revision has no GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET environment variables.

1. In Google Cloud Console, configure the OAuth consent screen for the intended audience.
2. Create an OAuth 2.0 Web application client.
3. Add these authorized redirect URIs:

       http://localhost:3000/api/auth/google/callback
       https://wonybananabot-272254743773.asia-northeast3.run.app/api/auth/google/callback

4. Store the Client ID and Client Secret in Secret Manager, then attach them to Cloud Run under GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.
5. Add the custom-domain callback before changing APP_ORIGIN, and keep the Cloud Run callback during the transition.

The implementation uses an OAuth state cookie for CSRF protection, PKCE S256 for authorization-code binding, and Google ID-token signature/audience verification. Only a Google-verified email address can create or link an account.

## OAuth Account Passwords

OAuth-created users receive an unguessable server-only password hash because the schema requires one, but the user never knows that value. The session now records whether the current login was password, Google, or Kakao. A Google/Kakao-authenticated session can set an initial email-login password or confirm account deletion without being asked for the unknown random value. After a password is set, that session becomes a normal password session and subsequent changes require the new current password.

Existing cookies created before this change have no auth-method marker. They remain fail-closed and require the user to sign out and sign in with Google/Kakao once before using the passwordless setup flow.

## Canonical Origin

`APP_ORIGIN` is the server-owned canonical public origin used for OAuth callbacks, payment redirects, and email links. The 2026-07-18 audit found that its Cloud Run value accidentally contained two Prisma assignments after the URL. The service value was corrected to exactly `https://wonybananabot-272254743773.asia-northeast3.run.app`.

PowerShell deployment commands must pass comma-separated environment updates as one variable or quoted argument. Otherwise shell argument parsing can corrupt a value while still returning a successful deployment.

## Storage And Browser Baseline

- GCS objects remain private and are accessed through ownership-aware media references and short V4 read URLs.
- Local fallback paths reject absolute paths, backslashes, query fragments, empty or dot segments, and verify that the resolved path remains under `public` or `public/uploads`.
- Local browser uploads accept only server-shaped user paths for `edited`, `studio-assets`, and `shorts`, with the same MIME, extension, and size boundaries as ticket issuance. A normal user cannot upload to `public/`.
- Every Next.js route sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a strict-origin referrer policy, and disables camera, microphone, and geolocation.
- A full Content Security Policy remains staged because image data URLs, Blob workers, ffmpeg WASM, signed media URLs, and OAuth endpoints need a measured allowlist first.

## Database Recovery: What It Protects

The current Cloud SQL instance wony-postgres is a zonal db-f1-micro PostgreSQL 16 instance. At the time of this check, automatic backups, point-in-time recovery (PITR), and deletion protection are all disabled.

| Setting | What it protects | Current result if it remains off |
| --- | --- | --- |
| Automated backups | A daily recoverable database snapshot | An accidental destructive query or broken migration has no recent provider backup. |
| PITR | Transaction-log history between backups | A bad DELETE, UPDATE, or application write cannot be restored to just before the mistake. |
| Deletion protection | Accidental instance deletion from Console, CLI, or IaC | A mistaken delete can remove the instance without a final safety stop. |

Backups and PITR are recovery controls, not high availability. A restore should be rehearsed into a separate target instance, data-checked, and then deliberately switched over; it is not a magic in-place undo button. The first sensible prototype baseline is seven retained backups, seven days of PITR logs, and deletion protection. The exact commands, preflight, verification, and rollback are in [cloud-sql-scaling-runbook.md](./cloud-sql-scaling-runbook.md). This has a small storage/log cost and should be enabled after choosing the quiet UTC backup window.

## Database Network Security

The current instance has a public IP, no authorized public networks, and ALLOW_UNENCRYPTED_AND_ENCRYPTED TLS mode. This does **not** mean that arbitrary internet clients can currently log in: no IP allowlist is configured, and the application uses the Cloud SQL connector path. It does mean:

- the database still has a public network endpoint;
- a future allowlist or direct-client change could accidentally permit a non-TLS PostgreSQL connection;
- DB credentials, IAM, and connector configuration are more exposed to configuration drift than a private-only topology.

The staged end state is:

1. Confirm every application/admin client supports encrypted Cloud SQL connections, then enforce encrypted-only TLS.
2. Create private connectivity for Cloud Run (Direct VPC egress or Serverless VPC Access) and private IP for Cloud SQL.
3. Smoke-test application and migration traffic through private connectivity.
4. Remove the public IP only after the private path is verified.

Do not switch these settings blindly on the active prototype: a private-IP migration affects egress routing, Cloud SQL connectivity, and deployment health. It is a later hardening task, not a current traffic-capacity fix.

The Cloud Run database URL must include the Cloud SQL socket query parameter. The intended production shape is a PostgreSQL URL with host set to /cloudsql/wonybananabot:asia-northeast3:wony-postgres in the query string. Prisma requires the nominal URI host to remain present, but ignores it when the host query parameter points to a Unix socket. Migration commands should run through scripts/run-cloud-sql-migrations.ps1 so they use the same mounted socket instead of a developer laptop connection.

## Cloud Tasks OIDC

The current job system posts tasks to the same public Cloud Run service and proves task origin with a static X-Tasks-Token secret. It works, but anyone who obtained that secret could construct a request that looks like a task until the secret is rotated.

OIDC changes that proof model. Cloud Tasks asks a designated service account to mint a short-lived signed ID token for each HTTP task. A private worker service grants Cloud Run Invoker only to that service account, and Cloud Run verifies the token before running the request. The useful security properties are:

- no long-lived task secret is copied into every queued request;
- a browser or arbitrary internet caller cannot invoke the worker endpoint;
- the task identity can be revoked with IAM and is visible in Cloud Audit/IAM policy.

To get the full benefit, split the current public web service from a private generation-worker Cloud Run service. A single public service cannot use Cloud Run IAM to protect only /api/tasks routes; route-level token verification alone would be weaker and leaves the public service boundary unchanged. The future worker change needs an oidcToken in CloudTasksClient.createTask, a worker service account, Cloud Run Invoker on the worker, and the Cloud Tasks service agent permission to mint tokens for that account.

## Monitoring Email

Cloud Monitoring can deliver all five current alert policies to n4topbada@gmail.com. The repository script now creates or reuses an email channel and attaches it to every managed policy:

    .\scripts\configure-gcp-observability.ps1 -NotificationEmail "n4topbada@gmail.com"

Google sends a mandatory verification email on first creation. The channel may be attached while pending, but actual email delivery begins only after the verification link is clicked. This verification prevents someone from silently subscribing another person's mailbox.

## References

- [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Cloud Tasks HTTP targets with OIDC tokens](https://cloud.google.com/tasks/docs/creating-http-target-tasks)
- [Cloud SQL backups](https://cloud.google.com/sql/docs/postgres/backup-recovery/backups)
- [Cloud SQL point-in-time recovery](https://cloud.google.com/sql/docs/postgres/backup-recovery/pitr)
- [Cloud Monitoring notification channels](https://cloud.google.com/monitoring/support/notification-options)
