@echo off
rem Starts Own The Light: installs packages on first run, finds the master
rem Nano's COM port, starts the bridge, and opens the game page full screen
rem (kiosk mode). Press F1 on the game page to exit.
rem
rem   run-all.bat          detect the port, or ask if there is more than one
rem   run-all.bat COM5     use COM5

setlocal
title Own The Light
cd /d "%~dp0ws-bridge"

where node >nul 2>nul
if errorlevel 1 goto no_node

if exist node_modules goto have_modules
echo Installing packages. This only happens the first time...
call npm install
if errorlevel 1 goto npm_failed
:have_modules

set "PORT=%~1"
if defined PORT goto have_port

for /f "delims=" %%p in ('node -e "require('serialport').SerialPort.list().then(l => { if (l.length === 1) console.log(l[0].path); })"') do set "PORT=%%p"
if defined PORT goto found_port

echo Serial ports on this PC:
node -e "require('serialport').SerialPort.list().then(l => { if (!l.length) console.log('  none. Is the master Nano plugged in?'); l.forEach(p => console.log('  ' + p.path + '  ' + (p.manufacturer || ''))); })"
echo.
set /p "PORT=Type the master Nano COM port (for example COM5) and press Enter: "
if not defined PORT goto no_port
goto have_port

:found_port
echo Found the master Nano on %PORT%.

:have_port
echo Close the Arduino Serial Monitor and send.js first. Only one program can use %PORT%.
echo The game page opens full screen. Press F1 on it to exit.
echo.
node bridge.js %PORT% --kiosk
echo.
echo The bridge stopped.
pause
exit /b 0

:no_node
echo Node.js is not installed. Install it from https://nodejs.org and run this again.
pause
exit /b 1

:npm_failed
echo npm install failed. Check the internet connection and run this again.
pause
exit /b 1

:no_port
echo No COM port given.
pause
exit /b 1
