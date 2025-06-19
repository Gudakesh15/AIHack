# Voice Call Integration with Vapi (Web-Based)

## How It Works

This Telegram bot now supports **browser-based voice calls** using Vapi's web integration. No phone numbers needed!

### User Experience

1. **User requests voice call**: 
   - "call me"
   - "voice call" 
   - "talk to me"
   - "phone call"

2. **Bot creates web call session**:
   - Shows "Setting up your voice call..." message
   - Creates Vapi assistant with conversation context
   - Generates secure web call URL

3. **Bot sends web call link**:
   - Clickable link opens in browser
   - No downloads or apps needed
   - Works on mobile and desktop

4. **User has voice conversation**:
   - Natural speech in browser
   - AI has full context from Telegram chat
   - 10-15 minute conversation

### Technical Implementation

The system uses:
- **Vapi Web API**: Creates browser-based voice sessions
- **Dynamic assistants**: Each call gets a custom assistant with context
- **Context preservation**: Includes wallet data and chat history
- **Webhook handling**: Receives call events for monitoring

### API Integration

#### Required Environment Variables:
```bash
VAPI_API_KEY=your_vapi_api_key_from_dashboard
VAPI_WEBHOOK_URL=https://your-app-url.com/webhook/vapi
```

#### Key API Calls:
1. **Create Assistant**: `POST /assistant` with context prompt
2. **Create Web Call**: `POST /call/web` with assistant ID
3. **Handle Webhooks**: Process call events and transcripts

### Context Examples

**With wallet data:**
```
User has 45.7 TON in their wallet (TON). Previous conversation about crypto strategy and portfolio analysis. User wants to discuss their holdings and get investment advice.
```

**Voice-only request:**
```
User requested voice consultation for crypto advice and strategy discussion.
```

### Web Call Response Format

```
🎙️ **Voice Call Ready!**

Your personalized AI strategist is ready to talk with your conversation context.

**Click to start voice conversation:**
https://vapi.ai/call/abc123...

**What to expect:**
• Natural voice conversation in your browser
• No downloads or apps needed  
• Personalized crypto strategy advice
• 10-15 minute conversation

💡 Tip: Use headphones for best audio quality!
```

### Webhook Events

The system handles these Vapi webhook events:
- `status-update`: Call started/ended
- `transcript`: Real-time conversation transcript
- `call-ended`: Final summary and cleanup

### Error Handling

If web call creation fails:
- Shows user-friendly error message
- Logs detailed error for debugging
- Suggests fallback to text-based questions

### Advantages over Phone Calls

✅ **No phone number required**
✅ **Works on any device with browser**  
✅ **Better audio quality over internet**
✅ **Easier integration (no phone number management)**
✅ **More privacy-friendly**
✅ **Works internationally without phone charges**

## Setup Instructions

1. **Get Vapi API Key**: Sign up at dashboard.vapi.ai
2. **Set environment variables** in your `.env` file
3. **Deploy with webhook endpoint** for call events
4. **Test with "call me" in Telegram**

## Next Steps

Optional enhancements:
- **Call summaries**: Send conversation summary back to Telegram
- **Call history**: Track user's previous voice conversations  
- **Custom voices**: Different AI voices for different contexts
- **Call scheduling**: Allow users to schedule calls for later 