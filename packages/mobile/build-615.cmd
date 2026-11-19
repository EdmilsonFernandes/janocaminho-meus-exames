@echo off
REM Build AAB 615 (2.7.365) — polimento 8K no app (a2aaca31): hairline cards,
REM tabular-nums nos valores, paleta AA, IconButton 44px, tracking h5/h6.
REM Gotchas da casa: gradlew PRECISA caminho explícito (NoDefaultCurrentDirectoryInExe).
cd /d "%~dp0"
call npm run sync >> aab-build-615.log 2>&1
if errorlevel 1 (
  echo SYNC_FALHOU >> aab-build-615.log
  exit /b 1
)
cd android
call "%~dp0android\gradlew.bat" bundleRelease >> ..\aab-build-615.log 2>&1
if errorlevel 1 (
  echo GRADLE_FALHOU >> aab-build-615.log
  exit /b 1
)
echo BUILD_OK >> ..\aab-build-615.log
