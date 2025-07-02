@echo off
echo Fixing database setup for CarminePF Backend...
echo.

REM Stop any running processes
echo Stopping any running processes...
taskkill /f /im node.exe 2>nul
taskkill /f /im nodemon.exe 2>nul

echo.
echo Checking database file...
if exist "prisma\dev.db" (
    echo Database file exists: prisma\dev.db
) else (
    echo Database file does not exist, will be created during migration
)

echo.
echo Running database migration...
call npx prisma migrate dev --name init

echo.
echo Generating Prisma Client...
call npx prisma generate

echo.
echo Database setup complete!
echo.
echo You can now run:
echo   npm run dev     - to start development server
echo   npm run build   - to build the project
echo.
pause