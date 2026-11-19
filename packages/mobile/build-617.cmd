@echo off
REM Build AAB 617 (2.7.367) — reestruturacao menu conta, consultas unificada, radar hormonal 8k
REM Gotchas da casa: gradlew PRECISA caminho explícito (NoDefaultCurrentDirectoryInExe).
cd /d "%~dp0"
call npm run sync >> aab-build-617.log 2>&1
if errorlevel 1 (
  echo SYNC_FALHOU >> aab-build-617.log
  exit /b 1
)
cd android
call "%~dp0android\gradlew.bat" bundleRelease >> ..\aab-build-617.log 2>&1
if errorlevel 1 (
  echo GRADLE_FALHOU >> aab-build-617.log
  exit /b 1
)
echo BUILD_OK >> ..\aab-build-617.log
