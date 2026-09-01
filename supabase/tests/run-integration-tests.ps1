<#
  WatchMuse — gerçek PostgreSQL entegrasyon testi koşucusu (Windows).

  Kullanım:
    $env:WATCHMUSE_TEST_DATABASE_URL = "postgresql://...atılabilir test db..."
    powershell -ExecutionPolicy Bypass -File supabase\tests\run-integration-tests.ps1

  Bu script yalnızca ATILABİLİR bir test veritabanında çalıştırılmalıdır:
  şema düşürür ve veri yazar.
#>

$ErrorActionPreference = 'Stop'

$root    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sqlDir  = Join-Path $root 'supabase\tests\sql'
$migDir  = Join-Path $root 'supabase\migrations'

if ([string]::IsNullOrWhiteSpace($env:WATCHMUSE_TEST_DATABASE_URL)) {
  Write-Error 'NOT RUN: WATCHMUSE_TEST_DATABASE_URL tanımlı değil. Kurulum için supabase\tests\README.md dosyasına bakın.'
  exit 2
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if ($null -eq $psql) {
  Write-Error 'NOT RUN: ''psql'' bulunamadı. PostgreSQL istemcisi gerekiyor. Kurulum için supabase\tests\README.md dosyasına bakın.'
  exit 2
}

# --- Production koruması -----------------------------------------------------
# Testler şema düşürür. Yönetilen bir Supabase adresine bağlanmayı reddederiz.
if ($env:WATCHMUSE_TEST_DATABASE_URL -like '*supabase.co*') {
  Write-Error 'REDDEDİLDİ: adres bir yönetilen Supabase projesine benziyor. Bu testler yalnızca atılabilir yerel bir veritabanında çalışır.'
  exit 1
}

Write-Host 'WatchMuse entegrasyon testleri'
Write-Host '  hedef  : (adres güvenlik gereği yazdırılmıyor)'
Write-Host "  sql dir: $sqlDir"
Write-Host ''

$logFile = Join-Path ([System.IO.Path]::GetTempPath()) 'wm-itest.log'
$failed  = $false

foreach ($file in Get-ChildItem -Path $sqlDir -Filter '*.sql' | Sort-Object Name) {
  Write-Host ('  {0,-34} ' -f $file.Name) -NoNewline

  & psql $env:WATCHMUSE_TEST_DATABASE_URL `
    --quiet --no-psqlrc `
    --variable=ON_ERROR_STOP=1 `
    --variable=MIGRATIONS_DIR=$migDir `
    --file $file.FullName *> $logFile

  if ($LASTEXITCODE -eq 0) {
    Write-Host 'PASS'
  } else {
    Write-Host 'FAIL'
    Get-Content $logFile | ForEach-Object { Write-Host "      $_" }
    $failed = $true
  }
}

Write-Host ''
if ($failed) {
  Write-Host 'SONUÇ: BAŞARISIZ'
  exit 1
}

Write-Host 'SONUÇ: tüm entegrasyon testleri geçti'
