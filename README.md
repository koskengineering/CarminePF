# CarminePF - Keepa Product Finder Automation

CarminePF is an automation system that detects newly added products from Keepa Product Finder and automatically purchases them on Amazon Japan. It consists of a backend API service and a Chrome extension for automated purchasing.

## Features

- **Keepa Integration**: Monitors Keepa Product Finder API for new products
- **Automatic Detection**: Identifies newly added ASINs based on configured criteria
- **Smart Baseline**: First run establishes baseline, subsequent runs detect differences
- **Chrome Extension**: Automated Amazon purchasing with configurable parameters
- **Purchase Conditions**: Filter by star rating, review count, seller type (Amazon/FBA)
- **Real-time Monitoring**: 1-minute interval API polling with proper rate limiting
- **Comprehensive Logging**: Full audit trail of all operations

## Architecture

### Backend (Node.js + TypeScript)
- **Express.js** API server
- **Prisma ORM** with SQLite/MySQL support  
- **Docker** containerization
- **PM2** process management
- **Scheduled Jobs** for Keepa API polling

### Chrome Extension (Manifest V3)
- **Side Panel UI** for configuration
- **Content Scripts** for Amazon automation
- **Background Service Worker** for coordination
- **Local Storage** for purchase history

## Quick Start

### Prerequisites
- Node.js 18+
- Chrome Browser
- Keepa API Key

### Backend Setup

1. **Clone and Install**
```bash
git clone https://github.com/koskengineering/CarminePF.git
cd CarminePF/backend
npm install
```

2. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your Keepa API key
```

3. **Database Setup**
```bash
npx prisma generate
npx prisma migrate dev
```

4. **Start Development Server**
```bash
npm run dev
```

### Chrome Extension Setup

1. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"

2. **Load Extension**
   - Click "Load unpacked"
   - Select the `extension` folder

3. **Configure Settings**
   - Click the CarminePF extension icon
   - Set your backend URL (default: http://localhost:3000)
   - Configure purchase parameters

## Configuration

### Backend Configuration

Create `.env` file in the backend directory:

```env
# Keepa API
KEEPA_API_KEY=your_keepa_api_key_here

# Database
DATABASE_URL="file:./dev.db"

# Server
PORT=3000
NODE_ENV=development

# CORS (for extension)
CORS_ORIGIN=chrome-extension://*
```

### Extension Configuration

Configure via the side panel UI:
- **Keepa Product Finder URL**: Your Keepa API endpoint
- **Review Requirements**: Minimum star rating and review count
- **Seller Filters**: Amazon-only or FBA-only options
- **Status Monitoring**: Real-time system status

## API Endpoints

### Configuration Management
- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration
- `DELETE /api/config` - Reset configuration

### System Control
- `POST /api/start` - Start monitoring
- `POST /api/stop` - Stop monitoring
- `GET /api/status` - Get system status

### Item Management
- `GET /api/items` - Get purchase queue items
- `POST /api/items/mark-processed` - Mark items as processed

### Health Check
- `GET /health` - Service health status

## Production Deployment

### Using Docker

1. **Build and Run**
```bash
cd backend
docker-compose up -d
```

2. **Environment Setup**
```bash
# Set production environment variables
export KEEPA_API_KEY=your_api_key
export DATABASE_URL=your_database_url
```

### Using PM2 (Windows/Linux)

1. **Install PM2**
```bash
npm install -g pm2
```

2. **Start Application**
```bash
cd backend
npm run build
pm2 start ecosystem.config.js
```

3. **Setup Auto-restart**
```bash
pm2 startup
pm2 save
```

## Purchase Flow

1. **Configuration**: Set Keepa URL and purchase criteria
2. **Baseline Establishment**: First run saves all current ASINs
3. **Monitoring**: System polls Keepa API every minute
4. **Detection**: New ASINs trigger purchase items creation
5. **Seller Discovery**: Keepa product API fetches cheapest new seller ID and price
6. **Automation**: Chrome extension processes purchase queue with seller-specific URLs
7. **Validation**: Products checked against configured criteria
8. **Purchase**: Automated Amazon checkout process targeting specific seller
9. **Logging**: Complete audit trail maintained

### Enhanced Seller Targeting

The system now automatically:
- Fetches seller information for new products using Keepa's product API
- Identifies the cheapest new seller for each ASIN
- Opens Amazon pages with seller-specific URLs (`?m=SELLER_ID`)
- Stores price information for reference
- Falls back to regular product pages if seller ID unavailable

## Security Considerations

- **API Keys**: Store securely in environment variables
- **Rate Limiting**: Respects Keepa API limits
- **Error Handling**: Comprehensive error recovery
- **Data Privacy**: No sensitive data stored in extension
- **HTTPS**: Use HTTPS in production
- **Firewall**: Secure backend API endpoints

## Troubleshooting

### Common Issues

**Extension not connecting to backend**
- Verify backend is running on correct port
- Check CORS configuration in .env
- Ensure extension has correct backend URL

**Keepa API errors**
- Verify API key is correct
- Check API token balance
- Review rate limiting status

**Purchase automation failures**
- Check Amazon login status
- Verify product availability
- Review error logs in extension console

### Logs and Monitoring

**Backend Logs**
```bash
# View real-time logs
pm2 logs CarminePF

# View log files
tail -f logs/combined.log
```

**Extension Logs**
- Open Chrome DevTools
- Navigate to Extensions > CarminePF > Inspect views
- Check Console and Network tabs

## Development

### Backend Development
```bash
cd backend
npm run dev        # Start with hot reload
npm run build      # Build for production
npm run test       # Run tests
npm run lint       # Check code style
```

### Extension Development
```bash
cd extension
# Make changes to files
# Reload extension in chrome://extensions/
```

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Support

For issues and questions:
1. Check existing GitHub issues
2. Create new issue with detailed description
3. Include logs and configuration details

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

---

**⚠️ Disclaimer**: This tool is for educational and legitimate business purposes only. Users are responsible for complying with all applicable terms of service and regulations.