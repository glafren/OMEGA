@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Ilk kurulum yapiliyor...
  call npm install || goto :error
  call npm run setup || goto :error
)
set OMEGA_OPEN_BROWSER=1
call npm run dev
exit /b 0
:error
echo Kurulum tamamlanamadi.
pause
exit /b 1
