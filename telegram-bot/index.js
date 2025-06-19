const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const logger = require('./logger');
const { detectWalletAddress, getWalletData, formatWalletResponse, formatWalletResponseWithStrategyCTA } = require('./wallet-utils');
const VapiIntegration = require('./voice-integration');
require('dotenv').config();

// Initialize Vapi integration
const vapiIntegration = new VapiIntegration();

// Check Vapi configuration at startup
if (vapiIntegration.isConfigured()) {
  logger.info('Vapi integration configured successfully', {
    hasAssistantId: !!process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID,
    hasPrivateKey: !!process.env.VAPI_PRIVATE_KEY
  });
} else {
  logger.warn('Vapi integration not fully configured - voice calls will not work', {
    hasAssistantId: !!process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID,
    hasPrivateKey: !!process.env.VAPI_PRIVATE_KEY
  });
}

// User state management for context-aware responses
const userStates = new Map();

// Intent detection functions
function detectIntent(messageText) {
  const text = messageText.toLowerCase().trim();
  
  // Check for wallet address first (highest priority)
  const walletDetected = detectWalletAddress(messageText);
  if (walletDetected) {
    return { type: 'wallet', data: walletDetected };
  }
  
  // Remove phone number detection since we're using web calls now
  
  // Check for voice call requests
  const voiceRequests = ['call me', 'voice call', 'phone call', 'talk to me', 'speak with me', 'voice chat'];
  if (voiceRequests.some(phrase => text.includes(phrase))) {
    return { type: 'voice_request', data: text };
  }

  // Check for voice troubleshooting requests
  const voiceTroublehooting = ['voice not working', 'call not working', 'mobile voice', 'phone voice issue', 'voice help'];
  if (voiceTroublehooting.some(phrase => text.includes(phrase))) {
    return { type: 'voice_troubleshooting', data: text };
  }
  
  // Check for affirmative responses
  const affirmativeResponses = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'y', '👍', 'go ahead', 'proceed'];
  if (affirmativeResponses.includes(text)) {
    return { type: 'affirmative', data: text };
  }
  
  // Check for negative responses
  const negativeResponses = ['no', 'nope', 'nah', 'not now', 'later', 'n', '👎', 'skip'];
  if (negativeResponses.includes(text)) {
    return { type: 'negative', data: text };
  }
  
  // Default to basic question
  return { type: 'basic_question', data: text };
}

// Phone number detection function removed - using web calls instead

function getUserState(userId) {
  return userStates.get(userId) || { context: null, lastWalletData: null, timestamp: null };
}

function setUserState(userId, context, data = null) {
  userStates.set(userId, {
    context: context,
    lastWalletData: data,
    timestamp: Date.now()
  });
  
  // Clean up old states (older than 10 minutes)
  setTimeout(() => {
    const state = userStates.get(userId);
    if (state && Date.now() - state.timestamp > 600000) { // 10 minutes
      userStates.delete(userId);
      logger.debug('User state cleaned up', { userId });
    }
  }, 600000);
}

function clearUserState(userId) {
  userStates.delete(userId);
}

