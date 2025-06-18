const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const logger = require('./logger');
const { detectWalletAddress, getWalletData, formatWalletResponse } = require('./wallet-utils');
require('dotenv').config();

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
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'TON AI Telegram Bot Bridge'
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

// Function to forward messages to n8n webhook
async function forwardToN8n(message, userId, requestId) {
  const startTime = Date.now();
  
  try {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    
    if (!n8nWebhookUrl) {
      logger.error('N8N_WEBHOOK_URL not configured', { userId, requestId });
      return { 
        error: 'configuration', 
        message: "I'm not properly configured yet. Please check back soon!" 
      };
    }
    
    // Prepare the payload for n8n
    const payload = {
      message: message,
      userId: userId,
      source: 'telegram',
      timestamp: new Date().toISOString(),
      requestId: requestId
    };
    
    // Send request to n8n webhook
    logger.info('Forwarding to n8n', {
      userId,
      requestId,
      messageLength: message.length,
      n8nUrl: n8nWebhookUrl.replace(/\/[^\/]*$/, '/***') // Hide sensitive URL parts
    });
    
    const response = await axios.post(n8nWebhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 300000 // 5 minute timeout for AI processing
    });
    
    const duration = Date.now() - startTime;
    logger.info('n8n response received', {
      userId,
      requestId,
      duration: `${duration}ms`,
      status: response.status,
      responseSize: JSON.stringify(response.data).length
    });
    
    // Return the processed response from n8n
    // Handle different response formats
    if (response.data && typeof response.data === 'object') {
      // Handle n8n structured output format: {"results": [{"toolCallId": "...", "result": "..."}]}
      if (response.data.results && Array.isArray(response.data.results) && response.data.results.length > 0) {
        return response.data.results[0].result;
      }
      // Handle other common formats
      return response.data.message || response.data.response || response.data;
    } else if (typeof response.data === 'string') {
      return response.data;
    } else {
      return response.data;
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Error forwarding to n8n', { 
      error: error.message,
      stack: error.stack,
      userId,
      requestId,
      duration: `${duration}ms`,
      messageLength: message.length,
      errorCode: error.code,
      responseStatus: error.response?.status,
      responseData: error.response?.data
    });
    
    // Enhanced error classification with logging
    if (error.code === 'ECONNABORTED') {
      logger.warn('n8n request timeout', { userId, requestId, duration: `${duration}ms` });
      return { 
        error: 'timeout', 
        message: 'Request took too long, please try again' 
      };
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logger.error('n8n connection failed', { 
        userId, 
        requestId, 
        errorCode: error.code,
        hostname: error.hostname
      });
      return { 
        error: 'connection', 
        message: "I can't reach my AI brain right now. Please try again later." 
      };
    } else if (error.response) {
      const status = error.response.status;
      logger.error('n8n error response', { 
        userId,
        requestId,
        status,
        statusText: error.response.statusText,
        responseData: error.response.data
      });
      
      if (status >= 500) {
        return { 
          error: 'n8n_error', 
          message: "I'm having trouble thinking right now, try again in a moment" 
        };
      } else if (status === 429) {
        return { 
          error: 'n8n_rate_limited', 
          message: "I'm receiving too many requests right now, please try again later" 
        };
      } else if (status === 400) {
        return { 
          error: 'invalid_request', 
          message: "I couldn't process that request properly" 
        };
      }
    }
    
    return { 
      error: 'unknown', 
      message: 'An error occurred processing your request. Please try again.' 
    };
  }
}

// Updated message processing function with n8n integration
async function processMessage(chatId, messageText, userId, userName, requestId) {
  const processingStartTime = Date.now();
  
  try {
    // Handle /start command (skip rate limiting for this)
    if (messageText === '/start') {
      logger.info('Start command received', { userId, userName, requestId });
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
    
    // Check if message contains a wallet address
    const walletDetected = detectWalletAddress(messageText);
    
    if (walletDetected) {
      // Handle wallet address - fetch data directly and respond
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
        
        // Format and send response
        const walletResponse = formatWalletResponse(walletData, walletDetected.type);
        await sendTelegramMessage(chatId, walletResponse);
        
        const totalDuration = Date.now() - processingStartTime;
        logger.info('Wallet processing completed', {
          userId,
          userName,
          requestId,
          walletType: walletDetected.type,
          success: walletData.success,
          totalDuration: `${totalDuration}ms`
        });
        
        return; // Don't forward to n8n for wallet addresses
      } catch (walletError) {
        logger.error('Error processing wallet', {
          userId,
          requestId,
          walletType: walletDetected.type,
          error: walletError.message
        });
        
        // Fallback to showing error and continuing to n8n
        await sendTelegramMessage(chatId, 
          `❌ I detected a ${walletDetected.type} wallet address but couldn't process it right now. Let me help you with general crypto questions instead!`
        );
        // Continue to n8n processing below...
      }
    }
    
    // Forward message to n8n and get AI response (for non-wallet messages or wallet fallback)
    logger.info('Processing message', {
      userId,
      userName,
      requestId,
      messageLength: messageText.length,
      walletDetected: !!walletDetected
    });
    
    const n8nResponse = await forwardToN8n(messageText, userId, requestId);
    
    // Extract message from response
    let responseMessage;
    if (typeof n8nResponse === 'object' && n8nResponse.message) {
      responseMessage = n8nResponse.message;
    } else if (typeof n8nResponse === 'string') {
      responseMessage = n8nResponse;
    } else {
      responseMessage = "I processed your question but got an unexpected response format. Please try again.";
    }
    
    // Send response back to user
    await sendTelegramMessage(chatId, responseMessage);
    
    const totalDuration = Date.now() - processingStartTime;
    logger.info('Message processing completed', {
      userId,
      userName,
      requestId,
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