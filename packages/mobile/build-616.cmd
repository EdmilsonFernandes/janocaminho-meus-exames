@echo off
REM Build AAB 616 (2.7.366) — correcao WhatsApp no mobile e menu saude (smooth drawer)
REM Gotchas da casa: gradlew PRECISA caminho explícito (NoDefaultCurrentDirectoryInExe).
cd /d "%~dp0"
call npm run sync >> aab-build-616.log 2>&1
if errorlevel 1 (
  echo SYNC_FALHOU >> aab-build-616.log
  exit /b 1
)
cd android
call "%~dp0android\gradlew.bat" bundleRelease >> ..\aab-build-616.log 2>&1
if errorlevel 1 (
  echo GRADLE_FALHOU >> aab-build-616.log
  exit /b 1
)
echo BUILD_OK >> ..\aab-build-616.log