// API routing functions
async function forwardToBasic(message, userId, requestId) {
  const startTime = Date.now();
  
  try {
    const basicWebhookUrl = process.env.N8N_BASIC_WEBHOOK_URL;
    
    if (!basicWebhookUrl) {
      logger.error('N8N_BASIC_WEBHOOK_URL not configured', { userId, requestId });
      return { 
        error: 'configuration', 
        message: "Basic questions service is not properly configured. Please check back soon!" 
      };
    }
    
    const payload = {
      message: message,
      userId: userId,
      source: 'telegram',
      intent: 'basic_question',
      timestamp: new Date().toISOString(),
      requestId: requestId
    };
    
    logger.info('Forwarding to basic n8n endpoint', {
      userId,
      requestId,
      messageLength: message.length,
      basicUrl: basicWebhookUrl.replace(/\/[^\/]*$/, '/***')
    });
    
    const response = await axios.post(basicWebhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000 // 2 minute timeout for basic questions
    });
    
    const duration = Date.now() - startTime;
    logger.info('Basic n8n response received', {
      userId,
      requestId,
      duration: `${duration}ms`,
      status: response.status,
      responseData: JSON.stringify(response.data, null, 2), // Debug: full response
      responseType: typeof response.data,
      responseKeys: typeof response.data === 'object' ? Object.keys(response.data) : 'not_object'
    });
    
    // Parse response and add CTA
    let responseText = '';
    if (response.data && typeof response.data === 'object') {
      // Handle n8n structured output format: {"results": [{"toolCallId": "...", "result": "..."}]}
      if (response.data.results && Array.isArray(response.data.results) && response.data.results.length > 0) {
        responseText = response.data.results[0].result;
      }
      // Handle direct n8n webhook response with output field
      else if (response.data.output) {
        responseText = response.data.output;
      }
      // Handle other common response formats
      else if (response.data.message) {
        responseText = response.data.message;
      }
      else if (response.data.response) {
        responseText = response.data.response;
      }
      // If it's a simple object with one string value, use that
      else {
        const values = Object.values(response.data).filter(v => typeof v === 'string' && v.length > 10);
        if (values.length > 0) {
          responseText = values[0];
        } else {
          responseText = JSON.stringify(response.data);
        }
      }
    } else if (typeof response.data === 'string') {
      responseText = response.data;
    } else {
      responseText = 'I processed your question but got an unexpected response format.';
    }
    
    // Add CTA to connect wallet AND voice call option
    responseText += '\n\n💡 **Want personalized advice?**\nShare your wallet address and I can analyze your holdings for tailored strategies!' +
                   '\n\n🎙️ **Prefer to talk it through?**\nType "call me" for a voice conversation in your browser!';
    
    return responseText;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error forwarding to basic endpoint', {
      error: error.message,
      stack: error.stack,
      userId,
      requestId,
      duration: `${duration}ms`
    });
    
    return { 
      error: 'basic_api_error', 
      message: 'Sorry, I had trouble processing your question. Please try again in a moment.' 
    };
  }
}

async function forwardToStrategy(message, userId, walletData, requestId) {
  const startTime = Date.now();
  
  try {
    const strategyWebhookUrl = process.env.N8N_STRATEGY_WEBHOOK_URL;
    
    if (!strategyWebhookUrl) {
      logger.error('N8N_STRATEGY_WEBHOOK_URL not configured', { userId, requestId });
      return { 
        error: 'configuration', 
        message: "Strategy service is not properly configured. Please check back soon!" 
      };
    }
    
    const payload = {
      message: message,
      userId: userId,
      source: 'telegram',
      intent: 'strategy_request',
      walletData: {
        type: walletData.type,
        balance: walletData.balance,
        balanceTON: walletData.balanceTON,
        currency: walletData.currency,
        address_preview: walletData.address?.substring(0, 8) + '...' // Don't send full address
      },
      timestamp: new Date().toISOString(),
      requestId: requestId
    };
    
    logger.info('Forwarding to strategy n8n endpoint', {
      userId,
      requestId,
      messageLength: message.length,
      walletType: walletData.type,
      balance: walletData.balanceTON,
      strategyUrl: strategyWebhookUrl.replace(/\/[^\/]*$/, '/***')
    });
    
    const response = await axios.post(strategyWebhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 300000 // 5 minute timeout for strategy analysis
    });
    
    const duration = Date.now() - startTime;
    logger.info('Strategy n8n response received', {
      userId,
      requestId,
      duration: `${duration}ms`,
      status: response.status,
      responseData: JSON.stringify(response.data, null, 2), // Debug: full response
      responseType: typeof response.data,
      responseKeys: typeof response.data === 'object' ? Object.keys(response.data) : 'not_object'
    });
    
    // Parse response (same logic as basic endpoint)
    if (response.data && typeof response.data === 'object') {
      // Handle n8n structured output format: {"results": [{"toolCallId": "...", "result": "..."}]}
      if (response.data.results && Array.isArray(response.data.results) && response.data.results.length > 0) {
        return response.data.results[0].result;
      }
      // Handle direct n8n webhook response with output field
      else if (response.data.output) {
        return response.data.output;
      }
      // Handle other common response formats
      else if (response.data.message) {
        return response.data.message;
      }
      else if (response.data.response) {
        return response.data.response;
      }
      // If it's a simple object with one string value, use that
      else {
        const values = Object.values(response.data).filter(v => typeof v === 'string' && v.length > 10);
        if (values.length > 0) {
          return values[0];
        } else {
          return JSON.stringify(response.data);
        }
      }
    } else if (typeof response.data === 'string') {
      return response.data;
    } else {
      return 'I analyzed your wallet but got an unexpected response format. Please try again.';
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error forwarding to strategy endpoint', {
      error: error.message,
      stack: error.stack,
      userId,
      requestId,
      duration: `${duration}ms`
    });
    
    return { 
      error: 'strategy_api_error', 
      message: 'Sorry, I had trouble analyzing your strategy. Please try again in a moment.' 
    };
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  // Skip logging health checks to reduce noise
  if (req.path === '/health') return next();
  
  const start = Date.now();
  const requestId = crypto.randomUUID();
  
  // Add requestId to request object for tracking through the request lifecycle
  req.requestId = requestId;
  
  logger.info('Request received', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // Log when request completes
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });
  
  next();
});

