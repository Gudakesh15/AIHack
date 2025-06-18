#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

async function setupWebhook() {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const publicUrl = process.env.PUBLIC_URL;
    
    if (!token) {
      logger.error('TELEGRAM_BOT_TOKEN is required but not provided');
      process.exit(1);
    }
    
    if (!publicUrl) {
      logger.error('PUBLIC_URL is required but not provided');
      process.exit(1);
    }
    
    const webhookUrl = `${publicUrl}/webhook/telegram`;
    const telegramUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
    
    logger.info('Setting up Telegram webhook', { webhookUrl });
    
    const response = await axios.get(telegramUrl, {
      timeout: 10000
    });
    
    if (response.data.ok) {
      logger.info('Webhook setup successful', { 
        webhookUrl,
        description: response.data.description,
        result: response.data.result
      });
      console.log('✅ Webhook setup completed successfully');
    } else {
      logger.error('Webhook setup failed', { 
        webhookUrl,
        telegramResponse: response.data 
      });
      console.error('❌ Webhook setup failed:', response.data);
      process.exit(1);
    }
  } catch (error) {
    logger.error('Error setting up webhook', { 
      error: error.message,
      stack: error.stack
    });
    console.error('❌ Error setting up webhook:', error.message);
    process.exit(1);
  }
}

// Check if running directly (not imported)
if (require.main === module) {
  setupWebhook();
}

module.exports = setupWebhook; 