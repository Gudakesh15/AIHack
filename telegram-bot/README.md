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

# Intent-based routing endpoints
N8N_BASIC_WEBHOOK_URL=https://your-n8n-instance.com/webhook/basic-questions
N8N_STRATEGY_WEBHOOK_URL=https://your-n8n-instance.com/webhook/strategy-analysis

# Legacy endpoint (optional)
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/telegram-bot

PORT=3000
PUBLIC_URL=https://your-app-url.com
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

## 🔄 Complete End-to-End Flow

### **Message Journey: User → AI → User**

1. **User** sends message to Telegram bot (e.g., "What's Bitcoin price?")
2. **Telegram API** forwards to Express.js `POST /webhook/telegram`
3. **Express.js** extracts data (chat_id, user_id, message_text) & responds 200 OK
4. **Express.js** forwards to n8n webhook with payload:
   ```json
   {
     "message": "What's Bitcoin price?",
     "userId": 12345,
     "source": "telegram",
     "timestamp": "2024-..."
   }
   ```
5. **n8n AI Processing Chain:**
   - Webhook → AI Agent (chat memory) → Perplexity (research) → AI Agent1 → Structured Output Parser → Respond to Webhook
6. **n8n** responds to Express.js with structured format:
   ```json
   {
     "results": [
       {
         "toolCallId": "call_xyz...",
         "result": "Bitcoin is currently trading at $45,234..."
       }
     ]
   }
   ```
7. **Express.js** parses `response.data.results[0].result`
8. **Express.js** sends to Telegram Bot API `/sendMessage`
9. **User** receives AI response

### **Key Architecture Notes:**
- ✅ **Express.js acts as bridge** - All responses flow through our server
- ✅ **Async processing** - Telegram gets immediate acknowledgment
- ✅ **Rate limiting** - 10 requests/minute per IP
- ✅ **Error handling** - Multiple fallback paths
- ✅ **Memory context** - n8n maintains chat history

## 🐛 Troubleshooting

- Check logs for webhook delivery issues
- Verify environment variables are set
- Ensure n8n webhook is accessible
- Test with Telegram webhook test tool 