// IP-based rate limiting (existing)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/webhook', limiter);

// User-based rate limiting configuration
const USER_RATE_LIMIT = {
  windowMs: parseInt(process.env.USER_RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 1 minute window
  maxRequests: parseInt(process.env.USER_RATE_LIMIT_MAX_REQUESTS) || 5,    // 5 requests per minute
  message: "⏱️ Please wait a moment before asking another question. You can ask up to 5 questions per minute."
};

// In-memory store for user rate limits
const userRequests = {};

// Function to check user-based rate limit
function checkUserRateLimit(userId) {
  const now = Date.now();
  
  // Initialize user record if not exists
  if (!userRequests[userId]) {
    userRequests[userId] = {
      count: 0,
      resetAt: now + USER_RATE_LIMIT.windowMs
    };
  }
  
  // Reset counter if window has passed
  if (now >= userRequests[userId].resetAt) {
    userRequests[userId] = {
      count: 0,
      resetAt: now + USER_RATE_LIMIT.windowMs
    };
  }
  
  // Check if limit exceeded
  if (userRequests[userId].count >= USER_RATE_LIMIT.maxRequests) {
    const remainingTime = Math.ceil((userRequests[userId].resetAt - now) / 1000);
    return {
      limited: true,
      message: `${USER_RATE_LIMIT.message}\n⏰ Try again in ${remainingTime} seconds.`,
      resetAt: userRequests[userId].resetAt
    };
  }
  
  // Increment counter
  userRequests[userId].count++;
  return { limited: false };
}

// Cleanup mechanism for expired rate limit records
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  for (const userId in userRequests) {
    if (now >= userRequests[userId].resetAt + USER_RATE_LIMIT.windowMs) {
      delete userRequests[userId];
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    logger.info('Rate limit cleanup completed', { 
      cleanedRecords: cleanedCount,
      activeRecords: Object.keys(userRequests).length
    });
  }
}, 15 * 60 * 1000); // Run every 15 minutes

// Health check endpoint
app.get('/health', (req, res) => {
  const vapiConfigured = !!(process.env.VAPI_PRIVATE_KEY);
  
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'TON AI Telegram Bot Bridge',
    features: {
      textChat: true,
      walletAnalysis: !!(process.env.N8N_BASIC_WEBHOOK_URL && process.env.N8N_STRATEGY_WEBHOOK_URL),
      voiceCalls: vapiConfigured
    },
    endpoints: {
      telegram: '/webhook/telegram',
      vapi: vapiConfigured ? '/webhook/vapi' : 'not_configured'
    }
  });
});

