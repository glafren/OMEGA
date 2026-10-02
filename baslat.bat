@echo off
setlocal
cd /d "%~dp0"

if exist "%ProgramFiles%\nodejs" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\Python\Python313" set "PATH=%LocalAppData%\Programs\Python\Python313;%PATH%"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin" set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback" set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback;%PATH%"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python" set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python;%PATH%"

if not defined PYTHON_EXECUTABLE (
  if exist "%LocalAppData%\Programs\Python\Python313\python.exe" (
    set "PYTHON_EXECUTABLE=%LocalAppData%\Programs\Python\Python313\python.exe"
  )
)
if not defined PYTHON_EXECUTABLE (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" (
    set "PYTHON_EXECUTABLE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
  )
)

set PKG=
set RUN_DIRECT=
where.exe npm >nul 2>nul
if not errorlevel 1 (
  set PKG=npm
) else (
  where.exe pnpm >nul 2>nul
  if not errorlevel 1 (
    set PKG=pnpm
  ) else (
    where.exe node >nul 2>nul
    if not errorlevel 1 (
      if exist node_modules (
        set RUN_DIRECT=1
      ) else (
        echo npm veya pnpm bulunamadi. Ilk kurulum icin Node.js 20.9+ ile gelen npm gerekli.
        goto :error
      )
    ) else (
      echo Node.js bulunamadi. Node.js 20.9+ kurun.
      goto :error
    )
  )
)
if not exist node_modules (
  echo Ilk kurulum yapiliyor...
  call %PKG% install || goto :error
)
echo Gereksinimler kontrol ediliyor...
call node scripts/setup.mjs || goto :error
if defined PYTHON_EXECUTABLE (
  call "%PYTHON_EXECUTABLE%" -c "import requests, openpyxl, reportlab, fitz, pandas" >nul 2>nul
  if errorlevel 1 (
    echo Python bagimliliklari kuruluyor...
    call "%PYTHON_EXECUTABLE%" -m pip install -r requirements.txt || goto :error
  )
)
set OMEGA_OPEN_BROWSER=1
if "%RUN_DIRECT%"=="1" (
  call node scripts/run.mjs dev
) else (
  call %PKG% run dev
)
exit /b 0
:error
echo Kurulum tamamlanamadi.
pause
exit /b 1
