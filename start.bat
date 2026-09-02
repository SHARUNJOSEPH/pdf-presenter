@echo off
title PDF Presenter Launcher
cd /d "%~dp0"
echo Starting PDF Presenter...
npm.cmd start
if %errorlevel% neq 0 (
  echo.
  echo If npm.cmd failed, trying electron directly...
  npx.cmd electron .
)
pause
