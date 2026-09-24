@echo off
cd /d "%~dp0"
where npm >nul 2>nul
if %errorlevel%==0 (
  set PKG=npm
) else (
  set PKG=pnpm
)
if not exist node_modules (
  echo Ilk kurulum yapiliyor...
  call %PKG% install || goto :error
  call %PKG% run setup || goto :error
)
set OMEGA_OPEN_BROWSER=1
call %PKG% run dev
exit /b 0
:error
echo Kurulum tamamlanamadi.
pause
exit /b 1