// Setup endpoint to register webhook with Telegram
app.get('/setup', async (req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const publicUrl = process.env.PUBLIC_URL;
    
    if (!token) {
      return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
    }
    
    if (!publicUrl) {
      return res.status(400).json({ 
        error: 'PUBLIC_URL not configured. Set this to your public webhook URL (e.g., https://yourapp.railway.app)' 
      });
    }
    
    const webhookUrl = `${publicUrl}/webhook/telegram`;
    const url = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
    
    logger.info('Setting webhook', { webhookUrl, requestId: req.requestId });
    const response = await axios.get(url);
    
    if (response.data.ok) {
      logger.info('Webhook registered successfully', { 
        webhookUrl, 
        telegramResponse: response.data,
        requestId: req.requestId
      });
      res.json({ 
        success: true, 
        webhook: webhookUrl,
        telegram_response: response.data 
      });
    } else {
      logger.error('Failed to register webhook', { 
        webhookUrl, 
        telegramResponse: response.data,
        requestId: req.requestId
      });
      res.status(400).json({ 
        success: false, 
        error: response.data 
      });
    }
  } catch (error) {
    logger.error('Error setting up webhook', { 
      error: error.message, 
      stack: error.stack,
      requestId: req.requestId
    });
    res.status(500).json({ error: error.message });
  }
});

// Telegram webhook endpoint
app.post('/webhook/telegram', async (req, res) => {
  try {
    logger.debug('Telegram webhook received', { 
      requestId: req.requestId,
      bodySize: JSON.stringify(req.body).length 
    });
    
    // Validate the incoming request has the expected structure
    if (!req.body || !req.body.message) {
      logger.warn('Invalid webhook request format', { 
        requestId: req.requestId,
        body: req.body 
      });
      return res.status(400).send('Invalid request format');
    }
    
    // Extract message data
    const { message } = req.body;
    const chatId = message.chat.id;
    const messageText = message.text;
    const userId = message.from.id;
    const userName = message.from.first_name || message.from.username || 'User';
    
    // Log incoming message (without sensitive content)
    logger.info('Message received from user', {
      requestId: req.requestId,
      userId,
      userName,
      chatId,
      messageLength: messageText?.length || 0,
      hasText: !!messageText
    });
    
    // Acknowledge receipt to Telegram (important for webhook performance)
    res.status(200).send('OK');
    
    // Process message in a separate function
    // This allows us to respond to Telegram quickly while processing continues
    processMessage(chatId, messageText, userId, userName, req.requestId);
  } catch (error) {
    logger.error('Error processing webhook', { 
      error: error.message, 
      stack: error.stack,
      requestId: req.requestId
    });
    res.status(500).send('Internal server error');
  }
});

// Vapi webhook endpoint for voice call events
app.post('/webhook/vapi', async (req, res) => {
  try {
    logger.debug('Vapi webhook received', { 
      requestId: req.requestId,
      bodySize: JSON.stringify(req.body).length,
      eventType: req.body.message?.type
    });
    
    // Acknowledge receipt to Vapi
    res.status(200).send('OK');
    
    // Process Vapi webhook event
    const event = vapiIntegration.handleWebhookEvent(req.body);
    
    if (event) {
      logger.info('Vapi webhook event processed', {
        requestId: req.requestId,
        eventType: event.type,
        callId: event.callId
      });
      
      // Handle call-ended events to send summary back to Telegram
      if (event.type === 'call-ended' && event.metadata?.userId) {
        const userId = event.metadata.userId;
        
        // Find user's chat ID (you might want to store this mapping)
        // For now, we'll just log the event
        logger.info('Voice call ended for user', {
          userId,
          duration: event.duration,
          endedReason: event.endedReason,
          hasSummary: !!event.summary
        });
        
        // TODO: Send call summary back to user's Telegram chat
        // This would require storing userId -> chatId mapping
      }
    }
    
  } catch (error) {
    logger.error('Error processing Vapi webhook', { 
      error: error.message, 
      stack: error.stack,
      requestId: req.requestId
    });
    res.status(500).send('Internal server error');
  }
});

