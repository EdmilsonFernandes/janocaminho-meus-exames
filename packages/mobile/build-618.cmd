@echo off
REM Build AAB 618 (2.7.368) — lapidacao ReUI Home (audio IA, deltas o que mudou, kpi progress bars)
REM Gotchas da casa: gradlew PRECISA caminho explícito (NoDefaultCurrentDirectoryInExe).
cd /d "%~dp0"
call npm run sync >> aab-build-618.log 2>&1
if errorlevel 1 (
  echo SYNC_FALHOU >> aab-build-618.log
  exit /b 1
)
cd android
call "%~dp0android\gradlew.bat" bundleRelease >> ..\aab-build-618.log 2>&1
if errorlevel 1 (
  echo GRADLE_FALHOU >> aab-build-618.log
  exit /b 1
)
echo BUILD_OK >> ..\aab-build-618.log
