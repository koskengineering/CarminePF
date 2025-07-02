#!/bin/bash

# Local development setup script (without Docker)

echo "🚀 ローカル開発環境でCarminePFを起動します..."

# Check if MySQL is installed
if ! command -v mysql &> /dev/null; then
    echo "❌ MySQLがインストールされていません。"
    echo "📝 以下のいずれかの方法でMySQLをインストールしてください："
    echo "   1. XAMPP: https://www.apachefriends.org/download.html"
    echo "   2. MySQL直接インストール: https://dev.mysql.com/downloads/mysql/"
    echo "   3. Dockerの設定を完了させる"
    exit 1
fi

# Update .env for local MySQL
echo "📝 ローカルMySQL用の環境変数を設定..."
cd backend

# Create local .env
cat > .env << EOF
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration (Local MySQL)
DATABASE_URL="mysql://root:@localhost:3306/carminepf_dev"

# Keepa API
KEEPA_API_KEY=dur10m9eqidpsc1ek7vghmnc7pq02mccse3ffdndjh0pn85i17f3gkud1rft3hn2

# CORS Configuration
CORS_ORIGIN=chrome-extension://*

# Logging
LOG_LEVEL=debug
EOF

echo "✅ 環境変数ファイルを更新しました"

# Install dependencies if not installed
if [ ! -d "node_modules" ]; then
    echo "📦 依存関係をインストール中..."
    npm install
fi

# Generate Prisma client
echo "🔧 Prisma クライアントを生成中..."
npx prisma generate

# Create database if it doesn't exist
echo "🗄️ データベースを作成中..."
mysql -u root -e "CREATE DATABASE IF NOT EXISTS carminepf_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || {
    echo "⚠️  MySQLに接続できませんでした。MySQLサービスが起動していることを確認してください。"
    echo "📝 XAMPPを使用している場合は、XAMPPコントロールパネルでMySQLを開始してください。"
    exit 1
}

# Run migrations
echo "🔄 データベースマイグレーションを実行中..."
npx prisma migrate dev --name init

echo "✅ ローカル環境の準備が完了しました！"
echo ""
echo "🌐 バックエンドを起動するには："
echo "   cd backend && npm run dev"
echo ""
echo "📊 Prisma Studioを起動するには："
echo "   cd backend && npm run prisma:studio"
echo ""
echo "🔧 Chrome拡張機能の設定："
echo "   1. chrome://extensions/ を開く"
echo "   2. デベロッパーモードを有効化"
echo "   3. extension フォルダを読み込み"