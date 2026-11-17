@echo off
REM Build AAB 607 (2.7.357) — motion audit 17/11. Log: aab-build-607.log (na pasta do mobile)
REM NOTA: este ambiente tem NoDefaultCurrentDirectoryInExe — gradlew.bat PRECISA de caminho explícito.
cd /d "%~dp0android"
call "%~dp0android\gradlew.bat" bundleRelease >> ..\aab-build-607.log 2>&1
if errorlevel 1 (
  echo GRADLE_FALHOU >> ..\aab-build-607.log
  exit /b 1
)
echo BUILD_OK >> ..\aab-build-607.log
