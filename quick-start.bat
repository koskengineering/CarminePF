@echo off
echo 🚀 CarminePF クイックスタート（ローカル環境）

echo 📦 バックエンド依存関係をインストール中...
cd backend
call npm install

echo 🔧 Prismaクライアントを生成中...
call npx prisma generate

echo 📝 ローカル環境用の.envファイルを作成中...
(
echo # Server Configuration
echo PORT=3000
echo NODE_ENV=development
echo.
echo # Database Configuration ^(SQLite for quick start^)
echo DATABASE_URL="file:./dev.db"
echo.
echo # Keepa API
echo KEEPA_API_KEY=dur10m9eqidpsc1ek7vghmnc7pq02mccse3ffdndjh0pn85i17f3gkud1rft3hn2
echo.
echo # CORS Configuration
echo CORS_ORIGIN=chrome-extension://*
echo.
echo # Logging
echo LOG_LEVEL=debug
) > .env

echo ✅ 設定完了！

echo 🌐 開発サーバーを起動するには：
echo    cd backend
echo    npm run dev

pause