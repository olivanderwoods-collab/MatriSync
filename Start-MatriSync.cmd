@echo off
cd /d "%~dp0"
if not exist .local-tools mkdir .local-tools
set "MATRISYNC_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%MATRISYNC_NODE%" set "MATRISYNC_NODE=node"
echo Preparing the MatriSync fictional demonstration. The application windows will open automatically.
"%MATRISYNC_NODE%" scripts/start-presentation.mjs > .local-tools\presentation.log 2>&1
if errorlevel 1 (
  echo MatriSync could not prepare the presentation. Details are in .local-tools\presentation.log.
  pause
)
