# One-click local starter for Neon Blob Arena (ports 7749 server / 5377 client).
# Double-click, or: powershell -ExecutionPolicy Bypass -File start-local.ps1
# Logs: neon-blob-arena/server/server.log + neon-blob-arena/client/client.log
# Usage: .\start-local.ps1 -Restart   (kills old :7749/:5377 listeners first — use after pulling new code)
param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $root 'neon-blob-arena\server'
$client = Join-Path $root 'neon-blob-arena\client'

function Test-Port($port) {
  try { $c = New-Object Net.Sockets.TcpClient; $r = $c.BeginConnect('127.0.0.1', $port, $null, $null); $ok = $r.AsyncWaitHandle.WaitOne(800); $c.Close(); return $ok }
  catch { return $false }
}
function Kill-Port($port) {
  # only our two dev ports, only node/cmd listeners
  try {
    foreach ($c in (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
      $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
      if ($p -and ($p.ProcessName -eq 'node' -or $p.ProcessName -eq 'cmd')) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    }
  } catch {}
}
if ($Restart) { Kill-Port 7749; Kill-Port 5377; Start-Sleep -Seconds 1 }

if (-not (Test-Port 7749)) {
  $env:PORT = '7749'
  $env:ORIGIN = 'http://localhost:5377'
  if (-not $env:DATABASE_URL) { Write-Host 'NOTE: no DATABASE_URL — server runs on memory leaderboard' }
  Start-Process -FilePath 'node' -ArgumentList 'dist/index.js' -WorkingDirectory $server -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $server 'server.log') -RedirectStandardError (Join-Path $server 'server.err.log')
  Write-Host 'server starting on :7749 ...'
} else { Write-Host 'server already up on :7749' }

if (-not (Test-Port 5377)) {
  $env:VITE_SERVER = 'ws://localhost:7749'
  Start-Process -FilePath 'cmd' -ArgumentList '/c npx vite --port 5377 --strictPort' -WorkingDirectory $client -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $client 'client.log') -RedirectStandardError (Join-Path $client 'client.err.log')
  Write-Host 'client starting on :5377 ...'
} else { Write-Host 'client already up on :5377' }

Start-Sleep -Seconds 6
try { Invoke-RestMethod http://localhost:7749/health -TimeoutSec 5 | ConvertTo-Json -Compress | Write-Host }
catch { Write-Host 'server NOT responding — see neon-blob-arena/server/server.err.log' }
try { Write-Host ('client HTTP ' + (Invoke-WebRequest http://localhost:5377/ -UseBasicParsing -TimeoutSec 5).StatusCode) }
catch { Write-Host 'client NOT responding — see neon-blob-arena/client/client.err.log' }
Write-Host ''
Write-Host 'PLAY: http://localhost:5377/?room=TEST  (open 2-3 tabs to vs yourself)'
