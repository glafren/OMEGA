@echo off
setlocal
cd /d "%~dp0"

call :addPathIfExists "%ProgramFiles%\nodejs"
call :addPathIfExists "%LocalAppData%\Programs\nodejs"
call :addPathIfExists "%LocalAppData%\Programs\Python\Python313"
call :addPathIfExists "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
call :addPathIfExists "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback"
call :addPathIfExists "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python"

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
  call %PKG% run setup || goto :error
)
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

:addPathIfExists
if exist "%~1" set "PATH=%~1;%PATH%"
exit /b 0
