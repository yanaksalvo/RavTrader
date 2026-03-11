@echo off
echo Building RAV Trader Chrome Extension...

REM Check if 7z is installed (Common on Windows)
set ZIP_CMD="C:\Program Files\7-Zip\7z.exe"
if not exist %ZIP_CMD% (
    echo 7-Zip is not installed at the default location. 
    echo Please manually right-click the chrome-extension folder and click 'Send to - Compressed (zipped) folder'
    pause
    exit /b 1
)

echo Creating RAV-Trader-Extension.zip...
%ZIP_CMD% a -tzip ..\RAV-Trader-Extension.zip * -x!build.bat

echo Done! The RAV-Trader-Extension.zip file is ready on your desktop (RavTraderNEW folder).
pause
