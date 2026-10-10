$pythonPath = (Get-Command python).Source
$backendDir = "c:\Users\ASUS\Desktop\big_project\backend"
$frontendDir = "c:\Users\ASUS\Desktop\big_project\frontend"

# Kill any existing processes on 8000 or 3000
Get-NetTCPConnection -LocalPort 8000, 3000 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

# Start Backend
Start-Process -FilePath $pythonPath -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000" -WorkingDirectory $backendDir -RedirectStandardOutput "c:\Users\ASUS\Desktop\big_project\backend_out.log" -RedirectStandardError "c:\Users\ASUS\Desktop\big_project\backend_err.log" -WindowStyle Hidden

# Start Frontend
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev -- --host 0.0.0.0 --port 3000" -WorkingDirectory $frontendDir -RedirectStandardOutput "c:\Users\ASUS\Desktop\big_project\frontend_out.log" -RedirectStandardError "c:\Users\ASUS\Desktop\big_project\frontend_err.log" -WindowStyle Hidden

Start-Sleep -Seconds 4
