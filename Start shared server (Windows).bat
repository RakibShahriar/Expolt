@echo off
REM Double-click to run the Noor Autos shared server on this Windows PC (needs Python 3 from python.org).
cd /d "%~dp0"
where py >NUL 2>NUL
if %errorlevel%==0 (py -3 server.py) else (python server.py)
pause
