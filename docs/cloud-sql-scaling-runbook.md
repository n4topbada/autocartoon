# Cloud SQL Scaling Runbook

Last verified: 2026-07-18 KST

This runbook records when and how to resize the production database. It is intentionally a manual decision: do not resize because of a short deploy, test, migration, or one-off local development spike.

## Current Baseline

| Item | Current value |
| --- | --- |
| Project / region | `wonybananabot` / `asia-northeast3` (Seoul) |
| Instance | `wony-postgres` |
| Engine | PostgreSQL 16 |
| Machine | `db-f1-micro`, zonal |
| Storage | 10 GiB SSD, automatic storage increase enabled |
| Cloud Run DB pool | Prisma `connection_limit=5` per instance |
| Cloud Run scale cap | 4 instances, so normal application pools can reach about 20 connections |
| Database safety state | Automatic backup off, PITR off, deletion protection off |
| Network posture | Public IP enabled, private IP disabled, TLS mode allows unencrypted connections |

The last three rows are data-protection and network-security work, not performance work. They should be addressed before a production launch or before any resize operation.

## Cost Model

Cloud SQL is billed primarily as an always-on database instance, not per registered user. The bill is:

```text
instance CPU/RAM time + provisioned storage + backup/PITR storage + external/cross-region network + optional HA replica
```

The following Seoul-region snapshot was calculated on 2026-07-17 with 730 hours and 10 GiB SSD. It excludes tax, backup growth, and network egress; confirm current prices in the [Cloud SQL pricing page](https://cloud.google.com/sql/pricing/) before a change.

| Option | Approximate monthly base cost | Use |
| --- | ---: | --- |
| Current `db-f1-micro` | `$12.21` | Solo development and small beta |
| `db-g1-small` | `$35.43` | Small temporary step; still shared-core and not SLA-covered |
| `db-custom-1-3840` | `$66.32` | 1 vCPU, 3.75 GiB RAM, first dedicated-core production option |
| `db-custom-1-3840` with HA | `$132+` | Availability decision, not a traffic-scale default |

Registered-user count does not directly change the database bill. The important signals are concurrent requests, active DB connections, write volume, and sustained latency.

## When To Keep The Current Database

Keep `db-f1-micro` when all of the following are true:

- Fewer than about 10 users are active at the same time.
- The Cloud SQL connection alert does not stay at 20 or more connections for five minutes during representative use.
- No `remaining connection slots are reserved` errors recur outside deploy, migration, or test windows.
- Cloud Tasks queue depth returns to normal and generation failures are not caused by database errors.

For this application, image and video generation normally hits Vertex AI, Cloud Run capacity, and Cloud Tasks before it needs a larger database. One hundred registered users with only a few simultaneous users does not by itself require a DB resize.

## Resize Decision Matrix

| Observed condition | First action |
| --- | --- |
| A one-time spike during deploy, test, migration, or local work | Do not resize; annotate the event and observe the next representative run. |
| Cloud Tasks backlog grows but DB connections remain below 20 | Lower queue concurrency or inspect Vertex/Cloud Run capacity first. |
| Cloud Run reaches 4 instances but DB connection alert is quiet | Investigate Cloud Run concurrency, CPU, memory, or request latency first. |
| DB connections remain at 20+ for five minutes during normal use, or slot-exhaustion errors recur | Prepare the dedicated-core resize below. |
| Data durability / uptime requirement increases | Enable backup/PITR/deletion protection, then consider HA separately. |

Do not use Cloud SQL memory utilization alone as a resize trigger. Confirm it together with backend connections, latency, and actual PostgreSQL errors.

## Required Safety Preflight

The current instance has no automatic backup, PITR, or deletion protection. Before any resize, decide a UTC backup window and enable these safeguards. The following command is a recommended baseline after confirming the desired backup time:

```powershell
gcloud sql instances patch wony-postgres `
  --project=wonybananabot `
  --backup-start-time=18:00 `
  --retained-backups-count=7 `
  --enable-point-in-time-recovery `
  --retained-transaction-log-days=7 `
  --deletion-protection `
  --retain-backups-on-delete `
  --quiet
```

`--backup-start-time` is UTC. `18:00` preserves the currently configured hour; choose a different quiet period if needed.

Also confirm that every application and local administrative connection uses the Cloud SQL connector or TLS before switching from `ALLOW_UNENCRYPTED_AND_ENCRYPTED` to `ENCRYPTED_ONLY`. Do not apply that TLS change blindly because it can break a direct local PostgreSQL client.

Create an on-demand backup and wait for it to succeed before changing the machine type:

```powershell
gcloud sql backups create `
  --instance=wony-postgres `
  --project=wonybananabot `
  --description="pre-resize-$(Get-Date -Format yyyyMMdd-HHmm)"
```

## Dedicated-Core Resize Procedure

Only run this after the preflight succeeds and the connection criteria are met:

```powershell
gcloud sql instances patch wony-postgres `
  --project=wonybananabot `
  --tier=db-custom-1-3840 `
  --quiet
```

For Cloud SQL Enterprise, CPU/RAM resizing can briefly restart the instance. Plan for a short database interruption, avoid migration/deploy activity during the change, and keep the same database URL and Prisma configuration initially. No schema migration is required for a tier resize.

After the instance returns to `RUNNABLE`:

```powershell
gcloud sql instances describe wony-postgres --project=wonybananabot
```

Then verify login, a normal save, a generation job creation, credit reservation, and the Cloud SQL connection dashboard. Observe at least one representative usage window before changing Cloud Run or Prisma pool limits.

## Rollback

If the resize itself causes an unexpected compatibility or cost problem, the machine tier can be changed back after confirming the database is healthy. Do not roll back while connection exhaustion is still occurring. Restore data only from a verified backup if there is a data-loss incident; a tier resize is not a data migration.
