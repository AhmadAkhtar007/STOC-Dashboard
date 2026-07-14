[CmdletBinding()]
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$projectRelative = 'projectsuccessfullyruned\EMP.pdsprj'
$firmwareRelative = 'projectsuccessfullyruned\STOC_Firmware.ino.hex'
$legacyRelative = 'Downloads\STOC_Firmware\build\arduino.avr.mega\STOC_Firmware.ino.hex'
$projectPath = Join-Path $repositoryRoot $projectRelative
$firmwarePath = Join-Path $repositoryRoot $firmwareRelative
$legacyPath = Join-Path $repositoryRoot $legacyRelative

function Assert-BundledFile {
  param(
    [string]$Path,
    [string]$Label,
    [string]$DisplayPath
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing $Label`: $DisplayPath"
  }
  if ((Get-Item -LiteralPath $Path).Length -eq 0) {
    throw "Empty $Label`: $DisplayPath"
  }
  Write-Host "Validated $Label`: $DisplayPath"
}

Assert-BundledFile -Path $projectPath -Label 'Proteus project' -DisplayPath $projectRelative
Assert-BundledFile -Path $firmwarePath -Label 'firmware HEX' -DisplayPath $firmwareRelative

if ((Get-Content -LiteralPath $firmwarePath -TotalCount 1) -notmatch '^:') {
  throw "Firmware HEX is not in Intel HEX format: $firmwareRelative"
}

if ($DryRun) {
  Write-Host "[DRY RUN] Copy firmware to $legacyRelative"
  Write-Host '[DRY RUN] npm ci'
  Write-Host '[DRY RUN] npm run build:desktop'
} else {
  New-Item -ItemType Directory -Path (Split-Path -Parent $legacyPath) -Force | Out-Null
  Copy-Item -LiteralPath $firmwarePath -Destination $legacyPath -Force
  Write-Host "Copied firmware to $legacyRelative"

  Push-Location $repositoryRoot
  try {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
    & npm run build:desktop
    if ($LASTEXITCODE -ne 0) { throw "npm run build:desktop failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

Write-Host ''
Write-Host 'Next steps (requires existing Proteus 8 and a virtual null-modem driver; this script installs neither):'
Write-Host '1. Create a virtual pair with Proteus: COM10 and Dashboard: COM11.'
Write-Host '2. Configure Proteus COMPIM on COM10 for 9600 8N1, no flow control.'
Write-Host '3. Open projectsuccessfullyruned\EMP.pdsprj and start the simulation.'
Write-Host '4. Run npm run start:electron, select COM11, then verify mode responses before one controlled fire.'
Write-Host 'No live Proteus or electrical validation was performed by this setup script.'
