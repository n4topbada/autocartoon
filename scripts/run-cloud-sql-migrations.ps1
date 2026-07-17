param(
  [string]$ProjectId = "wonybananabot",
  [string]$Region = "asia-northeast3",
  [string]$Repository = "cloud-run-source-deploy",
  [string]$JobName = "wony-prisma-migrate",
  [string]$ServiceAccount = "wony-run@wonybananabot.iam.gserviceaccount.com",
  [string]$CloudSqlInstance = "wonybananabot:asia-northeast3:wony-postgres"
)

$ErrorActionPreference = "Stop"
$tag = Get-Date -Format "yyyyMMddHHmmss"
$image = "$Region-docker.pkg.dev/$ProjectId/$Repository/wony-prisma-migrate:$tag"

function Invoke-Gcloud {
  param([string[]]$Arguments)

  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud failed: gcloud $($Arguments -join ' ')"
  }
}

Write-Host "Building migration image: $image"
Invoke-Gcloud @(
  "builds", "submit",
  "--project=$ProjectId",
  "--config=cloudbuild.migrations.yaml",
  "--substitutions=_IMAGE=$image",
  "--quiet"
)

Write-Host "Deploying Cloud Run migration job: $JobName"
Invoke-Gcloud @(
  "run", "jobs", "deploy", $JobName,
  "--project=$ProjectId",
  "--region=$Region",
  "--image=$image",
  "--service-account=$ServiceAccount",
  "--set-cloudsql-instances=$CloudSqlInstance",
  "--set-secrets=DATABASE_URL=database-url:latest",
  "--task-timeout=10m",
  "--max-retries=0",
  "--quiet"
)

Write-Host "Executing Prisma migrations"
Invoke-Gcloud @(
  "run", "jobs", "execute", $JobName,
  "--project=$ProjectId",
  "--region=$Region",
  "--wait",
  "--quiet"
)
