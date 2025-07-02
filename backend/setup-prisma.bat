@echo off
echo Setting up Prisma for CarminePF Backend...
echo.

REM Install dependencies
echo Installing dependencies...
call npm install

REM Generate Prisma Client
echo.
echo Generating Prisma Client...
call npx prisma generate

REM Run database migrations
echo.
echo Running database migrations...
call npx prisma migrate deploy

echo.
echo Prisma setup complete!
echo.
echo You can now run:
echo   npm run build   - to build the project
echo   npm run dev     - to start development server
echo.
pause