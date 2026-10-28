# LIVE STAGE — one-click start: server + 2 tunnels + auto-register to app server + keep-alive
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$SB  = 'https://zomssaylcebzirpvprgq.supabase.co'
$KEY = 'sb_publishable_DNuVzh6ufm5w3vDidiJCdw_Aeux-DQ8'
$SECRET = 'ls-pc-0b467aa8e90bcbf861f89622'

function Register($k, $v) {
  try {
    $body = @{ p_secret = $SECRET; p_key = $k; p_value = $v } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri "$SB/rest/v1/rpc/register_tunnel" -Headers @{ apikey = $KEY; Authorization = "Bearer $KEY"; 'Content-Type' = 'application/json' } -Body $body | Out-Null
    if ($k -eq 'publish_pass') { Write-Host "  [OK] publish password registered" -ForegroundColor Green } else { Write-Host "  [OK] $k = $v" -ForegroundColor Green }
  } catch { Write-Host "  [FAIL] $k : $($_.Exception.Message)" -ForegroundColor Red }
}
function StartTunnel($port, $name) {
  $log = Join-Path $PSScriptRoot "tunnel_$port.log"
  if (Test-Path $log) { Remove-Item $log -Force }
  $p = Start-Process -FilePath (Join-Path $PSScriptRoot 'cloudflared.exe') -ArgumentList "tunnel --url http://localhost:$port" -RedirectStandardError $log -WindowStyle Minimized -PassThru
  Write-Host "  $name tunnel starting (pid $($p.Id))..."
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
      $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
      if ($m) { return @{ url = $m.Matches[0].Value; proc = $p } }
    }
  }
  return $null
}
function StartServer() {
  $p = Start-Process -FilePath (Join-Path $PSScriptRoot 'mediamtx.exe') -ArgumentList 'mediamtx.yml' -WorkingDirectory $PSScriptRoot -WindowStyle Minimized -PassThru
  Start-Sleep -Seconds 2
  return $p
}

Write-Host '=============================================='
Write-Host ' LIVE STAGE - one-click start'
Write-Host '=============================================='
# 0. password -> mediamtx.yml
$pass = (Get-Content (Join-Path $PSScriptRoot 'password.txt') -Raw).Trim()
if (-not $pass -or $pass -like '*change-this*') { Write-Host '  [WARN] password.txt 를 긴 비밀번호로 바꾸세요 (지금은 기본값)' -ForegroundColor Yellow }
(Get-Content (Join-Path $PSScriptRoot 'mediamtx.template.yml') -Raw).Replace('__PASS__', $pass) | Set-Content (Join-Path $PSScriptRoot 'mediamtx.yml') -Encoding UTF8
# 1. server
Get-Process mediamtx -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
$srv = StartServer
Write-Host '  server started (minimized window, publish password ON)'
# 2. public IP
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
try { $pub = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 5) } catch { $pub = $ip }
Write-Host "  local IP $ip / public IP $pub"
Register 'server_ip' $pub
Register 'publish_pass' $pass
# 3. tunnels
$t1 = StartTunnel 8888 'viewer'
$t2 = StartTunnel 8889 'camera'
if ($t1) { Register 'tunnel' $t1.url } else { Write-Host '  [FAIL] viewer tunnel' -ForegroundColor Red }
if ($t2) { Register 'whip_tunnel' $t2.url } else { Write-Host '  [FAIL] camera tunnel' -ForegroundColor Red }
Write-Host ''
Write-Host '=============================================='
Write-Host ' READY. Nothing to paste - the app already knows these addresses.'
Write-Host "  Broadcast (OBS/YYCam/Larix): rtmp://$pub:1935/live   key = <stream id>?user=presence&pass=<password.txt>"
Write-Host "  Viewer tunnel : $($t1.url)"
Write-Host "  Camera tunnel : $($t2.url)"
Write-Host ' Keep this window open. Close it to stop everything.'
Write-Host ' (server/tunnels are watched every 20s and restarted if they die)'
Write-Host '=============================================='
# 4. keep-alive: restart anything that died, re-register new tunnel addresses
try {
  while ($true) {
    Start-Sleep -Seconds 20
    if ($srv.HasExited) { Write-Host "  [$(Get-Date -Format HH:mm:ss)] server died - restarting" -ForegroundColor Yellow; $srv = StartServer }
    if (-not $t1 -or $t1.proc.HasExited) { Write-Host "  [$(Get-Date -Format HH:mm:ss)] viewer tunnel died - restarting" -ForegroundColor Yellow; $t1 = StartTunnel 8888 'viewer'; if ($t1) { Register 'tunnel' $t1.url } }
    if (-not $t2 -or $t2.proc.HasExited) { Write-Host "  [$(Get-Date -Format HH:mm:ss)] camera tunnel died - restarting" -ForegroundColor Yellow; $t2 = StartTunnel 8889 'camera'; if ($t2) { Register 'whip_tunnel' $t2.url } }
  }
} finally { Get-Process mediamtx,cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force }
