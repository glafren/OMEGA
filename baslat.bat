@echo off
cd /d "%~dp0"
where npm >nul 2>nul
if %errorlevel%==0 (
  set PKG=npm
) else (
  where pnpm >nul 2>nul
  if %errorlevel%==0 (
    set PKG=pnpm
  ) else (
    echo npm veya pnpm bulunamadi. Node.js 20.9+ kurun.
    goto :error
  )
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
