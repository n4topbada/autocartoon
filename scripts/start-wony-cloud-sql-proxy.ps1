param(
  [int]$Port = 5433,
  [switch]$Restart
)

$ErrorActionPreference = "Stop"
$instance = "wonybananabot:asia-northeast3:wony-postgres"
$expectedProcessNames = @("cloud-sql-proxy", "cloud-sql-proxy.exe")
$proxy = Get-Command "cloud-sql-proxy.exe" -ErrorAction SilentlyContinue
if (-not $proxy) {
  $proxy = Get-Command "cloud-sql-proxy" -ErrorAction SilentlyContinue
}
if (-not $proxy) {
  $sdkProxyPath = Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\cloud-sql-proxy.exe"
  if (Test-Path -LiteralPath $sdkProxyPath) {
    $proxy = Get-Item -LiteralPath $sdkProxyPath
  }
}
if (-not $proxy) {
  throw "cloud-sql-proxy was not found on PATH or in the Google Cloud SDK."
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1

if ($listener) {
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  if (-not $Restart) {
    throw "Port $Port is already in use by PID $($listener.OwningProcess). Use -Restart only for the Wony Cloud SQL proxy."
  }
  if (-not $process -or $expectedProcessNames -notcontains $process.ProcessName) {
    throw "Refusing to stop PID $($listener.OwningProcess): it is not Cloud SQL Proxy."
  }
  Stop-Process -Id $listener.OwningProcess -Force
  Start-Sleep -Seconds 1
}

$proxyPath = if ($proxy.Source) { $proxy.Source } else { $proxy.FullName }
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $proxyPath
$startInfo.Arguments = "--address 127.0.0.1 --port $Port $instance"
$startInfo.UseShellExecute = $true
$startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$process = [System.Diagnostics.Process]::Start($startInfo)

$deadline = (Get-Date).AddSeconds(20)
do {
  Start-Sleep -Milliseconds 500
  $ready = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -eq $process.Id } |
    Select-Object -First 1
} until ($ready -or (Get-Date) -ge $deadline -or $process.HasExited)

if (-not $ready) {
  $detail = if ($process.HasExited) { " Exit code: $($process.ExitCode)." } else { "" }
  throw "Wony Cloud SQL Proxy did not become ready.$detail"
}

Write-Host "Wony development database proxy is ready at 127.0.0.1:$Port (PID $($process.Id))."
