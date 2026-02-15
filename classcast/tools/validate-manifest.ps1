param(
  [Parameter(Mandatory = $false)]
  [string]$ManifestPath = ".\manifest.txt"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$applyScript = Join-Path $repoRoot "apply-manifest.mjs"
$targetManifest = if ([System.IO.Path]::IsPathRooted($ManifestPath)) { $ManifestPath } else { Join-Path $repoRoot $ManifestPath }

node $applyScript --validate $targetManifest
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Validation passed: $targetManifest"
exit 0
