param(
  [string]$ProjectId = "wonybananabot",
  [string]$Region = "asia-northeast3",
  [string]$Service = "wonybananabot",
  [int]$MinInstances = 0,
  [int]$MaxInstances = 4,
  [string]$NotificationEmail = ""
)

$ErrorActionPreference = "Stop"
$monitoringRoot = Join-Path $PSScriptRoot "..\ops\gcp\monitoring"
$dashboardPath = Join-Path $monitoringRoot "prototype-dashboard.json"
$alertRoot = Join-Path $monitoringRoot "alerts"
$dashboardDisplayName = "WonyBananaBot Prototype Operations"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$notificationChannelNames = @()

function Invoke-Gcloud {
  param([string[]]$Arguments)

  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud failed: gcloud $($Arguments -join ' ')"
  }
}

function Write-TemporaryJson {
  param([object]$Value)

  $path = [System.IO.Path]::GetTempFileName()
  $json = $Value | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText($path, $json, $utf8NoBom)
  return $path
}

Write-Host "Applying request-based Cloud Run autoscaling: min=$MinInstances max=$MaxInstances"
Invoke-Gcloud @(
  "run", "services", "update", $Service,
  "--project=$ProjectId",
  "--region=$Region",
  "--scaling=auto",
  "--min=$MinInstances",
  "--max=$MaxInstances",
  "--quiet"
)

if ($NotificationEmail.Trim()) {
  $normalizedEmail = $NotificationEmail.Trim().ToLowerInvariant()
  if ($normalizedEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
    throw "NotificationEmail must be a valid email address."
  }

  $channelJson = & gcloud beta monitoring channels list --project=$ProjectId --format=json
  if ($LASTEXITCODE -ne 0) { throw "Could not list Monitoring notification channels." }
  $channels = @()
  foreach ($item in ($channelJson | ConvertFrom-Json)) {
    $channels += $item
  }
  $emailMatches = @(
    $channels | Where-Object {
      $_.type -eq "email" -and
      $_.labels -and
      $_.labels.email_address -eq $normalizedEmail
    }
  )
  $channel = if ($emailMatches.Count -gt 0) { $emailMatches[0] } else { $null }

  if (!$channel) {
    Write-Host "Creating Monitoring email notification channel for $normalizedEmail"
    $createdJson = & gcloud beta monitoring channels create --project=$ProjectId --display-name="WonyBananaBot operations email" --description="Prototype operations and generation failure alerts" --type=email --channel-labels="email_address=$normalizedEmail" --format=json --quiet
    if ($LASTEXITCODE -ne 0) { throw "Could not create Monitoring email notification channel." }
    $channel = $createdJson | ConvertFrom-Json
    Write-Host "Google Cloud sent a verification message to $normalizedEmail. Alerts activate after verification."
  } else {
    Write-Host "Reusing Monitoring email notification channel for $normalizedEmail"
  }
  $notificationChannelNames = @($channel.name)
}

$dashboardJson = & gcloud monitoring dashboards list --project=$ProjectId --format=json
if ($LASTEXITCODE -ne 0) { throw "Could not list Monitoring dashboards." }
$dashboards = @()
foreach ($item in ($dashboardJson | ConvertFrom-Json)) {
  $dashboards += $item
}
$dashboardMatches = @($dashboards | Where-Object { $_.displayName -eq $dashboardDisplayName })
$dashboard = if ($dashboardMatches.Count -gt 0) { $dashboardMatches[0] } else { $null }

if ($dashboard) {
  $config = Get-Content $dashboardPath -Raw | ConvertFrom-Json
  $config | Add-Member -NotePropertyName name -NotePropertyValue $dashboard.name -Force
  $config | Add-Member -NotePropertyName etag -NotePropertyValue $dashboard.etag -Force
  $tempPath = Write-TemporaryJson $config
  try {
    Write-Host "Updating Monitoring dashboard: $dashboardDisplayName"
    Invoke-Gcloud @(
      "monitoring", "dashboards", "update", $dashboard.name,
      "--project=$ProjectId",
      "--config-from-file=$tempPath",
      "--quiet"
    )
  } finally {
    Remove-Item -LiteralPath $tempPath -Force
  }
} else {
  Write-Host "Creating Monitoring dashboard: $dashboardDisplayName"
  Invoke-Gcloud @(
    "monitoring", "dashboards", "create",
    "--project=$ProjectId",
    "--config-from-file=$dashboardPath",
    "--quiet"
  )
}

$policyJson = & gcloud monitoring policies list --project=$ProjectId --format=json
if ($LASTEXITCODE -ne 0) { throw "Could not list Monitoring alert policies." }
$existingPolicies = @()
foreach ($item in ($policyJson | ConvertFrom-Json)) {
  $existingPolicies += $item
}

foreach ($policyPath in Get-ChildItem -LiteralPath $alertRoot -Filter "*.json" | Sort-Object Name) {
  $config = Get-Content $policyPath.FullName -Raw | ConvertFrom-Json
  $existingMatches = @($existingPolicies | Where-Object { $_.displayName -eq $config.displayName })
  $existing = if ($existingMatches.Count -gt 0) { $existingMatches[0] } else { $null }

  if ($existing) {
    $config | Add-Member -NotePropertyName name -NotePropertyValue $existing.name -Force
    $existingChannelNames = @()
    if ($existing.notificationChannels) {
      $existingChannelNames = @($existing.notificationChannels)
    }
    if ($notificationChannelNames.Count -gt 0) {
      $channelsForPolicy = @($existingChannelNames + $notificationChannelNames | Select-Object -Unique)
      $config | Add-Member -NotePropertyName notificationChannels -NotePropertyValue $channelsForPolicy -Force
    } elseif ($existingChannelNames.Count -gt 0) {
      $config | Add-Member -NotePropertyName notificationChannels -NotePropertyValue $existingChannelNames -Force
    }
    $tempPath = Write-TemporaryJson $config
    try {
      Write-Host "Updating alert policy: $($config.displayName)"
      Invoke-Gcloud @(
        "monitoring", "policies", "update", $existing.name,
        "--project=$ProjectId",
        "--policy-from-file=$tempPath",
        "--quiet"
      )
    } finally {
      Remove-Item -LiteralPath $tempPath -Force
    }
  } else {
    if ($notificationChannelNames.Count -gt 0) {
      $config | Add-Member -NotePropertyName notificationChannels -NotePropertyValue $notificationChannelNames -Force
    }
    Write-Host "Creating alert policy: $($config.displayName)"
    Invoke-Gcloud @(
      "monitoring", "policies", "create",
      "--project=$ProjectId",
      "--policy-from-file=$($policyPath.FullName)",
      "--quiet"
    )
  }
}

Write-Host "Done. Cloud SQL machine type and Cloud Tasks concurrency were not changed."
