@echo off
setlocal

set "PROJECT_DIR=%~dp0.."
set "PS_EXE="

if exist "C:\Program Files\PowerShell\7-preview\pwsh.exe" (
    set "PS_EXE=C:\Program Files\PowerShell\7-preview\pwsh.exe"
) else if exist "C:\Program Files\PowerShell\7\pwsh.exe" (
    set "PS_EXE=C:\Program Files\PowerShell\7\pwsh.exe"
) else (
    for %%P in (pwsh-preview.cmd pwsh-preview.exe pwsh.cmd pwsh.exe powershell.exe) do (
        if not defined PS_EXE (
            where %%P >nul 2>nul
            if not errorlevel 1 set "PS_EXE=%%P"
        )
    )
)

if not defined PS_EXE (
    echo [ERROR] Could not find PowerShell.
    echo Install PowerShell 7 or add pwsh/powershell to PATH.
    pause
    exit /b 1
)

echo [INFO] Starting dev processes with: "%PS_EXE%"

start "dev-db" /d "%PROJECT_DIR%" "%PS_EXE%" -NoExit -ExecutionPolicy Bypass -File ".\scripts\start-dev-postgres.ps1"
start "dev-web" /d "%PROJECT_DIR%" "%PS_EXE%" -NoExit -Command "pnpm run dev:web"
start "dev-backend" /d "%PROJECT_DIR%" "%PS_EXE%" -NoExit -Command "$env:BACKEND_DB_URL='postgres://postgres:postgres@127.0.0.1:55432/prodivix?sslmode=disable'; pnpm run dev:backend"
start "storybook-ui" /d "%PROJECT_DIR%" "%PS_EXE%" -NoExit -Command "pnpm run storybook:ui"

echo [SUCCESS] Dev windows have been opened.
endlocal
