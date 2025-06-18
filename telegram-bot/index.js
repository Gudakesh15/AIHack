const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/webhook', limiter);

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
    
    console.log(`🔗 Setting webhook to: ${webhookUrl}`);
    const response = await axios.get(url);
    
    if (response.data.ok) {
      console.log('✅ Webhook registered successfully');
      res.json({ 
        success: true, 
        webhook: webhookUrl,
        telegram_response: response.data 
      });
    } else {
      console.log('❌ Failed to register webhook:', response.data);
      res.status(400).json({ 
        success: false, 
        error: response.data 
      });
    }
  } catch (error) {
    console.error('Error setting up webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Telegram webhook endpoint
app.post('/webhook/telegram', async (req, res) => {
  try {
    console.log('Received Telegram webhook:', JSON.stringify(req.body, null, 2));
    
    // Validate the incoming request has the expected structure
    if (!req.body || !req.body.message) {
      console.error('Invalid request format:', req.body);
      return res.status(400).send('Invalid request format');
    }
    
    // Extract message data
    const { message } = req.body;
    const chatId = message.chat.id;
    const messageText = message.text;
    const userId = message.from.id;
    const userName = message.from.first_name || message.from.username || 'User';
    
    // Log incoming message
    console.log(`📨 Message from ${userName} (${userId}): ${messageText}`);
    
    // Acknowledge receipt to Telegram (important for webhook performance)
    res.status(200).send('OK');
    
    // Process message in a separate function
    // This allows us to respond to Telegram quickly while processing continues
    processMessage(chatId, messageText, userId, userName);
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal server error');
  }
});

// Function to forward messages to n8n webhook
async function forwardToN8n(message, userId) {
  try {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    
    if (!n8nWebhookUrl) {
      console.error('N8N_WEBHOOK_URL not configured');
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
      timestamp: new Date().toISOString()
    };
    
    // Send request to n8n webhook
    console.log(`🔄 Forwarding to n8n: "${message}"`);
    const response = await axios.post(n8nWebhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000 // 15 second timeout for AI processing
    });
    
    console.log('✅ Received response from n8n');
    
    // Return the processed response from n8n
    // Handle different response formats
    if (response.data && typeof response.data === 'object') {
      return response.data.message || response.data.response || response.data;
    } else if (typeof response.data === 'string') {
      return response.data;
    } else {
      return response.data;
    }
    
  } catch (error) {
    console.error('Error forwarding to n8n:', error.message);
    
    // Return appropriate error messages based on error type
    if (error.code === 'ECONNABORTED') {
      return { 
        error: 'timeout', 
        message: 'Request took too long, please try again' 
      };
    } else if (error.response && error.response.status >= 500) {
      return { 
        error: 'n8n_down', 
        message: "I'm having trouble thinking right now, try again in a moment" 
      };
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return { 
        error: 'connection', 
        message: "I can't reach my AI brain right now. Please try again later." 
      };
    } else {
      return { 
        error: 'unknown', 
        message: 'An error occurred processing your request. Please try again.' 
      };
    }
  }
}

// Updated message processing function with n8n integration
async function processMessage(chatId, messageText, userId, userName) {
  try {
    // Handle /start command
    if (messageText === '/start') {
      await sendTelegramMessage(chatId, 
        `🤖 Hello ${userName}! I'm TONNY, your crypto strategy assistant.\n\n` +
        `Ask me anything about crypto markets, DeFi, or investment strategies!\n\n` +
        `Example: "What are perpetual futures?"`
      );
      return;
    }
    
    // Forward message to n8n and get AI response
    console.log(`🧠 Processing "${messageText}" for user ${userName}`);
    const n8nResponse = await forwardToN8n(messageText, userId);
    
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
    
  } catch (error) {
    console.error('Error in processMessage:', error);
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
    console.log(`✅ Message sent to ${chatId}`);
    return response.data;
  } catch (error) {
    console.error('Error sending Telegram message:', error.response?.data || error.message);
    
    // If markdown parsing fails, try sending without markdown
    if (error.response && 
        error.response.status === 400 && 
        error.response.data.description && 
        error.response.data.description.includes('parse')) {
      console.log(`🔄 Markdown parsing failed, retrying with plain text for chat ${chatId}`);
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
    console.log(`✅ Plain text message sent to ${chatId}`);
    return response.data;
  } catch (error) {
    console.error('Error sending plain text message:', error.response?.data || error.message);
    throw error;
  }
}

// Temporary wrapper to maintain compatibility - will be enhanced in next subtasks
async function sendTelegramMessage(chatId, text) {
  return await sendSingleTelegramMessage(chatId, text);
}

// Start server
const server = app.listen(PORT, () => {
  console.log(`🤖 TON AI Telegram Bot Bridge running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`📞 Webhook endpoint: http://localhost:${PORT}/webhook/telegram`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
}); 