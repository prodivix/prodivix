$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'dev-environment.ps1')
Import-ProdivixDevEnvironment

$mailpitBin = $env:PRODIVIX_MAILPIT_BIN
if ([string]::IsNullOrWhiteSpace($mailpitBin)) {
  $mailpitBin = Join-Path $script:ProdivixRepoDir '.tmp\tools\mailpit\mailpit.exe'
}
if (-not (Test-Path -LiteralPath $mailpitBin)) {
  throw 'Install the Mailpit Windows binary in .tmp/tools/mailpit, or set PRODIVIX_MAILPIT_BIN to mailpit.exe.'
}

# Development messages stay in the local inbox even if the host has relay defaults.
$env:MP_SMTP_RELAY_CONFIG = $null
$env:MP_SMTP_FORWARD_CONFIG = $null
$env:MP_SMTP_RELAY_ALL = 'false'
Write-Host '[dev-mail] Inbox: http://localhost:8025; SMTP: 127.0.0.1:1025. Messages are captured locally.'
& $mailpitBin --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025 --max 100 --max-age 24h --smtp-disable-rdns --disable-version-check --quiet
if ($LASTEXITCODE -ne 0) { throw "Mailpit exited with code $LASTEXITCODE." }
