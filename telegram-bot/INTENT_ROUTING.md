# Intent-Based Message Routing System

## 🧠 Overview

This system routes Telegram messages to different n8n endpoints based on user intent, creating a more sophisticated conversation flow with context awareness.

## 🔄 Message Flow

```
User Message → Intent Detection → Route to Appropriate Handler
                    ↓
    ┌─────────────────┼─────────────────┐
    ↓                 ↓                 ↓
  Wallet           Basic            Affirmative
 Address         Question           Response
    ↓                 ↓                 ↓
Wallet Analysis → Basic n8n    → Strategy n8n
    ↓              Endpoint        (with wallet data)
Set User State       ↓                 ↓
    ↓           Add wallet CTA    Clear User State
Strategy CTA         ↓                 ↓
                Response           Strategy Response
```

## 🎯 Intent Types

### 1. **Wallet Address** (`wallet`)
- **Trigger**: TON/ETH address detected in message
- **Action**: Fetch wallet balance → Set user state → Send response with strategy CTA
- **Response**: Wallet analysis + "Type 'yes' for personalized strategy"

### 2. **Basic Question** (`basic_question`)
- **Trigger**: Any general crypto question
- **Action**: Forward to `/basic` n8n endpoint
- **Response**: AI answer + "Share wallet for personalized advice"

### 3. **Affirmative Response** (`affirmative`)
- **Trigger**: "yes", "yeah", "sure", "ok", etc.
- **Context-Aware Action**:
  - If user state = `awaiting_strategy_confirmation` → Forward to `/strategy` with wallet data
  - Otherwise → Treat as basic question

### 4. **Negative Response** (`negative`)
- **Trigger**: "no", "nope", "not now", etc.
- **Action**: Clear user state → Ask how else to help

## 🗃️ User State Management

Users have temporary state stored in memory:

```javascript
{
  context: 'awaiting_strategy_confirmation' | null,
  lastWalletData: { balance, type, address, ... },
  timestamp: Date.now()
}
```

- **Auto-cleanup**: States expire after 10 minutes
- **Manual cleanup**: Cleared on `/start`, errors, or completed flows

## 🔗 API Endpoints

### Basic Questions Endpoint
- **URL**: `N8N_BASIC_WEBHOOK_URL`
- **Purpose**: Handle general crypto questions
- **Payload**:
  ```json
  {
    "message": "What are perpetual futures?",
    "userId": 12345,
    "source": "telegram",
    "intent": "basic_question",
    "timestamp": "2024-...",
    "requestId": "uuid"
  }
  ```
- **Response**: Includes CTA to connect wallet

### Strategy Analysis Endpoint
- **URL**: `N8N_STRATEGY_WEBHOOK_URL`
- **Purpose**: Provide personalized investment strategies
- **Payload**:
  ```json
  {
    "message": "User requested personalized investment strategy",
    "userId": 12345,
    "source": "telegram", 
    "intent": "strategy_request",
    "walletData": {
      "type": "TON",
      "balance": "1500000000",
      "balanceTON": 1.5,
      "currency": "TON",
      "address_preview": "EQD7F..."
    },
    "timestamp": "2024-...",
    "requestId": "uuid"
  }
  ```

## 🛡️ Security & Privacy

- **Full wallet addresses** are never sent to n8n (only previews)
- **User states** are stored in memory only (not persisted)
- **Automatic cleanup** prevents memory leaks
- **Rate limiting** applies to all intents

## 🔧 Configuration

Add to your `.env` file:

```env
# Basic questions endpoint
N8N_BASIC_WEBHOOK_URL=https://your-n8n-instance.com/webhook/basic-questions

# Strategy analysis endpoint  
N8N_STRATEGY_WEBHOOK_URL=https://your-n8n-instance.com/webhook/strategy-analysis
```

## 📝 Example Conversations

### Scenario 1: Wallet → Strategy Flow
```
User: EQD7F8T73kFApTQFjNXj9d4GfNRgJzHC7ku2w9E2M7sGI7-e
Bot: 💳 Your TON Wallet Analysis:
     💰 Balance: 1.50 TON
     🚀 Ready for personalized strategy?
     Type "yes" to get custom strategy...

User: yes
Bot: [Detailed strategy based on 1.5 TON balance]
```

### Scenario 2: Basic Question Flow
```
User: What are DeFi yield farms?
Bot: [Explanation of yield farming]
     💡 Want personalized advice?
     Share your wallet address for tailored strategies!

User: EQD7F8T73kFApTQFjNXj9d4GfNRgJzHC7ku2w9E2M7sGI7-e
Bot: [Wallet analysis + strategy CTA]
```

## 🚀 Benefits

1. **Context-Aware**: Remembers user actions for intelligent follow-ups
2. **Efficient Routing**: Different n8n workflows for different intents
3. **Better UX**: Clear CTAs guide users through optimal conversation paths
4. **Scalable**: Easy to add new intent types and endpoints
5. **Privacy-First**: Minimal data exposure to external services

## 🧪 Testing

Test the different flows:

1. **Basic Question**: "What is Bitcoin?"
2. **Wallet Analysis**: Send any TON address
3. **Strategy Confirmation**: After wallet analysis, type "yes"
4. **Decline Strategy**: After wallet analysis, type "no"

## 🔄 Migration

The system maintains backward compatibility:
- Legacy `N8N_WEBHOOK_URL` still supported
- Gradual migration path available
- No breaking changes to existing functionality 