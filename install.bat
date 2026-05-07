@echo off
set DEST=C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.clauderesolve.plugin

echo Installing Claude Resolve...
xcopy /E /I /Y "%~dp0plugin" "%DEST%"
xcopy /E /I /Y "%~dp0renderer" "%DEST%\renderer"
echo.
echo Done. Restart DaVinci Resolve to use the plugin.
echo Open it from Workspace > Workflow Integration > Claude Resolve
pause
