@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "PROJECT_DIR=D:\Projects\prodivix"

set "PS_EXE=C:\Program Files\PowerShell\7-preview\pwsh.exe"


if not exist "%PS_EXE%" (
    echo [ERROR] 找不到 PowerShell: "%PS_EXE%"
    echo 尝试自动搜索环境变量中的 pwsh-preview...
    where pwsh-preview >nul 2>nul
    if !errorlevel! equ 0 (
        set "PS_EXE=pwsh-preview.exe"
        echo [INFO] 已切换为环境变量中的 pwsh-preview
    ) else (
        pause
        exit /b 1
    )
)

echo [INFO] 正在启动: "%PS_EXE%"

start "dev-web" /d "%PROJECT_DIR%" "%PS_EXE%" -NoExit -Command "pnpm run dev:web"

start "dev-backend" /d "%PROJECT_DIR%" "%PS_EXE%" -NoExit -Command "pnpm run dev:backend"

start "storybook-ui" /d "%PROJECT_DIR%" "%PS_EXE%" -NoExit -Command "pnpm run storybook:ui"

echo [SUCCESS] 窗口已弹出。
endlocal
