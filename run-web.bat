@echo off
chcp 65001 > nul
cd /d "%~dp0"

where node > nul 2> nul
if errorlevel 1 (
  echo Node.js를 찾을 수 없습니다.
  echo Node.js가 설치되어 있고 PATH에 등록되어 있는지 확인해주세요.
  pause
  exit /b 1
)

set OPEN_BROWSER=1
node server.mjs
echo.
pause