// Updated message processing function with intent-based routing
async function processMessage(chatId, messageText, userId, userName, requestId) {
  const processingStartTime = Date.now();
  
  try {
    // Handle /start command (skip rate limiting for this)
    if (messageText === '/start') {
      logger.info('Start command received', { userId, userName, requestId });
      clearUserState(userId); // Clear any previous state
      await sendTelegramMessage(chatId, 
        `🤖 Hello ${userName}! I'm TONNY, your crypto strategy assistant.\n\n` +
        `Ask me anything about crypto markets, DeFi, or investment strategies!\n\n` +
        `Example: "What are perpetual futures?"`
      );
      return;
    }
    
    // Check user-specific rate limit for all other messages
    const rateLimitCheck = checkUserRateLimit(userId);
    if (rateLimitCheck.limited) {
      logger.warn('Rate limit exceeded', { 
        userId, 
        userName, 
        requestId,
        resetAt: new Date(rateLimitCheck.resetAt).toISOString()
      });
      await sendTelegramMessage(chatId, rateLimitCheck.message);
      return;
    }
    
    // Detect message intent
    const intent = detectIntent(messageText);
    const userState = getUserState(userId);
    
    logger.info('Intent detected', {
      userId,
      userName,
      requestId,
      intentType: intent.type,
      userContext: userState.context,
      messageLength: messageText.length
    });
    
    let responseMessage = '';
    
    // Route based on intent and user state
    switch (intent.type) {
      case 'wallet':
        // Handle wallet address - fetch data and set state for strategy CTA
        const walletDetected = intent.data;
        logger.info('Wallet address detected, processing directly', {
          userId,
          userName,
          requestId,
          walletType: walletDetected.type,
          addressPreview: walletDetected.address.substring(0, 8) + '...'
        });
        
        try {
          // Fetch wallet data
          const walletData = await getWalletData(walletDetected.address, walletDetected.type);
          walletData.address = walletDetected.address; // Store full address for strategy calls
          
          if (walletData.success) {
            // Set user state for potential strategy request
            setUserState(userId, 'awaiting_strategy_confirmation', walletData);
            
            // Format wallet response with strategy CTA
            responseMessage = formatWalletResponseWithStrategyCTA(walletData, walletDetected.type);
          } else {
            // Clear state on error
            clearUserState(userId);
            responseMessage = formatWalletResponse(walletData, walletDetected.type);
          }
          
        } catch (walletError) {
          logger.error('Error processing wallet', {
            userId,
            requestId,
            walletType: walletDetected.type,
            error: walletError.message
          });
          
          clearUserState(userId);
          responseMessage = `❌ I detected a ${walletDetected.type} wallet address but couldn't process it right now. Please try again or ask me a general crypto question!`;
        }
        break;
        
      case 'affirmative':
        // Handle "yes" responses based on user context
        if (userState.context === 'awaiting_strategy_confirmation' && userState.lastWalletData) {
          logger.info('User confirmed strategy request', {
            userId,
            userName,
            requestId,
            walletType: userState.lastWalletData.type,
            balance: userState.lastWalletData.balanceTON
          });
          
          // Send immediate response
          await sendTelegramMessage(chatId, 
            '🔄 **Analyzing your portfolio and market conditions...**\n\n' +
            '⏱️ This usually takes 30-60 seconds. I\'m gathering the latest market data to create your personalized strategy!'
          );
          
          // Set up progress timers
          const timers = [];
          
          // 30 second update - "fast response"
          timers.push(setTimeout(async () => {
            try {
              await sendTelegramMessage(chatId, 
                '⚡ **Still analyzing...** (30s)\n\n' +
                'Good news! I\'m finding some great opportunities. Almost ready with your strategy! 📊'
              );
            } catch (error) {
              logger.error('Error sending 30s update', { userId, error: error.message });
            }
          }, 30000));
          
          // 1 minute update - "normal response time"
          timers.push(setTimeout(async () => {
            try {
              await sendTelegramMessage(chatId, 
                '⏳ **Deep analysis in progress...** (1 min)\n\n' +
                'I\'m running advanced market analysis to ensure your strategy is perfect. This is normal for thorough research! 🧠'
              );
            } catch (error) {
              logger.error('Error sending 1min update', { userId, error: error.message });
            }
          }, 60000));
          
          // 2 minute update
          timers.push(setTimeout(async () => {
            try {
              await sendTelegramMessage(chatId, 
                '🔍 **Comprehensive analysis ongoing...** (2 min)\n\n' +
                'I\'m cross-referencing multiple data sources to give you the most accurate strategy. Hang tight! 📈'
              );
            } catch (error) {
              logger.error('Error sending 2min update', { userId, error: error.message });
            }
          }, 120000));
          
          // 5 minute warning - "something might be wrong"
          timers.push(setTimeout(async () => {
            try {
              await sendTelegramMessage(chatId, 
                '⚠️ **This is taking longer than expected...** (5 min)\n\n' +
                'I\'m still working on your strategy, but this is unusual. The analysis might be extra complex, or there could be a technical issue. 🔧'
              );
            } catch (error) {
              logger.error('Error sending 5min warning', { userId, error: error.message });
            }
          }, 300000));
          
          try {
            // Forward to strategy endpoint with wallet data
            const strategyPrompt = `Create a personalized investment strategy for a user with ${userState.lastWalletData.balanceTON} ${userState.lastWalletData.currency}. ` +
              `Research and analyze the following to provide comprehensive recommendations:\n\n` +
              `📊 MARKET ANALYSIS:\n` +
              `- Current TON ecosystem trends and price movements\n` +
              `- DeFi yield opportunities and risks for ${userState.lastWalletData.balanceTON} TON\n` +
              `- Optimal portfolio allocation strategies\n\n` +
              `🐦 SOCIAL SENTIMENT:\n` +
              `- Scan X (Twitter) for recent tweets from key crypto influencers about TON, DeFi, and relevant projects\n` +
              `- Look for tweets from: @ton_blockchain, @durov, major DeFi protocol founders, crypto analysts\n` +
              `- Analyze sentiment around TON ecosystem developments\n\n` +
              `⚡ TECHNICAL RESEARCH:\n` +
              `- Check GitHub activity for major TON DeFi projects (DeDust, STON.fi, Tonstakers, etc.)\n` +
              `- Look for recent commits, updates, and development activity\n` +
              `- Identify emerging protocols with active development\n\n` +
              `💡 STRATEGY OUTPUT:\n` +
              `- Specific investment allocations with rationale\n` +
              `- Risk management for ${userState.lastWalletData.balanceTON} TON portfolio size\n` +
              `- Timeline and entry/exit strategies\n` +
              `- Current opportunities based on social sentiment and dev activity`;
            
            const strategyResponse = await forwardToStrategy(
              strategyPrompt, 
              userId, 
              userState.lastWalletData, 
              requestId
            );
            
            // Debug: Log what we got back from strategy function
            logger.info('Strategy function returned', {
              userId,
              requestId,
              responseType: typeof strategyResponse,
              isObject: typeof strategyResponse === 'object',
              hasError: typeof strategyResponse === 'object' && strategyResponse.error,
              hasMessage: typeof strategyResponse === 'object' && strategyResponse.message,
              responsePreview: typeof strategyResponse === 'string' ? strategyResponse.substring(0, 100) + '...' : JSON.stringify(strategyResponse)
            });
            
            // Clear all timers since we got a response
            timers.forEach(timer => clearTimeout(timer));
            
            // Check if we got an error response
            if (typeof strategyResponse === 'object' && strategyResponse.error) {
              responseMessage = '❌ **Strategy Analysis Failed**\n\n' + strategyResponse.message;
            } else if (typeof strategyResponse === 'object' && strategyResponse.message) {
              responseMessage = '✅ **Your Personalized Strategy is Ready!**\n\n' + strategyResponse.message;
            } else {
              responseMessage = '✅ **Your Personalized Strategy is Ready!**\n\n' + strategyResponse;
            }
            
            // Send the strategy response to Telegram
            await sendTelegramMessage(chatId, responseMessage);
            
            // Clear user state after strategy response
            clearUserState(userId);
            
          } catch (strategyError) {
            // Clear all timers on error
            timers.forEach(timer => clearTimeout(timer));
            
            logger.error('Strategy analysis failed', {
              userId,
              requestId,
              error: strategyError.message
            });
            
            responseMessage = '❌ **Strategy Analysis Failed**\n\n' +
              'I encountered an error while analyzing your portfolio. Please try again in a moment, or ask me any other crypto questions!';
            
            // Send error message to Telegram
            await sendTelegramMessage(chatId, responseMessage);
            
            clearUserState(userId);
          }
          
          // Strategy response handled and sent above
          const totalDuration = Date.now() - processingStartTime;
          logger.info('Strategy processing completed', {
            userId,
            userName,
            requestId,
            totalDuration: `${totalDuration}ms`,
            success: !responseMessage.includes('Failed')
          });
          return; // Exit early since we handled the response
          
        } else {
          // No context for "yes" - treat as basic question
          logger.info('Affirmative response without context, treating as basic question', {
            userId,
            requestId,
            userContext: userState.context
          });
          
          const basicResponse = await forwardToBasic(messageText, userId, requestId);
          responseMessage = typeof basicResponse === 'object' ? basicResponse.message : basicResponse;
        }
        break;
        
      // Removed phone case - using web calls instead
        
      case 'voice_request':
        // Handle voice call requests - create web call
        logger.info('Voice call requested - creating web call', {
          userId,
          userName,
          requestId,
          hasWalletData: !!userState.lastWalletData
        });
        
        try {
          // Send immediate response
          await sendTelegramMessage(chatId, 
            '🎙️ **Setting up your voice call...**\n\n' +
            '⏱️ Creating your personalized AI strategist session...'
          );
          
          // Get conversation context
          let conversationContext = 'User requested voice consultation for crypto advice and strategy discussion.';
          
          if (userState.lastWalletData) {
            conversationContext = `User has ${userState.lastWalletData.balanceTON} TON in their wallet (${userState.lastWalletData.type}). Previous conversation about crypto strategy and portfolio analysis. User wants to discuss their holdings and get investment advice.`;
          }
          
          // Create web call session
          const webCall = await vapiIntegration.createWebCall(userId, conversationContext);
          
          // Format the response message with the web call link
          responseMessage = vapiIntegration.formatWebCallMessage(webCall.webCallUrl, conversationContext);
          
          logger.info('Web call created successfully', {
            userId,
            requestId,
            callId: webCall.callId,
            hasContext: !!conversationContext
          });
          
        } catch (error) {
          logger.error('Error creating web call', {
            userId,
            requestId,
            error: error.message
          });
          
          responseMessage = '❌ **Voice Call Setup Failed**\n\n' +
            'I encountered an error setting up your voice call. This might be due to:\n' +
            '• Vapi API configuration issues\n' +
            '• Temporary service unavailability\n\n' +
            'Please try again in a moment, or ask me any text-based crypto questions!';
        }
        
        // Clear user state after processing
        clearUserState(userId);
        break;

      case 'voice_troubleshooting':
        // Handle voice troubleshooting requests
        logger.info('Voice troubleshooting requested', {
          userId,
          userName,
          requestId
        });

        responseMessage = vapiIntegration.formatMobileTroubleshootingMessage();
        clearUserState(userId);
        break;
        
      case 'negative':
        // Handle "no" responses - clear state and ask how else to help
        logger.info('User declined or responded negatively', {
          userId,
          userName,
          requestId,
          userContext: userState.context
        });
        
        clearUserState(userId);
        responseMessage = "No worries! Is there anything else I can help you with regarding crypto or DeFi?";
        break;
        
      case 'basic_question':
      default:
        // Handle basic questions - forward to basic endpoint
        logger.info('Processing basic question', {
          userId,
          userName,
          requestId,
          messageLength: messageText.length
        });
        
        const basicResponse = await forwardToBasic(messageText, userId, requestId);
        responseMessage = typeof basicResponse === 'object' ? basicResponse.message : basicResponse;
        
        // Clear any previous state since user is asking new questions
        clearUserState(userId);
        break;
    }
    
    // Send response back to user
    await sendTelegramMessage(chatId, responseMessage);
    
    const totalDuration = Date.now() - processingStartTime;
    logger.info('Message processing completed', {
      userId,
      userName,
      requestId,
      intentType: intent.type,
      totalDuration: `${totalDuration}ms`,
      responseLength: responseMessage.length
    });
    
  } catch (error) {
    const totalDuration = Date.now() - processingStartTime;
    logger.error('Error in processMessage', { 
      error: error.message,
      stack: error.stack,
      userId,
      userName,
      requestId,
      totalDuration: `${totalDuration}ms`
    });
    
    // Clear user state on error
    clearUserState(userId);
    
    await sendTelegramMessage(chatId, 
      "Sorry, I encountered an error processing your request. Please try again in a moment."
    );
  }
}

