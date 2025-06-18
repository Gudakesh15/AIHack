# 🧪 Testing the Complete Telegram Bot Flow

This guide will help you test the entire end-to-end flow: **Telegram → Express.js → n8n → Express.js → Telegram**

## 🚀 Quick Test Setup

### 1. **Prerequisites Check**
✅ Express.js server implemented  
✅ n8n workflow running  
✅ Telegram bot created  

### 2. **Environment Setup**

Create a `.env` file in the `telegram-bot/` directory:

```bash
# Required
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/telegram-bot

# Optional (for local testing)
PORT=3000
PUBLIC_URL=https://your-ngrok-url.ngrok.io  # If using ngrok
NODE_ENV=development
```

### 3. **Start the Server**

```bash
cd telegram-bot
npm install
npm run dev
```

You should see:
```
🤖 TON AI Telegram Bot Bridge running on port 3000
📋 Health check: http://localhost:3000/health
📞 Webhook endpoint: http://localhost:3000/webhook/telegram
```

### 4. **Run the Flow Test**

```bash
# Test the complete flow
npm run test:flow

# Or just test server health
npm run test:health
```

## 🔧 Test Options

### **Option A: Local Testing (Recommended)**
**Perfect for testing the logic without real Telegram integration**

1. Start your server: `npm run dev`
2. Run the test script: `npm run test:flow`
3. Watch the console for detailed logs

### **Option B: Full Integration Testing**
**Test with real Telegram webhook (requires public URL)**

1. **Get a public URL** (choose one):
   - **ngrok**: `ngrok http 3000`
   - **Railway**: Deploy to Railway
   - **Fly.io**: Deploy to Fly.io

2. **Set PUBLIC_URL** in your `.env`:
   ```bash
   PUBLIC_URL=https://your-public-url.com
   ```

3. **Register webhook with Telegram**:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-public-url.com/webhook/telegram"
   ```

4. **Send real messages** to your Telegram bot!

## 📊 What the Test Does

The test script simulates the complete flow:

1. **✅ Health Check** - Verifies server is running
2. **✅ Configuration Check** - Validates environment variables
3. **✅ Message Simulation** - Sends test messages to webhook
4. **✅ n8n Integration** - Tests forwarding to your n8n workflow
5. **✅ Response Parsing** - Verifies response format parsing
6. **✅ Error Handling** - Tests various failure scenarios

### Test Messages:
- `/start` - Welcome message
- `What is Bitcoin?` - Real AI query
- `Explain DeFi to me` - Another AI query
- `What are the latest crypto trends?` - Complex query

## 🐛 Troubleshooting

### **"Server health check failed"**
- ✅ Make sure server is running: `npm run dev`
- ✅ Check port 3000 is not in use

### **"Missing environment variables"**
- ✅ Create `.env` file with required variables
- ✅ Double-check TELEGRAM_BOT_TOKEN and N8N_WEBHOOK_URL

### **"Error forwarding to n8n"**
- ✅ Verify your n8n workflow is running
- ✅ Check N8N_WEBHOOK_URL is accessible
- ✅ Test n8n webhook directly with curl

### **"Webhook setup failed"**
- ✅ Verify PUBLIC_URL is accessible from internet
- ✅ Check TELEGRAM_BOT_TOKEN is valid
- ✅ Make sure webhook URL ends with `/webhook/telegram`

## 📝 Expected Output

### **Successful Test:**
```
🚀 TELEGRAM BOT FULL FLOW TEST
=====================================

🔧 Checking configuration...
✅ TELEGRAM_BOT_TOKEN: Set
✅ N8N_WEBHOOK_URL: Set
✅ PUBLIC_URL: Not set (optional for local testing)

🏥 Testing server health...
✅ Server is healthy!

📨 Testing message processing...

🧪 Testing message: "/start"
📤 Sending to webhook...
✅ Success! Response: 200 (1250ms)

🧪 Testing message: "What is Bitcoin?"
📤 Sending to webhook...
✅ Success! Response: 200 (3400ms)

📊 TEST SUMMARY
=================
✅ Successful: 4/4
❌ Failed: 0/4

🎉 ALL TESTS PASSED! Your bot is working correctly!
```

## 🎯 Next Steps After Testing

1. **If local tests pass**: Deploy to Railway/Fly.io and test with real Telegram
2. **If tests fail**: Check the specific error messages and fix configuration
3. **Monitor logs**: Watch console output during testing for detailed debugging

## 🔗 Quick Commands Reference

```bash
# Install and start
npm install && npm run dev

# Test the flow
npm run test:flow

# Test server only
npm run test:health

# View help
node test-real-flow.js --help
```

Happy testing! 🚀 