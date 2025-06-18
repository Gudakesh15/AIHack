# TON AI Telegram Bot Bridge

A lightweight Express.js application that bridges Telegram messages to an existing n8n AI backend for crypto strategy assistance.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- npm or yarn
- Telegram Bot Token (from @BotFather)
- n8n webhook URL

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your actual values
   ```

3. **Start the server:**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## 🔧 Configuration

Edit `.env` file with your values:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/telegram-bot
PORT=3000
```

## 📡 Endpoints

- `GET /health` - Health check
- `POST /webhook/telegram` - Telegram webhook endpoint

## 🔗 Telegram Bot Setup

1. Create bot with @BotFather
2. Get bot token
3. Set webhook URL to your deployed app:
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_APP_URL>/webhook/telegram
   ```

## 🚢 Deployment

### Railway
```bash
# Deploy to Railway
railway login
railway init
railway up
```

### Fly.io
```bash
# Deploy to Fly.io
fly auth login
fly launch
fly deploy
```

## 🧪 Testing

Test the health endpoint:
```bash
curl http://localhost:3000/health
```

## 🔄 Flow

1. User sends message to Telegram bot
2. Telegram forwards to `/webhook/telegram`
3. App extracts message and forwards to n8n
4. App receives n8n response
5. App sends formatted reply back to Telegram user

## 🐛 Troubleshooting

- Check logs for webhook delivery issues
- Verify environment variables are set
- Ensure n8n webhook is accessible
- Test with Telegram webhook test tool 