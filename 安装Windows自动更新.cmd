@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
set "TARGET=%LOCALAPPDATA%\ConfluenceMarkdownSync\extension"
echo Markdown - Confluence auto updater (Windows Chrome/Edge)
echo.
echo Paste the folder path that Chrome already loaded as an unpacked extension.
echo If this is your first install, press Enter to use:
echo %TARGET%
echo.
set /p "CHOICE=Extension folder (press Enter for default): "
if defined CHOICE set "TARGET=%CHOICE%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Install-ConfluenceSyncUpdater.ps1" -ExtensionPath "%TARGET%"
if errorlevel 1 (
    echo.
    echo Installation failed. See the messages above.
) else (
    echo.
    echo Installation complete. If this extension is not loaded yet, load the same folder in chrome://extensions.
)
pause
