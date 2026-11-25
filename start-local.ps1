<#
.SYNOPSIS
    Avvio locale per Alert Gare Nuoto Master (React + Vite).
.EXAMPLE
    .\start-local.ps1              # avvia in sviluppo (aggiorna gare.json se assente o > 6h)
    .\start-local.ps1 -Scrape      # forza aggiornamento dati dal sito FIN prima dell'avvio
    .\start-local.ps1 -NoScrape    # salta lo scraping
    .\start-local.ps1 -Test        # esegue gli unit test prima dell'avvio
    .\start-local.ps1 -Preview     # build di produzione (con CSP) + anteprima locale
    .\start-local.ps1 -Port 4173   # porta personalizzata (default: 5173)
#>
[CmdletBinding()]
param(
    [switch]$Scrape,
    [switch]$NoScrape,
    [switch]$Test,
    [switch]$Preview,
    [ValidateRange(1, 65535)]
    [int]$Port = 5173,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host @"
Avvio locale per Alert Gare Nuoto Master (React + Vite)
Uso:
  .\start-local.ps1              # avvia in sviluppo (esegue scraper se gare.json manca o e' vecchio)
  .\start-local.ps1 -Scrape      # forza aggiornamento dati dal sito FIN prima di avviare
  .\start-local.ps1 -NoScrape    # salta lo scraping
  .\start-local.ps1 -Test        # esegue gli unit test prima dell'avvio
  .\start-local.ps1 -Preview     # build di produzione + anteprima locale (come GitHub Pages)
  .\start-local.ps1 -Port 4173   # porta personalizzata (default: 5173)
"@
    exit 0
}

if ($Scrape -and $NoScrape) {
    throw 'Non puoi usare contemporaneamente -Scrape e -NoScrape.'
}

Push-Location $PSScriptRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'Node.js (>= 20) e npm sono necessari.'
    }

    $nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
    if ($nodeMajor -lt 20) {
        throw "Rilevato Node $(node -v), richiesto Node >= 20."
    }

    if (-not (Test-Path 'node_modules')) {
        Write-Host 'Installazione dipendenze npm...'
        npm install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    if (Test-Path '.env') {
        Get-Content '.env' | ForEach-Object {
            $line = $_.Trim()
            if (-not $line -or $line.StartsWith('#')) { return }
            $idx = $line.IndexOf('=')
            if ($idx -gt 0) {
                $name = $line.Substring(0, $idx).Trim()
                $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
                [Environment]::SetEnvironmentVariable($name, $val, 'Process')
            }
        }
    } elseif (Test-Path '.env.example') {
        Write-Host 'Nota: .env non presente (form iscrizione disabilitato finche'' non imposti VITE_APPS_SCRIPT_URL).'
    }

    $gareFile = Join-Path $PSScriptRoot 'public\data\gare.json'
    $shouldScrape = $false
    if ($Scrape) {
        $shouldScrape = $true
    } elseif (-not $NoScrape) {
        if (-not (Test-Path $gareFile)) {
            $shouldScrape = $true
        } else {
            $ageHours = ((Get-Date) - (Get-Item $gareFile).LastWriteTime).TotalHours
            if ($ageHours -gt 6) {
                $shouldScrape = $true
            }
        }
    }

    if ($shouldScrape) {
        Write-Host 'Aggiornamento calendario gare dal sito FIN...'
        node scripts/scrape.mjs
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    if ($Test) {
        Write-Host 'Esecuzione unit test...'
        npm test
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    if ($Preview) {
        Write-Host "Build di produzione e avvio preview su http://127.0.0.1:$Port ..."
        npm run build
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        npx vite preview --port $Port --host 127.0.0.1
    } else {
        Write-Host "Avvio server di sviluppo React su http://127.0.0.1:$Port ..."
        npx vite --port $Port --host 127.0.0.1
    }
} finally {
    Pop-Location
}
