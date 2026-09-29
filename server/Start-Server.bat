@echo off
cd /d "%~dp0"
docker info >nul 2>&1
if errorlevel 1 (
  echo Install and open Docker Desktop first, then run this file again.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
if not exist config mkdir config
if not exist cache mkdir cache
if not exist media\Movies mkdir media\Movies
if not exist media\Shows mkdir media\Shows
if not exist "media\Home Videos" mkdir "media\Home Videos"
docker compose up -d jellyfin
if errorlevel 1 (
  pause
  exit /b 1
)
start http://localhost:8096
echo Create YOUR server account in the browser. Keep Docker Desktop running while watching.
pause
