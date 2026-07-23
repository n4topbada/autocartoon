param(
  [string]$ProjectId = "wonybananabot",
  [string]$Region = "asia-northeast3",
  [string]$ServiceName = "wonybananabot",
  [string]$AppOrigin = "https://wonybananabot-272254743773.asia-northeast3.run.app",
  [int]$PrismaConnectionLimit = 5,
  [int]$PrismaPoolTimeout = 30
)

$ErrorActionPreference = "Stop"
$origin = [Uri]$AppOrigin
if (-not $origin.IsAbsoluteUri -or $origin.Scheme -notin @("http", "https") -or $origin.AbsolutePath -ne "/") {
  throw "AppOrigin must be an absolute http(s) origin without a path."
}

$runtimeEnv = @(
  "APP_ORIGIN=$($origin.GetLeftPart([System.UriPartial]::Authority))"
  "PRISMA_CONNECTION_LIMIT=$PrismaConnectionLimit"
  "PRISMA_POOL_TIMEOUT=$PrismaPoolTimeout"
) -join ","

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if ($gcloud) {
  $gcloudPath = $gcloud.Source
} else {
  $gcloudPath = Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\gcloud.ps1"
  if (-not (Test-Path -LiteralPath $gcloudPath)) {
    throw "gcloud was not found in PATH or the default Windows Cloud SDK location."
  }
}

& $gcloudPath run deploy $ServiceName `
  "--source=." `
  "--project=$ProjectId" `
  "--region=$Region" `
  "--update-env-vars=$runtimeEnv" `
  "--quiet"

if ($LASTEXITCODE -ne 0) {
  throw "Cloud Run deployment failed."
}
