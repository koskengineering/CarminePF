#!/bin/bash

# CarminePF Setup Script

echo "🚀 CarminePF セットアップを開始します..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Dockerがインストールされていません。Dockerをインストールしてください。"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Composeがインストールされていません。Docker Composeをインストールしてください。"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.jsがインストールされていません。Node.js 20以上をインストールしてください。"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20以上が必要です。現在のバージョン: $(node --version)"
    exit 1
fi

echo "✅ 必要な依存関係が確認できました"

# Create .env file if it doesn't exist
if [ ! -f "backend/.env" ]; then
    echo "📝 環境変数ファイルを作成しています..."
    cp backend/.env.example backend/.env
    echo "⚠️  backend/.env ファイルを編集してKeepa APIキーを設定してください"
fi

# Install backend dependencies
echo "📦 バックエンドの依存関係をインストールしています..."
cd backend
npm install

# Generate Prisma client
echo "🔧 Prisma クライアントを生成しています..."
npx prisma generate

# Go back to root directory
cd ..

# Start services with Docker Compose
echo "🐳 Dockerサービスを起動しています..."
docker-compose up -d

# Wait for MySQL to be ready
echo "⏳ MySQLの起動を待機しています..."
sleep 10

# Run database migrations
echo "🗄️ データベースマイグレーションを実行しています..."
cd backend
npm run prisma:migrate
cd ..

echo "✅ セットアップが完了しました！"
echo ""
echo "📋 次のステップ:"
echo "1. backend/.env ファイルを編集してKeepa APIキーを設定"
echo "2. Chromeで chrome://extensions/ を開く"
echo "3. デベロッパーモードを有効化"
echo "4. 「パッケージ化されていない拡張機能を読み込む」で extension フォルダを選択"
echo "5. Chrome拡張機能のアイコンをクリックしてサイドパネルを開く"
echo ""
echo "🌐 バックエンドURL: http://localhost:3000"
echo "📊 Prisma Studio: npm run prisma:studio (backend ディレクトリ内で実行)"
echo ""
echo "🔧 開発時のコマンド:"
echo "  - バックエンド開発モード: cd backend && npm run dev"
echo "  - サービス停止: docker-compose down"
echo "  - ログ確認: docker-compose logs"