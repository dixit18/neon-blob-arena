# Local dev: server :7749 + web :5377 (never 3000/8080/8081).
param([switch]$Restart)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
function Start-Svc($dir, $cmd, $log) {
  $job = Start-Job -ScriptBlock {
    param($d, $c)
    Set-Location $d
    Invoke-Expression $c
  } -ArgumentList "$root\$dir", $cmd
  echo "$dir -> job $($job.Id)"
}
if ($Restart) { Get-Job | Stop-Job -ErrorAction SilentlyContinue; Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue; }
Start-Svc "apps/server" '$env:PORT="7749"; npx tsx watch src/index.ts' "server"
Start-Svc "apps/web" 'npm run dev' "web"
echo "server http://localhost:7749/health · web http://localhost:5377/"
