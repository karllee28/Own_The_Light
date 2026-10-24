@echo off
rem Starts Own The Light: installs packages on first run, finds the master
rem Nano's COM port, starts the bridge, and opens the game page full screen
rem (kiosk mode). Press X on the game page to exit.
rem
rem   run-all.bat          use the last port if it is plugged in, otherwise
rem                        detect the port, or ask if there is more than one
rem   run-all.bat COM5     use COM5
rem
rem The last port used is saved in ws-bridge\last-port.txt.

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

set "LAST="
if exist last-port.txt set /p LAST=<last-port.txt
if not defined LAST goto detect
node -e "require('serialport').SerialPort.list().then(l => process.exit(l.some(p => p.path.toUpperCase() === process.argv[1].toUpperCase()) ? 0 : 1))" %LAST%
if errorlevel 1 goto detect
set "PORT=%LAST%"
echo Using the last COM port, %PORT%.
goto have_port

:detect
for /f "delims=" %%p in ('node -e "require('serialport').SerialPort.list().then(l => { if (l.length === 1) console.log(l[0].path); })"') do set "PORT=%%p"
if defined PORT goto found_port

echo Serial ports on this PC:
node -e "require('serialport').SerialPort.list().then(l => { if (!l.length) console.log('  none. Is the master Nano plugged in?'); l.forEach(p => console.log('  ' + p.path + '  ' + (p.manufacturer || ''))); })"
echo.
if not defined LAST goto ask
set "PORT=%LAST%"
set /p "PORT=Type the master Nano COM port, or press Enter for %LAST%: "
goto asked
:ask
set /p "PORT=Type the master Nano COM port (for example COM5) and press Enter: "
:asked
if not defined PORT goto no_port
goto have_port

:found_port
echo Found the master Nano on %PORT%.

:have_port
>last-port.txt echo(%PORT%
echo Close the Arduino Serial Monitor and send.js first. Only one program can use %PORT%.
echo The game page opens full screen. Press X on it to exit.
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
