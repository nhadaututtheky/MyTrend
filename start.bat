@echo off
title MyTrend Launcher
color 0A

echo.
echo  ================================
echo   MyTrend - Quick Launcher
echo  ================================
echo.
echo  [1] Dev Mode     (frontend only, localhost:5173)
echo  [2] Docker Full  (all services, localhost:80)
echo  [3] Docker Build (rebuild + start)
echo  [4] PocketBase Admin (open browser)
echo  [5] Validate     (lint + typecheck + test)
echo  [6] Stop Docker  (stop all containers)
echo  [0] Exit
echo.

set /p choice="  Pick: "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto docker
if "%choice%"=="3" goto docker_build
if "%choice%"=="4" goto pb_admin
if "%choice%"=="5" goto validate
if "%choice%"=="6" goto stop
if "%choice%"=="0" goto end

echo  Invalid choice.
pause
goto end

:dev
echo.
echo  Starting frontend dev server...
cd /d "%~dp0frontend"
call npm run dev
goto end

:docker
echo.
echo  Starting all services with Docker...
cd /d "%~dp0"
docker-compose up -d
echo.
echo  Frontend:  http://localhost
echo  PocketBase: http://localhost:8090/_/
echo.
pause
goto end

:docker_build
echo.
echo  Rebuilding and starting...
cd /d "%~dp0"
docker-compose up -d --build
echo.
echo  Frontend:  http://localhost
echo  PocketBase: http://localhost:8090/_/
echo.
pause
goto end

:pb_admin
start http://localhost:8090/_/
goto end

:validate
echo.
echo  Running validation...
cd /d "%~dp0frontend"
call npm run validate
echo.
pause
goto end

:stop
echo.
echo  Stopping all containers...
cd /d "%~dp0"
docker-compose down
echo  Done.
pause
goto end

:end