// Function to send a single message to Telegram with markdown support and fallback
async function sendSingleTelegramMessage(chatId, text) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    // Prepare the payload for Telegram API with markdown support
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown' // Enable markdown formatting
    };
    
    // Send message to Telegram
    const response = await axios.post(url, payload);
    logger.info('Telegram message sent', { 
      chatId, 
      messageLength: text.length,
      parseMode: 'Markdown'
    });
    return response.data;
  } catch (error) {
    logger.error('Error sending Telegram message', { 
      chatId,
      error: error.message,
      responseStatus: error.response?.status,
      responseData: error.response?.data,
      messageLength: text.length
    });
    
    // If markdown parsing fails, try sending without markdown
    if (error.response && 
        error.response.status === 400 && 
        error.response.data.description && 
        error.response.data.description.includes('parse')) {
      logger.warn('Markdown parsing failed, retrying with plain text', { chatId });
      return await sendSingleTelegramMessagePlainText(chatId, text);
    }
    
    // For other errors, throw them up the chain
    throw error;
  }
}

// Fallback function for sending plain text (no markdown)
async function sendSingleTelegramMessagePlainText(chatId, text) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    const payload = {
      chat_id: chatId,
      text: text
      // No parse_mode for plain text
    };
    
    const response = await axios.post(url, payload);
    logger.info('Telegram plain text message sent', { 
      chatId, 
      messageLength: text.length 
    });
    return response.data;
  } catch (error) {
    logger.error('Error sending plain text message', { 
      chatId,
      error: error.message,
      responseStatus: error.response?.status,
      responseData: error.response?.data,
      messageLength: text.length
    });
    throw error;
  }
}

// Temporary wrapper to maintain compatibility - will be enhanced in next subtasks
async function sendTelegramMessage(chatId, text) {
  return await sendSingleTelegramMessage(chatId, text);
}

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { 
    error: error.message, 
    stack: error.stack 
  });
  // Don't exit in development, but log the error
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { 
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise.toString()
  });
});

// Express error handler (should be last middleware)
app.use((err, req, res, next) => {
  logger.error('Express error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId
  });
  res.status(500).send('Internal server error');
});

// Start server
const server = app.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    healthCheck: `http://localhost:${PORT}/health`,
    webhookEndpoint: `http://localhost:${PORT}/webhook/telegram`
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed gracefully');
    process.exit(0);
  });
}); 