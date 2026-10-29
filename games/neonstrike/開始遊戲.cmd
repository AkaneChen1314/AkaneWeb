@echo off
cd /d "%~dp0"
title NEON STRIKE Local Game Server
color 0A
echo.
echo ==============================================
echo   NEON STRIKE is starting...
echo ==============================================
echo The game will open in your browser automatically.
echo Keep this window open while playing.
echo Close this window to stop the local game server.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -OpenBrowser
set "GAME_EXIT=%ERRORLEVEL%"
echo.
if not "%GAME_EXIT%"=="0" echo [ERROR] Server failed with code %GAME_EXIT%.
echo The game server has stopped. Press any key to close.
pause >nul
exit /b %GAME_EXIT%
