$ErrorActionPreference = 'Stop'
$repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseVersion = (Get-Content -Raw -LiteralPath (Join-Path $repoPath 'client/package.json') | ConvertFrom-Json).version
$archivePath = Join-Path $repoPath "namecheap-passenger-checker-$releaseVersion.zip"
if (Test-Path -LiteralPath $archivePath) { throw 'Release archive already exists; preserve it.' }
$distPath = Join-Path $repoPath 'client/dist'
if (!(Test-Path -LiteralPath (Join-Path $distPath 'index.html'))) { throw 'Build the client first.' }
$files = @('CHANGELOG.md', "RELEASE-$releaseVersion.md", 'client/package.json', 'client/package-lock.json',
  'client/scripts/prepare-checker-ocr.mjs', 'server/src/index.js', 'server/src/passengerChecker.js',
  'server/src/routes/passengerChecks.js', 'server/src/routes/passengerCheckerOcr.js')
$files += Get-ChildItem -LiteralPath $distPath -File -Recurse | ForEach-Object {
  $_.FullName.Substring($repoPath.Length + 1).Replace('\', '/')
}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [IO.File]::Open($archivePath, [IO.FileMode]::CreateNew)
$zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in ($files | Sort-Object -Unique)) {
    $source = [IO.Path]::GetFullPath((Join-Path $repoPath $relative))
    if (!$source.StartsWith($repoPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe package path.' }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $source, $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $zip.Dispose(); $stream.Dispose() }
$check = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $names = @($check.Entries | ForEach-Object FullName)
  if ($names | Where-Object { $_ -match '(^|/)(data|node_modules|test|\.git)/|\.env|server/src/db\.js|\.(db|sqlite|sqlite3)$' }) { throw 'Forbidden file in package.' }
  foreach ($required in @('client/dist/index.html','client/dist/checker-ocr/worker.min.js','client/dist/checker-ocr/ben.traineddata.gz','server/src/routes/passengerChecks.js','server/src/routes/passengerCheckerOcr.js')) {
    if ($names -notcontains $required) { throw "Missing $required" }
  }
  Write-Output "Verified $($names.Count) update files: $archivePath"
} finally { $check.Dispose() }
Get-FileHash -LiteralPath $archivePath -Algorithm SHA256 | Select-Object Hash
