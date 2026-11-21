@echo off
REM Build AAB 619 (2.7.369) — preview de foto no card de falha (87fc4bec)
REM Gotchas da casa: gradlew PRECISA caminho explícito (NoDefaultCurrentDirectoryInExe).
cd /d "%~dp0"
cd android
call "%~dp0android\gradlew.bat" bundleRelease >> ..\aab-build-619.log 2>&1
if errorlevel 1 (
  echo GRADLE_FALHOU >> ..\aab-build-619.log
  exit /b 1
)
echo BUILD_OK >> ..\aab-build-619.log
