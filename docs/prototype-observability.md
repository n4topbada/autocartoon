# Prototype Observability and Autoscaling

Last verified: 2026-07-18 KST

This document is the current operational baseline for the one-person prototype. It supersedes the immediate capacity-upgrade recommendation in the earlier database and worker scaling report: the observed short spike was development, deployment, and test activity, not sustained end-user traffic.

## Current Runtime Guardrails

| Area | Current setting | Why it is limited this way |
| --- | --- | --- |
| Cloud Run `wonybananabot` | request-based autoscaling, min instances `0`, max instances `4` | Scales to zero while idle and prevents an accidental cost or database-connection surge. |
| Cloud Run concurrency | `80` requests per instance | Kept unchanged for the prototype. The dashboard shows whether it causes CPU, memory, or latency pressure. |
| Cloud Run container | 1 CPU, 1 GiB, 600 second timeout | Kept unchanged. Image and document work can be memory intensive, so CPU and memory p95 are monitored. |
| Cloud Tasks `wony-jobs` | 5 dispatches/sec, 10 concurrent dispatches, 5 attempts | Separates long generation work from the user request and absorbs temporary Vertex or network failures. |
| Cloud Tasks retry | 10 second minimum backoff, up to 300 seconds | Prevents rapid retry loops from hammering Vertex AI, Cloud Run, or the database. |
| Prisma connection pool | `PRISMA_CONNECTION_LIMIT=5` per Cloud Run instance | At a four-instance cap, normal application pooling stays near 20 database connections. |
| Cloud SQL | `db-f1-micro`, PostgreSQL 16 | Retained for prototype use. Connection pressure is observed before any resize decision. |

Cloud Run scales up when incoming requests cannot be handled comfortably by the active instances. It uses request concurrency and CPU utilization as signals; it scales back down to zero after idle time. The configured maximum of four is a deliberate safety ceiling, not a performance target.

## What Is Monitored

The Cloud Monitoring dashboard is named `WonyBananaBot Prototype Operations` and shows:

- Cloud Run request rate, p95 latency, active instances, CPU p95, and memory p95.
- Cloud SQL PostgreSQL backend connections, CPU utilization, and memory utilization.
- Cloud Tasks queue depth and non-successful task attempts.
- Structured generation logs, searchable by event and `jobId`.

The following alert policies are enabled. They create incidents in Cloud Monitoring; no email or chat channel is attached yet.

| Alert | Trigger | Purpose |
| --- | --- | --- |
| Cloud Run 5xx | 3 or more server errors in 5 minutes | Detect application or dependency failures. |
| Cloud Run At Max Instances | 4 active instances for 5 minutes | Detect sustained saturation at the prototype cap. |
| Cloud SQL Connections | 20 or more database connections for 5 minutes | Leave room below the small prototype database connection limit. |
| Cloud Tasks Failures | any non-OK task attempt in 5 minutes | Detect task delivery or worker failures. |
| Generation Errors | a structured image, video, poll, request, or enqueue error | Detect provider and job-runner failures even when the task endpoint returns a handled response. |

To receive alerts outside the console, create and verify a Cloud Monitoring notification channel, then attach it to these policies. Email-channel verification requires access to the recipient mailbox, so it is intentionally not automated by this repository.

## Structured Generation Logs

Generation routes now emit single-line JSON logs that Cloud Logging parses into `jsonPayload`. The records include event name, severity, `jobId`, job type, provider/model identifier, duration, task retry metadata, Cloud Run revision, and Cloud Trace correlation where available.

Prompts, uploaded image content, base64 data, access tokens, email addresses, and task secrets are deliberately excluded from logs. Video polling is sampled every ten attempts, with terminal events always logged, to avoid noisy and costly logs.

Useful event names include:

- `generation.request.accepted` and `generation.request.failed`
- `generation.task.enqueued`, `generation.task.enqueue_failed`, and `generation.task.completed`
- `generation.image.started`, `generation.image.succeeded`, and `generation.image.failed`
- `generation.video.task_started`, `generation.video.poll_pending`, `generation.video.succeeded`, and `generation.video.timeout`

## Reapplying the Configuration

The repository owns the dashboard and alert definitions in `ops/gcp/monitoring/`. Re-run the following after a new project, region, or service is intentionally adopted:

```powershell
.\scripts\configure-gcp-observability.ps1
```

The script is idempotent: it updates matching dashboard and alert-policy names or creates them when absent. It also enforces Cloud Run request-based scaling with min `0` and max `4`. It does not resize Cloud SQL, change Cloud Tasks rate limits, or split the web and generation worker.

## When to Change Capacity

Do not change infrastructure just because a deployment or local test produces a short metric spike. Reconsider the current limits only when the dashboard shows a sustained condition during real representative use, especially:

- active instances remain at 4 and p95 latency rises;
- CPU or memory p95 stays high during normal generation;
- Cloud SQL connections remain at or above 20;
- queue depth grows while task failures or retry counts increase.

The first decision should be based on the limiting signal: queue concurrency for upstream generation pressure, Cloud Run max instances for web saturation, or Cloud SQL capacity for database pressure. A separate worker service is still a valid later option, but it is not required to make the current prototype observable and bounded.
