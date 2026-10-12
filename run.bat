@echo off
rem Starts Own The Light: installs packages once, starts bridge.js on the
rem master Nano's COM port, and opens the game page in the browser.
rem
rem   run.bat              asks for the COM port
rem   run.bat COM5         uses COM5
rem   run.bat COM5 9000    uses COM5 and web port 9000

setlocal
cd /d "%~dp0ws-bridge"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing packages. This only happens the first time.
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check the internet connection and try again.
    pause
    exit /b 1
  )
)

set "COM_PORT=%~1"
set "WEB_PORT=%~2"
if "%WEB_PORT%"=="" set "WEB_PORT=8080"

if "%COM_PORT%"=="" (
  echo Serial ports on this PC:
  node -e "require('serialport').SerialPort.list().then(function (ports) { if (ports.length === 0) console.log('  none found. Is the master Nano plugged in?'); ports.forEach(function (p) { console.log('  ' + p.path + '  ' + (p.manufacturer || '')); }); })"
  echo.
  set /p "COM_PORT=Type the master Nano COM port (for example COM5) and press Enter: "
)

if "%COM_PORT%"=="" (
  echo No COM port given.
  pause
  exit /b 1
)

echo.
echo Close the Arduino Serial Monitor and send.js first. Only one program can use %COM_PORT%.
echo The game page opens at http://localhost:%WEB_PORT% in a few seconds.
echo Press Ctrl+C in this window to stop.
echo.

start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:%WEB_PORT%'"

node bridge.js %COM_PORT% %WEB_PORT%

echo.
echo The bridge stopped.
pause
