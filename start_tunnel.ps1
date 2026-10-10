# start_tunnel.ps1
$Host.UI.RawUI.WindowTitle = "EventHub Public Tunnel"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Cloudflare Public Tunnel for Smart Event Hub... " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Connecting to Cloudflare network... please wait 3 seconds..." -ForegroundColor Yellow

$logFile = Join-Path $PSScriptRoot "tunnel.log"
$urlFile = Join-Path $PSScriptRoot "PUBLIC_URL.txt"
$cloudflared = Join-Path $PSScriptRoot "cloudflared.exe"

if (Test-Path $logFile) { Remove-Item $logFile -Force }

# Launch cloudflared in the background with logfile
$process = Start-Process -FilePath $cloudflared -ArgumentList "tunnel", "--url", "http://localhost:3000", "--logfile", "`"$logFile`"" -PassThru -NoNewWindow

# Poll for the URL in tunnel.log
$foundUrl = $null
$attempts = 0
while ($attempts -lt 25 -and -not $foundUrl) {
    Start-Sleep -Seconds 1
    $attempts++
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($content -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') {
            $foundUrl = $matches[1]
        }
    }
}

if ($foundUrl) {
    $foundUrl | Out-File -FilePath $urlFile -Encoding utf8 -Force
    Set-Clipboard -Value $foundUrl -ErrorAction SilentlyContinue
    Clear-Host
    Write-Host ""
    Write-Host "=========================================================================" -ForegroundColor Green
    Write-Host "                 🎉 YOUR PUBLIC SHAREABLE LINK IS READY!                 " -ForegroundColor Green
    Write-Host "=========================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Link: " -NoNewline -ForegroundColor White
    Write-Host "$foundUrl" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Status: " -NoNewline -ForegroundColor White
    Write-Host "COPIED TO YOUR CLIPBOARD AUTOMATICALLY! (Press Ctrl+V to paste)" -ForegroundColor Green
    Write-Host "  Saved to: " -NoNewline -ForegroundColor White
    Write-Host "PUBLIC_URL.txt in your project folder" -ForegroundColor Gray
    Write-Host ""
    Write-Host "=========================================================================" -ForegroundColor Green
    Write-Host "Share this link with anyone on their phone, laptop, or anywhere on Earth." -ForegroundColor Cyan
    Write-Host "Keep this window OPEN so the tunnel stays active. Press Ctrl+C to stop." -ForegroundColor Gray
    Write-Host "=========================================================================" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "Could not automatically extract URL. Opening raw log below:" -ForegroundColor Red
}

# Wait for process
$process.WaitForExit()
